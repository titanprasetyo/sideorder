<?php

use App\Events\OrderCreated;
use App\Events\OrderStatusUpdated;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\MenuOptionGroup;
use App\Models\MenuOptionItem;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->create([
        'name' => 'Owner Admin',
        'email' => 'admin.stock@sideline.com',
        'role' => 'admin',
    ]);

    $this->cashier = User::factory()->create([
        'name' => 'Kasir Shift',
        'email' => 'kasir.stock@sideline.com',
        'role' => 'cashier',
    ]);

    $this->tableA = CafeTable::create([
        'table_number' => '01',
        'name' => 'Meja 01',
        'is_active' => true,
    ]);

    $this->tableB = CafeTable::create([
        'table_number' => '02',
        'name' => 'Meja 02',
        'is_active' => true,
    ]);

    $this->category = Category::create([
        'name' => 'Seasonal Roast',
        'slug' => 'seasonal-roast',
        'sort_order' => 1,
        'is_active' => true,
    ]);

    $this->limitedMenu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Geisha Pour Over',
        'slug' => 'geisha-pour-over',
        'base_price' => 45000,
        'is_active' => true,
        'is_limited_stock' => true,
        'stock_quantity' => 5,
    ]);

    $this->optionGroup = MenuOptionGroup::create([
        'menu_id' => $this->limitedMenu->id,
        'name' => 'Penyajian',
        'selection_type' => 'single',
        'is_required' => false,
        'sort_order' => 0,
    ]);

    $this->optionHot = MenuOptionItem::create([
        'option_group_id' => $this->optionGroup->id,
        'name' => 'Hot',
        'additional_price' => 0,
        'is_default' => true,
        'is_active' => true,
        'sort_order' => 1,
    ]);

    $this->optionIced = MenuOptionItem::create([
        'option_group_id' => $this->optionGroup->id,
        'name' => 'Iced',
        'additional_price' => 3000,
        'is_default' => false,
        'is_active' => true,
        'sort_order' => 2,
    ]);

    $this->unlimitedMenu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Americano Regular',
        'slug' => 'americano-regular',
        'base_price' => 20000,
        'is_active' => true,
        'is_limited_stock' => false,
        'stock_quantity' => 0,
    ]);
});

test('admin can create and update limited stock menus while enforcing stock quantity validation', function () {
    $this->actingAs($this->admin)
        ->post(route('admin.menus.store'), [
            'category_id' => $this->category->id,
            'name' => 'Croissant Matcha',
            'base_price' => 32000,
            'is_active' => true,
            'is_limited_stock' => true,
            'stock_quantity' => null,
        ])
        ->assertSessionHasErrors('stock_quantity');

    $this->actingAs($this->admin)
        ->post(route('admin.menus.store'), [
            'category_id' => $this->category->id,
            'name' => 'Croissant Matcha',
            'base_price' => 32000,
            'is_active' => true,
            'is_limited_stock' => true,
            'stock_quantity' => 12,
        ])
        ->assertSessionHas('success');

    $created = Menu::where('name', 'Croissant Matcha')->firstOrFail();
    expect($created->is_limited_stock)->toBeTrue()
        ->and((int) $created->stock_quantity)->toBe(12);

    $this->actingAs($this->admin)
        ->put(route('admin.menus.update', $created), [
            'category_id' => $this->category->id,
            'name' => 'Croissant Matcha',
            'base_price' => 32000,
            'is_active' => true,
            'is_limited_stock' => false,
            'stock_quantity' => 12,
        ])
        ->assertSessionHas('success');

    expect($created->fresh()->is_limited_stock)->toBeFalse()
        ->and((int) $created->fresh()->stock_quantity)->toBe(12);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Tamu Unlimited',
        'items' => [
            [
                'menu_id' => $created->id,
                'quantity' => 15,
            ],
        ],
    ])->assertRedirect();

    expect((int) $created->fresh()->stock_quantity)->toBe(12);
});

test('checkout atomically reserves stock across variants rejects over-limit requests and leaves unlimited menus untouched', function () {
    Event::fake([OrderCreated::class]);

    // Total 2 (Hot) + 4 (Iced) = 6 > stok tersedia 5 -> harus gagal tanpa pengurangan parsial
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Dina',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 2,
                'selected_option_ids' => [$this->optionHot->id],
            ],
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 4,
                'selected_option_ids' => [$this->optionIced->id],
            ],
        ],
    ])->assertSessionHasErrors(['items.0.quantity']);

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(5)
        ->and(Order::count())->toBe(0);

    // Checkout valid: 2 Hot + 1 Iced + 3 Unlimited -> sisa stok terbatas 5 - 3 = 2
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Dina',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 2,
                'selected_option_ids' => [$this->optionHot->id],
            ],
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionIced->id],
            ],
            [
                'menu_id' => $this->unlimitedMenu->id,
                'quantity' => 3,
            ],
        ],
    ])->assertRedirect();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(2)
        ->and((int) $this->unlimitedMenu->fresh()->stock_quantity)->toBe(0);

    $order = Order::latest()->firstOrFail();
    $limitedItems = $order->items()->where('menu_id', $this->limitedMenu->id)->get();
    expect($limitedItems)->toHaveCount(2);
    foreach ($limitedItems as $item) {
        expect($item->stock_state)->toBe('reserved')
            ->and($item->stock_deducted_at)->not->toBeNull();
    }

    $unlimitedItem = $order->items()->where('menu_id', $this->unlimitedMenu->id)->firstOrFail();
    expect($unlimitedItem->stock_state)->toBe('none');

    // Customer lain memesan sisa 2 porsi -> stok menjadi 0
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableB->qr_token,
        'customer_name' => 'Raka',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 2,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(0);

    // Pesanan berikutnya pada stok 0 gagal dengan validasi habis
    $tableC = CafeTable::create([
        'table_number' => '03',
        'name' => 'Meja 03',
        'is_active' => true,
    ]);

    $this->post(route('order.checkout'), [
        'qr_token' => $tableC->qr_token,
        'customer_name' => 'Bima',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertSessionHasErrors(['items.0.quantity']);
});

test('cashier payment confirmation marks reserved stock confirmed without double decrementing', function () {
    Event::fake([OrderCreated::class, OrderStatusUpdated::class]);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Sari',
        'payment_method' => 'cash',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 3,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(2);

    $order = Order::latest()->firstOrFail();

    $this->actingAs($this->cashier)
        ->post(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 150000,
            'change_amount' => 15000,
        ])
        ->assertSessionHas('success');

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(2)
        ->and($order->fresh()->payment_status)->toBe('paid')
        ->and($order->items()->firstOrFail()->stock_state)->toBe('confirmed');
});

test('cancelling an unpaid order or deleting it restores reserved stock idempotently', function () {
    Event::fake([OrderCreated::class, OrderStatusUpdated::class]);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Farah',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 4,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(1);
    $order = Order::latest()->firstOrFail();

    // Batalkan pesanan belum dibayar via Kasir -> stok kembali dari 1 menjadi 5
    $this->actingAs($this->cashier)
        ->post(route('cashier.orders.update-status', $order), [
            'status' => 'cancelled',
        ])
        ->assertSessionHas('success');

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(5)
        ->and($order->items()->firstOrFail()->stock_state)->toBe('released');

    // Pembatalan ulang oleh Admin pada pesanan yang sudah dibatalkan ditolak dengan error & tidak mengembalikan stok dua kali
    $this->actingAs($this->admin)
        ->delete(route('admin.orders.destroy', $order))
        ->assertSessionHas('error');

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(5);

    // Pembatalan langsung via admin.orders.destroy pada pesanan baru mengembalikan stok
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableB->qr_token,
        'customer_name' => 'Farah 2',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 3,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(2);
    $freshOrder = Order::latest('id')->firstOrFail();

    $this->actingAs($this->admin)
        ->delete(route('admin.orders.destroy', $freshOrder))
        ->assertSessionHas('success');

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(5);
});

test('admin cannot delete a menu that is currently used in a processing order', function () {
    $order = Order::create([
        'cafe_table_id' => $this->tableA->id,
        'customer_name' => 'Budi Sedang Diracik',
        'subtotal' => 38000,
        'total_amount' => 38000,
        'order_status' => 'processing',
        'payment_status' => 'paid',
    ]);

    $order->items()->create([
        'menu_id' => $this->limitedMenu->id,
        'menu_name' => $this->limitedMenu->name,
        'base_price' => 38000,
        'quantity' => 1,
        'unit_price' => 38000,
        'total_price' => 38000,
        'status' => 'active',
    ]);

    $response = $this->actingAs($this->admin)
        ->delete(route('admin.menus.destroy', $this->limitedMenu));

    $response->assertSessionHas('error');
    expect(Menu::whereKey($this->limitedMenu->id)->exists())->toBeTrue();
});

test('expired additional payment on tambah menu order releases newly added reserved stock while keeping initial confirmed stock', function () {
    Event::fake([OrderCreated::class, OrderStatusUpdated::class]);
    config()->set('services.xendit.webhook_token', 'test-xendit-stock-secret');

    // 1. Order awal 2 porsi -> lunas via cashier (confirmed stock)
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Adit Initial',
        'payment_method' => 'cash',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 2,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    $order = Order::latest()->firstOrFail();
    $this->actingAs($this->cashier)
        ->post(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 90000,
        ]);

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(3);

    // 2. Tambah menu 2 porsi lagi via checkout Scenario A (reserved stock)
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'order_number' => $order->order_number,
        'customer_name' => 'Adit Initial',
        'payment_method' => 'qris',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 2,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(1);

    // 3. Additional payment failed/expired via Xendit webhook callback
    $order->refresh();
    $targetPayment = $order->payments()->create([
        'payment_reference' => 'PAY-XENDIT-ADD',
        'gateway' => 'xendit',
        'method' => 'qris',
        'external_id' => 'xendit_add_'.$order->id.'_'.time(),
        'amount' => 90000,
        'status' => 'pending',
    ]);

    $this->withHeaders([
        'X-CALLBACK-TOKEN' => 'test-xendit-stock-secret',
    ])->postJson(route('payments.webhook', ['driver' => 'xendit']), [
        'id' => 'inv_expired_add_001',
        'external_id' => $targetPayment->payment_reference,
        'status' => 'EXPIRED',
        'amount' => 90000,
    ])->assertOk();

    // Sisa stok harus kembali menjadi 3 (2 porsi reserved dikembalikan, 2 porsi awal tetap confirmed)
    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(3);
});

test('deactivating category prevents checkout and marks menus inactive in stock-sync', function () {
    $this->category->update(['is_active' => false]);

    // stock-sync marks menu inactive
    $syncResponse = $this->getJson(route('order.stock-sync'));
    $syncResponse->assertOk();
    $menuData = collect($syncResponse->json('menus'))->firstWhere('id', $this->limitedMenu->id);
    expect($menuData['is_active'])->toBeFalse();

    // checkout fails with validation error
    $response = $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Testing Category Inactive',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ]);

    $response->assertSessionHasErrors(['items.0.menu_id']);
    // Re-activate category
    $this->category->update(['is_active' => true]);
});

test('gateway webhook paid confirms stock and expired releases stock safely with retry re-reservation', function () {
    Event::fake([OrderCreated::class, OrderStatusUpdated::class]);
    config()->set('services.xendit.webhook_token', 'test-xendit-stock-secret');

    // Order 1: Checkout -> Initiate -> EXPIRED webhook -> stok dilepas
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Gibran',
        'payment_method' => 'qris',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 3,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(2);

    $order1 = Order::latest('id')->firstOrFail();
    $initRes1 = $this->postJson(route('payments.initiate', ['order_number' => $order1->order_number]), [
        'payment_method' => 'qris',
        'gateway' => 'xendit',
    ])->assertOk();
    $paymentRef1 = $initRes1->json('payment.payment_reference');

    $this->withHeaders([
        'X-CALLBACK-TOKEN' => 'test-xendit-stock-secret',
    ])->postJson(route('payments.webhook', ['driver' => 'xendit']), [
        'id' => 'inv_expired_001',
        'external_id' => $paymentRef1,
        'status' => 'EXPIRED',
        'amount' => $order1->total_amount,
    ])->assertOk();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(5)
        ->and($order1->items()->firstOrFail()->stock_state)->toBe('released');

    // Customer mencoba bayar ulang (initiatePayment) -> stok direservasi kembali dari 5 menjadi 2
    $initRetry = $this->postJson(route('payments.initiate', ['order_number' => $order1->order_number]), [
        'payment_method' => 'qris',
        'gateway' => 'xendit',
        'force_new' => true,
    ])->assertOk();
    $paymentRefRetry = $initRetry->json('payment.payment_reference');

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(2)
        ->and($order1->items()->firstOrFail()->stock_state)->toBe('reserved');

    // Webhook PAID mengonfirmasi stok tanpa memotong ganda (tetap 2)
    $this->withHeaders([
        'X-CALLBACK-TOKEN' => 'test-xendit-stock-secret',
    ])->postJson(route('payments.webhook', ['driver' => 'xendit']), [
        'id' => 'inv_paid_002',
        'external_id' => $paymentRefRetry,
        'status' => 'PAID',
        'amount' => $order1->total_amount,
        'paid_amount' => $order1->total_amount,
        'payment_channel' => 'QRIS',
    ])->assertOk();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(2)
        ->and($order1->fresh()->payment_status)->toBe('paid')
        ->and($order1->items()->firstOrFail()->stock_state)->toBe('confirmed');

    // Simulasi stok habis sebelum retry pembayaran pada order lain yang sudah kedaluwarsa -> gagal dengan 422
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableB->qr_token,
        'customer_name' => 'Hana',
        'payment_method' => 'qris',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 2,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    $order2 = Order::latest('id')->firstOrFail();
    $initRes2 = $this->postJson(route('payments.initiate', ['order_number' => $order2->order_number]), [
        'payment_method' => 'qris',
        'gateway' => 'xendit',
    ])->assertOk();

    $this->withHeaders([
        'X-CALLBACK-TOKEN' => 'test-xendit-stock-secret',
    ])->postJson(route('payments.webhook', ['driver' => 'xendit']), [
        'id' => 'inv_expired_003',
        'external_id' => $initRes2->json('payment.payment_reference'),
        'status' => 'EXPIRED',
        'amount' => $order2->total_amount,
    ])->assertOk();

    // Admin menurunkan stok menjadi 1 sehingga order2 (butuh 2) tidak bisa di-retry pembayarannya
    $this->limitedMenu->update(['stock_quantity' => 1]);

    $this->postJson(route('payments.initiate', ['order_number' => $order2->order_number]), [
        'payment_method' => 'qris',
        'gateway' => 'xendit',
        'force_new' => true,
    ])->assertStatus(422);
});

test('stock sync endpoint returns live limited stock flags and remaining quantities', function () {
    $syncResponse = $this->getJson(route('order.stock-sync'))
        ->assertOk()
        ->assertJsonStructure([
            'menus' => [
                '*' => ['id', 'is_active', 'is_limited_stock', 'stock_quantity', 'is_stock_expired'],
            ],
            'synced_at',
        ]);

    $menus = collect($syncResponse->json('menus'))->keyBy('id');

    expect($menus[$this->limitedMenu->id]['is_limited_stock'])->toBeTrue()
        ->and($menus[$this->limitedMenu->id]['stock_quantity'])->toBe(5)
        ->and($menus[$this->limitedMenu->id]['is_stock_expired'])->toBeFalse()
        ->and($menus[$this->unlimitedMenu->id]['is_limited_stock'])->toBeFalse()
        ->and($menus[$this->unlimitedMenu->id]['stock_quantity'])->toBe(0)
        ->and($menus[$this->unlimitedMenu->id]['is_stock_expired'])->toBeFalse();
});

test('expired daily stock displays as habis to customer, blocks checkout, and recovers when admin updates stock', function () {
    // Simulasikan Admin lupa update stok hari ini (terakhir diperbarui kemarin WIB, masa berlaku 1 hari)
    $this->limitedMenu->update([
        'stock_valid_days' => 1,
        'stock_updated_at' => now('Asia/Jakarta')->subDay()->setTime(9, 0),
    ]);

    $freshMenu = $this->limitedMenu->fresh();
    expect($freshMenu->hasExpiredStock())->toBeTrue()
        ->and($freshMenu->resolveEffectiveStockQuantity())->toBe(0)
        ->and((int) $freshMenu->stock_quantity)->toBe(5);

    // Halaman customer melihat stok efektif 0 (Habis) + is_stock_expired = true
    $syncResponse = $this->getJson(route('order.stock-sync'))->assertOk();
    $synced = collect($syncResponse->json('menus'))->keyBy('id');
    expect($synced[$this->limitedMenu->id]['stock_quantity'])->toBe(0)
        ->and($synced[$this->limitedMenu->id]['is_stock_expired'])->toBeTrue();

    // Tampilan Inertia meja customer juga menerima stok 0 (Habis) tanpa mengubah angka DB
    $this->get(route('order.index', ['table' => $this->tableA->qr_token]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('categories.0.menus.0.stock_quantity', 0)
            ->where('categories.0.menus.0.is_stock_expired', true)
        );
    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(5);

    // Checkout diblokir saat stok kedaluwarsa
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Raka',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertSessionHasErrors('items.0.quantity');

    // Dashboard Ringkasan & Manajemen Sistem menampilkan pengingat update stok
    $this->actingAs($this->admin)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('alerts.expired_stock_count', 1)
            ->where('alerts.expired_stock_menus.0.id', $this->limitedMenu->id)
        );

    $this->actingAs($this->admin)
        ->get(route('admin.location-settings.edit', ['tab' => 'system']))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('systemHealth.expired_stock_menus.0.id', $this->limitedMenu->id)
        );

    // Admin melakukan Update Stok Cepat (misal 8 porsi, berlaku 3 hari)
    $this->actingAs($this->admin)
        ->post(route('admin.menus.stock', $this->limitedMenu), [
            'stock_quantity' => 8,
            'stock_valid_days' => 3,
        ])
        ->assertSessionHas('success');

    $updated = $this->limitedMenu->fresh();
    expect($updated->hasExpiredStock())->toBeFalse()
        ->and($updated->resolveEffectiveStockQuantity())->toBe(8)
        ->and($updated->stockValidDays())->toBe(3);

    // Customer kembali dapat memesan setelah Admin memperbarui stok
    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Raka',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 2,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(6);
});

test('custom multi-day stock validity stays purchasable within window and expires after configured days without checkout extending timestamp', function () {
    $twoDaysAgo = now('Asia/Jakarta')->subDays(2)->setTime(10, 0);

    $this->limitedMenu->update([
        'stock_quantity' => 10,
        'stock_valid_days' => 3,
        'stock_updated_at' => $twoDaysAgo,
    ]);

    // Hari ke-2 dari masa berlaku 3 hari masih aktif
    expect($this->limitedMenu->fresh()->hasExpiredStock())->toBeFalse()
        ->and($this->limitedMenu->fresh()->resolveEffectiveStockQuantity())->toBe(10);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Sari',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 3,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    $afterCheckout = $this->limitedMenu->fresh();
    expect((int) $afterCheckout->stock_quantity)->toBe(7)
        ->and($afterCheckout->stock_updated_at?->timezone('Asia/Jakarta')->toDateString())
        ->toBe($twoDaysAgo->toDateString());

    // Setelah melewati 3 hari kalender WIB (diupdate 3 hari lalu), stok otomatis kedaluwarsa (Habis di customer)
    $this->limitedMenu->update([
        'stock_updated_at' => now('Asia/Jakarta')->subDays(3)->setTime(10, 0),
    ]);

    expect($this->limitedMenu->fresh()->hasExpiredStock())->toBeTrue()
        ->and($this->limitedMenu->fresh()->resolveEffectiveStockQuantity())->toBe(0);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableB->qr_token,
        'customer_name' => 'Sari 2',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertSessionHasErrors('items.0.quantity');
});

test('overdue qris auto-expires on cashier sync, releases limited stock, and re-reserves on explicit cash switch or rejects when stock depletes', function () {
    Event::fake([OrderCreated::class, OrderStatusUpdated::class]);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->tableA->qr_token,
        'customer_name' => 'Rizky Abandon QRIS',
        'payment_method' => 'qris',
        'items' => [
            [
                'menu_id' => $this->limitedMenu->id,
                'quantity' => 3,
                'selected_option_ids' => [$this->optionHot->id],
            ],
        ],
    ])->assertRedirect();

    $order = Order::latest('id')->firstOrFail();
    $this->postJson(route('payments.initiate', ['order_number' => $order->order_number]), [
        'payment_method' => 'qris',
        'gateway' => 'xendit',
    ])->assertOk();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(2);

    // Pelanggan menunda 30 menit; ketika kasir sync antrean, QRIS otomatis kedaluwarsa & stok 3 porsi kembali ke 5
    $this->travel(30)->minutes();

    $this->actingAs($this->cashier)
        ->get(route('cashier.orders.index'))
        ->assertOk();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(5)
        ->and($order->fresh()->payment_status)->toBe('failed')
        ->and($order->items()->firstOrFail()->stock_state)->toBe('released')
        ->and(Payment::where('order_id', $order->id)->firstOrFail()->status)->toBe('expired');

    // Alihkan dari QRIS kedaluwarsa ke Tunai di Kasir -> stok ter-reservasi kembali ke 2 dan payment_status = unpaid
    $this->postJson(route('order.switch-payment-method', ['order_number' => $order->order_number]), [
        'payment_method' => 'cash',
    ])->assertOk();

    expect((int) $this->limitedMenu->fresh()->stock_quantity)->toBe(2)
        ->and($order->fresh()->payment_method)->toBe('cash')
        ->and($order->fresh()->payment_status)->toBe('unpaid')
        ->and($order->items()->firstOrFail()->stock_state)->toBe('reserved');

    $this->travelBack();
});
