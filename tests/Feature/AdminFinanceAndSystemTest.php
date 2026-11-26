<?php

use App\Models\CafeSetting;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Expense;
use App\Models\Menu;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->create([
        'name' => 'Owner Admin',
        'email' => 'owner@sideline.test',
        'role' => 'admin',
    ]);

    $this->cashier = User::factory()->create([
        'name' => 'Kasir Shift 1',
        'email' => 'cashier@sideline.test',
        'role' => 'cashier',
    ]);

    $this->table = CafeTable::create([
        'table_number' => '05',
        'name' => 'Indoor Cozy',
        'is_active' => true,
    ]);

    $this->category = Category::create([
        'name' => 'Signature Coffee',
        'slug' => 'signature-coffee',
        'is_active' => true,
    ]);

    CafeSetting::create([
        'cafe_name' => 'Café SIDE LINE',
        'address' => 'Jl. Kopi No. 1',
        'phone' => '081234567890',
        'receipt_footer' => 'Terima kasih sudah mampir!',
        'is_ordering_enabled' => true,
        'closed_message' => 'Pemesanan mandiri sedang ditutup sementara.',
        'allow_cash_payment' => true,
        'allow_xendit_payment' => false,
        'payment_expiry_minutes' => 15,
        'is_location_restricted' => false,
        'access_radius_meters' => 150,
    ]);
});

test('menu cost price is saved and snapshotted onto order items on customer checkout for real gross profit analytics', function () {
    // 1. Admin creates menu with cost_price (HPP)
    $this->actingAs($this->admin)
        ->post(route('admin.menus.store'), [
            'category_id' => $this->category->id,
            'name' => 'Aren Oat Latte',
            'base_price' => 28000,
            'cost_price' => 10000,
            'is_active' => true,
            'is_limited_stock' => false,
        ])
        ->assertSessionHas('success');

    $menu = Menu::where('name', 'Aren Oat Latte')->firstOrFail();
    expect((float) $menu->cost_price)->toBe(10000.0);

    // 2. Customer checks out 2 cups via cash
    $response = $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Bima',
        'payment_method' => 'cash',
        'items' => [
            [
                'menu_id' => $menu->id,
                'quantity' => 2,
                'option_item_ids' => [],
            ],
        ],
    ]);
    $response->assertRedirect();

    $order = Order::where('customer_name', 'Bima')->firstOrFail();
    $orderItem = OrderItem::where('order_id', $order->id)->firstOrFail();
    expect((float) $orderItem->cost_price)->toBe(10000.0);

    // 3. Changing menu cost_price later must NOT alter historical order item cost snapshot
    $menu->update(['cost_price' => 14000]);
    expect((float) $orderItem->fresh()->cost_price)->toBe(10000.0);

    // 4. Cashier settles payment -> financial report computes exact COGS & Gross Profit
    $this->actingAs($this->cashier)
        ->post(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 60000,
        ])
        ->assertSessionHas('success');

    $sync = $this->actingAs($this->admin)
        ->getJson(route('admin.financial-reports.sync', ['preset' => 'today']));

    $sync->assertOk()
        ->assertJsonPath('summary.period.gross_revenue', 56000)
        ->assertJsonPath('summary.period.cogs_amount', 20000)
        ->assertJsonPath('summary.period.gross_profit', 36000);
});

test('admin can manage operational expenses which flow into net profit, cash flow, and recaps while cashier is forbidden', function () {
    $today = Carbon::today('Asia/Jakarta')->toDateString();

    $menu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Manual Brew V60',
        'slug' => 'manual-brew-v60',
        'base_price' => 30000,
        'cost_price' => 10000,
        'is_active' => true,
    ]);

    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Sari',
        'subtotal' => 60000,
        'total_amount' => 60000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'cash',
        'payment_gateway' => 'manual',
        'paid_at' => Carbon::now('Asia/Jakarta'),
    ]);

    OrderItem::create([
        'order_id' => $order->id,
        'menu_id' => $menu->id,
        'menu_name' => $menu->name,
        'base_price' => 30000,
        'cost_price' => 10000,
        'quantity' => 2,
        'unit_price' => 30000,
        'total_price' => 60000,
        'status' => 'active',
        'payment_status' => 'paid',
        'paid_at' => Carbon::now('Asia/Jakarta'),
    ]);

    // Cashier forbidden on Expense CRUD
    $this->actingAs($this->cashier)
        ->post(route('admin.expenses.store'), [
            'expense_date' => $today,
            'category' => 'raw_materials',
            'title' => 'Es Batu Kristal',
            'amount' => 15000,
            'payment_source' => 'cash',
        ])
        ->assertForbidden();

    // Admin creates expense
    $this->actingAs($this->admin)
        ->post(route('admin.expenses.store'), [
            'expense_date' => $today,
            'category' => 'raw_materials',
            'title' => 'Biji Kopi Gayo 1kg',
            'amount' => 15000,
            'payment_source' => 'cash',
            'notes' => 'Restock harian',
        ])
        ->assertSessionHas('success');

    $expense = Expense::where('title', 'Biji Kopi Gayo 1kg')->firstOrFail();

    // Admin updates expense amount
    $this->actingAs($this->admin)
        ->put(route('admin.expenses.update', $expense), [
            'expense_date' => $today,
            'category' => 'utilities',
            'title' => 'Token Listrik Bar',
            'amount' => 25000,
            'payment_source' => 'bank',
            'notes' => 'Topup meteran',
        ])
        ->assertSessionHas('success');

    // Sync verifies Revenue = 60k, COGS = 20k, Gross Profit = 40k, Opex = 25k (bank), Net Profit = 15k, Net Cash Flow = 35k
    $sync = $this->actingAs($this->admin)
        ->getJson(route('admin.financial-reports.sync', ['preset' => 'today']));

    $sync->assertOk()
        ->assertJsonPath('summary.period.gross_revenue', 60000)
        ->assertJsonPath('summary.period.cogs_amount', 20000)
        ->assertJsonPath('summary.period.gross_profit', 40000)
        ->assertJsonPath('summary.period.operational_expenses', 25000)
        ->assertJsonPath('summary.period.operational_expenses_bank', 25000)
        ->assertJsonPath('summary.period.net_profit', 15000)
        ->assertJsonPath('summary.period.cash_flow.net_cash_flow', 35000)
        ->assertJsonPath('expenses.total_amount', 25000)
        ->assertJsonPath('expenses.bank_amount', 25000);

    // Admin deletes expense -> Opex resets to 0
    $this->actingAs($this->admin)
        ->delete(route('admin.expenses.destroy', $expense))
        ->assertSessionHas('success');

    $afterDeleteSync = $this->actingAs($this->admin)
        ->getJson(route('admin.financial-reports.sync', ['preset' => 'today']));

    $afterDeleteSync->assertOk()
        ->assertJsonPath('summary.period.operational_expenses', 0)
        ->assertJsonPath('summary.period.net_profit', 40000);
});

test('admin can update system management policies and cannot disable cash payment while digital gateway is unconfigured', function () {
    // Disabling cash payment while no digital gateway is active must fail validation
    $this->actingAs($this->admin)
        ->put(route('admin.location-settings.update'), [
            'cafe_name' => 'Café SIDE LINE',
            'is_ordering_enabled' => true,
            'allow_cash_payment' => false,
            'payment_expiry_minutes' => 15,
            'is_location_restricted' => false,
            'access_radius_meters' => 150,
        ])
        ->assertSessionHasErrors('allow_cash_payment');

    // Valid system update persists identity, ordering switch, payment policy, and expiry
    $this->actingAs($this->admin)
        ->put(route('admin.location-settings.update'), [
            'cafe_name' => 'SIDE LINE Roastery',
            'address' => 'Jl. Melati No. 88',
            'phone' => '021-5550199',
            'receipt_footer' => 'Sampai jumpa lagi di SIDE LINE Roastery!',
            'is_ordering_enabled' => false,
            'closed_message' => 'Sedang jam istirahat barista hingga 14:00.',
            'allow_cash_payment' => true,
            'payment_expiry_minutes' => 30,
            'is_location_restricted' => false,
            'access_radius_meters' => 200,
        ])
        ->assertSessionHas('success');

    $setting = CafeSetting::current();
    expect($setting->cafe_name)->toBe('SIDE LINE Roastery')
        ->and($setting->is_ordering_enabled)->toBeFalse()
        ->and($setting->allow_cash_payment)->toBeTrue()
        ->and($setting->payment_expiry_minutes)->toBe(30);
});

test('customer self ordering and payment endpoints strictly enforce admin system policies', function () {
    $menu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Iced Americano',
        'slug' => 'iced-americano',
        'base_price' => 22000,
        'cost_price' => 7000,
        'is_active' => true,
    ]);

    // 1. When ordering is disabled: /order returns empty catalog & closed notice, checkout rejects
    CafeSetting::current()->update([
        'is_ordering_enabled' => false,
        'closed_message' => 'Kasir tutup sementara.',
    ]);

    $this->get(route('order.index', ['table' => $this->table->qr_token]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('customer/order')
            ->where('orderingStatus.enabled', false)
            ->where('orderingStatus.closed_message', 'Kasir tutup sementara.')
            ->has('categories', 0));

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Rani',
        'payment_method' => 'cash',
        'items' => [['menu_id' => $menu->id, 'quantity' => 1, 'option_item_ids' => []]],
    ])->assertSessionHasErrors('ordering');

    // 2. Re-enable ordering, disable Cash -> checkout with cash is blocked
    CafeSetting::current()->update([
        'is_ordering_enabled' => true,
        'allow_cash_payment' => false,
        'payment_expiry_minutes' => 30,
    ]);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Rani',
        'payment_method' => 'cash',
        'items' => [['menu_id' => $menu->id, 'quantity' => 1, 'option_item_ids' => []]],
    ])->assertSessionHasErrors('payment_method');

    // 3. Re-enable cash -> checkout with cash succeeds, while qris is rejected
    CafeSetting::current()->update([
        'allow_cash_payment' => true,
    ]);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Rani',
        'payment_method' => 'qris',
        'items' => [['menu_id' => $menu->id, 'quantity' => 1, 'option_item_ids' => []]],
    ])->assertSessionHasErrors('payment_method');

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Rani',
        'payment_method' => 'cash',
        'items' => [['menu_id' => $menu->id, 'quantity' => 1, 'option_item_ids' => []]],
    ])->assertRedirect();

    $order = Order::where('customer_name', 'Rani')->firstOrFail();

    // Switching to disabled cash is rejected with 422 JSON
    CafeSetting::current()->update(['allow_cash_payment' => false]);

    $this->postJson(route('order.switch-payment-method', ['order_number' => $order->order_number]), [
        'payment_method' => 'cash',
    ])->assertStatus(422);
});

test('categories route redirects admin to integrated menu tabs and dashboard serves overview props cleanly', function () {
    // Cashier remains blocked on admin.categories.index
    $this->actingAs($this->cashier)
        ->get(route('admin.categories.index'))
        ->assertForbidden();

    // Admin is redirected to integrated Menu & Kategori tab
    $this->actingAs($this->admin)
        ->get(route('admin.categories.index'))
        ->assertRedirect(route('admin.menus.index', ['tab' => 'categories']));

    // Dashboard serves focused overview props including system_snapshot and alerts
    $this->actingAs($this->admin)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('dashboard')
            ->has('summary')
            ->has('chart')
            ->has('operational')
            ->has('alerts')
            ->has('system_snapshot'));
});
