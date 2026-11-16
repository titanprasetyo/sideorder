<?php

namespace App\Services\Stock;

use App\Exceptions\PaymentGatewayException;
use App\Models\Menu;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Validation\ValidationException;

class MenuStockService
{
    /**
     * Kunci baris menu secara deterministik (urut ID menaik untuk cegah deadlock),
     * validasi ketersediaan stok, lalu reservasi/kurangi stok saat checkout di dalam DB transaction.
     *
     * @param  array<int, int>  $requestedQtyByMenuId
     * @param  array<int, int>  $firstItemIndexByMenuId
     * @return Collection<int, Menu>
     *
     * @throws ValidationException
     */
    public function lockAndReserveForCheckout(array $requestedQtyByMenuId, array $firstItemIndexByMenuId = []): Collection
    {
        if ($requestedQtyByMenuId === []) {
            return new Collection;
        }

        $menuIds = array_keys($requestedQtyByMenuId);
        sort($menuIds, SORT_NUMERIC);

        /** @var Collection<int, Menu> $lockedMenus */
        $lockedMenus = Menu::query()
            ->with([
                'category:id,is_active',
                'optionGroups' => function ($gQuery): void {
                    $gQuery->orderBy('sort_order', 'asc')
                        ->with([
                            'optionItems' => function ($iQuery): void {
                                $iQuery->where('is_active', true)->orderBy('sort_order', 'asc');
                            },
                        ]);
                },
            ])
            ->whereIn('id', $menuIds)
            ->orderBy('id', 'asc')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($menuIds as $menuId) {
            $itemIndex = $firstItemIndexByMenuId[$menuId] ?? 0;
            /** @var Menu|null $menu */
            $menu = $lockedMenus->get($menuId);

            if (! $menu || ! $menu->is_active || ! ($menu->category?->is_active ?? false)) {
                throw ValidationException::withMessages([
                    "items.{$itemIndex}.menu_id" => 'Menu yang dipilih sedang tidak tersedia atau sudah tidak aktif.',
                ]);
            }

            if (! $menu->is_limited_stock) {
                continue;
            }

            $requestedQty = max(1, (int) ($requestedQtyByMenuId[$menuId] ?? 0));
            $availableStock = (int) $menu->stock_quantity;

            if ($availableStock <= 0) {
                throw ValidationException::withMessages([
                    "items.{$itemIndex}.quantity" => "Maaf, stok menu {$menu->name} sudah habis.",
                ]);
            }

            if ($availableStock < $requestedQty) {
                throw ValidationException::withMessages([
                    "items.{$itemIndex}.quantity" => "Stok {$menu->name} tidak mencukupi. Tersisa {$availableStock} porsi, sedangkan total yang dipesan {$requestedQty} porsi.",
                ]);
            }
        }

        foreach ($menuIds as $menuId) {
            /** @var Menu $menu */
            $menu = $lockedMenus->get($menuId);
            if (! $menu->is_limited_stock) {
                continue;
            }

            $requestedQty = max(1, (int) ($requestedQtyByMenuId[$menuId] ?? 0));
            $menu->decrement('stock_quantity', $requestedQty);
            $menu->stock_quantity = max(0, (int) $menu->stock_quantity);
        }

        return $lockedMenus;
    }

    /**
     * Pastikan seluruh item aktif pada pesanan telah mengonfirmasi stoknya secara idempoten saat pembayaran sukses.
     * - Jika sudah 'reserved' dari checkout: cukup ubah ke 'confirmed' tanpa mengurangi stok dua kali.
     * - Jika sudah 'confirmed': lewati sepenuhnya.
     * - Jika berstatus 'released'/'none' (misal retry setelah failed atau order tanpa checkout): kunci & kurangi stok secara aman.
     *
     * @throws PaymentGatewayException
     */
    public function confirmOrderStock(Order $order): void
    {
        /** @var Collection<int, OrderItem> $activeItems */
        $activeItems = $order->items()
            ->where('status', 'active')
            ->whereNotNull('menu_id')
            ->orderBy('menu_id', 'asc')
            ->orderBy('id', 'asc')
            ->lockForUpdate()
            ->get();

        if ($activeItems->isEmpty()) {
            return;
        }

        $menuIds = $activeItems
            ->pluck('menu_id')
            ->filter(fn ($id): bool => is_numeric($id))
            ->map(fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        sort($menuIds, SORT_NUMERIC);

        /** @var Collection<int, Menu> $lockedMenus */
        $lockedMenus = Menu::query()
            ->whereIn('id', $menuIds)
            ->orderBy('id', 'asc')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        $now = now('Asia/Jakarta');

        foreach ($activeItems as $item) {
            if ($item->stock_state === OrderItem::STOCK_STATE_CONFIRMED) {
                continue;
            }

            /** @var Menu|null $menu */
            $menu = $item->menu_id !== null ? $lockedMenus->get((int) $item->menu_id) : null;

            if (! $menu || ! $menu->is_limited_stock) {
                if ($item->stock_state === OrderItem::STOCK_STATE_RESERVED) {
                    $item->update([
                        'stock_state' => OrderItem::STOCK_STATE_CONFIRMED,
                    ]);
                }

                continue;
            }

            if ($item->stock_state === OrderItem::STOCK_STATE_RESERVED && $item->stock_deducted_quantity >= $item->quantity) {
                $item->update([
                    'stock_state' => OrderItem::STOCK_STATE_CONFIRMED,
                    'stock_deducted_at' => $item->stock_deducted_at ?? $now,
                ]);

                continue;
            }

            $needed = max(0, (int) $item->quantity - (int) $item->stock_deducted_quantity);
            if ($needed > 0) {
                if ((int) $menu->stock_quantity < $needed) {
                    throw new PaymentGatewayException(
                        "Stok menu {$menu->name} tidak mencukupi untuk mengonfirmasi pesanan #{$order->order_number} (tersisa {$menu->stock_quantity} porsi)."
                    );
                }

                $menu->decrement('stock_quantity', $needed);
                $menu->stock_quantity = max(0, (int) $menu->stock_quantity);
            }

            $item->update([
                'stock_deducted_quantity' => (int) $item->quantity,
                'stock_state' => OrderItem::STOCK_STATE_CONFIRMED,
                'stock_deducted_at' => $item->stock_deducted_at ?? $now,
            ]);
        }
    }

    /**
     * Reservasi ulang item berstatus 'released' sebelum inisiasi pembayaran ulang (misal setelah pembayaran sempat failed/expired).
     *
     * @throws PaymentGatewayException
     */
    public function reserveBeforePaymentRetry(Order $order): void
    {
        /** @var Collection<int, OrderItem> $releasedItems */
        $releasedItems = $order->items()
            ->where('status', 'active')
            ->where('stock_state', OrderItem::STOCK_STATE_RELEASED)
            ->whereNotNull('menu_id')
            ->orderBy('menu_id', 'asc')
            ->orderBy('id', 'asc')
            ->lockForUpdate()
            ->get();

        if ($releasedItems->isEmpty()) {
            return;
        }

        $menuIds = $releasedItems
            ->pluck('menu_id')
            ->filter(fn ($id): bool => is_numeric($id))
            ->map(fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        sort($menuIds, SORT_NUMERIC);

        /** @var Collection<int, Menu> $lockedMenus */
        $lockedMenus = Menu::query()
            ->whereIn('id', $menuIds)
            ->orderBy('id', 'asc')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        $now = now('Asia/Jakarta');

        foreach ($releasedItems as $item) {
            /** @var Menu|null $menu */
            $menu = $item->menu_id !== null ? $lockedMenus->get((int) $item->menu_id) : null;
            if (! $menu || ! $menu->is_limited_stock) {
                continue;
            }

            $qty = max(1, (int) $item->quantity);
            if ((int) $menu->stock_quantity < $qty) {
                throw new PaymentGatewayException(
                    "Maaf, stok menu {$menu->name} sudah tidak mencukupi untuk melanjutkan pembayaran ulang (tersisa {$menu->stock_quantity} porsi)."
                );
            }

            $menu->decrement('stock_quantity', $qty);
            $menu->stock_quantity = max(0, (int) $menu->stock_quantity);

            $item->update([
                'stock_deducted_quantity' => $qty,
                'stock_state' => OrderItem::STOCK_STATE_RESERVED,
                'stock_deducted_at' => $now,
                'stock_released_at' => null,
            ]);
        }
    }

    /**
     * Kembalikan stok yang berstatus 'reserved' secara idempoten (pembayaran gagal/expired atau pembatalan sebelum lunas).
     */
    public function releaseUnsettledOrderStock(Order $order): void
    {
        /** @var Collection<int, OrderItem> $reservedItems */
        $reservedItems = $order->items()
            ->where('stock_state', OrderItem::STOCK_STATE_RESERVED)
            ->where('stock_deducted_quantity', '>', 0)
            ->whereNotNull('menu_id')
            ->orderBy('menu_id', 'asc')
            ->orderBy('id', 'asc')
            ->lockForUpdate()
            ->get();

        if ($reservedItems->isEmpty()) {
            return;
        }

        $menuIds = $reservedItems
            ->pluck('menu_id')
            ->filter(fn ($id): bool => is_numeric($id))
            ->map(fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        sort($menuIds, SORT_NUMERIC);

        /** @var Collection<int, Menu> $lockedMenus */
        $lockedMenus = Menu::query()
            ->whereIn('id', $menuIds)
            ->orderBy('id', 'asc')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        $now = now('Asia/Jakarta');

        foreach ($reservedItems as $item) {
            /** @var Menu|null $menu */
            $menu = $item->menu_id !== null ? $lockedMenus->get((int) $item->menu_id) : null;
            $qtyToRestore = (int) $item->stock_deducted_quantity;

            if ($menu && $menu->is_limited_stock && $qtyToRestore > 0) {
                $menu->increment('stock_quantity', $qtyToRestore);
            }

            $item->update([
                'stock_deducted_quantity' => 0,
                'stock_state' => OrderItem::STOCK_STATE_RELEASED,
                'stock_released_at' => $now,
            ]);
        }
    }
}
