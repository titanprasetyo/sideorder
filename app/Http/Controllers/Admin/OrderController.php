<?php

namespace App\Http\Controllers\Admin;

use App\Events\OrderItemRejected;
use App\Events\OrderStatusUpdated;
use App\Http\Controllers\Controller;
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
     * Menampilkan daftar pesanan untuk panel Administrator dengan filter lengkap.
     */
    public function index(Request $request): Response
    {
        $data = $this->getAdminOrdersData($request);

        return Inertia::render('admin/orders/index', $data);
    }

    /**
     * Endpoint API JSON berkecepatan tinggi untuk background real-time sync admin.
     */
    public function sync(Request $request): JsonResponse
    {
        $data = $this->getAdminOrdersData($request);

        return response()->json($data);
    }

    /**
     * Stream real-time SSE untuk dashboard administrator.
     */
    public function stream(Request $request): StreamedResponse
    {
        // Lepas session lock agar request lain di PHP-FPM tidak terblokir
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        return response()->stream(function () use ($request) {
            $data = $this->getAdminOrdersData($request);
            echo "retry: 2000\n";
            echo "event: sync\n";
            echo 'data: '.json_encode($data)."\n\n";
            if (ob_get_level() > 0) {
                ob_flush();
            }
            flush();
        }, 200, [
            'Content-Type' => 'text/event-stream ',
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * Helper query data pesanan admin dengan kalkulasi agregasi tunggal.
     */
    private function getAdminOrdersData(Request $request): array
    {
        @set_time_limit(60);

        $statusFilter = $request->query('status', 'all');
        $paymentFilter = $request->query('payment', 'all');
        $dateFilter = $request->query('date', 'today'); // 'today', 'yesterday', 'this_week', 'this_month', 'all'
        $search = $request->query('search', '');

        $todayStart = Carbon::today()->startOfDay();
        $todayEnd = Carbon::today()->endOfDay();
        $yesterdayStart = Carbon::yesterday()->startOfDay();
        $yesterdayEnd = Carbon::yesterday()->endOfDay();

        // 1. Single Aggregation untuk Ringkasan Global
        $globalMetrics = DB::table('orders')
            ->selectRaw("
                COUNT(id) as total_all_time,
                COUNT(CASE WHEN created_at >= ? AND created_at <= ? THEN 1 END) as today_orders,
                COUNT(CASE WHEN created_at >= ? AND created_at <= ? THEN 1 END) as yesterday_orders,
                COALESCE(SUM(CASE WHEN COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) <= ? AND payment_status = 'paid' AND order_status != 'cancelled' THEN total_amount - COALESCE(refunded_amount, 0) ELSE 0 END), 0) as today_revenue
            ", [
                $todayStart,
                $todayEnd,
                $yesterdayStart,
                $yesterdayEnd,
                $todayStart,
                $todayEnd,
            ])
            ->first();

        // 2. Query Dasar Sesuai Rentang Tanggal yang Dipilih
        $dateQuery = Order::query();
        if ($dateFilter === 'today') {
            $dateQuery->whereBetween('created_at', [$todayStart, $todayEnd]);
        } elseif ($dateFilter === 'yesterday') {
            $dateQuery->whereBetween('created_at', [$yesterdayStart, $yesterdayEnd]);
        } elseif ($dateFilter === 'this_week') {
            $dateQuery->whereBetween('created_at', [Carbon::now()->startOfWeek(), Carbon::now()->endOfWeek()]);
        } elseif ($dateFilter === 'this_month') {
            $dateQuery->whereBetween('created_at', [Carbon::now()->startOfMonth(), Carbon::now()->endOfMonth()]);
        }

        // 3. Single Aggregation untuk Badge Tab Status
        $tabMetrics = (clone $dateQuery)
            ->selectRaw("
                COUNT(id) as all_count,
                COUNT(CASE WHEN order_status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN order_status = 'processing' THEN 1 END) as processing,
                COUNT(CASE WHEN order_status = 'ready' THEN 1 END) as ready,
                COUNT(CASE WHEN order_status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN order_status = 'cancelled' THEN 1 END) as cancelled,
                COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as unpaid
            ")
            ->first();

        // 4. Query Pesanan Utama dengan Relasi Ringkas
        $query = (clone $dateQuery)->with(['table', 'items.options', 'items.rejectedByUser', 'statusHistories.user'])
            ->latest();

        // Filter Status Pesanan
        if ($statusFilter !== 'all') {
            $query->where('order_status', $statusFilter);
        }

        // Filter Status Pembayaran
        if ($paymentFilter !== 'all') {
            $query->where('payment_status', $paymentFilter);
        }

        // Filter Pencarian (kompatibel PostgreSQL & SQLite)
        if (! empty($search)) {
            $likeTerm = '%'.strtolower(trim($search)).'%';
            $query->where(function ($q) use ($likeTerm) {
                $q->whereRaw('LOWER(order_number) LIKE ?', [$likeTerm])
                    ->orWhereRaw('LOWER(customer_name) LIKE ?', [$likeTerm])
                    ->orWhereHas('table', function ($t) use ($likeTerm) {
                        $t->whereRaw('LOWER(table_number) LIKE ?', [$likeTerm]);
                    });
            });
        }

        $orders = $query->paginate(25)->withQueryString();

        // Riwayat Penolakan Menu untuk Admin
        $rejectionsQuery = OrderItem::with(['order.table', 'rejectedByUser', 'options'])
            ->where('status', 'rejected');

        if ($dateFilter === 'today') {
            $rejectionsQuery->whereBetween('rejected_at', [$todayStart, $todayEnd]);
        }

        $rejections = $rejectionsQuery->latest('rejected_at')->limit(50)->get()->map(function ($item) {
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
                'rejection_reason' => $item->rejection_reason ?? 'Stok bahan habis / Ditolak kasir',
                'rejected_at' => $item->rejected_at ? $item->rejected_at->toIso8601String() : null,
                'cashier_name' => $item->rejectedByUser ? $item->rejectedByUser->name : 'Staf',
            ];
        });

        $counts = [
            'all' => (int) ($tabMetrics->all_count ?? 0),
            'pending' => (int) ($tabMetrics->pending ?? 0),
            'processing' => (int) ($tabMetrics->processing ?? 0),
            'ready' => (int) ($tabMetrics->ready ?? 0),
            'completed' => (int) ($tabMetrics->completed ?? 0),
            'cancelled' => (int) ($tabMetrics->cancelled ?? 0),
            'unpaid' => (int) ($tabMetrics->unpaid ?? 0),
            'rejections' => $rejections->count(),
            'today_orders' => (int) ($globalMetrics->today_orders ?? 0),
            'yesterday_orders' => (int) ($globalMetrics->yesterday_orders ?? 0),
            'today_revenue' => (float) ($globalMetrics->today_revenue ?? 0),
            'total_all_time' => (int) ($globalMetrics->total_all_time ?? 0),
        ];

        return [
            'orders' => $orders,
            'counts' => $counts,
            'rejections' => $rejections,
            'filters' => [
                'status' => $statusFilter,
                'payment' => $paymentFilter,
                'date' => $dateFilter,
                'search' => $search,
            ],
            'timestamp' => microtime(true),
        ];
    }

    /**
     * Konfirmasi pembayaran tidak diizinkan melalui panel Admin.
     * Proses konfirmasi pembayaran dilakukan melalui operasional Kasir sesuai role.
     */
    public function confirmPayment(Request $request, Order $order): RedirectResponse
    {
        abort(403, 'Admin hanya melihat dan memantau pesanan. Konfirmasi pembayaran dilakukan melalui halaman operasional Kasir.');
    }

    /**
     * Memperbarui status pesanan oleh Administrator.
     */
    public function updateStatus(Request $request, Order $order): RedirectResponse
    {
        if ($order->order_status === 'completed') {
            return back()->with('error', "Pesanan #{$order->order_number} sudah selesai dan tidak dapat diproses ulang.");
        }

        if ($order->order_status === 'cancelled') {
            return back()->with('error', "Pesanan #{$order->order_number} sudah dibatalkan dan tidak dapat diproses ulang.");
        }

        $validated = $request->validate([
            'status' => ['required', 'string', 'in:processing,ready,completed,cancelled'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $oldStatus = $order->order_status;
        $newStatus = $validated['status'];

        DB::transaction(function () use ($request, $order, $oldStatus, $newStatus, $validated) {
            $order->update([
                'order_status' => $newStatus,
            ]);

            $auditNote = $validated['notes'] ?? "Status pesanan diubah dari {$oldStatus} ke {$newStatus} oleh Admin {$request->user()->name}";

            OrderStatusHistory::create([
                'order_id' => $order->id,
                'user_id' => $request->user()->id,
                'status' => $newStatus,
                'notes' => $auditNote,
            ]);
        });

        try {
            event(new OrderStatusUpdated($order, $oldStatus, $newStatus));
        } catch (\Throwable $e) {
        }

        return back()->with('success', "Status Pesanan #{$order->order_number} berhasil diubah.");
    }

    /**
     * Menolak item menu oleh Administrator.
     */
    public function rejectItem(Request $request, Order $order, OrderItem $item): RedirectResponse
    {
        if ($item->order_id !== $order->id) {
            return back()->with('error', 'Item menu tidak sesuai dengan pesanan.');
        }

        if ($order->order_status === 'completed' || $order->order_status === 'cancelled') {
            return back()->with('error', "Tidak dapat menolak menu pada pesanan yang sudah {$order->order_status}.");
        }

        if ($item->status === 'rejected') {
            return back()->with('info', "Menu {$item->menu_name} sudah berstatus ditolak sebelumnya.");
        }

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        DB::transaction(function () use ($request, $order, $item, $validated) {
            $item->update([
                'status' => 'rejected',
                'rejection_reason' => $validated['reason'],
                'rejected_at' => now(),
                'rejected_by' => $request->user()->id,
            ]);

            $activeItems = $order->items()->where('status', 'active')->get();
            $newSubtotal = (float) $activeItems->sum('total_price');

            if ($activeItems->isEmpty()) {
                $order->update([
                    'order_status' => 'cancelled',
                    'subtotal' => 0,
                    'total_amount' => 0,
                ]);

                OrderStatusHistory::create([
                    'order_id' => $order->id,
                    'user_id' => $request->user()->id,
                    'status' => 'cancelled',
                    'notes' => "Pesanan otomatis dibatalkan oleh Admin {$request->user()->name} karena semua menu ditolak. Alasan: {$validated['reason']}",
                ]);
            } else {
                $previouslySettled = $order->getSettledAmount();
                $updateOrderPayload = [
                    'subtotal' => $newSubtotal,
                    'total_amount' => $newSubtotal,
                ];

                if ($order->paid_at !== null && $order->payment_status === 'unpaid' && $previouslySettled >= $newSubtotal && $newSubtotal > 0) {
                    $updateOrderPayload['payment_status'] = 'paid';
                }

                $order->update($updateOrderPayload);

                OrderStatusHistory::create([
                    'order_id' => $order->id,
                    'user_id' => $request->user()->id,
                    'status' => $order->order_status,
                    'notes' => "Menu '{$item->menu_name}' (x{$item->quantity}) ditolak oleh Admin {$request->user()->name}. Alasan: {$validated['reason']}. Total tagihan diperbarui menjadi Rp ".number_format($newSubtotal, 0, ',', '.'),
                ]);
            }
        });

        try {
            event(new OrderItemRejected($order, $item));
        } catch (\Throwable $e) {
        }

        return back()->with('success', "Menu {$item->menu_name} berhasil ditolak.");
    }

    /**
     * Batalkan pesanan.
     */
    public function destroy(Request $request, Order $order): RedirectResponse
    {
        if ($order->order_status === 'completed') {
            return back()->with('error', "Pesanan #{$order->order_number} sudah selesai dan tidak dapat dibatalkan.");
        }

        DB::transaction(function () use ($request, $order) {
            $order->update([
                'order_status' => 'cancelled',
            ]);

            // Tandai seluruh item yang masih aktif sebagai ditolak/dibatalkan
            $order->items()->where('status', 'active')->update([
                'status' => 'rejected',
                'rejection_reason' => 'Dibatalkan oleh Administrator',
                'rejected_at' => now(),
                'rejected_by' => $request->user()->id,
            ]);

            OrderStatusHistory::create([
                'order_id' => $order->id,
                'user_id' => $request->user()->id,
                'status' => 'cancelled',
                'notes' => "Pesanan dibatalkan oleh Administrator {$request->user()->name}",
            ]);
        });

        try {
            event(new OrderStatusUpdated($order, $order->order_status, 'cancelled'));
        } catch (\Throwable $e) {
        }

        return back()->with('success', "Pesanan #{$order->order_number} berhasil dibatalkan.");
    }
}
