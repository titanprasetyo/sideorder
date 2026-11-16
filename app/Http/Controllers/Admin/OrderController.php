<?php

namespace App\Http\Controllers\Admin;

use App\Events\OrderStatusUpdated;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Services\Payments\PaymentService;
use App\Services\Stock\MenuStockService;
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
    public function __construct(
        private readonly PaymentService $paymentService,
        private readonly MenuStockService $menuStockService,
    ) {}

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

        return response()->stream(function () use ($request): void {
            $data = $this->getAdminOrdersData($request);
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
     * Helper query data pesanan admin dengan kalkulasi agregasi tunggal.
     *
     * @return array<string, mixed>
     */
    private function getAdminOrdersData(Request $request): array
    {
        @set_time_limit(60);

        $statusFilter = (string) $request->query('status', 'all');
        $paymentFilter = (string) $request->query('payment', 'all');
        $dateFilter = (string) $request->query('date', 'today'); // 'today', 'yesterday', 'this_week', 'this_month', 'all'
        $search = (string) $request->query('search', '');

        $todayStart = Carbon::today()->startOfDay();
        $todayEnd = Carbon::today()->endOfDay();
        $yesterdayStart = Carbon::yesterday()->startOfDay();
        $yesterdayEnd = Carbon::yesterday()->endOfDay();
        $weekStart = Carbon::now()->startOfWeek();
        $weekEnd = Carbon::now()->endOfWeek();
        $monthStart = Carbon::now()->startOfMonth();
        $monthEnd = Carbon::now()->endOfMonth();

        // 1. Single Aggregation untuk Ringkasan Global
        /** @var object{total_all_time?: int|string, today_orders?: int|string, yesterday_orders?: int|string, today_revenue?: float|string}|null $globalMetrics */
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
            $dateQuery->whereBetween('created_at', [$weekStart, $weekEnd]);
        } elseif ($dateFilter === 'this_month') {
            $dateQuery->whereBetween('created_at', [$monthStart, $monthEnd]);
        }

        // 3. Single Aggregation untuk Badge Tab Status
        /** @var object{all_count?: int|string, pending?: int|string, processing?: int|string, ready?: int|string, completed?: int|string, cancelled?: int|string, unpaid?: int|string}|null $tabMetrics */
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
        $query = (clone $dateQuery)->with(['table', 'items.options', 'items.rejectedByUser', 'latestPayment'])
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
        if (trim($search) !== '') {
            $likeTerm = '%'.strtolower(trim($search)).'%';
            $query->where(function ($q) use ($likeTerm): void {
                $q->whereRaw('LOWER(order_number) LIKE ?', [$likeTerm])
                    ->orWhereRaw('LOWER(customer_name) LIKE ?', [$likeTerm])
                    ->orWhereHas('table', function ($t) use ($likeTerm): void {
                        $t->whereRaw('LOWER(table_number) LIKE ?', [$likeTerm]);
                    });
            });
        }

        $orders = $query->paginate(25)->withQueryString();

        $counts = [
            'all' => (int) ($tabMetrics->all_count ?? 0),
            'pending' => (int) ($tabMetrics->pending ?? 0),
            'processing' => (int) ($tabMetrics->processing ?? 0),
            'ready' => (int) ($tabMetrics->ready ?? 0),
            'completed' => (int) ($tabMetrics->completed ?? 0),
            'cancelled' => (int) ($tabMetrics->cancelled ?? 0),
            'unpaid' => (int) ($tabMetrics->unpaid ?? 0),
            'today_orders' => (int) ($globalMetrics->today_orders ?? 0),
            'yesterday_orders' => (int) ($globalMetrics->yesterday_orders ?? 0),
            'today_revenue' => (float) ($globalMetrics->today_revenue ?? 0),
            'total_all_time' => (int) ($globalMetrics->total_all_time ?? 0),
        ];

        return [
            'orders' => $orders,
            'counts' => $counts,
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
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $validated = $request->validate([
            'status' => ['required', 'string', 'in:processing,ready,completed,cancelled'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $newStatus = (string) $validated['status'];
        $oldStatus = $order->order_status;
        $blockedError = null;

        DB::transaction(function () use ($user, $order, &$oldStatus, $newStatus, $validated, &$blockedError): void {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $oldStatus = $lockedOrder->order_status;

            if ($lockedOrder->order_status === 'completed') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah selesai dan tidak dapat diproses ulang.";

                return;
            }

            if ($lockedOrder->order_status === 'cancelled') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah dibatalkan dan tidak dapat diproses ulang.";

                return;
            }

            if ($newStatus === 'cancelled' && $lockedOrder->hasAnySettlement()) {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah memiliki pembayaran lunas dan tidak dapat dibatalkan maupun di-refund.";

                return;
            }

            if ($newStatus === 'completed' && $lockedOrder->payment_status !== 'paid') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} belum lunas. Konfirmasi pembayaran terlebih dahulu melalui Kasir.";

                return;
            }

            $lockedOrder->update([
                'order_status' => $newStatus,
            ]);

            if ($newStatus === 'cancelled') {
                $this->menuStockService->releaseUnsettledOrderStock($lockedOrder);
            }

            $auditNote = $validated['notes'] ?? "Status pesanan diubah dari {$oldStatus} ke {$newStatus} oleh Admin {$user->name}";

            OrderStatusHistory::create([
                'order_id' => $lockedOrder->id,
                'user_id' => $user->id,
                'status' => $newStatus,
                'notes' => $auditNote,
            ]);
        });

        if ($blockedError !== null) {
            return back()->with('error', $blockedError);
        }

        $order->refresh();

        try {
            event(new OrderStatusUpdated($order, $oldStatus, $newStatus));
        } catch (\Throwable) {
        }

        return back()->with('success', "Status Pesanan #{$order->order_number} berhasil diubah.");
    }

    /**
     * Batalkan pesanan yang belum dibayar.
     */
    public function destroy(Request $request, Order $order): RedirectResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $oldStatus = $order->order_status;
        $blockedError = null;

        DB::transaction(function () use ($user, $order, &$oldStatus, &$blockedError): void {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $oldStatus = $lockedOrder->order_status;

            if ($lockedOrder->order_status === 'completed') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah selesai dan tidak dapat dibatalkan.";

                return;
            }

            if ($lockedOrder->order_status === 'cancelled') {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah dibatalkan sebelumnya.";

                return;
            }

            if ($lockedOrder->hasAnySettlement()) {
                $blockedError = "Pesanan #{$lockedOrder->order_number} sudah dibayar dan tidak dapat dibatalkan maupun di-refund.";

                return;
            }

            $this->menuStockService->releaseUnsettledOrderStock($lockedOrder);

            $lockedOrder->update([
                'order_status' => 'cancelled',
                'subtotal' => 0,
                'total_amount' => 0,
            ]);

            // Tandai seluruh item yang masih aktif sebagai ditolak/dibatalkan
            $lockedOrder->items()->where('status', 'active')->update([
                'status' => 'rejected',
                'rejection_reason' => 'Dibatalkan oleh Administrator',
                'rejected_at' => now(),
                'rejected_by' => $user->id,
            ]);

            OrderStatusHistory::create([
                'order_id' => $lockedOrder->id,
                'user_id' => $user->id,
                'status' => 'cancelled',
                'notes' => "Pesanan belum bayar dibatalkan oleh Administrator {$user->name}",
            ]);
        });

        if ($blockedError !== null) {
            return back()->with('error', $blockedError);
        }

        $order->refresh();

        try {
            event(new OrderStatusUpdated($order, $oldStatus, 'cancelled'));
        } catch (\Throwable) {
        }

        return back()->with('success', "Pesanan #{$order->order_number} berhasil dibatalkan.");
    }
}
