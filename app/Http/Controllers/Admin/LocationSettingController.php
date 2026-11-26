<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LocationSettingRequest;
use App\Models\CafeSetting;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use App\Models\User;
use App\Services\Payments\PaymentService;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
        $setting = CafeSetting::current()->loadMissing('updatedByUser:id,name');
        $gatewayConfig = $this->paymentService->getPublicGatewayConfig();

        // Data Kesehatan Sistem & Master Data
        $activeTablesCount = CafeTable::where('is_active', true)->count();
        $totalTablesCount = CafeTable::count();
        $activeMenusCount = Menu::where('is_active', true)->count();
        $totalMenusCount = Menu::count();
        $menusMissingCostCount = Menu::where('is_active', true)->whereNull('cost_price')->count();
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

        $activeCategoriesCount = Category::where('is_active', true)->count();
        $totalCategoriesCount = Category::count();
        $adminUsersCount = User::where('role', 'admin')->count();
        $cashierUsersCount = User::where('role', 'cashier')->count();

        // Log Gateway Pembayaran Terbaru
        $recentPayments = Payment::query()
            ->with(['order:id,order_number,customer_name', 'confirmedByUser:id,name'])
            ->latest('id')
            ->limit(25)
            ->get()
            ->map(function (Payment $p): array {
                return [
                    'id' => $p->id,
                    'payment_reference' => $p->payment_reference,
                    'order_number' => $p->order?->order_number ?? '-',
                    'customer_name' => $p->order?->customer_name ?? '-',
                    'gateway' => $p->gateway,
                    'gateway_label' => $p->resolveGatewayLabel(),
                    'method' => $p->method,
                    'channel' => $p->resolveChannelLabel(),
                    'type' => $p->type,
                    'amount' => (float) $p->amount,
                    'settled_amount' => (float) $p->settled_amount,
                    'status' => $p->status,
                    'external_id' => $p->external_id,
                    'gateway_transaction_id' => $p->gateway_transaction_id,
                    'paid_at' => $p->paid_at ? Carbon::parse($p->paid_at)->timezone(self::TIMEZONE)->format('d M Y, H:i').' WIB' : null,
                    'created_at' => Carbon::parse($p->created_at)->timezone(self::TIMEZONE)->format('d M Y, H:i').' WIB',
                    'actor_name' => $p->confirmedByUser?->name ?? ($p->gateway === 'manual' ? 'Sistem' : 'Gateway Digital'),
                ];
            })
            ->values()
            ->all();

        $gatewayStats = [
            'paid_count' => Payment::where('status', 'paid')->count(),
            'pending_count' => Payment::where('status', 'pending')->count(),
            'failed_or_expired_count' => Payment::whereIn('status', ['failed', 'expired'])->count(),
            'digital_paid_count' => Payment::where('gateway', '!=', 'manual')->where('status', 'paid')->count(),
        ];

        // Log Audit Aktivitas Operasional & Penolakan Item Terbaru
        $recentStatusAudits = OrderStatusHistory::query()
            ->with(['order:id,order_number,customer_name', 'user:id,name,role'])
            ->latest('id')
            ->limit(25)
            ->get()
            ->map(fn (OrderStatusHistory $h): array => [
                'id' => 'hist-'.$h->id,
                'type' => 'status_change',
                'order_number' => $h->order?->order_number ?? '-',
                'customer_name' => $h->order?->customer_name ?? '-',
                'status' => $h->status,
                'notes' => $h->notes,
                'actor_name' => $h->user?->name ?? 'Pelanggan / Sistem',
                'actor_role' => $h->user?->role ?? 'system',
                'created_at' => Carbon::parse($h->created_at)->timezone(self::TIMEZONE)->format('d M Y, H:i').' WIB',
                'timestamp' => Carbon::parse($h->created_at)->timestamp,
            ]);

        $recentRejectionAudits = OrderItem::query()
            ->where('status', 'rejected')
            ->with(['order:id,order_number,customer_name', 'rejectedByUser:id,name,role'])
            ->latest('rejected_at')
            ->limit(15)
            ->get()
            ->map(fn (OrderItem $item): array => [
                'id' => 'rej-'.$item->id,
                'type' => 'item_rejected',
                'order_number' => $item->order?->order_number ?? '-',
                'customer_name' => $item->order?->customer_name ?? '-',
                'status' => 'rejected',
                'notes' => "Item ditolak: {$item->quantity}x {$item->menu_name}".($item->rejection_reason ? " ({$item->rejection_reason})" : ''),
                'actor_name' => $item->rejectedByUser?->name ?? 'Staf Kasir',
                'actor_role' => $item->rejectedByUser?->role ?? 'cashier',
                'created_at' => Carbon::parse($item->rejected_at ?? $item->updated_at)->timezone(self::TIMEZONE)->format('d M Y, H:i').' WIB',
                'timestamp' => Carbon::parse($item->rejected_at ?? $item->updated_at)->timestamp,
            ]);

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
                'allow_digital_payment' => false,
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
                'updated_by_name' => $setting->updatedByUser?->name,
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
            'allow_xendit_payment' => false,
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
