<?php

namespace App\Http\Controllers\Cashier;

use App\Events\OrderStatusUpdated;
use App\Exceptions\PaymentGatewayException;
use App\Http\Controllers\Controller;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Services\Orders\OrderServingService;
use App\Services\Payments\PaymentService;
use App\Services\Stock\MenuStockService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderController extends Controller
{
    public function __construct(
        private readonly PaymentService $paymentService,
        private readonly MenuStockService $menuStockService,
        private readonly OrderServingService $orderServingService,
    ) {}

    /**
     * Menampilkan daftar pesanan masuk untuk kasir dan dapur.
     */
    public function index(Request $request): Response
    {
        $dateFilter = (string) $request->query('date', 'today');
        $data = $this->getCashierData($dateFilter);

        return Inertia::render('cashier/orders/index', $data);
    }

    /**
     * Endpoint API JSON berkecepatan tinggi untuk background real-time sync & lonceng notifikasi kasir.
     */
    public function sync(Request $request): JsonResponse
    {
        $dateFilter = (string) $request->query('date', 'today');
        $data = $this->getCashierData($dateFilter);

        return response()->json($data);
    }

    /**
     * Server-Sent Events (SSE) stream untuk real-time update tanpa delay.
     */
    public function stream(Request $request): StreamedResponse
    {
        $dateFilter = (string) $request->query('date', 'today');

        // Lepas session lock agar request lain di PHP-FPM tidak terblokir
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        return response()->stream(function () use ($dateFilter): void {
            $data = $this->getCashierData($dateFilter);
            echo "retry: 2000\n";
            echo "event: sync\n";
            echo 'data: '.json_encode($data)."\n\n";
            if (ob_get_level() > 0) {
                ob_flush();
            }
            flush();
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * Helper pemuatan data operasional kasir.
     *
     * @return array<string, mixed>
     */
    private function getCashierData(string $dateFilter = 'today'): array
    {
        $this->paymentService->expireOverduePendingPayments();

        $startOfToday = Carbon::today()->startOfDay();
        $endOfToday = Carbon::today()->endOfDay();

        $query = Order::with([
            'table',
            'items.options',
            'items.rejectedByUser:id,name',
            'items.servedByUser:id,name',
            'latestPayment',
            'payments:id,order_id,payment_reference,gateway,method,channel,type,amount,settled_amount,status,expired_at,paid_at',
        ])->latest();

        if ($dateFilter === 'today') {
            // Ambil semua pesanan aktif (pending/processing/ready) ATAU pesanan selesai/batal hari ini
            $query->where(function ($q) use ($startOfToday, $endOfToday): void {
                $q->whereNotIn('order_status', ['completed', 'cancelled'])
                    ->orWhereBetween('created_at', [$startOfToday, $endOfToday])
                    ->orWhereBetween('updated_at', [$startOfToday, $endOfToday]);
            });
        }

        $orders = $query->limit(100)->get();

        $pendingOrders = $orders->where('order_status', 'pending');
        $processingOrders = $orders->where('order_status', 'processing');
        $readyOrders = $orders->where('order_status', 'ready');
        $partialReadyOrders = $processingOrders->filter(
            fn (Order $o): bool => $o->hasServedActivePaidItem()
        );
        $readyAndPartialOrders = $readyOrders->merge($partialReadyOrders);

        // Filter pesanan selesai khusus hari ini
        $completedTodayOrders = $orders->where('order_status', 'completed')->filter(function (Order $o) use ($startOfToday): bool {
            $updatedAt = Carbon::parse($o->updated_at ?? $o->created_at);

            return $updatedAt->gte($startOfToday);
        });

        // Hitung ringkasan badge antrean
        $counts = [
            'pending' => $pendingOrders->count(),
            'processing' => $processingOrders->count(),
            'ready' => $readyAndPartialOrders->count(),
            'completed_today' => $completedTodayOrders->count(),
            'active' => $pendingOrders->count() + $processingOrders->count() + $readyOrders->count(),
            'all' => $orders->count(),
        ];

        $stats = [
            'processing_amount' => (float) $processingOrders->sum('total_amount'),
            'completed_amount' => (float) $completedTodayOrders->sum('total_amount'),
            'ready_tables' => $readyAndPartialOrders->pluck('table.table_number')->filter()->unique()->values()->all(),
            'active_tables_count' => Cache::remember('active_tables_count', 60, fn (): int => CafeTable::where('is_active', true)->count()),
        ];

        // Ambil data menu dan kategori terbaru dari Admin untuk referensi kasir
        $menuCatalog = Category::query()->orderBy('sort_order', 'asc')->get(['id', 'name', 'slug']);

        $allMenus = Menu::with([
            'category:id,name',
            'optionGroups.optionItems' => function ($iq): void {
                $iq->orderBy('sort_order', 'asc');
            },
        ])->latest('updated_at')->get();

        $counts['menus_total'] = $allMenus->count();
        $counts['menus_active'] = $allMenus->filter(
            fn (Menu $m): bool => (bool) $m->is_active && (! $m->is_limited_stock || $m->resolveEffectiveStockQuantity() > 0)
        )->count();
        $counts['menus_discounted'] = $allMenus->where('is_discount_active', true)->count();

        return [
            'orders' => $orders,
            'counts' => $counts,
            'stats' => $stats,
            'menuCatalog' => $menuCatalog,
            'allMenus' => $allMenus,
            'dateFilter' => $dateFilter,
            'timestamp' => microtime(true),
        ];
    }

    private function wantsJsonResponse(Request $request): bool
    {
        return $request->expectsJson() && ! $request->header('X-Inertia');
    }

    private function respondCashierAction(
        Request $request,
        string $type,
        string $message,
        int $status = 200
    ): RedirectResponse|JsonResponse {
        if ($this->wantsJsonResponse($request)) {
            $dateFilter = (string) $request->input('date', $request->query('date', 'today'));

            return response()->json(array_merge(
                [
                    'success' => $status < 400,
                    'status_type' => $type,
                    'message' => $message,
                ],
                $this->getCashierData($dateFilter),
            ), $status);
        }

        if ($type === 'error') {
            return back()->with('error', $message);
        }

        if ($type === 'info') {
            return back()->with('info', $message);
        }

        return back()->with('success', $message);
    }

    /**
     * Konfirmasi pembayaran oleh kasir (Tunai, QRIS, Transfer, Debit).
     */
    public function confirmPayment(Request $request, Order $order): RedirectResponse|JsonResponse
    {
        $user = $request->user();
        if (! $user || (! $user->isCashier() && ! $user->isAdmin())) {
            abort(403, 'Konfirmasi pembayaran hanya dapat dilakukan melalui operasional Kasir.');
        }

        if ($order->payment_status === 'paid' && $order->getUnpaidBalance() <= 0.01 && ! $order->hasUnpaidActiveItems()) {
            $existingOrderStatusChanged = false;
            if ($order->order_status === 'pending') {
                $order->update(['order_status' => 'processing']);
                $existingOrderStatusChanged = true;
            }

            return $this->respondCashierAction(
                $request,
                'info',
                $existingOrderStatusChanged
                    ? "Pesanan #{$order->order_number} sudah lunas dan diteruskan ke Sedang Diracik."
                    : "Pesanan #{$order->order_number} sudah dibayar sebelumnya."
            );
        }

        if ($order->order_status === 'completed' || $order->order_status === 'cancelled') {
            return $this->respondCashierAction(
                $request,
                'error',
                "Pesanan #{$order->order_number} berstatus {$order->order_status} dan tidak dapat diubah pembayarannya.",
                422
            );
        }

        $validated = $request->validate([
            'payment_method' => ['nullable', 'string', 'in:cash,qris,transfer,debit'],
            'cash_received' => ['nullable', 'numeric', 'min:0'],
            'change_amount' => ['nullable', 'numeric'],
            'payment_reference' => ['nullable', 'string', 'max:100'],
        ]);

        $paymentMethod = strtolower((string) ($validated['payment_method'] ?? 'cash'));
        $amountDue = $order->getUnpaidBalance() > 0
            ? $order->getUnpaidBalance()
            : (float) $order->total_amount;

        if (
            $paymentMethod === 'cash'
            && isset($validated['cash_received'])
            && (float) $validated['cash_received'] > 0
            && (float) $validated['cash_received'] < $amountDue
        ) {
            if ($this->wantsJsonResponse($request)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Nominal uang tunai yang diterima kurang dari total tagihan.',
                    'errors' => [
                        'cash_received' => ['Nominal uang tunai yang diterima kurang dari total tagihan.'],
                    ],
                ], 422);
            }

            return back()->withErrors([
                'cash_received' => 'Nominal uang tunai yang diterima kurang dari total tagihan.',
            ])->with('error', 'Nominal uang tunai yang diterima kurang dari total tagihan.');
        }

        try {
            $result = $this->paymentService->confirmCashierPayment(
                $order,
                $user->id,
                $user->name,
                $validated,
            );
        } catch (PaymentGatewayException $e) {
            return $this->respondCashierAction($request, 'error', $e->getMessage(), 422);
        }

        if ($result['already_paid']) {
            return $this->respondCashierAction(
                $request,
                'info',
                "Pesanan #{$order->order_number} sudah dibayar sebelumnya."
            );
        }

        return $this->respondCashierAction(
            $request,
            'success',
            "Pembayaran untuk Pesanan #{$order->order_number} berhasil dikonfirmasi!"
        );
    }

    /**
     * Memperbarui status operasional pesanan (processing -> ready -> completed / cancelled untuk belum bayar).
     */
    public function updateStatus(Request $request, Order $order): RedirectResponse|JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $validated = $request->validate([
            'status' => ['required', 'string', 'in:processing,ready,completed,cancelled'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $newStatus = (string) $validated['status'];
        $previousStatus = $order->order_status;
        $blockedError = null;

        DB::transaction(function () use ($user, $order, &$previousStatus, $newStatus, $validated, &$blockedError): void {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $previousStatus = $lockedOrder->order_status;

            $lockedActiveItems = $lockedOrder->items()
                ->where('status', 'active')
                ->lockForUpdate()
                ->get();

            if ($lockedOrder->order_status === 'completed') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah selesai dan tidak dapat diproses ulang.";

                return;
            }

            if ($lockedOrder->order_status === 'cancelled') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah dibatalkan dan tidak dapat diproses ulang.";

                return;
            }

            if ($lockedOrder->order_status === $newStatus) {
                return;
            }

            $allowedTransitions = [
                'pending' => ['processing', 'cancelled'],
                'processing' => ['ready', 'cancelled'],
                'ready' => ['completed'],
            ];

            if (! in_array($newStatus, $allowedTransitions[$lockedOrder->order_status] ?? [], true)) {
                $blockedError = "Transisi status Pesanan #{$lockedOrder->order_number} dari {$lockedOrder->order_status} ke {$newStatus} tidak diizinkan.";

                return;
            }

            $hasAnySettlement = $lockedOrder->hasAnySettlement()
                || $lockedActiveItems->contains(fn (OrderItem $item): bool => $item->isPaid());

            if ($newStatus === 'cancelled' && $hasAnySettlement) {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah memiliki pembayaran lunas dan tidak dapat dibatalkan maupun di-refund.";

                return;
            }

            if (in_array($newStatus, ['processing', 'ready', 'completed'], true)) {
                $unpaidItems = $lockedActiveItems->filter(fn (OrderItem $item): bool => ! $item->isPaid());
                $unpaidBalance = $lockedOrder->getUnpaidBalance();
                $isFullyPaid = $lockedOrder->payment_status === 'paid'
                    && $unpaidBalance <= 0.01
                    && $unpaidItems->isEmpty();

                if (! $isFullyPaid) {
                    $unpaidDue = max($unpaidBalance, (float) $unpaidItems->sum('total_price'));
                    $dueFormatted = number_format($unpaidDue, 0, ',', '.');
                    $blockedError = $hasAnySettlement
                        ? "Pesanan #{$lockedOrder->order_number} masih memiliki pesanan susulan belum dibayar (Rp {$dueFormatted}). Konfirmasi pembayaran susulan terlebih dahulu."
                        : "Pesanan #{$lockedOrder->order_number} belum lunas. Konfirmasi pembayaran terlebih dahulu sebelum memproses atau menyajikan pesanan.";

                    return;
                }
            }

            $lockedOrder->update([
                'order_status' => $newStatus,
            ]);

            if (in_array($newStatus, ['ready', 'completed'], true)) {
                $lockedOrder->items()
                    ->where('status', 'active')
                    ->where('payment_status', OrderItem::PAYMENT_PAID)
                    ->where('is_served', false)
                    ->update([
                        'is_served' => true,
                        'served_at' => now('Asia/Jakarta'),
                        'served_by' => $user->id,
                    ]);
            }

            if ($newStatus === 'cancelled') {
                $this->menuStockService->releaseUnsettledOrderStock($lockedOrder);
            }

            $labels = [
                'processing' => 'Sedang Diracik Barista',
                'ready' => 'Siap Saji (Ready to Pickup)',
                'completed' => 'Pesanan Selesai & Ditutup',
                'cancelled' => 'Dibatalkan',
            ];

            $label = $labels[$newStatus] ?? $newStatus;
            $auditNote = $validated['notes'] ?? "Status pesanan diubah dari {$previousStatus} ke {$label} oleh staf {$user->name}";

            OrderStatusHistory::create([
                'order_id' => $lockedOrder->id,
                'user_id' => $user->id,
                'status' => $newStatus,
                'notes' => $auditNote,
            ]);
        });

        if ($blockedError !== null) {
            return $this->respondCashierAction($request, 'error', $blockedError, 422);
        }

        $order->refresh();

        try {
            event(new OrderStatusUpdated($order, $previousStatus, $newStatus));
        } catch (\Throwable) {
            // Abaikan broadcaster error
        }

        $labels = [
            'processing' => 'Sedang Diracik Barista',
            'ready' => 'Siap Saji (Ready to Pickup)',
            'completed' => 'Selesai & Diantar',
            'cancelled' => 'Dibatalkan',
        ];
        $label = $labels[$newStatus] ?? $newStatus;

        return $this->respondCashierAction(
            $request,
            'success',
            "Pesanan #{$order->order_number} berhasil diubah ke: {$label}."
        );
    }

    /**
     * Menandai atau membatalkan status pengantaran per menu saat fase Sedang Diracik / Siap Disajikan.
     * Dilindungi IDOR check dan validasi bahwa item wajib sudah dibayar lunas.
     */
    public function toggleItemServed(Request $request, Order $order, OrderItem $item): RedirectResponse|JsonResponse
    {
        $user = $request->user();
        if (! $user || (! $user->isCashier() && ! $user->isAdmin())) {
            abort(403);
        }

        if ((int) $item->order_id !== (int) $order->id) {
            abort(404);
        }

        $validated = $request->validate([
            'is_served' => ['required', 'boolean'],
        ]);

        $targetServed = (bool) $validated['is_served'];
        $result = $this->orderServingService->toggleItemServed($order, $item, $targetServed, $user);

        if ($result['blocked_error'] !== null) {
            return $this->respondCashierAction($request, 'error', $result['blocked_error'], 422);
        }

        $itemName = $result['item_name'];
        $msg = match (true) {
            $result['auto_promoted'] => "Menu '{$itemName}' selesai! Seluruh menu pada #{$order->order_number} kini siap disajikan.",
            $result['auto_reverted'] => "Status '{$itemName}' dikembalikan ke antrean racik (#{$order->order_number}).",
            $targetServed => "Menu '{$itemName}' pada #{$order->order_number} ditandai Siap Diantarkan ke meja.",
            default => "Status pengantaran menu '{$itemName}' pada #{$order->order_number} dikembalikan ke antrean racik.",
        };

        return $this->respondCashierAction($request, 'success', $msg);
    }
}
