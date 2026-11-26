<?php

use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('guests are redirected to the login page', function () {
    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('login'));
});

test('authenticated users can visit the dashboard', function () {
    $user = User::factory()->create([
        'role' => 'admin',
    ]);
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertOk();
});

test('cashier users are redirected to cashier orders from dashboard', function () {
    $user = User::factory()->create([
        'role' => 'cashier',
    ]);
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('cashier.orders.index'));
});

test('selected dashboard period filter persists across admin navigation via session', function () {
    $admin = User::factory()->create([
        'role' => 'admin',
    ]);

    $this->actingAs($admin)
        ->get(route('dashboard', ['preset' => 'today']))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('dashboard')
            ->where('filters.preset', 'today')
            ->has('hourly_tracking.hours'));

    $this->actingAs($admin)
        ->get(route('admin.menus.index'))
        ->assertOk();

    $this->actingAs($admin)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('dashboard')
            ->where('filters.preset', 'today')
            ->has('hourly_tracking.hours'));

    $this->actingAs($admin)
        ->get(route('admin.financial-reports.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/financial-reports/index')
            ->where('filters.preset', 'today'));

    $this->actingAs($admin)
        ->get(route('dashboard', ['preset' => 'last_7_days']))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('filters.preset', 'last_7_days'));

    $this->actingAs($admin)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('filters.preset', 'last_7_days'));
});

test('dashboard exposes dynamic hourly tracking breakdown for single day filters', function () {
    Carbon::setTestNow(Carbon::create(2026, 10, 22, 15, 0, 0, 'Asia/Jakarta'));

    try {
        $admin = User::factory()->create(['role' => 'admin']);
        $table = CafeTable::create([
            'table_number' => '01',
            'name' => 'Bar Corner',
            'is_active' => true,
        ]);

        Order::create([
            'cafe_table_id' => $table->id,
            'customer_name' => 'Pagi',
            'subtotal' => 35000,
            'total_amount' => 35000,
            'order_status' => 'completed',
            'payment_status' => 'paid',
            'payment_method' => 'qris',
            'paid_at' => Carbon::create(2026, 10, 22, 7, 15, 0, 'Asia/Jakarta'),
        ]);

        Order::create([
            'cafe_table_id' => $table->id,
            'customer_name' => 'Malam',
            'subtotal' => 70000,
            'total_amount' => 70000,
            'order_status' => 'completed',
            'payment_status' => 'paid',
            'payment_method' => 'cash',
            'paid_at' => Carbon::create(2026, 10, 22, 23, 10, 0, 'Asia/Jakarta'),
        ]);

        $response = $this->actingAs($admin)
            ->getJson(route('dashboard.sync', ['preset' => 'today']))
            ->assertOk()
            ->json();

        $hours = collect($response['hourly_tracking']['hours']);

        expect($hours->first()['hour'])->toBe('07:00')
            ->and($hours->last()['hour'])->toBe('23:00')
            ->and((float) $hours->firstWhere('hour', '07:00')['revenue'])->toBe(35000.0)
            ->and((float) $hours->firstWhere('hour', '23:00')['revenue'])->toBe(70000.0)
            ->and($hours->firstWhere('hour', '23:00')['is_peak'])->toBeTrue();
    } finally {
        Carbon::setTestNow();
    }
});

test('dashboard sync with scope=dashboard returns real-time KPI cards, tracking chart, and expires overdue pending QRIS payments', function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 18, 14, 0, 0, 'Asia/Jakarta'));

    try {
        $admin = User::factory()->create(['role' => 'admin']);
        $table = CafeTable::create([
            'table_number' => '02',
            'name' => 'Window Seat',
            'is_active' => true,
        ]);

        // 1. Pesanan QRIS lunas hari ini: Rp 50.000
        Order::create([
            'cafe_table_id' => $table->id,
            'customer_name' => 'Lunas Digital',
            'subtotal' => 50000,
            'total_amount' => 50000,
            'order_status' => 'processing',
            'payment_status' => 'paid',
            'payment_method' => 'qris',
            'payment_gateway' => 'digital',
            'paid_at' => Carbon::create(2026, 11, 18, 11, 0, 0, 'Asia/Jakarta'),
            'created_at' => Carbon::create(2026, 11, 18, 10, 55, 0, 'Asia/Jakarta'),
        ]);

        // 2. Pesanan digital belum bayar yang sudah melewati batas kedaluwarsa: Rp 40.000
        $overdueOrder = Order::create([
            'cafe_table_id' => $table->id,
            'customer_name' => 'Digital Kedaluwarsa',
            'subtotal' => 40000,
            'total_amount' => 40000,
            'order_status' => 'pending',
            'payment_status' => 'unpaid',
            'payment_method' => 'qris',
            'payment_gateway' => 'digital',
            'created_at' => Carbon::create(2026, 11, 18, 12, 0, 0, 'Asia/Jakarta'),
        ]);

        Payment::create([
            'order_id' => $overdueOrder->id,
            'payment_reference' => 'PAY-EXP-DASH-01',
            'gateway' => 'digital',
            'method' => 'qris',
            'channel' => 'QRIS',
            'type' => 'initial',
            'amount' => 40000,
            'settled_amount' => 0,
            'status' => 'pending',
            'expired_at' => Carbon::create(2026, 11, 18, 12, 15, 0, 'Asia/Jakarta'),
        ]);

        $firstSync = $this->actingAs($admin)
            ->getJson(route('dashboard.sync', [
                'scope' => 'dashboard',
                'preset' => 'this_month',
            ]))
            ->assertOk()
            ->json();

        expect($firstSync)->toHaveKeys([
            'filters',
            'summary',
            'chart',
            'hourly_tracking',
            'top_menus',
            'operational',
            'alerts',
            'system_snapshot',
            'synced_at',
        ])
            ->and((float) $firstSync['summary']['period']['net_revenue'])->toBe(50000.0)
            ->and($firstSync['summary']['period']['pending_payments_count'])->toBe(0)
            ->and($firstSync['summary']['period']['failed_or_cancelled_count'])->toBe(1)
            ->and((float) $firstSync['summary']['period']['failed_or_cancelled_amount'])->toBe(40000.0);

        $todayBar = collect($firstSync['chart']['data'])->firstWhere('key', '2026-11-18');
        expect($todayBar)->not->toBeNull()
            ->and((float) $todayBar['net_revenue'])->toBe(50000.0);

        // 3. Simulasi pesanan tunai baru masuk & lunas -> sync kedua harus langsung merefleksikan kenaikan omzet & batang grafik
        Order::create([
            'cafe_table_id' => $table->id,
            'customer_name' => 'Lunas Tunai Baru',
            'subtotal' => 30000,
            'total_amount' => 30000,
            'order_status' => 'completed',
            'payment_status' => 'paid',
            'payment_method' => 'cash',
            'payment_gateway' => 'manual',
            'paid_at' => Carbon::create(2026, 11, 18, 13, 30, 0, 'Asia/Jakarta'),
            'created_at' => Carbon::create(2026, 11, 18, 13, 25, 0, 'Asia/Jakarta'),
        ]);

        $secondSync = $this->actingAs($admin)
            ->getJson(route('dashboard.sync', [
                'scope' => 'dashboard',
                'preset' => 'this_month',
            ]))
            ->assertOk()
            ->json();

        expect((float) $secondSync['summary']['period']['net_revenue'])->toBe(80000.0)
            ->and($secondSync['summary']['period']['paid_transactions_count'])->toBe(2);

        $updatedTodayBar = collect($secondSync['chart']['data'])->firstWhere('key', '2026-11-18');
        expect((float) $updatedTodayBar['net_revenue'])->toBe(80000.0);
    } finally {
        Carbon::setTestNow();
    }
});

test('dashboard sync accurately counts limited-stock and missing-cost menu alerts, and financial report sync expires overdue pending payments', function () {
    Carbon::setTestNow(Carbon::create(2026, 11, 18, 15, 0, 0, 'Asia/Jakarta'));

    try {
        $admin = User::factory()->create(['role' => 'admin']);
        $category = Category::create([
            'name' => 'Signature',
            'slug' => 'signature',
            'is_active' => true,
        ]);

        Menu::create([
            'category_id' => $category->id,
            'name' => 'Stok Menipis Tanpa HPP',
            'slug' => 'stok-menipis-tanpa-hpp',
            'base_price' => 28000,
            'cost_price' => null,
            'is_active' => true,
            'is_limited_stock' => true,
            'stock_quantity' => 3,
            'stock_valid_days' => 1,
            'stock_updated_at' => Carbon::create(2026, 11, 18, 10, 0, 0, 'Asia/Jakarta'),
        ]);

        Menu::create([
            'category_id' => $category->id,
            'name' => 'Stok Normal Tanpa HPP',
            'slug' => 'stok-normal-tanpa-hpp',
            'base_price' => 25000,
            'cost_price' => null,
            'is_active' => true,
            'is_limited_stock' => false,
        ]);

        $table = CafeTable::create([
            'table_number' => '03',
            'name' => 'Terrace',
            'is_active' => true,
        ]);

        $overdueOrder = Order::create([
            'cafe_table_id' => $table->id,
            'customer_name' => 'QRIS Expired Report',
            'subtotal' => 45000,
            'total_amount' => 45000,
            'order_status' => 'pending',
            'payment_status' => 'unpaid',
            'payment_method' => 'qris',
            'payment_gateway' => 'digital',
            'created_at' => Carbon::create(2026, 11, 18, 13, 0, 0, 'Asia/Jakarta'),
        ]);

        Payment::create([
            'order_id' => $overdueOrder->id,
            'payment_reference' => 'PAY-EXP-FIN-01',
            'gateway' => 'digital',
            'method' => 'qris',
            'channel' => 'QRIS',
            'type' => 'initial',
            'amount' => 45000,
            'settled_amount' => 0,
            'status' => 'pending',
            'expired_at' => Carbon::create(2026, 11, 18, 13, 15, 0, 'Asia/Jakarta'),
        ]);

        $financialSync = $this->actingAs($admin)
            ->getJson(route('admin.financial-reports.sync', ['preset' => 'this_month']))
            ->assertOk()
            ->json();

        expect($financialSync['summary']['period']['pending_payments_count'])->toBe(0)
            ->and($financialSync['summary']['period']['failed_or_cancelled_count'])->toBe(1)
            ->and((float) $financialSync['summary']['period']['failed_or_cancelled_amount'])->toBe(45000.0);

        $dashSync = $this->actingAs($admin)
            ->getJson(route('dashboard.sync', ['scope' => 'dashboard', 'preset' => 'this_month']))
            ->assertOk()
            ->json();

        expect($dashSync['alerts']['menus_missing_cost_count'])->toBe(2)
            ->and($dashSync['alerts']['low_stock_menus'])->toHaveCount(1)
            ->and($dashSync['alerts']['low_stock_menus'][0]['name'])->toBe('Stok Menipis Tanpa HPP');
    } finally {
        Carbon::setTestNow();
    }
});
