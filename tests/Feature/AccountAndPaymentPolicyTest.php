<?php

use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\User;
use App\Services\Payments\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->create([
        'name' => 'Single Owner Admin',
        'email' => 'admin@sideline.com',
        'role' => 'admin',
    ]);

    $this->cashier = User::factory()->create([
        'name' => 'Kasir Pagi',
        'email' => 'kasir@sideline.com',
        'role' => 'cashier',
    ]);

    $this->table = CafeTable::create([
        'table_number' => '09',
        'name' => 'Table VIP',
        'is_active' => true,
    ]);

    $this->category = Category::create([
        'name' => 'Espresso Based',
        'slug' => 'espresso-based',
        'is_active' => true,
    ]);

    $this->menu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Signature Latte',
        'slug' => 'signature-latte',
        'base_price' => 32000,
        'is_active' => true,
    ]);
});

test('public registration routes are disabled', function () {
    expect(Route::has('register'))->toBeFalse()
        ->and(Route::has('register.store'))->toBeFalse();

    $this->get('/register')->assertNotFound();
    $this->post('/register', [
        'name' => 'Intruder',
        'email' => 'intruder@example.com',
        'password' => 'Password123!',
        'password_confirmation' => 'Password123!',
    ])->assertNotFound();
});

test('admin can only create cashier accounts and cannot promote demote or delete single admin', function () {
    // 1. Admin creates staff -> always saved as cashier even if role=admin is tampered in payload
    $this->actingAs($this->admin)
        ->post(route('admin.users.store'), [
            'name' => 'Kasir Sore',
            'email' => 'kasir.sore@sideline.com',
            'password' => 'Password123!',
            'role' => 'cashier',
        ])
        ->assertSessionHas('success');

    $newCashier = User::where('email', 'kasir.sore@sideline.com')->firstOrFail();
    expect($newCashier->role)->toBe('cashier');

    // 2. Trying to promote cashier to admin is rejected by FormRequest validation
    $this->actingAs($this->admin)
        ->put(route('admin.users.update', $newCashier), [
            'name' => 'Kasir Sore',
            'email' => 'kasir.sore@sideline.com',
            'role' => 'admin',
        ])
        ->assertSessionHasErrors('role');

    expect($newCashier->fresh()->role)->toBe('cashier');

    // 3. Trying to demote the single admin is rejected by FormRequest validation
    $this->actingAs($this->admin)
        ->put(route('admin.users.update', $this->admin), [
            'name' => $this->admin->name,
            'email' => $this->admin->email,
            'role' => 'cashier',
        ])
        ->assertSessionHasErrors('role');

    expect($this->admin->fresh()->role)->toBe('admin');

    // 4. Trying to delete admin account is rejected
    $this->actingAs($this->admin)
        ->delete(route('admin.users.destroy', $this->admin))
        ->assertSessionHas('error');

    expect(User::where('id', $this->admin->id)->exists())->toBeTrue();
});

test('removed xendit, midtrans, webhook, and sandbox simulation routes return 404', function () {
    expect(Route::has('payments.initiate'))->toBeFalse()
        ->and(Route::has('payments.status'))->toBeFalse()
        ->and(Route::has('payments.webhook'))->toBeFalse()
        ->and(Route::has('order.payment'))->toBeFalse()
        ->and(Route::has('order.check-payment'))->toBeFalse()
        ->and(Route::has('order.simulate-payment'))->toBeFalse();

    $this->postJson('/payments/webhook/xendit', ['status' => 'PAID'])->assertNotFound();
    $this->postJson('/payments/webhook', ['status' => 'paid'])->assertNotFound();
    $this->postJson('/payments/orders/SO-TEST-0001/initiate', ['payment_method' => 'qris'])->assertNotFound();
    $this->getJson('/payments/orders/SO-TEST-0001/status')->assertNotFound();
    $this->get('/order/payment/SO-TEST-0001')->assertNotFound();
    $this->getJson('/order/check-payment/SO-TEST-0001')->assertNotFound();
    $this->postJson('/order/simulate-payment/SO-TEST-0001', ['status' => 'paid'])->assertNotFound();

    /** @var PaymentService $paymentService */
    $paymentService = app(PaymentService::class);
    $gatewayConfig = $paymentService->getPublicGatewayConfig();

    expect($gatewayConfig['driver'])->toBe('manual')
        ->and($gatewayConfig['is_configured'])->toBeFalse()
        ->and($gatewayConfig['is_ready'])->toBeFalse()
        ->and($gatewayConfig['mode'])->toBe('manual_only')
        ->and($gatewayConfig['webhook_endpoint'])->toBeNull();
});

test('customer checkout defaults to cash manual POS and rejects unconfigured digital methods', function () {
    // Checkout QRIS ditolak saat payment gateway belum terintegrasi
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Pelanggan Digital',
        'payment_method' => 'qris',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertSessionHasErrors('payment_method');

    // Checkout tanpa payment_method otomatis diarahkan ke cash (manual POS)
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Pelanggan Tunai',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect();

    $order = Order::where('customer_name', 'Pelanggan Tunai')->firstOrFail();
    expect($order->payment_method)->toBe('cash')
        ->and($order->payment_gateway)->toBe('manual')
        ->and($order->payment_channel)->toBe('CASH');
});

test('financial report sync includes gateway integration summary and filters transactions by digital vs manual', function () {
    $digitalOrder = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Riwayat Digital',
        'subtotal' => 45000,
        'total_amount' => 45000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'qris',
        'payment_gateway' => 'digital',
        'payment_channel' => 'QRIS',
        'payment_reference' => 'DIG-QRIS-1001',
        'paid_at' => now('Asia/Jakarta'),
    ]);

    Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Bayar Tunai',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'cash',
        'payment_gateway' => 'manual',
        'payment_channel' => 'CASH',
        'paid_at' => now('Asia/Jakarta'),
    ]);

    $syncRes = $this->actingAs($this->admin)
        ->getJson(route('admin.financial-reports.sync', [
            'preset' => 'today',
            'payment_gateway' => 'digital',
        ]));

    $syncRes->assertOk()
        ->assertJsonPath('summary.gateway_integration.driver', 'manual')
        ->assertJsonPath('summary.gateway_integration.configured', false)
        ->assertJsonPath('summary.gateway_integration.transactions_count', 1);

    $txRows = $syncRes->json('transactions.data');
    expect($txRows)->toHaveCount(1)
        ->and($txRows[0]['order_number'])->toBe($digitalOrder->order_number)
        ->and($txRows[0]['payment_gateway'])->toBe('digital');
});
