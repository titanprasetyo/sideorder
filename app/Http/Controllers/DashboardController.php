<?php

namespace App\Http\Controllers;

use App\Models\CafeTable;
use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    /**
     * Tampilkan Ringkasan Metrik Finansial & Operasional Kafe (Single Batch Query)
     */
    public function index(Request $request): Response|RedirectResponse
    {
        // Kasir tidak memerlukan dashboard analitik admin, langsung alihkan ke Papan Pesanan Masuk
        if ($request->user() && $request->user()->isCashier()) {
            return redirect()->route('cashier.orders.index');
        }

        $todayStart = Carbon::today('Asia/Jakarta')->startOfDay();
        $todayEnd = Carbon::today('Asia/Jakarta')->endOfDay();
        $yesterdayStart = Carbon::yesterday('Asia/Jakarta')->startOfDay();
        $yesterdayEnd = Carbon::yesterday('Asia/Jakarta')->endOfDay();
        $startOfMonth = Carbon::now('Asia/Jakarta')->startOfMonth()->startOfDay();
        $sevenDaysAgo = Carbon::today('Asia/Jakarta')->subDays(6)->startOfDay();

        $startDate = $sevenDaysAgo->lessThan($startOfMonth) ? $sevenDaysAgo : $startOfMonth;

        // =========================================================================
        // QUERY 1: Ambil seluruh pesanan relevan dalam 1 kali request
        // =========================================================================
        $orders = Order::where(function ($q) use ($startDate) {
            $q->where('created_at', '>=', $startDate)
                ->orWhere('paid_at', '>=', $startDate);
        })->get();

        // 1. Filter Pesanan Hari Ini (Operasional berdasarkan created_at, Pendapatan berdasarkan paid_at/created_at)
        $todayOrders = $orders->filter(function ($order) use ($todayStart, $todayEnd) {
            $createdAt = Carbon::parse($order->created_at)->timezone('Asia/Jakarta');

            return $createdAt->between($todayStart, $todayEnd);
        });

        $todayPaidOrders = $orders->filter(function (Order $order) use ($todayStart, $todayEnd) {
            if (! $order->isRealizedRevenue()) {
                return false;
            }
            $effectivePaidAt = Carbon::parse($order->paid_at ?? $order->created_at)->timezone('Asia/Jakarta');

            return $effectivePaidAt->between($todayStart, $todayEnd);
        });

        $todayRevenue = (float) $todayPaidOrders->sum(fn (Order $o) => $o->getRealizedNetAmount());
        $todayOrdersCount = $todayOrders->count();
        $todayPaidCount = $todayPaidOrders->count();
        $todayAov = $todayPaidCount > 0 ? (int) round($todayRevenue / $todayPaidCount) : 0;

        // 2. Filter Pesanan Kemarin (untuk perbandingan pertumbuhan)
        $yesterdayPaidOrders = $orders->filter(function (Order $order) use ($yesterdayStart, $yesterdayEnd) {
            if (! $order->isRealizedRevenue()) {
                return false;
            }
            $effectivePaidAt = Carbon::parse($order->paid_at ?? $order->created_at)->timezone('Asia/Jakarta');

            return $effectivePaidAt->between($yesterdayStart, $yesterdayEnd);
        });
        $yesterdayPaidRevenue = (float) $yesterdayPaidOrders->sum(fn (Order $o) => $o->getRealizedNetAmount());

        $growthPercent = 0.0;
        if ($yesterdayPaidRevenue > 0) {
            $growthPercent = round((($todayRevenue - $yesterdayPaidRevenue) / $yesterdayPaidRevenue) * 100, 1);
        } elseif ($todayRevenue > 0) {
            $growthPercent = 100.0;
        }

        // 3. Filter Pesanan Bulan Ini
        $monthOrders = $orders->filter(function ($order) use ($startOfMonth) {
            return Carbon::parse($order->created_at)->timezone('Asia/Jakarta')->gte($startOfMonth);
        });
        $monthPaidOrders = $orders->filter(function (Order $order) use ($startOfMonth) {
            if (! $order->isRealizedRevenue()) {
                return false;
            }

            return Carbon::parse($order->paid_at ?? $order->created_at)->timezone('Asia/Jakarta')->gte($startOfMonth);
        });
        $monthRevenue = (float) $monthPaidOrders->sum(fn (Order $o) => $o->getRealizedNetAmount());
        $monthOrdersCount = $monthOrders->count();

        // 4. Distribusi Pipeline Pesanan Hari Ini
        $pendingPayments = $todayOrders->where('payment_status', 'unpaid')
            ->where('order_status', '!=', 'cancelled')
            ->count();

        $inKitchen = $todayOrders->where('order_status', 'processing')->count();
        $readyForPickup = $todayOrders->where('order_status', 'ready')->count();
        $completedToday = $todayOrders->where('order_status', 'completed')->count();

        // 5. Kalkulasi Tren 7 Hari
        $salesTrend = [];
        for ($i = 6; $i >= 0; $i--) {
            $targetDate = Carbon::today()->subDays($i);
            $dayStart = $targetDate->copy()->startOfDay();
            $dayEnd = $targetDate->copy()->endOfDay();
            $dayLabel = $targetDate->format('d M');

            $dayOrders = $orders->filter(function ($order) use ($dayStart, $dayEnd) {
                return Carbon::parse($order->created_at)->between($dayStart, $dayEnd);
            });

            $dayRevenue = (float) $dayOrders->where('payment_status', 'paid')->sum('total_amount');
            $dayOrdersCount = $dayOrders->count();

            $salesTrend[] = [
                'date' => $dayLabel,
                'revenue' => $dayRevenue,
                'orders_count' => $dayOrdersCount,
            ];
        }

        // =========================================================================
        // QUERY 2: Okupansi Meja
        // =========================================================================
        $tables = CafeTable::withCount('activeOrders')->where('is_active', true)->get();
        $totalTables = $tables->count();
        $occupiedTables = $tables->where('active_orders_count', '>', 0)->count();

        // =========================================================================
        // QUERY 3: Tren Penjualan per Jam Hari Ini (Real Data Only - Tidak Ada Data Palsu)
        // =========================================================================
        $hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
        $hourlyTrend = [];
        $peakHour = '12:00';
        $maxHourlyRevenue = 0;

        foreach ($hours as $h) {
            $hInt = (int) substr($h, 0, 2);
            $ordersInHour = $todayOrders->filter(function ($o) use ($hInt) {
                return Carbon::parse($o->created_at)->hour === $hInt;
            });

            $hRevenue = (float) $ordersInHour->where('payment_status', 'paid')->sum('total_amount');
            $hCount = $ordersInHour->count();

            if ($hRevenue > $maxHourlyRevenue) {
                $maxHourlyRevenue = $hRevenue;
                $peakHour = $h;
            }

            $hourlyTrend[] = [
                'hour' => $h,
                'revenue' => $hRevenue,
                'orders_count' => $hCount,
                'is_peak' => false,
            ];
        }

        // Tandai jam puncak jika ada revenue
        if ($maxHourlyRevenue > 0) {
            foreach ($hourlyTrend as &$item) {
                if ($item['hour'] === $peakHour) {
                    $item['is_peak'] = true;
                }
            }
            unset($item);
        }

        // =========================================================================
        // QUERY 4: 5 Menu Terlaris (1 kali query agregasi)
        // =========================================================================
        $topMenus = OrderItem::query()
            ->where('status', 'active')
            ->whereHas('order', function ($q) {
                $q->whereNotIn('order_status', ['cancelled']);
            })
            ->selectRaw('menu_name, SUM(quantity) as total_qty, SUM(total_price) as total_revenue')
            ->groupBy('menu_name')
            ->orderByDesc('total_qty')
            ->limit(5)
            ->get()
            ->map(function ($item) {
                return [
                    'menu_name' => $item->menu_name,
                    'total_qty' => (int) $item->total_qty,
                    'total_revenue' => (float) $item->total_revenue,
                ];
            });

        // =========================================================================
        // QUERY 5: 15 Transaksi Terkini dengan Meja & Ringkasan Item
        // =========================================================================
        $recentOrders = Order::with(['table', 'items' => function ($q) {
            $q->where('status', 'active')->with('options');
        }])
            ->latest()
            ->limit(15)
            ->get()
            ->map(function ($order) {
                $itemsSummary = $order->items->map(function ($it) {
                    $optLabels = $it->options && $it->options->isNotEmpty()
                        ? ' ('.$it->options->pluck('option_name')->join(', ').')'
                        : '';

                    return "{$it->quantity}x {$it->menu_name}{$optLabels}";
                })->join(', ');

                $createdWib = Carbon::parse($order->created_at)->timezone('Asia/Jakarta');

                return [
                    'id' => $order->id,
                    'order_number' => $order->order_number,
                    'customer_name' => $order->customer_name,
                    'table_number' => $order->table ? $order->table->table_number : '00',
                    'total_amount' => (float) $order->total_amount,
                    'order_status' => $order->order_status,
                    'payment_status' => $order->payment_status,
                    'payment_method' => $order->payment_method,
                    'created_at' => $createdWib->isToday()
                        ? $createdWib->format('H:i').' WIB'
                        : $createdWib->format('d M Y, H:i').' WIB',
                    'items_summary' => $itemsSummary ?: 'Item pesanan',
                    'notes' => $order->notes,
                ];
            });

        return Inertia::render('dashboard', [
            'stats' => [
                'today_revenue' => $todayRevenue,
                'today_orders_count' => $todayOrdersCount,
                'today_paid_count' => $todayPaidCount,
                'today_aov' => $todayAov,
                'month_revenue' => $monthRevenue,
                'month_orders_count' => $monthOrdersCount,
                'total_tables' => $totalTables,
                'occupied_tables' => $occupiedTables,
                'pending_payments' => $pendingPayments,
                'in_kitchen' => $inKitchen,
                'ready_for_pickup' => $readyForPickup,
                'completed_today' => $completedToday,
                'growth_percent' => $growthPercent,
                'target_aov' => 50000,
            ],
            'sales_trend' => $salesTrend,
            'hourly_trend' => $hourlyTrend,
            'top_menus' => $topMenus,
            'recent_orders' => $recentOrders,
        ]);
    }
}
