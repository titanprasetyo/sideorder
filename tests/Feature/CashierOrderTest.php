<?php

use App\Events\OrderStatusUpdated;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->cashier = User::factory()->create([
        'name' => 'Siti Kasir',
        'email' => 'kasir@sideline.com',
        'role' => 'cashier',
    ]);

    $this->table = CafeTable::create([
        'table_number' => '05',
        'is_active' => true,
    ]);

    $this->category = Category::create([
        'name' => 'Food & Snacks',
        'slug' => 'food-snacks',
        'is_active' => true,
    ]);

    $this->menuCroissant = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Butter Croissant',
        'slug' => 'butter-croissant',
        'base_price' => 25000,
        'is_active' => true,
    ]);

    $this->menuCoffee = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Americano Hot',
        'slug' => 'americano-hot',
        'base_price' => 22000,
        'is_active' => true,
    ]);
});

test('cashier can confirm payment and advance order from pending to processing', function () {
    Event::fake([OrderStatusUpdated::class]);

    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Rina',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
    ]);

    $response = $this->actingAs($this->cashier)
        ->post(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 50000,
            'change_amount' => 25000,
        ]);

    $response->assertSessionHas('success');

    $order->refresh();
    expect($order->payment_status)->toBe('paid')
        ->and($order->payment_method)->toBe('cash')
        ->and($order->order_status)->toBe('processing');

    expect(OrderStatusHistory::where('order_id', $order->id)->where('status', 'processing')->exists())->toBeTrue();
    Event::assertDispatched(OrderStatusUpdated::class);
});

test('cashier can mark order as ready and then permanently completed', function () {
    Event::fake([OrderStatusUpdated::class]);

    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Rina',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'processing',
        'payment_status' => 'paid',
    ]);

    // 1. Mark Ready
    $this->actingAs($this->cashier)
        ->post(route('cashier.orders.update-status', $order), [
            'status' => 'ready',
        ])
        ->assertSessionHas('success');

    $order->refresh();
    expect($order->order_status)->toBe('ready');

    // 2. Mark Completed (Tandai Selesai)
    $this->actingAs($this->cashier)
        ->post(route('cashier.orders.update-status', $order), [
            'status' => 'completed',
        ])
        ->assertSessionHas('success');

    $order->refresh();
    expect($order->order_status)->toBe('completed');
    expect($order->isCompleted())->toBeTrue();

    // 3. Completed order cannot be re-processed
    $revertAttempt = $this->actingAs($this->cashier)
        ->post(route('cashier.orders.update-status', $order), [
            'status' => 'processing',
        ]);

    $revertAttempt->assertSessionHas('error');
    $order->refresh();
    expect($order->order_status)->toBe('completed');
});

test('cashier cash payment confirmation on order with prior settlement computes change from remaining due', function () {
    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Rina Tambah Menu',
        'subtotal' => 47000,
        'total_amount' => 47000,
        'order_status' => 'processing',
        'payment_status' => 'unpaid',
        'cash_received' => 25000,
        'change_amount' => 0,
    ]);

    // Initial settled payment recorded in payments table (25.000)
    $order->payments()->create([
        'payment_reference' => 'PAY-INIT-001',
        'gateway' => 'manual',
        'method' => 'cash',
        'amount' => 25000,
        'settled_amount' => 25000,
        'status' => 'paid',
        'paid_at' => now('Asia/Jakarta'),
    ]);

    // Additional due is 22.000. Customer hands over Rp 50.000 (which is >= total_amount 47.000)
    $response = $this->actingAs($this->cashier)
        ->post(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 50000,
        ]);

    $response->assertSessionHas('success');

    $order->refresh();
    expect($order->payment_status)->toBe('paid')
        ->and((float) $order->cash_received)->toBe(75000.0) // 25000 initial + 50000 input
        ->and((float) $order->change_amount)->toBe(28000.0); // 50000 - 22000 remaining due
});

test('cashier cannot cancel an order that already has settled payment', function () {
    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Dedi Lunas',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'processing',
        'payment_status' => 'paid',
        'paid_at' => now('Asia/Jakarta'),
    ]);

    $response = $this->actingAs($this->cashier)
        ->post(route('cashier.orders.update-status', $order), [
            'status' => 'cancelled',
        ]);

    $response->assertSessionHas('error');

    $order->refresh();
    expect($order->order_status)->toBe('processing')
        ->and($order->payment_status)->toBe('paid');
});
