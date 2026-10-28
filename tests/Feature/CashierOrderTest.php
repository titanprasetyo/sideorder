<?php

use App\Events\OrderItemRejected;
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

test('cashier can reject single menu item without affecting other items in order', function () {
    Event::fake([OrderItemRejected::class, OrderStatusUpdated::class]);

    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Dimas',
        'subtotal' => 47000,
        'total_amount' => 47000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
    ]);

    $item1 = $order->items()->create([
        'menu_id' => $this->menuCroissant->id,
        'menu_name' => 'Butter Croissant',
        'base_price' => 25000,
        'quantity' => 1,
        'subtotal_options' => 0,
        'unit_price' => 25000,
        'total_price' => 25000,
        'status' => 'active',
    ]);

    $item2 = $order->items()->create([
        'menu_id' => $this->menuCoffee->id,
        'menu_name' => 'Americano Hot',
        'base_price' => 22000,
        'quantity' => 1,
        'subtotal_options' => 0,
        'unit_price' => 22000,
        'total_price' => 22000,
        'status' => 'active',
    ]);

    // Kasir menolak Butter Croissant karena stok habis
    $response = $this->actingAs($this->cashier)
        ->post(route('cashier.orders.items.reject', ['order' => $order, 'item' => $item1]), [
            'reason' => 'Stok croissant habis di display',
        ]);

    $response->assertSessionHas('success');

    $item1->refresh();
    $item2->refresh();
    $order->refresh();

    // Item 1 harus rejected dengan alasan & staf kasir
    expect($item1->status)->toBe('rejected')
        ->and($item1->rejection_reason)->toBe('Stok croissant habis di display')
        ->and($item1->rejected_by)->toBe($this->cashier->id)
        ->and($item1->rejected_at)->not->toBeNull();

    // Item 2 harus tetap active
    expect($item2->status)->toBe('active');

    // Pesanan tetap aktif, tetapi subtotal dan total_amount berkurang sesuai sisa item aktif
    expect($order->order_status)->toBe('pending')
        ->and((float) $order->subtotal)->toBe(22000.0)
        ->and((float) $order->total_amount)->toBe(22000.0);

    Event::assertDispatched(OrderItemRejected::class);
});

test('rejecting all items in order automatically cancels the order', function () {
    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Fajar',
        'subtotal' => 22000,
        'total_amount' => 22000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
    ]);

    $item = $order->items()->create([
        'menu_id' => $this->menuCoffee->id,
        'menu_name' => 'Americano Hot',
        'base_price' => 22000,
        'quantity' => 1,
        'subtotal_options' => 0,
        'unit_price' => 22000,
        'total_price' => 22000,
        'status' => 'active',
    ]);

    $this->actingAs($this->cashier)
        ->post(route('cashier.orders.items.reject', ['order' => $order, 'item' => $item]), [
            'reason' => 'Mesin espresso troubleshooting',
        ])
        ->assertSessionHas('success');

    $order->refresh();
    $item->refresh();

    expect($item->status)->toBe('rejected');
    expect($order->order_status)->toBe('cancelled')
        ->and((float) $order->total_amount)->toBe(0.0);
});
