<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LocationSettingRequest;
use App\Models\CafeSetting;
use App\Models\Menu;
use App\Models\Payment;
use App\Services\Payments\PaymentService;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class LocationSettingController extends Controller
{
    private const TIMEZONE = 'Asia/Jakarta';

    public function __construct(
        private readonly PaymentService $paymentService,
    ) {}

    /**
     * Pusat Manajemen Sistem & Konfigurasi Café SIDE LINE (Profil, Geofencing, Gateway, Kesehatan & Audit).
     */
    public function edit(Request $request): Response
    {
        $setting = CafeSetting::current();
        $gatewayConfig = $this->paymentService->getPublicGatewayConfig();

        // Gabungkan seluruh 13 agregasi count + nama pengubah terakhir ke dalam 1 query tunggal
        // untuk meminimalkan latensi round-trip jaringan pada database remote (PostgreSQL / Supabase).
        $updatedById = $setting->updated_by ? (int) $setting->updated_by : 0;
        /** @var object{
         *     active_tables: int|string,
         *     total_tables: int|string,
         *     active_menus: int|string,
         *     total_menus: int|string,
         *     menus_missing_cost: int|string,
         *     active_categories: int|string,
         *     total_categories: int|string,
         *     admin_users: int|string,
         *     cashier_users: int|string,
         *     paid_count: int|string,
         *     pending_count: int|string,
         *     failed_or_expired_count: int|string,
         *     digital_paid_count: int|string,
         *     updated_by_name: string|null
         * }|null $counts */
        $counts = DB::selectOne(
            "SELECT
                (SELECT COUNT(*) FROM cafe_tables WHERE is_active = ?) AS active_tables,
                (SELECT COUNT(*) FROM cafe_tables) AS total_tables,
                (SELECT COUNT(*) FROM menus WHERE is_active = ?) AS active_menus,
                (SELECT COUNT(*) FROM menus) AS total_menus,
                (SELECT COUNT(*) FROM menus WHERE is_active = ? AND cost_price IS NULL) AS menus_missing_cost,
                (SELECT COUNT(*) FROM categories WHERE is_active = ?) AS active_categories,
                (SELECT COUNT(*) FROM categories) AS total_categories,
                (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admin_users,
                (SELECT COUNT(*) FROM users WHERE role = 'cashier') AS cashier_users,
                (SELECT COUNT(*) FROM payments WHERE status = 'paid') AS paid_count,
                (SELECT COUNT(*) FROM payments WHERE status = 'pending') AS pending_count,
                (SELECT COUNT(*) FROM payments WHERE status IN ('failed', 'expired')) AS failed_or_expired_count,
                (SELECT COUNT(*) FROM payments WHERE gateway != 'manual' AND status = 'paid') AS digital_paid_count,
                (SELECT name FROM users WHERE id = ? LIMIT 1) AS updated_by_name",
            [true, true, true, true, $updatedById]
        );

        $activeTablesCount = (int) ($counts->active_tables ?? 0);
        $totalTablesCount = (int) ($counts->total_tables ?? 0);
        $activeMenusCount = (int) ($counts->active_menus ?? 0);
        $totalMenusCount = (int) ($counts->total_menus ?? 0);
        $menusMissingCostCount = (int) ($counts->menus_missing_cost ?? 0);
        $activeCategoriesCount = (int) ($counts->active_categories ?? 0);
        $totalCategoriesCount = (int) ($counts->total_categories ?? 0);
        $adminUsersCount = (int) ($counts->admin_users ?? 0);
        $cashierUsersCount = (int) ($counts->cashier_users ?? 0);
        $updatedByName = $counts->updated_by_name ?? null;

        $limitedMenus = Menu::where('is_active', true)
            ->where('is_limited_stock', true)
            ->orderBy('name', 'asc')
            ->get([
                'id',
                'name',
                'is_limited_stock',
                'stock_quantity',
                'stock_valid_days',
                'stock_updated_at',
                'updated_at',
                'created_at',
            ]);

        $expiredStockMenus = $limitedMenus
            ->filter(fn (Menu $menu): bool => $menu->hasExpiredStock())
            ->values()
            ->map(fn (Menu $menu): array => [
                'id' => $menu->id,
                'name' => $menu->name,
                'stock_quantity' => (int) $menu->stock_quantity,
                'stock_valid_days' => $menu->stockValidDays(),
                'stock_updated_at_label' => $menu->stock_updated_at_label,
            ])
            ->all();

        $lowStockMenus = $limitedMenus
            ->filter(fn (Menu $menu): bool => ! $menu->hasExpiredStock() && $menu->resolveEffectiveStockQuantity() <= 5)
            ->sortBy(fn (Menu $menu): int => $menu->resolveEffectiveStockQuantity())
            ->values()
            ->map(fn (Menu $menu): array => [
                'id' => $menu->id,
                'name' => $menu->name,
                'stock_quantity' => $menu->resolveEffectiveStockQuantity(),
                'stock_valid_days' => $menu->stockValidDays(),
            ])
            ->all();

        // Log Gateway Pembayaran Terbaru (1 query via LEFT JOIN)
        $recentPayments = DB::table('payments')
            ->leftJoin('orders', 'orders.id', '=', 'payments.order_id')
            ->leftJoin('users', 'users.id', '=', 'payments.confirmed_by')
            ->orderByDesc('payments.id')
            ->limit(25)
            ->get([
                'payments.id',
                'payments.payment_reference',
                'payments.gateway',
                'payments.method',
                'payments.channel',
                'payments.type',
                'payments.amount',
                'payments.settled_amount',
                'payments.status',
                'payments.external_id',
                'payments.gateway_transaction_id',
                'payments.paid_at',
                'payments.created_at',
                'orders.order_number',
                'orders.customer_name',
                'users.name as confirmed_by_name',
            ])
            ->map(function (object $p): array {
                $gateway = (string) ($p->gateway ?? 'manual');
                $method = (string) ($p->method ?? 'cash');
                $channel = isset($p->channel) && is_string($p->channel) ? $p->channel : null;
                $helperPayment = new Payment([
                    'gateway' => $gateway,
                    'method' => $method,
                    'channel' => $channel,
                ]);
                $confirmedByName = isset($p->confirmed_by_name) && is_string($p->confirmed_by_name) && $p->confirmed_by_name !== ''
                    ? $p->confirmed_by_name
                    : null;

                return [
                    'id' => (int) $p->id,
                    'payment_reference' => (string) $p->payment_reference,
                    'order_number' => isset($p->order_number) && is_string($p->order_number) ? $p->order_number : '-',
                    'customer_name' => isset($p->customer_name) && is_string($p->customer_name) ? $p->customer_name : '-',
                    'gateway' => $gateway,
                    'gateway_label' => $helperPayment->resolveGatewayLabel(),
                    'method' => $method,
                    'channel' => $helperPayment->resolveChannelLabel(),
                    'type' => (string) $p->type,
                    'amount' => (float) $p->amount,
                    'settled_amount' => (float) $p->settled_amount,
                    'status' => (string) $p->status,
                    'external_id' => isset($p->external_id) && is_string($p->external_id) ? $p->external_id : null,
                    'gateway_transaction_id' => isset($p->gateway_transaction_id) && is_string($p->gateway_transaction_id) ? $p->gateway_transaction_id : null,
                    'paid_at' => ! empty($p->paid_at) ? Carbon::parse((string) $p->paid_at)->timezone(self::TIMEZONE)->format('d M Y, H:i').' WIB' : null,
                    'created_at' => Carbon::parse((string) $p->created_at)->timezone(self::TIMEZONE)->format('d M Y, H:i').' WIB',
                    'actor_name' => $confirmedByName ?? ($gateway === 'manual' ? 'Sistem' : 'Gateway Digital'),
                ];
            })
            ->values()
            ->all();

        $gatewayStats = [
            'paid_count' => (int) ($counts->paid_count ?? 0),
            'pending_count' => (int) ($counts->pending_count ?? 0),
            'failed_or_expired_count' => (int) ($counts->failed_or_expired_count ?? 0),
            'digital_paid_count' => (int) ($counts->digital_paid_count ?? 0),
        ];

        // Log Audit Aktivitas Operasional & Penolakan Item Terbaru (masing-masing 1 query via LEFT JOIN)
        $recentStatusAudits = DB::table('order_status_histories')
            ->leftJoin('orders', 'orders.id', '=', 'order_status_histories.order_id')
            ->leftJoin('users', 'users.id', '=', 'order_status_histories.user_id')
            ->orderByDesc('order_status_histories.id')
            ->limit(25)
            ->get([
                'order_status_histories.id',
                'order_status_histories.status',
                'order_status_histories.notes',
                'order_status_histories.created_at',
                'orders.order_number',
                'orders.customer_name',
                'users.name as actor_name',
                'users.role as actor_role',
            ])
            ->map(fn (object $h): array => [
                'id' => 'hist-'.$h->id,
                'type' => 'status_change',
                'order_number' => isset($h->order_number) && is_string($h->order_number) ? $h->order_number : '-',
                'customer_name' => isset($h->customer_name) && is_string($h->customer_name) ? $h->customer_name : '-',
                'status' => (string) $h->status,
                'notes' => isset($h->notes) && is_string($h->notes) ? $h->notes : null,
                'actor_name' => isset($h->actor_name) && is_string($h->actor_name) && $h->actor_name !== '' ? $h->actor_name : 'Pelanggan / Sistem',
                'actor_role' => isset($h->actor_role) && is_string($h->actor_role) && $h->actor_role !== '' ? $h->actor_role : 'system',
                'created_at' => Carbon::parse((string) $h->created_at)->timezone(self::TIMEZONE)->format('d M Y, H:i').' WIB',
                'timestamp' => Carbon::parse((string) $h->created_at)->timestamp,
            ]);

        $recentRejectionAudits = DB::table('order_items')
            ->leftJoin('orders', 'orders.id', '=', 'order_items.order_id')
            ->leftJoin('users', 'users.id', '=', 'order_items.rejected_by')
            ->where('order_items.status', 'rejected')
            ->orderByDesc('order_items.rejected_at')
            ->limit(15)
            ->get([
                'order_items.id',
                'order_items.quantity',
                'order_items.menu_name',
                'order_items.rejection_reason',
                'order_items.rejected_at',
                'order_items.updated_at',
                'orders.order_number',
                'orders.customer_name',
                'users.name as actor_name',
                'users.role as actor_role',
            ])
            ->map(function (object $item): array {
                $reason = isset($item->rejection_reason) && is_string($item->rejection_reason) && $item->rejection_reason !== ''
                    ? " ({$item->rejection_reason})"
                    : '';
                $timestampRaw = (string) ($item->rejected_at ?? $item->updated_at);

                return [
                    'id' => 'rej-'.$item->id,
                    'type' => 'item_rejected',
                    'order_number' => isset($item->order_number) && is_string($item->order_number) ? $item->order_number : '-',
                    'customer_name' => isset($item->customer_name) && is_string($item->customer_name) ? $item->customer_name : '-',
                    'status' => 'rejected',
                    'notes' => "Item ditolak: {$item->quantity}x {$item->menu_name}{$reason}",
                    'actor_name' => isset($item->actor_name) && is_string($item->actor_name) && $item->actor_name !== '' ? $item->actor_name : 'Staf Kasir',
                    'actor_role' => isset($item->actor_role) && is_string($item->actor_role) && $item->actor_role !== '' ? $item->actor_role : 'cashier',
                    'created_at' => Carbon::parse($timestampRaw)->timezone(self::TIMEZONE)->format('d M Y, H:i').' WIB',
                    'timestamp' => Carbon::parse($timestampRaw)->timestamp,
                ];
            });

        $auditLogs = $recentStatusAudits
            ->concat($recentRejectionAudits)
            ->sortByDesc('timestamp')
            ->take(30)
            ->values()
            ->all();

        $allowedTabs = ['profile', 'geofencing', 'gateway', 'system'];
        $requestedTab = (string) $request->query('tab', 'profile');
        $initialTab = in_array($requestedTab, $allowedTabs, true) ? $requestedTab : 'profile';

        return Inertia::render('admin/location-settings/index', [
            'initialTab' => $initialTab,
            'setting' => [
                'id' => $setting->id,
                'cafe_name' => $setting->cafe_name,
                'address' => $setting->address,
                'phone' => $setting->phone,
                'receipt_footer' => $setting->receipt_footer,
                'is_ordering_enabled' => (bool) $setting->is_ordering_enabled,
                'closed_message' => $setting->closed_message,
                'allow_cash_payment' => (bool) $setting->allow_cash_payment,
                'allow_digital_payment' => (bool) $setting->allow_xendit_payment,
                'payment_expiry_minutes' => (int) ($setting->payment_expiry_minutes ?: CafeSetting::DEFAULT_PAYMENT_EXPIRY_MINUTES),
                'min_payment_expiry_minutes' => CafeSetting::MIN_PAYMENT_EXPIRY_MINUTES,
                'max_payment_expiry_minutes' => CafeSetting::MAX_PAYMENT_EXPIRY_MINUTES,
                'is_location_restricted' => (bool) $setting->is_location_restricted,
                'latitude' => $setting->latitude !== null ? (float) $setting->latitude : null,
                'longitude' => $setting->longitude !== null ? (float) $setting->longitude : null,
                'access_radius_meters' => (int) $setting->access_radius_meters,
                'min_radius_meters' => CafeSetting::MIN_RADIUS_METERS,
                'max_radius_meters' => CafeSetting::MAX_RADIUS_METERS,
                'is_enforcement_active' => $setting->isEnforcementActive(),
                'updated_at' => $setting->updated_at?->toIso8601String(),
                'updated_by_name' => $updatedByName,
            ],
            'gatewayConfig' => $gatewayConfig,
            'gatewayStats' => $gatewayStats,
            'recentPayments' => $recentPayments,
            'systemHealth' => [
                'active_tables' => $activeTablesCount,
                'total_tables' => $totalTablesCount,
                'active_menus' => $activeMenusCount,
                'total_menus' => $totalMenusCount,
                'menus_missing_cost' => $menusMissingCostCount,
                'expired_stock_menus' => $expiredStockMenus,
                'low_stock_menus' => $lowStockMenus,
                'active_categories' => $activeCategoriesCount,
                'total_categories' => $totalCategoriesCount,
                'admin_users' => $adminUsersCount,
                'cashier_users' => $cashierUsersCount,
            ],
            'auditLogs' => $auditLogs,
        ]);
    }

    /**
     * Simpan pembaruan konfigurasi sistem, profil kafe, geofencing, dan kebijakan pembayaran.
     */
    public function update(LocationSettingRequest $request): RedirectResponse
    {
        $validated = $request->validated();
        $user = $request->user();
        $setting = CafeSetting::current();

        $latitude = isset($validated['latitude']) && $validated['latitude'] !== '' && is_numeric($validated['latitude'])
            ? round((float) $validated['latitude'], 7)
            : null;
        $longitude = isset($validated['longitude']) && $validated['longitude'] !== '' && is_numeric($validated['longitude'])
            ? round((float) $validated['longitude'], 7)
            : null;

        $setting->update([
            'cafe_name' => trim((string) $validated['cafe_name']),
            'address' => isset($validated['address']) && trim((string) $validated['address']) !== ''
                ? trim((string) $validated['address'])
                : null,
            'phone' => array_key_exists('phone', $validated)
                ? (isset($validated['phone']) && trim((string) $validated['phone']) !== '' ? trim((string) $validated['phone']) : null)
                : $setting->phone,
            'receipt_footer' => array_key_exists('receipt_footer', $validated)
                ? (isset($validated['receipt_footer']) && trim((string) $validated['receipt_footer']) !== '' ? trim((string) $validated['receipt_footer']) : null)
                : $setting->receipt_footer,
            'is_ordering_enabled' => $request->has('is_ordering_enabled')
                ? $request->boolean('is_ordering_enabled')
                : (bool) $setting->is_ordering_enabled,
            'closed_message' => array_key_exists('closed_message', $validated)
                ? (isset($validated['closed_message']) && trim((string) $validated['closed_message']) !== '' ? trim((string) $validated['closed_message']) : null)
                : $setting->closed_message,
            'allow_cash_payment' => $request->has('allow_cash_payment')
                ? $request->boolean('allow_cash_payment')
                : (bool) $setting->allow_cash_payment,
            'allow_xendit_payment' => $request->has('allow_digital_payment')
                ? ($this->paymentService->isFcGatewayConfigured() && $request->boolean('allow_digital_payment'))
                : (bool) $setting->allow_xendit_payment,
            'payment_expiry_minutes' => $request->has('payment_expiry_minutes')
                ? (int) $validated['payment_expiry_minutes']
                : (int) ($setting->payment_expiry_minutes ?: CafeSetting::DEFAULT_PAYMENT_EXPIRY_MINUTES),
            'is_location_restricted' => $request->boolean('is_location_restricted'),
            'latitude' => $latitude,
            'longitude' => $longitude,
            'access_radius_meters' => (int) $validated['access_radius_meters'],
            'updated_by' => $user?->id,
        ]);

        return back()->with('success', 'Pengaturan sistem & operasional Café SIDE LINE berhasil disimpan.');
    }
}
