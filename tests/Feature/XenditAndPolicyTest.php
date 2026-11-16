<?php

use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
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

test('payment initiation creates a xendit ledger record and returns public metadata', function () {
    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Pelanggan Xendit',
        'subtotal' => 32000,
        'total_amount' => 32000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
        'payment_method' => 'qris',
    ]);

    $response = $this->postJson(route('payments.initiate', ['order_number' => $order->order_number]), [
        'payment_method' => 'qris',
        'gateway' => 'xendit',
    ]);

    $response->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonPath('gateway.driver', 'xendit')
        ->assertJsonPath('gateway.label', 'Xendit Payment Gateway')
        ->assertJsonPath('payment.gateway', 'xendit')
        ->assertJsonPath('payment.gateway_label', 'Xendit Payment Gateway')
        ->assertJsonPath('order.payment_gateway', 'xendit');

    $payment = Payment::where('order_id', $order->id)->first();
    expect($payment)->not->toBeNull()
        ->and($payment->gateway)->toBe('xendit')
        ->and((float) $payment->amount)->toBe(32000.0)
        ->and($payment->status)->toBe('pending');
});

test('xendit webhook is fail closed on invalid token and settles order idempotently with valid token', function () {
    config()->set('services.xendit.webhook_token', 'test-xendit-webhook-secret-123');

    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Raka Digital',
        'subtotal' => 32000,
        'total_amount' => 32000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
        'payment_method' => 'qris',
        'payment_gateway' => 'xendit',
        'payment_channel' => 'QRIS',
    ]);

    $initRes = $this->postJson(route('payments.initiate', ['order_number' => $order->order_number]), [
        'payment_method' => 'qris',
        'gateway' => 'xendit',
    ]);
    $paymentRef = $initRes->json('payment.payment_reference');

    // 1. Missing token -> HTTP 401
    $this->postJson(route('payments.webhook', ['driver' => 'xendit']), [
        'external_id' => $paymentRef,
        'status' => 'PAID',
        'amount' => 32000,
    ])->assertUnauthorized();

    // 2. Wrong token -> HTTP 401
    $this->withHeaders([
        'X-CALLBACK-TOKEN' => 'wrong-token-attempt',
    ])->postJson(route('payments.webhook', ['driver' => 'xendit']), [
        'external_id' => $paymentRef,
        'status' => 'PAID',
        'amount' => 32000,
    ])->assertUnauthorized();

    $order->refresh();
    expect($order->payment_status)->toBe('unpaid');

    // 3. Valid X-CALLBACK-TOKEN -> settles order and updates ledger
    $this->withHeaders([
        'X-CALLBACK-TOKEN' => 'test-xendit-webhook-secret-123',
    ])->postJson(route('payments.webhook', ['driver' => 'xendit']), [
        'id' => 'inv_xnd_valid_001',
        'external_id' => $paymentRef,
        'status' => 'PAID',
        'amount' => 32000,
        'paid_amount' => 32000,
        'payment_channel' => 'QRIS',
    ])->assertOk()
        ->assertJsonPath('status', 'ok')
        ->assertJsonPath('gateway', 'xendit');

    $order->refresh();
    expect($order->payment_status)->toBe('paid')
        ->and($order->order_status)->toBe('processing')
        ->and($order->payment_gateway)->toBe('xendit');

    // 4. Replay idempotent webhook -> already_processed = true
    $this->withHeaders([
        'X-CALLBACK-TOKEN' => 'test-xendit-webhook-secret-123',
    ])->postJson(route('payments.webhook', ['driver' => 'xendit']), [
        'id' => 'inv_xnd_valid_001',
        'external_id' => $paymentRef,
        'status' => 'PAID',
        'amount' => 32000,
        'paid_amount' => 32000,
        'payment_channel' => 'QRIS',
    ])->assertOk()
        ->assertJsonPath('already_processed', true);
});

test('admin cannot delete or cancel a paid order', function () {
    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Tamu Sudah Bayar',
        'subtotal' => 32000,
        'total_amount' => 32000,
        'order_status' => 'processing',
        'payment_status' => 'paid',
        'payment_method' => 'qris',
        'payment_gateway' => 'xendit',
        'paid_at' => now('Asia/Jakarta'),
    ]);

    $this->actingAs($this->admin)
        ->delete(route('admin.orders.destroy', $order))
        ->assertSessionHas('error');

    $order->refresh();
    expect($order->order_status)->toBe('processing')
        ->and($order->payment_status)->toBe('paid');
});

test('dashboard sync includes xendit integration summary and filters transactions by payment gateway', function () {
    $xenditOrder = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Bayar QRIS Xendit',
        'subtotal' => 32000,
        'total_amount' => 32000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'qris',
        'payment_gateway' => 'xendit',
        'payment_channel' => 'QRIS',
        'payment_reference' => 'XND-QRIS-1001',
        'paid_at' => now('Asia/Jakarta'),
    ]);

    Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Bayar Tunai POS',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'cash',
        'payment_gateway' => 'manual',
        'payment_channel' => 'CASH',
        'paid_at' => now('Asia/Jakarta'),
    ]);

    $response = $this->actingAs($this->admin)
        ->getJson(route('dashboard.sync', [
            'period' => 'today',
            'payment_gateway' => 'xendit',
        ]));

    $response->assertOk()
        ->assertJsonPath('summary.xendit_integration.label', 'Xendit Payment Gateway')
        ->assertJsonPath('summary.xendit_integration.transactions_count', 1);

    $txRows = $response->json('transactions.data');
    expect($txRows)->toHaveCount(1)
        ->and($txRows[0]['order_number'])->toBe($xenditOrder->order_number)
        ->and($txRows[0]['payment_gateway'])->toBe('xendit');
});
