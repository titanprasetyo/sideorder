<?php

use App\Events\OrderCreated;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\MenuOptionGroup;
use App\Models\MenuOptionItem;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->table = CafeTable::create([
        'table_number' => '01',
        'name' => 'Meja VIP 1',
        'is_active' => true,
    ]);

    $this->category = Category::create([
        'name' => 'Signature Coffee',
        'slug' => 'signature-coffee',
        'sort_order' => 1,
        'is_active' => true,
    ]);

    $this->menu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Kopi Susu Gula Aren',
        'slug' => 'kopi-susu-gula-aren',
        'base_price' => 20000,
        'is_active' => true,
    ]);

    $this->group = MenuOptionGroup::create([
        'menu_id' => $this->menu->id,
        'name' => 'Ukuran Gelas',
        'selection_type' => 'single',
        'is_required' => false,
        'sort_order' => 0,
    ]);

    $this->optionLarge = MenuOptionItem::create([
        'option_group_id' => $this->group->id,
        'name' => 'Large (+5k)',
        'additional_price' => 5000,
        'is_default' => false,
        'is_active' => true,
        'sort_order' => 1,
    ]);
});

test('customer can view order menu page with valid table qr token', function () {
    $response = $this->get(route('order.index', ['table' => $this->table->qr_token]));

    $response->assertOk();
});

test('customer cannot order from inactive table', function () {
    $this->table->update(['is_active' => false]);

    $response = $this->get(route('order.index', ['table' => $this->table->qr_token]));
    $response->assertOk();
    $response->assertInertia(fn ($page) => $page->component('customer/invalid-table'));

    $checkoutResponse = $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Budi',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 2,
            ],
        ],
    ]);

    $checkoutResponse->assertSessionHasErrors(['table']);
});

test('customer checkout calculates total price strictly from database and dispatches OrderCreated event', function () {
    Event::fake([OrderCreated::class]);

    $response = $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Andi Wijaya',
        'notes' => 'Tolong sedotan kertas',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 2,
                'selected_option_ids' => [$this->optionLarge->id],
                'customer_notes' => 'Less ice',
            ],
        ],
    ]);

    $order = Order::latest()->first();

    expect($order)->not->toBeNull()
        ->and($order->customer_name)->toBe('Andi Wijaya')
        ->and($order->order_status)->toBe('pending')
        ->and($order->payment_status)->toBe('unpaid')
        ->and((float) $order->subtotal)->toBe(50000.0) // (20000 + 5000) * 2 = 50000
        ->and((float) $order->total_amount)->toBe(50000.0);

    expect($order->items)->toHaveCount(1);
    $item = $order->items->first();
    expect($item->menu_name)->toBe('Kopi Susu Gula Aren')
        ->and($item->status)->toBe('active')
        ->and((float) $item->unit_price)->toBe(25000.0)
        ->and((float) $item->total_price)->toBe(50000.0);

    Event::assertDispatched(OrderCreated::class);

    $response->assertRedirect(route('order.status', ['order_number' => $order->order_number]));
});

test('customer can order the same product with different sizes (Juice Jeruk Large and XL) plus non-variant product in one order', function () {
    Event::fake([OrderCreated::class]);

    $juiceMenu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Juice Jeruk',
        'slug' => 'juice-jeruk',
        'base_price' => 22000,
        'is_active' => true,
    ]);

    $sizeGroup = MenuOptionGroup::create([
        'menu_id' => $juiceMenu->id,
        'name' => 'Ukuran',
        'selection_type' => 'single',
        'is_required' => true,
        'min_selection' => 1,
        'max_selection' => 1,
        'sort_order' => 0,
    ]);

    $sizeLarge = MenuOptionItem::create([
        'option_group_id' => $sizeGroup->id,
        'name' => 'Large',
        'additional_price' => 3000, // 22000 + 3000 = 25000
        'is_default' => false,
        'is_active' => true,
        'sort_order' => 0,
    ]);

    $sizeXL = MenuOptionItem::create([
        'option_group_id' => $sizeGroup->id,
        'name' => 'XL',
        'additional_price' => 8000, // 22000 + 8000 = 30000
        'is_default' => false,
        'is_active' => true,
        'sort_order' => 1,
    ]);

    $fruitMenu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Fruit Platter',
        'slug' => 'fruit-platter',
        'base_price' => 45000,
        'is_active' => true,
    ]);

    // Skenario 1: 1x Juice Jeruk Large (Rp 25.000) + 1x Juice Jeruk XL (Rp 30.000) + 1x Fruit Platter tanpa varian (Rp 45.000) = Rp 100.000
    $response = $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Titan Prasetyo',
        'items' => [
            [
                'menu_id' => $juiceMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$sizeLarge->id],
                'customer_notes' => 'Normal ice',
            ],
            [
                'menu_id' => $juiceMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$sizeXL->id],
                'customer_notes' => 'Less sugar',
            ],
            [
                'menu_id' => $fruitMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [],
            ],
        ],
    ]);

    $order = Order::with('items.options')->latest('id')->first();
    expect($order)->not->toBeNull();

    $response->assertRedirect(route('order.status', ['order_number' => $order->order_number]));

    // Pastikan tersimpan sebagai 3 baris order_items berbeda (Large dan XL tidak tergabung)
    expect($order->items)->toHaveCount(3)
        ->and((float) $order->subtotal)->toBe(100000.0)
        ->and((float) $order->total_amount)->toBe(100000.0);

    $largeItem = $order->items[0];
    expect($largeItem->menu_name)->toBe('Juice Jeruk')
        ->and($largeItem->quantity)->toBe(1)
        ->and((float) $largeItem->base_price)->toBe(22000.0)
        ->and((float) $largeItem->subtotal_options)->toBe(3000.0)
        ->and((float) $largeItem->unit_price)->toBe(25000.0)
        ->and((float) $largeItem->total_price)->toBe(25000.0)
        ->and($largeItem->customer_notes)->toBe('Normal ice')
        ->and($largeItem->options)->toHaveCount(1)
        ->and($largeItem->options[0]->group_name)->toBe('Ukuran')
        ->and($largeItem->options[0]->option_name)->toBe('Large')
        ->and((float) $largeItem->options[0]->additional_price)->toBe(3000.0);

    $xlItem = $order->items[1];
    expect($xlItem->menu_name)->toBe('Juice Jeruk')
        ->and($xlItem->quantity)->toBe(1)
        ->and((float) $xlItem->base_price)->toBe(22000.0)
        ->and((float) $xlItem->subtotal_options)->toBe(8000.0)
        ->and((float) $xlItem->unit_price)->toBe(30000.0)
        ->and((float) $xlItem->total_price)->toBe(30000.0)
        ->and($xlItem->customer_notes)->toBe('Less sugar')
        ->and($xlItem->options)->toHaveCount(1)
        ->and($xlItem->options[0]->group_name)->toBe('Ukuran')
        ->and($xlItem->options[0]->option_name)->toBe('XL')
        ->and((float) $xlItem->options[0]->additional_price)->toBe(8000.0);

    $fruitItem = $order->items[2];
    expect($fruitItem->menu_name)->toBe('Fruit Platter')
        ->and($fruitItem->quantity)->toBe(1)
        ->and((float) $fruitItem->unit_price)->toBe(45000.0)
        ->and((float) $fruitItem->total_price)->toBe(45000.0)
        ->and($fruitItem->options)->toHaveCount(0);
});

test('manipulative price payload from frontend is completely ignored and backend uses database prices', function () {
    $juiceMenu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Juice Jeruk',
        'slug' => 'juice-jeruk-2',
        'base_price' => 22000,
        'is_active' => true,
    ]);

    $sizeGroup = MenuOptionGroup::create([
        'menu_id' => $juiceMenu->id,
        'name' => 'Ukuran',
        'selection_type' => 'single',
        'is_required' => true,
        'min_selection' => 1,
        'max_selection' => 1,
    ]);

    $sizeXL = MenuOptionItem::create([
        'option_group_id' => $sizeGroup->id,
        'name' => 'XL',
        'additional_price' => 8000,
        'is_active' => true,
    ]);

    // Client mencoba memanipulasi harga menjadi Rp 100
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Hacker Test',
        'subtotal' => 100,
        'total_amount' => 100,
        'items' => [
            [
                'menu_id' => $juiceMenu->id,
                'quantity' => 2,
                'base_price' => 50,
                'unit_price' => 50,
                'total_price' => 100,
                'selected_option_ids' => [$sizeXL->id],
            ],
        ],
    ])->assertRedirect();

    $order = Order::with('items.options')->latest('id')->first();
    // Harga aktual: (22.000 + 8.000) * 2 = 60.000
    expect((float) $order->subtotal)->toBe(60000.0)
        ->and((float) $order->total_amount)->toBe(60000.0)
        ->and((float) $order->items[0]->base_price)->toBe(22000.0)
        ->and((float) $order->items[0]->subtotal_options)->toBe(8000.0)
        ->and((float) $order->items[0]->unit_price)->toBe(30000.0)
        ->and((float) $order->items[0]->total_price)->toBe(60000.0);
});

test('backend validates required size groups, single-selection constraint, cross-menu options, and inactive options', function () {
    $juiceMenu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Juice Jeruk',
        'slug' => 'juice-jeruk-val',
        'base_price' => 22000,
        'is_active' => true,
    ]);

    $sizeGroup = MenuOptionGroup::create([
        'menu_id' => $juiceMenu->id,
        'name' => 'Ukuran',
        'selection_type' => 'single',
        'is_required' => true,
        'min_selection' => 1,
        'max_selection' => 1,
    ]);

    $sizeLarge = MenuOptionItem::create([
        'option_group_id' => $sizeGroup->id,
        'name' => 'Large',
        'additional_price' => 3000,
        'is_active' => true,
    ]);

    $sizeXL = MenuOptionItem::create([
        'option_group_id' => $sizeGroup->id,
        'name' => 'XL',
        'additional_price' => 8000,
        'is_active' => true,
    ]);

    $sizeXXLInactive = MenuOptionItem::create([
        'option_group_id' => $sizeGroup->id,
        'name' => 'XXL',
        'additional_price' => 12000,
        'is_active' => false,
    ]);

    // 1. Gagal jika grup Ukuran wajib (is_required = true) tetapi tidak ada ukuran yang dipilih
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Budi',
        'items' => [
            [
                'menu_id' => $juiceMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [],
            ],
        ],
    ])->assertSessionHasErrors(['items.0.selected_option_ids']);

    // 2. Gagal jika mengirim 2 ukuran sekaligus untuk grup single-select
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Budi',
        'items' => [
            [
                'menu_id' => $juiceMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$sizeLarge->id, $sizeXL->id],
            ],
        ],
    ])->assertSessionHasErrors(['items.0.selected_option_ids']);

    // 3. Gagal jika memilih opsi yang nonaktif (is_active = false)
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Budi',
        'items' => [
            [
                'menu_id' => $juiceMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$sizeXXLInactive->id],
            ],
        ],
    ])->assertSessionHasErrors(['items.0.selected_option_ids']);

    // 4. Gagal jika mengirim ID opsi milik menu lain ($this->optionLarge milik Kopi Susu Gula Aren)
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Budi',
        'items' => [
            [
                'menu_id' => $juiceMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionLarge->id],
            ],
        ],
    ])->assertSessionHasErrors(['items.0.selected_option_ids']);

    expect(Order::count())->toBe(0);
});

test('checkout idempotency key prevents duplicate orders from double click or retry', function () {
    $payload = [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Rina Double Click',
        'idempotency_key' => 'idem-key-12345',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionLarge->id],
            ],
        ],
    ];

    $firstResponse = $this->post(route('order.checkout'), $payload);
    $secondResponse = $this->post(route('order.checkout'), $payload);

    expect(Order::count())->toBe(1);
    $order = Order::first();

    $firstResponse->assertRedirect(route('order.status', ['order_number' => $order->order_number]));
    $secondResponse->assertRedirect(route('order.status', ['order_number' => $order->order_number]));
});

test('payment, cashier KDS, customer status, admin orders, dashboard, and financial reports read items with sizes and historical non-variant items properly', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $cashier = User::factory()->create(['role' => 'cashier']);

    $juiceMenu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Juice Jeruk',
        'slug' => 'juice-jeruk-e2e',
        'base_price' => 22000,
        'is_active' => true,
    ]);

    $sizeGroup = MenuOptionGroup::create([
        'menu_id' => $juiceMenu->id,
        'name' => 'Ukuran',
        'selection_type' => 'single',
        'is_required' => true,
        'min_selection' => 1,
        'max_selection' => 1,
    ]);

    $sizeLarge = MenuOptionItem::create([
        'option_group_id' => $sizeGroup->id,
        'name' => 'Large',
        'additional_price' => 3000,
        'is_active' => true,
    ]);

    $sizeXL = MenuOptionItem::create([
        'option_group_id' => $sizeGroup->id,
        'name' => 'XL',
        'additional_price' => 8000,
        'is_active' => true,
    ]);

    // 1. Buat pesanan baru melalui checkout customer dengan 2 ukuran berbeda (Large & XL) + 1 item tanpa ukuran
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Pelanggan E2E',
        'items' => [
            [
                'menu_id' => $juiceMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$sizeLarge->id],
            ],
            [
                'menu_id' => $juiceMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [$sizeXL->id],
            ],
            [
                'menu_id' => $this->menu->id, // Kopi Susu Gula Aren tanpa memilih ukuran opsional (kompatibilitas non-varian)
                'quantity' => 1,
                'selected_option_ids' => [],
            ],
        ],
    ])->assertRedirect();

    $order = Order::latest('id')->first();
    expect((float) $order->total_amount)->toBe(75000.0); // 25.000 + 30.000 + 20.000

    // 2. Halaman status customer membaca seluruh item & opsi ukuran
    $this->get(route('order.status', ['order_number' => $order->order_number]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('customer/status')
            ->has('order.items', 3)
            ->where('order.items.0.options.0.option_name', 'Large')
            ->where('order.items.1.options.0.option_name', 'XL')
            ->has('order.items.2.options', 0)
        );

    // 3. Kasir membaca pesanan beserta ukuran di sinkronisasi KDS dan mengonfirmasi pembayaran
    $cashierSync = $this->actingAs($cashier)
        ->getJson(route('cashier.orders.sync', ['date' => 'all']))
        ->assertOk()
        ->json();

    $syncedOrder = collect($cashierSync['orders'])->firstWhere('id', $order->id);
    expect($syncedOrder)->not->toBeNull()
        ->and($syncedOrder['items'])->toHaveCount(3)
        ->and($syncedOrder['items'][0]['options'][0]['option_name'])->toBe('Large')
        ->and($syncedOrder['items'][1]['options'][0]['option_name'])->toBe('XL');

    $this->actingAs($cashier)
        ->post(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 80000,
        ])
        ->assertSessionHas('success');

    // 4. Laporan Keuangan membaca ringkasan item lengkap dengan ukuran "(Large)" dan "(XL)"
    $reportSync = $this->actingAs($admin)
        ->getJson(route('admin.financial-reports.sync', ['preset' => 'today']))
        ->assertOk()
        ->json();

    $tx = collect($reportSync['transactions']['data'])->firstWhere('order_number', $order->order_number);
    expect($tx)->not->toBeNull()
        ->and($tx['items_summary'])->toContain('1x Juice Jeruk (Large)')
        ->and($tx['items_summary'])->toContain('1x Juice Jeruk (XL)')
        ->and($tx['items_summary'])->toContain('1x Kopi Susu Gula Aren')
        ->and((float) $tx['net_revenue'])->toBe(75000.0);

    // 5. Dashboard membaca ringkasan item lengkap dengan ukuran
    $this->actingAs($admin)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('dashboard')
            ->where('recent_orders.0.items_summary', '1x Juice Jeruk (Large), 1x Juice Jeruk (XL), 1x Kopi Susu Gula Aren')
        );
});

test('adding more menu items from the same table while order is pending unpaid merges into the same active order and recalculates total', function () {
    $snackMenu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Butter Croissant',
        'slug' => 'butter-croissant-add',
        'base_price' => 18000,
        'is_active' => true,
    ]);

    // 1. Checkout pertama: 1x Kopi Susu Gula Aren Large (Rp 25.000)
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Rizky Meja 1',
        'notes' => 'Catatan awal',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionLarge->id],
            ],
        ],
    ])->assertRedirect();

    expect(Order::count())->toBe(1);
    $activeOrder = Order::first();
    expect((float) $activeOrder->subtotal)->toBe(25000.0)
        ->and((float) $activeOrder->total_amount)->toBe(25000.0)
        ->and($activeOrder->order_status)->toBe('pending')
        ->and($activeOrder->payment_status)->toBe('unpaid');

    // 2. Customer menekan "Tambah Menu Lain dari Meja Ini" -> halaman /order memuat activeOrder
    $this->get(route('order.index', [
        'table' => $this->table->qr_token,
        'order' => $activeOrder->order_number,
    ]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('customer/order')
            ->where('activeOrder.order_number', $activeOrder->order_number)
            ->where('activeOrder.customer_name', 'Rizky Meja 1')
        );

    // 3. Checkout tambahan: 2x Butter Croissant (2 x Rp 18.000 = Rp 36.000)
    $addResponse = $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'order_number' => $activeOrder->order_number,
        'customer_name' => 'Rizky Meja 1',
        'notes' => 'Tambah tisu',
        'items' => [
            [
                'menu_id' => $snackMenu->id,
                'quantity' => 2,
                'selected_option_ids' => [],
                'customer_notes' => 'Hangatkan',
            ],
        ],
    ]);

    // Tidak membuat order baru, tetap 1 order yang sama
    expect(Order::count())->toBe(1);

    $activeOrder->refresh();
    $addResponse->assertRedirect(route('order.status', ['order_number' => $activeOrder->order_number]));

    // Total dihitung ulang: 25.000 + 36.000 = 61.000, status tetap pending & unpaid
    expect($activeOrder->items)->toHaveCount(2)
        ->and((float) $activeOrder->subtotal)->toBe(61000.0)
        ->and((float) $activeOrder->total_amount)->toBe(61000.0)
        ->and($activeOrder->order_status)->toBe('pending')
        ->and($activeOrder->payment_status)->toBe('unpaid')
        ->and((float) $activeOrder->unpaid_balance)->toBe(61000.0)
        ->and($activeOrder->notes)->toContain('Catatan awal')
        ->and($activeOrder->notes)->toContain('Tambah tisu');
});

test('adding more menu items while order is processing and already paid preserves previous payment safely and tracks additional unpaid balance', function () {
    $cashier = User::factory()->create(['role' => 'cashier']);

    $pastryMenu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Cinnamon Roll',
        'slug' => 'cinnamon-roll-add',
        'base_price' => 24000,
        'is_active' => true,
    ]);

    // 1. Customer membuat pesanan awal: 2x Kopi Susu Gula Aren Large = Rp 50.000
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Nadia Paid',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 2,
                'selected_option_ids' => [$this->optionLarge->id],
            ],
        ],
    ])->assertRedirect();

    $order = Order::first();

    // 2. Kasir mengonfirmasi pembayaran awal Rp 50.000 (uang tunai Rp 100.000, kembalian Rp 50.000) -> status menjadi processing & paid
    $this->actingAs($cashier)
        ->post(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 100000,
        ])
        ->assertSessionHas('success');

    $order->refresh();
    $initialPaidAt = $order->paid_at;
    $initialReference = $order->payment_reference;

    expect($order->order_status)->toBe('processing')
        ->and($order->payment_status)->toBe('paid')
        ->and((float) $order->settled_amount)->toBe(50000.0)
        ->and((float) $order->unpaid_balance)->toBe(0.0);

    // 3. Saat pesanan sedang diracik (processing), customer menekan Tambah Menu Lain dari Meja Ini dan menambah 1x Cinnamon Roll (Rp 24.000)
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'order_number' => $order->order_number,
        'customer_name' => 'Nadia Paid',
        'items' => [
            [
                'menu_id' => $pastryMenu->id,
                'quantity' => 1,
                'selected_option_ids' => [],
            ],
        ],
    ])->assertRedirect(route('order.status', ['order_number' => $order->order_number]));

    // Pastikan tetap 1 pesanan, status tetap processing, data pembayaran awal tetap utuh, dan selisih Rp 24.000 tercatat sebagai unpaid_balance
    expect(Order::count())->toBe(1);

    $order->refresh();
    expect($order->items)->toHaveCount(2)
        ->and($order->order_status)->toBe('processing')
        ->and((float) $order->subtotal)->toBe(74000.0)
        ->and((float) $order->total_amount)->toBe(74000.0)
        ->and($order->paid_at?->toIso8601String())->toBe($initialPaidAt?->toIso8601String())
        ->and($order->payment_reference)->toBe($initialReference)
        ->and($order->confirmed_by)->toBe($cashier->id)
        ->and((float) $order->settled_amount)->toBe(50000.0)
        ->and((float) $order->unpaid_balance)->toBe(24000.0)
        ->and($order->payment_status)->toBe('unpaid');

    // 4. Kasir mengonfirmasi pembayaran tambahan sebesar Rp 24.000 (customer membayar uang pas Rp 24.000 untuk menu tambahan)
    $this->actingAs($cashier)
        ->post(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 24000,
        ])
        ->assertSessionHas('success');

    $order->refresh();
    expect($order->payment_status)->toBe('paid')
        ->and($order->order_status)->toBe('processing')
        ->and((float) $order->total_amount)->toBe(74000.0)
        ->and((float) $order->settled_amount)->toBe(74000.0)
        ->and((float) $order->unpaid_balance)->toBe(0.0);
});

test('completed, cancelled, or ready orders cannot have new menu items appended to them', function () {
    $completedOrder = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Doni Selesai',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
    ]);

    $completedOrder->items()->create([
        'menu_id' => $this->menu->id,
        'menu_name' => $this->menu->name,
        'base_price' => 20000,
        'quantity' => 1,
        'subtotal_options' => 5000,
        'unit_price' => 25000,
        'total_price' => 25000,
        'status' => 'active',
    ]);

    // 1. Mencoba memaksa tambah menu ke pesanan yang sudah completed harus ditolak
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'order_number' => $completedOrder->order_number,
        'customer_name' => 'Doni Selesai',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionLarge->id],
            ],
        ],
    ])->assertSessionHasErrors(['order_number']);

    $completedOrder->refresh();
    expect($completedOrder->items)->toHaveCount(1)
        ->and((float) $completedOrder->total_amount)->toBe(25000.0);

    // 2. Jika customer membuat pesanan baru setelah pesanan lama completed, sistem membuat order baru tanpa mengubah order completed
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Pelanggan Berikutnya',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionLarge->id],
            ],
        ],
    ])->assertRedirect();

    expect(Order::count())->toBe(2);
    $newOrder = Order::latest('id')->first();
    expect($newOrder->id)->not->toBe($completedOrder->id)
        ->and($newOrder->order_status)->toBe('pending')
        ->and((float) $completedOrder->fresh()->total_amount)->toBe(25000.0);
});

test('three friends scanning QR on separate phones or one person ordering again at the same table creates separate orders with the same table id', function () {
    // Teman 1 (HP 1) pesan di Meja 01
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Teman 1 (Budi)',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 1,
                'selected_option_ids' => [$this->optionLarge->id],
            ],
        ],
    ])->assertRedirect();

    // Teman 2 (HP 2) scan QR Meja 01 & pesan di saat pesanan Teman 1 masih pending
    $this->get(route('order.index', ['table' => $this->table->qr_token]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('customer/order')
            ->where('activeOrder', null)
        );

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Teman 2 (Andi)',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 2,
                'selected_option_ids' => [],
            ],
        ],
    ])->assertRedirect();

    // Teman 3 (HP 3) atau orang yang sama pesan lagi di Meja 01
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Teman 3 (Siti)',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 1,
                'selected_option_ids' => [],
            ],
        ],
    ])->assertRedirect();

    // Harus terbentuk 3 nota (Order) berbeda, masing-masing sendiri-sendiri, namun cafe_table_id tetap sama (Meja 01)
    $orders = Order::orderBy('id', 'asc')->get();
    expect($orders)->toHaveCount(3);

    expect($orders[0]->customer_name)->toBe('Teman 1 (Budi)')
        ->and($orders[0]->cafe_table_id)->toBe($this->table->id)
        ->and((float) $orders[0]->total_amount)->toBe(25000.0);

    expect($orders[1]->customer_name)->toBe('Teman 2 (Andi)')
        ->and($orders[1]->cafe_table_id)->toBe($this->table->id)
        ->and($orders[1]->order_number)->not->toBe($orders[0]->order_number)
        ->and((float) $orders[1]->total_amount)->toBe(40000.0);

    expect($orders[2]->customer_name)->toBe('Teman 3 (Siti)')
        ->and($orders[2]->cafe_table_id)->toBe($this->table->id)
        ->and($orders[2]->order_number)->not->toBe($orders[0]->order_number)
        ->and($orders[2]->order_number)->not->toBe($orders[1]->order_number)
        ->and((float) $orders[2]->total_amount)->toBe(20000.0);
});
