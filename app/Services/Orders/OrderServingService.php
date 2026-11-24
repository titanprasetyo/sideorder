<?php

namespace App\Services\Orders;

use App\Events\OrderStatusUpdated;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class OrderServingService
{
    /**
     * Memperbarui status pengantaran (is_served) item pesanan dengan proteksi lock,
     * validasi lunas, serta auto-transisi status pesanan ketika seluruh item selesai atau dikembalikan.
     *
     * @return array{
     *     blocked_error: string|null,
     *     item_name: string,
     *     previous_status: string,
     *     new_status: string,
     *     auto_promoted: bool,
     *     auto_reverted: bool
     * }
     */
    public function toggleItemServed(
        Order $order,
        OrderItem $item,
        bool $targetServed,
        User $actor,
    ): array {
        $blockedError = null;
        $updatedItemName = $item->menu_name;
        $previousStatus = $order->order_status;
        $newStatus = $order->order_status;
        $autoPromoted = false;
        $autoReverted = false;

        DB::transaction(function () use (
            $order,
            $item,
            $targetServed,
            $actor,
            &$blockedError,
            &$updatedItemName,
            &$previousStatus,
            &$newStatus,
            &$autoPromoted,
            &$autoReverted,
        ): void {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $previousStatus = $lockedOrder->order_status;
            $newStatus = $lockedOrder->order_status;

            /** @var OrderItem $lockedItem */
            $lockedItem = OrderItem::whereKey($item->id)
                ->where('order_id', $lockedOrder->id)
                ->lockForUpdate()
                ->firstOrFail();

            $updatedItemName = $lockedItem->menu_name;

            if (! in_array($lockedOrder->order_status, ['processing', 'ready'], true)) {
                $blockedError = "Pengantaran menu per item untuk Pesanan #{$lockedOrder->order_number} hanya dapat diubah saat fase Sedang Diracik atau Siap Disajikan.";

                return;
            }

            if ($lockedItem->status !== 'active') {
                $blockedError = "Menu '{$lockedItem->menu_name}' sudah ditolak dan tidak dapat diantarkan.";

                return;
            }

            if ($targetServed && ! $lockedItem->isPaid()) {
                $blockedError = "Menu '{$lockedItem->menu_name}' (Pesanan Susulan) belum dibayar dan tidak dapat diantarkan sebelum pembayaran lunas.";

                return;
            }

            $nowWib = now('Asia/Jakarta');

            $lockedItem->update([
                'is_served' => $targetServed,
                'served_at' => $targetServed ? $nowWib : null,
                'served_by' => $targetServed ? $actor->id : null,
            ]);

            $activeItems = $lockedOrder->items()
                ->where('status', 'active')
                ->lockForUpdate()
                ->get();

            $allPaid = $activeItems->isNotEmpty()
                && $activeItems->every(fn (OrderItem $it): bool => $it->isPaid());
            $allServed = $activeItems->isNotEmpty()
                && $activeItems->every(fn (OrderItem $it): bool => $it->isServed());
            $isOrderFullyPaid = $lockedOrder->payment_status === 'paid'
                && $lockedOrder->getUnpaidBalance() <= 0.01;

            if ($targetServed && $lockedOrder->order_status === 'processing' && $allPaid && $allServed && $isOrderFullyPaid) {
                $lockedOrder->update(['order_status' => 'ready']);
                $newStatus = 'ready';
                $autoPromoted = true;

                $count = $activeItems->count();
                OrderStatusHistory::create([
                    'order_id' => $lockedOrder->id,
                    'user_id' => $actor->id,
                    'status' => 'ready',
                    'notes' => "Seluruh menu ({$count}/{$count}) selesai diracik & otomatis berpindah ke Siap Disajikan oleh {$actor->name}.",
                ]);
            } elseif (! $targetServed && $lockedOrder->order_status === 'ready') {
                $lockedOrder->update(['order_status' => 'processing']);
                $newStatus = 'processing';
                $autoReverted = true;

                OrderStatusHistory::create([
                    'order_id' => $lockedOrder->id,
                    'user_id' => $actor->id,
                    'status' => 'processing',
                    'notes' => "Status pesanan dikembalikan ke Sedang Diracik karena '{$lockedItem->menu_name}' belum siap disajikan ({$actor->name}).",
                ]);
            } else {
                $lockedOrder->touch();
            }
        });

        if ($blockedError === null) {
            $order->refresh();

            try {
                event(new OrderStatusUpdated($order, $previousStatus, $newStatus));
            } catch (\Throwable) {
            }
        }

        return [
            'blocked_error' => $blockedError,
            'item_name' => $updatedItemName,
            'previous_status' => $previousStatus,
            'new_status' => $newStatus,
            'auto_promoted' => $autoPromoted,
            'auto_reverted' => $autoReverted,
        ];
    }
}
