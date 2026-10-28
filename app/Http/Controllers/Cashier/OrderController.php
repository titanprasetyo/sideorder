<?php

namespace App\Http\Controllers\Cashier;

use App\Events\OrderItemRejected;
use App\Events\OrderStatusUpdated;
use App\Http\Controllers\Controller;
use App\Models\CafeTable;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderController extends Controller
{
    /**
     * Menampilkan daftar pesanan masuk untuk kasir dan dapur.
     */
    public function index(Request $request): Response
    {
        $dateFilter = $request->query('date', 'today');
        $data = $this->getCashierData($dateFilter);

        return Inertia::render('cashier/orders/index', $data);
    }

    /**
     * Endpoint API JSON berkecepatan tinggi untuk background real-time sync & lonceng notifikasi kasir.
     */
    public function sync(Request $request): JsonResponse
    {
        $dateFilter = $request->query('date', 'today');
        $data = $this->getCashierData($dateFilter);

        return response()->json($data);
    }

    /**
     * Server-Sent Events (SSE) stream untuk real-time update tanpa delay.
     */
    public function stream(Request $request): StreamedResponse
    {
        $dateFilter = $request->query('date', 'today');

        // Lepas session lock agar request lain di PHP-FPM tidak terblokir
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        return response()->stream(function () use ($dateFilter) {
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
     */
    private function getCashierData(string $dateFilter = 'today'): array
    {
        $startOfToday = Carbon::today()->startOfDay();
        $endOfToday = Carbon::today()->endOfDay();

        $query = Order::with(['table', 'items.options', 'items.rejectedByUser', 'statusHistories.user'])->latest();

        if ($dateFilter === 'today') {
            // Ambil semua pesanan aktif (pending/processing/ready) ATAU pesanan selesai/batal hari ini
            $query->where(function ($q) use ($startOfToday, $endOfToday) {
                $q->whereNotIn('order_status', ['completed', 'cancelled'])
                    ->orWhereBetween('created_at', [$startOfToday, $endOfToday])
                    ->orWhereBetween('updated_at', [$startOfToday, $endOfToday]);
            });
        }

        $orders = $query->limit(100)->get();

        $pendingOrders = $orders->where('order_status', 'pending');
        $processingOrders = $orders->where('order_status', 'processing');
        $readyOrders = $orders->where('order_status', 'ready');

        // Filter pesanan selesai khusus hari ini
        $completedTodayOrders = $orders->where('order_status', 'completed')->filter(function ($o) use ($startOfToday) {
            $updatedAt = Carbon::parse($o->updated_at ?? $o->created_at);

            return $updatedAt->gte($startOfToday);
        });

        // Ambil riwayat penolakan menu (History Penolakan)
        $rejectionsQuery = OrderItem::with(['order.table', 'rejectedByUser', 'options'])
            ->where('status', 'rejected');

        if ($dateFilter === 'today') {
            $rejectionsQuery->where(function ($q) use ($startOfToday, $endOfToday) {
                $q->whereBetween('rejected_at', [$startOfToday, $endOfToday])
                    ->orWhere(function ($sub) use ($startOfToday, $endOfToday) {
                        $sub->whereNull('rejected_at')
                            ->whereBetween('updated_at', [$startOfToday, $endOfToday]);
                    });
            });
        }

        $rejectedItemsRaw = $rejectionsQuery->latest('rejected_at')->limit(100)->get();

        $rejections = $rejectedItemsRaw->map(function ($item) {
            $optLabels = $item->options && $item->options->isNotEmpty()
                ? ' ('.$item->options->pluck('option_name')->join(', ').')'
                : '';

            return [
                'id' => $item->id,
                'order_id' => $item->order_id,
                'order_number' => $item->order ? $item->order->order_number : '-',
                'table_number' => $item->order && $item->order->table ? $item->order->table->table_number : '00',
                'customer_name' => $item->order ? $item->order->customer_name : 'Pelanggan',
                'menu_name' => $item->menu_name.$optLabels,
                'quantity' => $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'total_price' => (float) $item->total_price,
                'rejection_reason' => $item->rejection_reason ?? 'Stok bahan habis / Permintaan kasir',
                'rejected_at' => $item->rejected_at ? $item->rejected_at->toIso8601String() : ($item->updated_at ? $item->updated_at->toIso8601String() : null),
                'cashier_name' => $item->rejectedByUser ? $item->rejectedByUser->name : 'Kasir',
            ];
        });

        // Hitung ringkasan badge antrean
        $counts = [
            'pending' => $pendingOrders->count(),
            'processing' => $processingOrders->count(),
            'ready' => $readyOrders->count(),
            'completed_today' => $completedTodayOrders->count(),
            'active' => $pendingOrders->count() + $processingOrders->count() + $readyOrders->count(),
            'rejections' => $rejections->count(),
            'all' => $orders->count(),
        ];

        $stats = [
            'processing_amount' => (float) $processingOrders->sum('total_amount'),
            'completed_amount' => (float) $completedTodayOrders->sum('total_amount'),
            'ready_tables' => $readyOrders->pluck('table.table_number')->filter()->unique()->values()->all(),
            'active_tables_count' => CafeTable::where('is_active', true)->count(),
            'rejected_items_count' => $rejections->count(),
        ];

        return [
            'orders' => $orders,
            'counts' => $counts,
            'stats' => $stats,
            'rejections' => $rejections,
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
        if (! $request->user() || (! $request->user()->isCashier() && ! $request->user()->isAdmin())) {
            abort(403, 'Konfirmasi pembayaran hanya dapat dilakukan melalui operasional Kasir.');
        }

        if ($order->payment_status === 'paid') {
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

        $paymentMethod = $validated['payment_method'] ?? 'cash';
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

        $alreadyPaid = false;

        DB::transaction(function () use ($request, $order, $paymentMethod, $validated, &$alreadyPaid) {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($lockedOrder->payment_status === 'paid') {
                if ($lockedOrder->order_status === 'pending') {
                    $lockedOrder->update(['order_status' => 'processing']);
                }
                $alreadyPaid = true;

                return;
            }

            $previouslySettled = $lockedOrder->getSettledAmount();
            $expectedTotal = (float) $lockedOrder->total_amount;
            $remainingDue = max(0.0, $expectedTotal - $previouslySettled);
            $newOrderStatus = $lockedOrder->order_status === 'pending' ? 'processing' : $lockedOrder->order_status;

            if ($previouslySettled > 0 && $remainingDue > 0) {
                if ($paymentMethod === 'cash' && isset($validated['cash_received']) && (float) $validated['cash_received'] > 0) {
                    $inputCash = (float) $validated['cash_received'];
                    if ($inputCash < $expectedTotal) {
                        $changeAmount = max(0.0, $inputCash - $remainingDue);
                        $cashReceived = $previouslySettled + $inputCash;
                    } else {
                        $cashReceived = $inputCash;
                        $changeAmount = max(0.0, $inputCash - $expectedTotal);
                    }
                } else {
                    $cashReceived = $expectedTotal;
                    $changeAmount = 0.0;
                }
            } else {
                $cashReceived = $paymentMethod === 'cash' && isset($validated['cash_received']) && (float) $validated['cash_received'] > 0
                    ? (float) $validated['cash_received']
                    : $expectedTotal;
                $changeAmount = $paymentMethod === 'cash'
                    ? max(0.0, $cashReceived - $expectedTotal)
                    : 0.0;
            }

            $lockedOrder->update([
                'payment_status' => 'paid',
                'payment_method' => $paymentMethod,
                'paid_at' => $lockedOrder->paid_at ?? now('Asia/Jakarta'),
                'payment_reference' => $validated['payment_reference'] ?? $lockedOrder->payment_reference ?? ('POS-'.$lockedOrder->order_number),
                'cash_received' => $cashReceived,
                'change_amount' => $changeAmount,
                'confirmed_by' => $request->user()->id,
                'order_status' => $newOrderStatus,
            ]);

            $methodLabel = match ($paymentMethod) {
                'qris' => 'QRIS',
                'transfer' => 'Transfer Bank',
                'debit' => 'Kartu Debit',
                default => 'Tunai',
            };

            if ($previouslySettled > 0 && $remainingDue > 0) {
                $remainingFormatted = number_format($remainingDue, 0, ',', '.');
                $totalFormatted = number_format($expectedTotal, 0, ',', '.');
                $notes = "Pembayaran tagihan menu tambahan sebesar Rp {$remainingFormatted} via {$methodLabel} diterima & dikonfirmasi oleh staf {$request->user()->name}. Total lunas: Rp {$totalFormatted}.";
            } else {
                $notes = "Pembayaran via {$methodLabel} diterima & dikonfirmasi oleh staf {$request->user()->name}.";
                if ($paymentMethod === 'cash' && isset($validated['cash_received']) && $validated['cash_received'] > 0) {
                    $cashReceivedFormatted = number_format($cashReceived, 0, ',', '.');
                    $changeFormatted = number_format($changeAmount, 0, ',', '.');
                    $notes .= " (Uang: Rp {$cashReceivedFormatted}, Kembalian: Rp {$changeFormatted})";
                }
            }

            OrderStatusHistory::create([
                'order_id' => $lockedOrder->id,
                'user_id' => $request->user()->id,
                'status' => $lockedOrder->order_status,
                'notes' => $notes,
            ]);
        });

        if ($alreadyPaid) {
            return $this->respondCashierAction(
                $request,
                'info',
                "Pesanan #{$order->order_number} sudah dibayar sebelumnya."
            );
        }

        $order->refresh();

        try {
            event(new OrderStatusUpdated($order, 'pending', $order->order_status));
        } catch (\Throwable $e) {
            // Abaikan broadcaster error jika driver off
        }

        return $this->respondCashierAction(
            $request,
            'success',
            "Pembayaran untuk Pesanan #{$order->order_number} berhasil dikonfirmasi!"
        );
    }

    /**
     * Memperbarui status operasional pesanan (processing -> ready -> completed / cancelled).
     */
    public function updateStatus(Request $request, Order $order): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:processing,ready,completed,cancelled'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $newStatus = $validated['status'];
        $previousStatus = $order->order_status;
        $blockedError = null;

        DB::transaction(function () use ($request, $order, &$previousStatus, $newStatus, $validated, &$blockedError) {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $previousStatus = $lockedOrder->order_status;

            if ($lockedOrder->order_status === 'completed') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah selesai dan tidak dapat diproses ulang.";

                return;
            }

            if ($lockedOrder->order_status === 'cancelled') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah dibatalkan dan tidak dapat diproses ulang.";

                return;
            }

            if ($newStatus === 'completed' && $lockedOrder->payment_status !== 'paid') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} belum lunas. Konfirmasi pembayaran terlebih dahulu sebelum menyelesaikan pesanan.";

                return;
            }

            $lockedOrder->update([
                'order_status' => $newStatus,
            ]);

            $labels = [
                'processing' => 'Sedang Diracik Barista',
                'ready' => 'Siap Saji (Ready to Pickup)',
                'completed' => 'Pesanan Selesai & Ditutup',
                'cancelled' => 'Dibatalkan',
            ];

            $label = $labels[$newStatus] ?? $newStatus;
            $auditNote = $validated['notes'] ?? "Status pesanan diubah dari {$previousStatus} ke {$label} oleh staf {$request->user()->name}";

            OrderStatusHistory::create([
                'order_id' => $lockedOrder->id,
                'user_id' => $request->user()->id,
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
        } catch (\Throwable $e) {
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
     * Menolak menu tertentu dalam pesanan kasir (Item-Level Rejection).
     */
    public function rejectItem(Request $request, Order $order, OrderItem $item): RedirectResponse|JsonResponse
    {
        if ($item->order_id !== $order->id) {
            return $this->respondCashierAction($request, 'error', 'Item menu tidak sesuai dengan pesanan.', 422);
        }

        if ($order->order_status === 'completed' || $order->order_status === 'cancelled') {
            return $this->respondCashierAction(
                $request,
                'error',
                "Tidak dapat menolak menu pada pesanan yang sudah {$order->order_status}.",
                422
            );
        }

        if ($item->status === 'rejected') {
            return $this->respondCashierAction(
                $request,
                'info',
                "Menu {$item->menu_name} sudah berstatus ditolak sebelumnya."
            );
        }

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        DB::transaction(function () use ($request, $order, $item, $validated) {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            // 1. Ubah status item menjadi rejected dan simpan audit
            $item->update([
                'status' => 'rejected',
                'rejection_reason' => $validated['reason'],
                'rejected_at' => now(),
                'rejected_by' => $request->user()->id,
            ]);

            // 2. Hitung ulang total pesanan berdasarkan item yang masih aktif
            $activeItems = $lockedOrder->items()->where('status', 'active')->get();
            $newSubtotal = (float) $activeItems->sum('total_price');

            // 3. Jika semua item ditolak, batalkan pesanan induk secara otomatis
            if ($activeItems->isEmpty()) {
                $lockedOrder->update([
                    'order_status' => 'cancelled',
                    'subtotal' => 0,
                    'total_amount' => 0,
                ]);

                OrderStatusHistory::create([
                    'order_id' => $lockedOrder->id,
                    'user_id' => $request->user()->id,
                    'status' => 'cancelled',
                    'notes' => "Pesanan otomatis dibatalkan karena semua menu ditolak. Menu terakhir ditolak: {$item->menu_name} (x{$item->quantity}). Alasan: {$validated['reason']}",
                ]);
            } else {
                $previouslySettled = $lockedOrder->getSettledAmount();
                $updateOrderPayload = [
                    'subtotal' => $newSubtotal,
                    'total_amount' => $newSubtotal,
                ];

                if ($lockedOrder->paid_at !== null && $lockedOrder->payment_status === 'unpaid' && $previouslySettled >= $newSubtotal && $newSubtotal > 0) {
                    $updateOrderPayload['payment_status'] = 'paid';
                }

                $lockedOrder->update($updateOrderPayload);

                OrderStatusHistory::create([
                    'order_id' => $lockedOrder->id,
                    'user_id' => $request->user()->id,
                    'status' => $lockedOrder->order_status,
                    'notes' => "Menu '{$item->menu_name}' (x{$item->quantity}) ditolak oleh kasir {$request->user()->name}. Alasan: {$validated['reason']}. Total tagihan diperbarui menjadi Rp ".number_format($newSubtotal, 0, ',', '.'),
                ]);
            }
        });

        try {
            event(new OrderItemRejected($order, $item));
        } catch (\Throwable $e) {
            // Abaikan broadcaster error
        }

        return $this->respondCashierAction(
            $request,
            'success',
            "Menu {$item->menu_name} berhasil ditolak dan dicatat di Riwayat Penolakan."
        );
    }
}
