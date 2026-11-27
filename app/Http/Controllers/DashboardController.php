<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Admin\FinancialReportController;
use App\Http\Requests\Admin\FinancialReportFilterRequest;
use App\Models\CafeSetting;
use App\Models\CafeTable;
use App\Models\Menu;
use App\Models\Order;
use App\Models\Payment;
use App\Services\Payments\PaymentService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
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
     * Tampilkan Ringkasan Eksekutif & Status Sistem Café SIDE LINE (Admin).
     */
    public function index(
        Request $request,
        FinancialReportController $financialController,
        PaymentService $paymentService
    ): Response|RedirectResponse {
        if ($request->user() && $request->user()->isCashier()) {
            return redirect()->route('cashier.orders.index');
        }

        $paymentService->expireOverduePendingPayments();

        $filterRequest = $this->resolveFilterRequest($request);
        $dashboardData = $financialController->buildDashboardData($filterRequest);
        $operationalData = $this->getOperationalMetrics();
        $systemSnapshot = $this->getSystemSnapshot($paymentService);

        return Inertia::render('dashboard', [
            'filters' => $dashboardData['filters'],
            'summary' => $dashboardData['summary'],
            'chart' => $dashboardData['chart'],
            'hourly_tracking' => $dashboardData['hourly_tracking'],
            'top_menus' => $dashboardData['top_menus'],
            'operational' => $operationalData['operational'],
            'alerts' => $operationalData['alerts'],
            'system_snapshot' => $systemSnapshot,
            'synced_at' => $dashboardData['synced_at'],
        ]);
    }

    /**
     * Endpoint API JSON sinkronisasi on-demand / polling untuk Ringkasan & pengujian analitik.
     */
    public function sync(
        Request $request,
        FinancialReportController $financialController,
        PaymentService $paymentService
    ): JsonResponse {
        if (! $request->user() || ! $request->user()->isAdmin()) {
            abort(403, 'Akses ditolak. Hanya Administrator yang dapat menyinkronkan analitik dashboard.');
        }

        $paymentService->expireOverduePendingPayments();

        $filterRequest = $this->resolveFilterRequest($request);
        $operationalData = $this->getOperationalMetrics();
        $systemSnapshot = $this->getSystemSnapshot($paymentService);

        if ($request->query('scope') === 'dashboard') {
            $dashboardData = $financialController->buildDashboardData($filterRequest);

            return response()->json(array_merge($dashboardData, $operationalData, [
                'system_snapshot' => $systemSnapshot,
            ]));
        }

        $financialData = $financialController->buildReportData($filterRequest);

        $topMenus = array_slice(
            is_array($financialData['product_analytics']['top_selling'] ?? null)
                ? $financialData['product_analytics']['top_selling']
                : [],
            0,
            5,
        );

        $hourlyTracking = is_array($financialData['operational_analytics']['period_hourly'] ?? null)
            ? $financialData['operational_analytics']['period_hourly']
            : null;

        return response()->json(array_merge($financialData, $operationalData, [
            'top_menus' => $topMenus,
            'hourly_tracking' => $hourlyTracking,
            'system_snapshot' => $systemSnapshot,
        ]));
    }

    private function resolveFilterRequest(Request $request): FinancialReportFilterRequest
    {
        /** @var FinancialReportFilterRequest $filterRequest */
        $filterRequest = FinancialReportFilterRequest::createFrom($request);
        if ($request->hasSession()) {
            $filterRequest->setLaravelSession($request->session());
        }
        $filterRequest->setContainer(app());
        $filterRequest->setRedirector(app(Redirector::class));
        $filterRequest->validateResolved();

        return $filterRequest;
    }

    /**
     * Mengambil ringkasan operasional meja, antrean kasir/barista hari ini, serta peringatan stok & HPP menu.
     *
     * @return array{
     *     operational: array<string, int>,
     *     alerts: array<string, mixed>
     * }
     */
    private function getOperationalMetrics(): array
    {
        $todayStart = Carbon::today(self::TIMEZONE)->startOfDay();
        $todayEnd = Carbon::today(self::TIMEZONE)->endOfDay();

        $todayCounts = Order::query()
            ->whereBetween('created_at', [$todayStart, $todayEnd])
            ->selectRaw("
                COUNT(CASE WHEN order_status = 'processing' THEN 1 END) as in_kitchen,
                COUNT(CASE WHEN order_status = 'ready' THEN 1 END) as ready_for_pickup,
                COUNT(CASE WHEN order_status = 'completed' THEN 1 END) as completed_today,
                COUNT(CASE WHEN payment_status = 'unpaid' AND order_status != 'cancelled' THEN 1 END) as pending_payments
            ")
            ->first();

        $tables = CafeTable::withCount('activeOrders')->where('is_active', true)->get();
        $totalTables = $tables->count();
        $occupiedTables = $tables->where('active_orders_count', '>', 0)->count();
        $occupancyRate = $totalTables > 0 ? (int) round(($occupiedTables / $totalTables) * 100) : 0;

        $alertMenus = Menu::query()
            ->where('is_active', true)
            ->where(function (Builder $query): void {
                $query->where('is_limited_stock', true)
                    ->orWhereNull('cost_price');
            })
            ->orderBy('name', 'asc')
            ->get([
                'id',
                'name',
                'is_limited_stock',
                'stock_quantity',
                'stock_valid_days',
                'stock_updated_at',
                'cost_price',
                'updated_at',
                'created_at',
            ]);

        $limitedMenus = $alertMenus
            ->filter(fn (Menu $menu): bool => (bool) $menu->is_limited_stock)
            ->values();

        $expiredAll = $limitedMenus
            ->filter(fn (Menu $menu): bool => $menu->hasExpiredStock())
            ->values();

        $expiredStockMenus = $expiredAll
            ->take(6)
            ->map(fn (Menu $menu): array => [
                'id' => $menu->id,
                'name' => $menu->name,
                'stock_quantity' => (int) $menu->stock_quantity,
                'stock_valid_days' => $menu->stockValidDays(),
                'stock_updated_at_label' => $menu->stock_updated_at_label,
                'stock_valid_until_label' => $menu->stock_valid_until_label,
            ])
            ->all();

        $lowStockMenus = $limitedMenus
            ->filter(fn (Menu $menu): bool => ! $menu->hasExpiredStock() && $menu->resolveEffectiveStockQuantity() <= 5)
            ->sortBy(fn (Menu $menu): int => $menu->resolveEffectiveStockQuantity())
            ->take(6)
            ->values()
            ->map(fn (Menu $menu): array => [
                'id' => $menu->id,
                'name' => $menu->name,
                'stock_quantity' => (int) $menu->stock_quantity,
                'stock_valid_days' => $menu->stockValidDays(),
            ])
            ->all();

        $menusMissingCostCount = $alertMenus
            ->filter(fn (Menu $menu): bool => $menu->cost_price === null)
            ->count();

        return [
            'operational' => [
                'in_kitchen' => (int) ($todayCounts->in_kitchen ?? 0),
                'ready_for_pickup' => (int) ($todayCounts->ready_for_pickup ?? 0),
                'completed_today' => (int) ($todayCounts->completed_today ?? 0),
                'pending_payments' => (int) ($todayCounts->pending_payments ?? 0),
                'total_tables' => $totalTables,
                'occupied_tables' => $occupiedTables,
                'occupancy_rate' => $occupancyRate,
            ],
            'alerts' => [
                'expired_stock_count' => $expiredAll->count(),
                'expired_stock_menus' => $expiredStockMenus,
                'low_stock_menus' => $lowStockMenus,
                'menus_missing_cost_count' => $menusMissingCostCount,
            ],
        ];
    }

    /**
     * Ringkasan konfigurasi sistem & payment gateway aktif untuk tampilan cepat Ringkasan Admin.
     *
     * @return array<string, mixed>
     */
    private function getSystemSnapshot(PaymentService $paymentService): array
    {
        $setting = CafeSetting::current();
        $gateway = $paymentService->getPublicGatewayConfig();
        $paymentCounts = Payment::query()
            ->selectRaw("
                COUNT(CASE WHEN gateway != 'manual' AND status = 'pending' THEN 1 END) as digital_pending_payments,
                COUNT(CASE WHEN status IN ('failed', 'expired') THEN 1 END) as failed_payments_recent
            ")
            ->first();

        return [
            'cafe_name' => $setting->cafe_name,
            'is_ordering_enabled' => (bool) $setting->is_ordering_enabled,
            'is_location_restricted' => (bool) $setting->is_location_restricted,
            'is_enforcement_active' => $setting->isEnforcementActive(),
            'access_radius_meters' => (int) $setting->access_radius_meters,
            'allow_cash_payment' => (bool) $setting->allow_cash_payment,
            'allow_digital_payment' => $paymentService->isDigitalPaymentEnabled($setting),
            'payment_expiry_minutes' => (int) ($setting->payment_expiry_minutes ?: CafeSetting::DEFAULT_PAYMENT_EXPIRY_MINUTES),
            'gateway_label' => $gateway['label'],
            'gateway_mode' => $gateway['mode'],
            'gateway_configured' => $gateway['is_configured'],
            'digital_pending_payments' => (int) ($paymentCounts->digital_pending_payments ?? 0),
            'failed_payments_recent' => (int) ($paymentCounts->failed_payments_recent ?? 0),
        ];
    }
}
