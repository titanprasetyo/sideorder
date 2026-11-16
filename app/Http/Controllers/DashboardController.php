<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Admin\FinancialReportController;
use App\Http\Requests\Admin\FinancialReportFilterRequest;
use App\Models\CafeTable;
use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Redirector;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    private const TIMEZONE = 'Asia/Jakarta';

    /**
     * Tampilkan Ringkasan & Laporan Keuangan Terpadu Administrator SIDEORDER.
     */
    public function index(Request $request, FinancialReportController $financialController): Response|RedirectResponse
    {
        // Kasir tidak memerlukan dashboard analitik admin, langsung alihkan ke Papan Pesanan Masuk
        if ($request->user() && $request->user()->isCashier()) {
            return redirect()->route('cashier.orders.index');
        }

        // Resolusi filter request untuk kalkulasi finansial
        $filterRequest = $this->resolveFilterRequest($request);
        $financialData = $financialController->buildReportData($filterRequest);

        // Ambil metrik operasional langsung & tren 7 hari aktual
        $operationalData = $this->getOperationalMetrics();
        $salesTrend7d = $this->getSalesTrend7Days();

        // Gunakan menu terlaris periode aktif secara presisi
        $topMenus = ! empty($financialData['product_analytics']['top_selling'])
            ? $financialData['product_analytics']['top_selling']
            : $operationalData['top_menus'];

        // Siapkan recent_orders untuk kompatibilitas riwayat transaksi cepat
        $paginator = $financialData['transactions'] ?? null;
        $recentOrders = $paginator instanceof Paginator
            ? array_slice($paginator->items(), 0, 15)
            : [];

        return Inertia::render('dashboard', array_merge($financialData, $operationalData, [
            'top_menus' => $topMenus,
            'sales_trend_7d' => $salesTrend7d,
            'recent_orders' => $recentOrders,
        ]));
    }

    /**
     * Endpoint API JSON sinkronisasi on-demand / polling untuk dashboard terpadu.
     */
    public function sync(Request $request, FinancialReportController $financialController): JsonResponse
    {
        if (! $request->user() || ! $request->user()->isAdmin()) {
            abort(403, 'Akses ditolak. Hanya Administrator yang dapat menyinkronkan analitik dashboard.');
        }

        $filterRequest = $this->resolveFilterRequest($request);
        $financialData = $financialController->buildReportData($filterRequest);
        $operationalData = $this->getOperationalMetrics();
        $salesTrend7d = $this->getSalesTrend7Days();

        $topMenus = ! empty($financialData['product_analytics']['top_selling'])
            ? $financialData['product_analytics']['top_selling']
            : $operationalData['top_menus'];

        return response()->json(array_merge($financialData, $operationalData, [
            'top_menus' => $topMenus,
            'sales_trend_7d' => $salesTrend7d,
        ]));
    }

    private function resolveFilterRequest(Request $request): FinancialReportFilterRequest
    {
        /** @var FinancialReportFilterRequest $filterRequest */
        $filterRequest = FinancialReportFilterRequest::createFrom($request);
        $filterRequest->setContainer(app());
        $filterRequest->setRedirector(app(Redirector::class));
        $filterRequest->validateResolved();

        return $filterRequest;
    }

    /**
     * Mengambil seluruh metrik operasional kafe terkini (Live status).
     *
     * @return array{
     *     operational: array<string, int>,
     *     hourly_trend: list<array<string, mixed>>,
     *     hourly_summary: array<string, mixed>,
     *     top_menus: list<array<string, mixed>>
     * }
     */
    private function getOperationalMetrics(): array
    {
        $todayStart = Carbon::today(self::TIMEZONE)->startOfDay();
        $todayEnd = Carbon::today(self::TIMEZONE)->endOfDay();

        // 1. Ambil seluruh pesanan hari ini untuk status pipeline dapur
        $todayOrders = Order::whereBetween('created_at', [$todayStart, $todayEnd])->get();

        $inKitchen = $todayOrders->where('order_status', 'processing')->count();
        $readyForPickup = $todayOrders->where('order_status', 'ready')->count();
        $completedToday = $todayOrders->where('order_status', 'completed')->count();
        $pendingPayments = $todayOrders->where('payment_status', 'unpaid')
            ->where('order_status', '!=', 'cancelled')
            ->count();

        // 2. Okupansi Meja Aktif
        $tables = CafeTable::withCount('activeOrders')->where('is_active', true)->get();
        $totalTables = $tables->count();
        $occupiedTables = $tables->where('active_orders_count', '>', 0)->count();
        $occupancyRate = $totalTables > 0 ? (int) round(($occupiedTables / $totalTables) * 100) : 0;

        // 3. Tren Penjualan per Jam Hari Ini (08:00 - 21:00 WIB)
        // Dikelompokkan sekali secara O(N) untuk mencegah multi-pass parsing Carbon yang membebani CPU
        $ordersByHour = [];
        foreach ($todayOrders as $o) {
            $hInt = (int) Carbon::parse($o->created_at)->timezone(self::TIMEZONE)->hour;
            $ordersByHour[$hInt][] = $o;
        }

        $hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
        $hourlyTrend = [];
        $peakHour = '12:00';
        $maxHourlyRevenue = 0.0;
        $totalHourlyRevenue = 0.0;
        $totalHourlyOrders = 0;

        foreach ($hours as $h) {
            $hInt = (int) substr($h, 0, 2);
            $ordersInHour = collect($ordersByHour[$hInt] ?? []);

            $hRevenue = (float) $ordersInHour->where('payment_status', 'paid')
                ->where('order_status', '!=', 'cancelled')
                ->sum(fn (Order $o) => $o->getRealizedNetAmount());
            $hCount = $ordersInHour->count();

            if ($hRevenue > $maxHourlyRevenue) {
                $maxHourlyRevenue = $hRevenue;
                $peakHour = $h;
            }

            $totalHourlyRevenue += $hRevenue;
            $totalHourlyOrders += $hCount;

            $hourlyTrend[] = [
                'hour' => $h,
                'revenue' => $hRevenue,
                'orders_count' => $hCount,
                'is_peak' => false,
            ];
        }

        if ($maxHourlyRevenue > 0) {
            foreach ($hourlyTrend as &$item) {
                if ($item['hour'] === $peakHour) {
                    $item['is_peak'] = true;
                }
            }
            unset($item);
        }

        // 4. Top 5 Menu Terlaris (Berdasarkan Kuantitas Terjual Aktual)
        $rawTopMenus = OrderItem::query()
            ->where('status', 'active')
            ->whereHas('order', function ($q): void {
                $q->whereNotIn('order_status', ['cancelled']);
            })
            ->selectRaw('menu_name, SUM(quantity) as total_qty, SUM(total_price) as total_revenue')
            ->groupBy('menu_name')
            ->orderByDesc('total_qty')
            ->limit(5)
            ->get();

        $maxQty = (int) ($rawTopMenus->max('total_qty') ?: 1);

        $topMenus = array_values($rawTopMenus->map(function (object $item) use ($maxQty): array {
            /** @var object{menu_name: string, total_qty: int|string, total_revenue: float|string} $row */
            $row = $item;
            $qty = (int) $row->total_qty;
            $rev = (float) $row->total_revenue;

            return [
                'menu_name' => $row->menu_name,
                'total_qty' => $qty,
                'total_revenue' => $rev,
                'percentage' => (int) round(($qty / $maxQty) * 100),
            ];
        })->all());

        return [
            'operational' => [
                'in_kitchen' => $inKitchen,
                'ready_for_pickup' => $readyForPickup,
                'completed_today' => $completedToday,
                'pending_payments' => $pendingPayments,
                'total_tables' => $totalTables,
                'occupied_tables' => $occupiedTables,
                'occupancy_rate' => $occupancyRate,
            ],
            'hourly_trend' => $hourlyTrend,
            'hourly_summary' => [
                'max_revenue' => $maxHourlyRevenue,
                'peak_hour' => $maxHourlyRevenue > 0 ? $peakHour : null,
                'total_revenue' => $totalHourlyRevenue,
                'total_orders' => $totalHourlyOrders,
            ],
            'top_menus' => $topMenus,
        ];
    }

    /**
     * Menghitung tren penjualan 7 hari terakhir (Hari ini mundur 6 hari) secara presisi.
     *
     * @return array<string, mixed>
     */
    private function getSalesTrend7Days(): array
    {
        $today = Carbon::today(self::TIMEZONE);
        $start7Days = $today->copy()->subDays(6)->startOfDay();
        $endToday = $today->copy()->endOfDay();

        // Ambil pesanan dalam rentang 7 hari terakhir
        $orders = Order::where(function ($q) use ($start7Days, $endToday): void {
            $q->whereBetween('paid_at', [$start7Days, $endToday])
                ->orWhere(function ($sub) use ($start7Days, $endToday): void {
                    $sub->whereNull('paid_at')->whereBetween('created_at', [$start7Days, $endToday]);
                });
        })->get();

        $trend = [];
        $maxRevenue = 0.0;
        $totalRevenue = 0.0;
        $totalPaidOrders = 0;
        $peakDateKey = null;

        // Kelompokkan pesanan sekali (O(N)) berdasarkan tanggal efektif untuk meminimalkan parsing Carbon
        $ordersByDate = [];
        foreach ($orders as $order) {
            $effDate = Carbon::parse($order->paid_at ?? $order->created_at)->timezone(self::TIMEZONE)->format('Y-m-d');
            $ordersByDate[$effDate][] = $order;
        }

        $dayNames = [
            0 => 'Minggu', 1 => 'Senin', 2 => 'Selasa', 3 => 'Rabu',
            4 => 'Kamis', 5 => 'Jumat', 6 => 'Sabtu',
        ];
        $monthNames = [
            1 => 'Januari', 2 => 'Februari', 3 => 'Maret', 4 => 'April',
            5 => 'Mei', 6 => 'Juni', 7 => 'Juli', 8 => 'Agustus',
            9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Desember',
        ];

        for ($i = 6; $i >= 0; $i--) {
            $date = $today->copy()->subDays($i);
            $dateKey = $date->format('Y-m-d');
            $dayOrders = collect($ordersByDate[$dateKey] ?? []);

            $paidOrders = $dayOrders->filter(fn (Order $o): bool => $o->isRealizedRevenue());
            $dayRevenue = (float) $paidOrders->sum(fn (Order $o): float => $o->getRealizedNetAmount());
            $dayPaidCount = $paidOrders->count();

            if ($dayRevenue > $maxRevenue) {
                $maxRevenue = $dayRevenue;
                $peakDateKey = $dateKey;
            }

            $totalRevenue += $dayRevenue;
            $totalPaidOrders += $dayPaidCount;

            $fullLabel = ($dayNames[$date->dayOfWeek] ?? '')
                .', '.$date->format('j')
                .' '.$monthNames[(int) $date->format('n')]
                .' '.$date->format('Y');

            $trend[] = [
                'key' => $dateKey,
                'date' => $date->format('d M'),
                'full_label' => $fullLabel,
                'revenue' => $dayRevenue,
                'orders_count' => $dayPaidCount,
                'is_today' => $date->isToday(),
                'is_peak' => false,
            ];
        }

        if ($maxRevenue > 0 && $peakDateKey) {
            foreach ($trend as &$item) {
                if ($item['key'] === $peakDateKey) {
                    $item['is_peak'] = true;
                }
            }
            unset($item);
        }

        return [
            'data' => $trend,
            'max_revenue' => $maxRevenue,
            'total_revenue' => $totalRevenue,
            'total_paid' => $totalPaidOrders,
            'peak_date' => $peakDateKey,
        ];
    }
}
