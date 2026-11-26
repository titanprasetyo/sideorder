<?php

use App\Events\OrderStatusUpdated;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\OrderItem;
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

test('cashier and admin cannot advance unpaid orders into processing, ready, or completed', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $unpaidOrder = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Tamu Belum Bayar',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
        'payment_method' => 'qris',
    ]);

    OrderItem::create([
        'order_id' => $unpaidOrder->id,
        'menu_id' => $this->menuCroissant->id,
        'menu_name' => $this->menuCroissant->name,
        'base_price' => 25000,
        'quantity' => 1,
        'batch_number' => 1,
        'is_followup' => false,
        'payment_status' => 'unpaid',
        'subtotal_options' => 0,
        'unit_price' => 25000,
        'total_price' => 25000,
        'status' => 'active',
        'is_served' => false,
    ]);

    foreach (['processing', 'ready', 'completed'] as $targetStatus) {
        $this->actingAs($this->cashier)
            ->postJson(route('cashier.orders.update-status', $unpaidOrder), [
                'status' => $targetStatus,
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        expect($unpaidOrder->fresh()->order_status)->toBe('pending');

        $this->actingAs($admin)
            ->post(route('admin.orders.update-status', $unpaidOrder), [
                'status' => $targetStatus,
            ])
            ->assertSessionHas('error');

        expect($unpaidOrder->fresh()->order_status)->toBe('pending');
    }
});

test('cashier cannot skip stages even on paid orders', function () {
    $paidPending = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Rudi Lunas',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'pending',
        'payment_status' => 'paid',
        'paid_at' => now('Asia/Jakarta'),
    ]);

    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.update-status', $paidPending), ['status' => 'ready'])
        ->assertStatus(422);
    expect($paidPending->fresh()->order_status)->toBe('pending');

    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.update-status', $paidPending), ['status' => 'completed'])
        ->assertStatus(422);
    expect($paidPending->fresh()->order_status)->toBe('pending');

    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.update-status', $paidPending), ['status' => 'processing'])
        ->assertOk();
    expect($paidPending->fresh()->order_status)->toBe('processing');

    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.update-status', $paidPending), ['status' => 'completed'])
        ->assertStatus(422);
    expect($paidPending->fresh()->order_status)->toBe('processing');
});

test('cashier can mark paid items served individually during processing while unpaid follow-up items stay locked and block order completion', function () {
    Event::fake([OrderStatusUpdated::class]);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Andi VIP',
        'payment_method' => 'cash',
        'items' => [
            ['menu_id' => $this->menuCroissant->id, 'quantity' => 1, 'selected_option_ids' => []],
            ['menu_id' => $this->menuCoffee->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect();

    $order = Order::with('items')->latest('id')->firstOrFail();

    // 1. Konfirmasi pembayaran awal Rp 47.000 -> processing & seluruh item batch 1 lunas
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 50000,
        ])
        ->assertOk();

    $order->refresh();
    $initialItems = $order->items()->orderBy('id')->get();
    $croissantItem = $initialItems[0];
    $coffeeItem = $initialItems[1];

    expect($croissantItem->batch_number)->toBe(1)
        ->and($croissantItem->payment_status)->toBe('paid')
        ->and($coffeeItem->batch_number)->toBe(1)
        ->and($coffeeItem->payment_status)->toBe('paid');

    // 2. Pelanggan memesan susulan 1x Americano Hot (Rp 22.000) via tunai kasir sebelum pesanan selesai
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'order_number' => $order->order_number,
        'customer_name' => 'Andi VIP',
        'payment_method' => 'cash',
        'items' => [
            ['menu_id' => $this->menuCoffee->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect();

    $order->refresh();
    $followupItem = $order->items()->where('batch_number', 2)->firstOrFail();

    expect($order->payment_status)->toBe('unpaid')
        ->and((float) $order->unpaid_balance)->toBe(22000.0)
        ->and($followupItem->is_followup)->toBeTrue()
        ->and($followupItem->payment_status)->toBe('unpaid');

    // 3. Kasir dapat menandai item awal yang sudah lunas satu per satu sebagai diantar
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.items.toggle-served', [$order, $croissantItem]), [
            'is_served' => true,
        ])
        ->assertOk()
        ->assertJsonPath('success', true);

    expect($croissantItem->fresh()->is_served)->toBeTrue()
        ->and($coffeeItem->fresh()->is_served)->toBeFalse();

    // 4. Item susulan yang BELUM dibayar ditolak (422) saat dicoba ditandai diantar
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.items.toggle-served', [$order, $followupItem]), [
            'is_served' => true,
        ])
        ->assertStatus(422)
        ->assertJsonPath('success', false);

    expect($followupItem->fresh()->is_served)->toBeFalse();

    // 5. Order dengan susulan belum bayar tidak bisa ditandai Ready ataupun Completed
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.update-status', $order), ['status' => 'ready'])
        ->assertStatus(422);
    expect($order->fresh()->order_status)->toBe('processing');

    // 6. Proteksi IDOR & guest access pada endpoint toggle-served
    $otherOrder = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Tamu Lain',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'processing',
        'payment_status' => 'paid',
    ]);
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.items.toggle-served', [$otherOrder, $croissantItem]), [
            'is_served' => true,
        ])
        ->assertNotFound();

    auth()->logout();
    $this->postJson(route('cashier.orders.items.toggle-served', [$order, $coffeeItem]), [
        'is_served' => true,
    ])->assertUnauthorized();

    // 7. Setelah susulan dibayar lunas, item susulan dapat diantar dan order dapat lanjut ke Ready -> Completed
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 25000,
        ])
        ->assertOk();

    expect($followupItem->fresh()->payment_status)->toBe('paid')
        ->and($order->fresh()->payment_status)->toBe('paid');

    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.items.toggle-served', [$order, $followupItem]), [
            'is_served' => true,
        ])
        ->assertOk();
    expect($followupItem->fresh()->is_served)->toBeTrue();

    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.update-status', $order), ['status' => 'ready'])
        ->assertOk();
    expect($order->fresh()->order_status)->toBe('ready')
        ->and($coffeeItem->fresh()->is_served)->toBeTrue();
});

test('partial item serving moves order into cashier and admin ready views and auto-promotes when all paid items are served', function () {
    Event::fake([OrderStatusUpdated::class]);
    $admin = User::factory()->create(['role' => 'admin']);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Budi Multi Menu',
        'payment_method' => 'cash',
        'items' => [
            ['menu_id' => $this->menuCroissant->id, 'quantity' => 1, 'selected_option_ids' => []],
            ['menu_id' => $this->menuCoffee->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect();

    $order = Order::with('items')->latest('id')->firstOrFail();

    // Kasir mengonfirmasi pembayaran tunai -> masuk ke processing & lunas
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 50000,
        ])->assertOk();

    $items = $order->items()->orderBy('id')->get();
    $firstItem = $items[0];
    $secondItem = $items[1];

    // 1. Ceklis item pertama (1/2) -> status order tetap processing (partial ready), masuk ke hitungan ready Kasir & Admin
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.items.toggle-served', [$order, $firstItem]), [
            'is_served' => true,
        ])
        ->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonPath('counts.ready', 1)
        ->assertJsonPath('counts.processing', 1);

    expect($order->fresh()->order_status)->toBe('processing')
        ->and($firstItem->fresh()->is_served)->toBeTrue()
        ->and($secondItem->fresh()->is_served)->toBeFalse();

    $adminReadySync = $this->actingAs($admin)
        ->getJson(route('admin.orders.sync', ['status' => 'ready']))
        ->assertOk();

    expect($adminReadySync->json('counts.ready'))->toBe(1)
        ->and($adminReadySync->json('orders.data.0.id'))->toBe($order->id);

    // 2. Ceklis item terakhir (2/2) -> otomatis naik penuh ke status 'ready' (Siap Disajikan)
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.items.toggle-served', [$order, $secondItem]), [
            'is_served' => true,
        ])
        ->assertOk()
        ->assertJsonPath('counts.ready', 1)
        ->assertJsonPath('counts.processing', 0);

    expect($order->fresh()->order_status)->toBe('ready')
        ->and($secondItem->fresh()->is_served)->toBeTrue();

    // 3. Uncheck salah satu item saat status 'ready' -> otomatis kembali ke 'processing' (partial ready 1/2)
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.items.toggle-served', [$order, $secondItem]), [
            'is_served' => false,
        ])
        ->assertOk()
        ->assertJsonPath('counts.ready', 1)
        ->assertJsonPath('counts.processing', 1);

    expect($order->fresh()->order_status)->toBe('processing')
        ->and($secondItem->fresh()->is_served)->toBeFalse();
});

test('checking all paid batch items does not auto-promote order to ready while unpaid follow-up items exist', function () {
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Citra Susulan',
        'payment_method' => 'cash',
        'items' => [
            ['menu_id' => $this->menuCroissant->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect();

    $order = Order::with('items')->latest('id')->firstOrFail();

    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 30000,
        ])
        ->assertOk();

    $batch1Item = $order->items()->where('batch_number', 1)->firstOrFail();

    // Pelanggan menambah pesanan susulan yang belum dibayar
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'order_number' => $order->order_number,
        'customer_name' => 'Citra Susulan',
        'items' => [
            ['menu_id' => $this->menuCoffee->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect();

    // Tandai seluruh item batch 1 sudah siap diantar -> tidak boleh auto-promote menjadi 'ready'
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.items.toggle-served', [$order, $batch1Item]), [
            'is_served' => true,
        ])
        ->assertOk()
        ->assertJsonPath('counts.ready', 1);

    expect($batch1Item->fresh()->is_served)->toBeTrue()
        ->and($order->fresh()->order_status)->toBe('processing')
        ->and($order->fresh()->payment_status)->toBe('unpaid');
});

test('cashier cannot manually confirm unpaid legacy qris order until customer switches it to cash', function () {
    Event::fake([OrderStatusUpdated::class]);

    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Rama Switch',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
        'payment_method' => 'qris',
        'payment_gateway' => 'digital',
    ]);

    OrderItem::create([
        'order_id' => $order->id,
        'menu_id' => $this->menuCroissant->id,
        'menu_name' => $this->menuCroissant->name,
        'base_price' => 25000,
        'quantity' => 1,
        'batch_number' => 1,
        'is_followup' => false,
        'payment_status' => 'unpaid',
        'subtotal_options' => 0,
        'unit_price' => 25000,
        'total_price' => 25000,
        'status' => 'active',
        'is_served' => false,
    ]);

    // 1. Awal masih QRIS -> ditolak kasir saat confirm-payment maupun update-status
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 30000,
        ])
        ->assertStatus(422);

    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.update-status', $order), [
            'status' => 'processing',
        ])
        ->assertStatus(422);

    // 2. Pelanggan beralih ke Tunai Kasir dari halaman status -> kini kasir dapat mengonfirmasi bayar tunai
    $this->postJson(route('order.switch-payment-method', ['order_number' => $order->order_number]), [
        'payment_method' => 'cash',
    ])->assertOk()
        ->assertJsonPath('payment_method', 'cash');

    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 30000,
        ])
        ->assertOk()
        ->assertJsonPath('success', true);

    $order->refresh();
    expect($order->payment_status)->toBe('paid')
        ->and($order->payment_method)->toBe('cash')
        ->and($order->order_status)->toBe('processing');
});
