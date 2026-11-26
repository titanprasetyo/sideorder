<?php

use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow(Carbon::create(2026, 10, 22, 14, 0, 0, 'Asia/Jakarta')); // Kamis, 22 Okt 2026 14:00 WIB

    $this->admin = User::factory()->create([
        'name' => 'Admin Utama',
        'email' => 'admin.finance@sideline.com',
        'role' => 'admin',
    ]);

    $this->cashier = User::factory()->create([
        'name' => 'Kasir Operasional',
        'email' => 'kasir.finance@sideline.com',
        'role' => 'cashier',
    ]);

    $this->table = CafeTable::create([
        'table_number' => '07',
        'name' => 'Indoor Bar',
        'is_active' => true,
    ]);

    $this->category = Category::create([
        'name' => 'Espresso Based',
        'slug' => 'espresso-based',
        'is_active' => true,
    ]);

    $this->menu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Cappuccino Artisan',
        'slug' => 'cappuccino-artisan',
        'base_price' => 30000,
        'is_active' => true,
    ]);
});

afterEach(function () {
    Carbon::setTestNow();
});

test('role access control restricts financial reports and exports to admin only', function () {
    // Guest diarahkan ke login
    $this->get(route('admin.financial-reports.index'))->assertRedirect(route('login'));
    $this->get(route('admin.financial-reports.export.csv'))->assertRedirect(route('login'));
    $this->get(route('admin.financial-reports.export.pdf'))->assertRedirect(route('login'));

    // Kasir ditolak (403 Forbidden)
    $this->actingAs($this->cashier)
        ->get(route('admin.financial-reports.index'))
        ->assertForbidden();

    $this->actingAs($this->cashier)
        ->get(route('admin.financial-reports.sync'))
        ->assertForbidden();

    $this->actingAs($this->cashier)
        ->get(route('admin.financial-reports.export.csv'))
        ->assertForbidden();

    $this->actingAs($this->cashier)
        ->get(route('admin.financial-reports.export.pdf'))
        ->assertForbidden();

    // Admin diizinkan mengakses halaman khusus Pengelolaan Keuangan Detail
    $this->actingAs($this->admin)
        ->get(route('admin.financial-reports.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/financial-reports/index')
            ->has('summary')
            ->has('expenses')
            ->has('recaps')
            ->has('transactions'));
});

test('admin cannot confirm payment via admin panel endpoint while cashier KDS endpoint confirms payment', function () {
    $order = Order::create([
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Pelanggan Uji',
        'subtotal' => 30000,
        'total_amount' => 30000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
    ]);

    // Admin mencoba memicu konfirmasi pembayaran lewat panel admin -> ditolak 403
    $this->actingAs($this->admin)
        ->post(route('admin.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 50000,
        ])
        ->assertForbidden();

    $order->refresh();
    expect($order->payment_status)->toBe('unpaid');

    // Kasir melakukan konfirmasi pembayaran -> berhasil
    $this->actingAs($this->cashier)
        ->post(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 50000,
        ])
        ->assertSessionHas('success');

    $order->refresh();
    expect($order->payment_status)->toBe('paid')
        ->and($order->order_status)->toBe('processing')
        ->and($order->paid_at)->not->toBeNull()
        ->and($order->confirmed_by)->toBe($this->cashier->id)
        ->and((float) $order->cash_received)->toBe(50000.0)
        ->and((float) $order->change_amount)->toBe(20000.0);
});

test('financial report separates realized revenue from unpaid, failed, cancelled, and refunded transactions', function () {
    $now = Carbon::now('Asia/Jakarta');

    // 1. Transaksi Berhasil 1 (Tunai): Rp 60.000
    Order::create([
        'order_number' => 'SO-20261022-PAID1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Budi Paid',
        'subtotal' => 60000,
        'total_amount' => 60000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'cash',
        'paid_at' => $now->copy()->subHours(2),
        'created_at' => $now->copy()->subHours(2),
    ]);

    // 2. Transaksi Berhasil 2 dengan Refund Parsial Rp 10.000 dari Rp 50.000 -> Net Rp 40.000
    Order::create([
        'order_number' => 'SO-20261022-PAID2',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Sari Partial Refund',
        'subtotal' => 50000,
        'total_amount' => 50000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'qris',
        'paid_at' => $now->copy()->subHour(),
        'refunded_amount' => 10000,
        'refunded_at' => $now->copy()->subMinutes(30),
        'refund_reason' => '1 item habis setelah bayar',
        'created_at' => $now->copy()->subHour(),
    ]);

    // 3. Pesanan Menunggu Pembayaran (Unpaid): Rp 45.000 -> TIDAK boleh masuk pendapatan
    Order::create([
        'order_number' => 'SO-20261022-UNPD1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Deni Unpaid',
        'subtotal' => 45000,
        'total_amount' => 45000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
        'payment_method' => 'cash',
        'created_at' => $now->copy()->subMinutes(40),
    ]);

    // 4. Pesanan Dibatalkan (Cancelled): Rp 35.000 -> TIDAK boleh masuk pendapatan
    Order::create([
        'order_number' => 'SO-20261022-CNCL1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Eka Cancelled',
        'subtotal' => 35000,
        'total_amount' => 35000,
        'order_status' => 'cancelled',
        'payment_status' => 'unpaid',
        'payment_method' => 'cash',
        'created_at' => $now->copy()->subMinutes(25),
    ]);

    // 5. Pembayaran Gagal (Failed): Rp 25.000 -> TIDAK boleh masuk pendapatan
    Order::create([
        'order_number' => 'SO-20261022-FAIL1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Fajar Failed',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'pending',
        'payment_status' => 'failed',
        'payment_method' => 'qris',
        'created_at' => $now->copy()->subMinutes(15),
    ]);

    // 6. Transaksi Full Refund: Rp 30.000 -> Net Rp 0
    Order::create([
        'order_number' => 'SO-20261022-RFND1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Gita Refunded',
        'subtotal' => 30000,
        'total_amount' => 30000,
        'order_status' => 'cancelled',
        'payment_status' => 'refunded',
        'payment_method' => 'qris',
        'paid_at' => $now->copy()->subMinutes(20),
        'refunded_amount' => 30000,
        'refunded_at' => $now->copy()->subMinutes(10),
        'created_at' => $now->copy()->subMinutes(20),
    ]);

    $response = $this->actingAs($this->admin)
        ->getJson(route('admin.financial-reports.sync', ['preset' => 'today']));

    $response->assertOk();
    $data = $response->json();

    // Realized Net Revenue = 60.000 + (50.000 - 10.000) = 100.000
    expect((float) $data['summary']['today_revenue'])->toBe(100000.0)
        ->and((float) $data['summary']['period']['net_revenue'])->toBe(100000.0)
        ->and((float) $data['summary']['period']['gross_revenue'])->toBe(110000.0)
        ->and($data['summary']['period']['paid_transactions_count'])->toBe(2)
        ->and((float) $data['summary']['period']['average_order_value'])->toBe(50000.0)
        // Unpaid: 1 pesanan senilai 45.000
        ->and($data['summary']['period']['pending_payments_count'])->toBe(1)
        ->and((float) $data['summary']['period']['pending_payments_amount'])->toBe(45000.0)
        // Failed / Cancelled: CNCL1 (35k) + FAIL1 (25k) + RFND1 cancelled (30k) = 3 pesanan (90.000)
        ->and($data['summary']['period']['failed_or_cancelled_count'])->toBe(3)
        ->and((float) $data['summary']['period']['failed_or_cancelled_amount'])->toBe(90000.0)
        // Refund: PAID2 (10k) + RFND1 (30k) = 2 pesanan (40.000)
        ->and($data['summary']['period']['refunded_count'])->toBe(2)
        ->and((float) $data['summary']['period']['refund_amount'])->toBe(40000.0);
});

test('daily, weekly, and monthly recaps and date boundaries do not double count or lose cross-period transactions', function () {
    // Waktu uji saat ini: Kamis, 22 Okt 2026 (Minggu berjalan: Senin 19 Okt 2026 00:00 WIB - Minggu 25 Okt 2026 23:59:59 WIB)

    // 1. Transaksi tepat akhir Minggu Lalu: Minggu, 18 Okt 2026 23:59:59 WIB (Rp 30.000)
    Order::create([
        'order_number' => 'SO-BOUND-SUN',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Minggu Malam',
        'subtotal' => 30000,
        'total_amount' => 30000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'cash',
        'created_at' => Carbon::create(2026, 10, 18, 23, 59, 59, 'Asia/Jakarta'),
        'paid_at' => Carbon::create(2026, 10, 18, 23, 59, 59, 'Asia/Jakarta'),
    ]);

    // 2. Transaksi tepat awal Minggu Ini: Senin, 19 Okt 2026 00:00:00 WIB (Rp 40.000)
    Order::create([
        'order_number' => 'SO-BOUND-MON',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Senin Dini Hari',
        'subtotal' => 40000,
        'total_amount' => 40000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'qris',
        'created_at' => Carbon::create(2026, 10, 19, 0, 0, 0, 'Asia/Jakarta'),
        'paid_at' => Carbon::create(2026, 10, 19, 0, 0, 0, 'Asia/Jakarta'),
    ]);

    // 3. Transaksi Lintas Periode: Order dibuat Kemarin (21 Okt 23:50 WIB), tetapi baru dibayar Hari Ini (22 Okt 00:05 WIB) (Rp 55.000)
    Order::create([
        'order_number' => 'SO-CROSS-DAY',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Lintas Tengah Malam',
        'subtotal' => 55000,
        'total_amount' => 55000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'cash',
        'created_at' => Carbon::create(2026, 10, 21, 23, 50, 0, 'Asia/Jakarta'),
        'paid_at' => Carbon::create(2026, 10, 22, 0, 5, 0, 'Asia/Jakarta'),
    ]);

    // 4. Transaksi Bulan Lalu: 30 Sep 2026 23:59:59 WIB (Rp 70.000)
    Order::create([
        'order_number' => 'SO-PREV-MONTH',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Bulan Lalu',
        'subtotal' => 70000,
        'total_amount' => 70000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'transfer',
        'created_at' => Carbon::create(2026, 9, 30, 23, 59, 59, 'Asia/Jakarta'),
        'paid_at' => Carbon::create(2026, 9, 30, 23, 59, 59, 'Asia/Jakarta'),
    ]);

    $response = $this->actingAs($this->admin)
        ->getJson(route('admin.financial-reports.sync', ['preset' => 'this_month']));

    $response->assertOk();
    $data = $response->json();

    // Hari Ini (22 Okt): hanya SO-CROSS-DAY (Rp 55.000) karena paid_at pada 22 Okt 00:05 WIB
    expect((float) $data['summary']['today_revenue'])->toBe(55000.0)
        // Kemarin (21 Okt): Rp 0 karena SO-CROSS-DAY baru dibayar pada 22 Okt
        ->and((float) $data['summary']['yesterday_revenue'])->toBe(0.0)
        // Minggu Ini (Senin 19 Okt - Minggu 25 Okt): SO-BOUND-MON (40.000) + SO-CROSS-DAY (55.000) = 95.000
        ->and((float) $data['summary']['this_week_revenue'])->toBe(95000.0)
        // Minggu Lalu (Senin 12 Okt - Minggu 18 Okt): SO-BOUND-SUN (30.000)
        ->and((float) $data['summary']['last_week_revenue'])->toBe(30000.0)
        // Bulan Ini (Oktober 2026): 30.000 + 40.000 + 55.000 = 125.000 (tidak tercampur September 70.000)
        ->and((float) $data['summary']['this_month_revenue'])->toBe(125000.0)
        ->and((float) $data['summary']['last_month_revenue'])->toBe(70000.0);

    // Pastikan total rekap harian, mingguan, dan bulanan untuk periode Oktober semuanya konsisten Rp 125.000
    expect((float) $data['recaps']['daily']['totals']['net_revenue'])->toBe(125000.0)
        ->and((float) $data['recaps']['weekly']['totals']['net_revenue'])->toBe(125000.0)
        ->and((float) $data['recaps']['monthly']['totals']['net_revenue'])->toBe(125000.0);

    // Pastikan grafik memiliki titik data untuk setiap hari di bulan Oktober (31 hari) dan hari tanpa transaksi bernilai 0
    expect($data['chart']['data'])->toHaveCount(31);
    $oct20Point = collect($data['chart']['data'])->firstWhere('key', '2026-10-20');
    expect($oct20Point)->not->toBeNull()
        ->and((float) $oct20Point['net_revenue'])->toBe(0.0);
});

test('cashier payment confirmation updates revenue idempotently and prevents duplicate counting', function () {
    $order = Order::create([
        'order_number' => 'SO-20261022-POS01',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Maya Tunai',
        'subtotal' => 90000,
        'total_amount' => 90000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
        'payment_method' => 'cash',
    ]);

    // 1. Konfirmasi pertama oleh kasir berhasil melunasi pesanan
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 100000,
        ])
        ->assertOk()
        ->assertJsonPath('success', true);

    // 2. Konfirmasi duplikat (retry) harus idempotent dan tidak menggandakan history maupun pendapatan
    $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 100000,
        ])
        ->assertOk();

    expect(OrderStatusHistory::where('order_id', $order->id)->count())->toBe(1);

    // Cek laporan keuangan: hanya tercatat 1 kali (Rp 90.000)
    $report = $this->actingAs($this->admin)
        ->getJson(route('admin.financial-reports.sync', ['preset' => 'today']))
        ->assertOk()
        ->json();

    expect((float) $report['summary']['today_revenue'])->toBe(90000.0)
        ->and($report['summary']['today_paid_count'])->toBe(1);
});

test('transactions table supports filtering, search, sorting, pagination, and full order item detail', function () {
    $orderCash = Order::create([
        'order_number' => 'SO-20261022-AAA1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Andi Tunai',
        'subtotal' => 30000,
        'total_amount' => 30000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'cash',
        'paid_at' => Carbon::now('Asia/Jakarta')->subHour(),
    ]);

    $item = $orderCash->items()->create([
        'menu_id' => $this->menu->id,
        'menu_name' => 'Cappuccino Artisan',
        'base_price' => 30000,
        'quantity' => 1,
        'subtotal_options' => 0,
        'unit_price' => 30000,
        'total_price' => 30000,
        'customer_notes' => 'Extra hot',
        'status' => 'active',
    ]);

    $item->options()->create([
        'group_name' => 'Shot',
        'option_name' => 'Normal Shot',
        'additional_price' => 0,
    ]);

    Order::create([
        'order_number' => 'SO-20261022-BBB2',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Bella QRIS',
        'subtotal' => 75000,
        'total_amount' => 75000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'qris',
        'paid_at' => Carbon::now('Asia/Jakarta')->subMinutes(20),
    ]);

    // Filter metode pembayaran = cash & search = AAA1
    $res = $this->actingAs($this->admin)
        ->getJson(route('admin.financial-reports.sync', [
            'preset' => 'today',
            'payment_method' => 'cash',
            'search' => 'AAA1',
        ]))
        ->assertOk()
        ->json();

    expect($res['transactions']['total'])->toBe(1)
        ->and((float) $res['filtered_table_totals']['net_revenue'])->toBe(30000.0);

    $firstTx = $res['transactions']['data'][0];
    expect($firstTx['order_number'])->toBe('SO-20261022-AAA1')
        ->and($firstTx['discount_supported'])->toBeFalse()
        ->and($firstTx['additional_fees_supported'])->toBeFalse()
        ->and($firstTx['items'])->toHaveCount(1)
        ->and($firstTx['items'][0]['menu_name'])->toBe('Cappuccino Artisan')
        ->and($firstTx['items'][0]['customer_notes'])->toBe('Extra hot')
        ->and($firstTx['items'][0]['options'])->toHaveCount(1);
});

test('csv and pdf exports return valid files with totals matching the report', function () {
    Order::create([
        'order_number' => 'SO-20261022-EXP1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Raka Export',
        'subtotal' => 85000,
        'total_amount' => 85000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'qris',
        'paid_at' => Carbon::now('Asia/Jakarta')->subMinutes(15),
    ]);

    // 1. Uji Ekspor CSV
    $csvResponse = $this->actingAs($this->admin)
        ->get(route('admin.financial-reports.export.csv', ['preset' => 'today']));

    $csvResponse->assertOk();
    expect($csvResponse->headers->get('content-type'))->toContain('text/csv');
    $csvContent = $csvResponse->streamedContent();
    expect($csvContent)->toContain('SO-20261022-EXP1')
        ->and($csvContent)->toContain('85000.00')
        ->and($csvContent)->toContain('Rp 85.000');

    // 2. Uji Ekspor PDF
    $pdfResponse = $this->actingAs($this->admin)
        ->get(route('admin.financial-reports.export.pdf', ['preset' => 'today']));

    $pdfResponse->assertOk();
    expect($pdfResponse->headers->get('content-type'))->toContain('application/pdf');
    $pdfContent = $pdfResponse->getContent();
    expect($pdfContent)->toStartWith('%PDF-1.4')
        ->and($pdfContent)->toContain('SO-20261022-EXP1')
        ->and($pdfContent)->toContain('Rp 85.000');
});

test('cashier KDS JSON endpoints transition order sequentially from pending to processing to ready to completed without bouncing', function () {
    $order = Order::create([
        'order_number' => 'SO-20261022-KDS1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Tamu KDS Responsif',
        'subtotal' => 30000,
        'total_amount' => 30000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
    ]);

    // Step 1: Kasir konfirmasi bayar via JSON -> langsung menjadi processing + paid dalam 1 round-trip JSON
    $confirmRes = $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.confirm-payment', $order), [
            'payment_method' => 'cash',
            'cash_received' => 50000,
            'date' => '2026-10-22',
        ])
        ->assertOk()
        ->json();

    expect($confirmRes['success'])->toBeTrue();
    $syncedAfterConfirm = collect($confirmRes['orders'])->firstWhere('id', $order->id);
    expect($syncedAfterConfirm)->not->toBeNull()
        ->and($syncedAfterConfirm['order_status'])->toBe('processing')
        ->and($syncedAfterConfirm['payment_status'])->toBe('paid')
        ->and($confirmRes['counts']['pending'])->toBe(0)
        ->and($confirmRes['counts']['processing'])->toBe(1);

    // Step 2: Langsung klik Tandai Siap Saji (update-status -> ready) via JSON
    $readyRes = $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.update-status', $order), [
            'status' => 'ready',
            'date' => '2026-10-22',
        ])
        ->assertOk()
        ->json();

    expect($readyRes['success'])->toBeTrue();
    $syncedAfterReady = collect($readyRes['orders'])->firstWhere('id', $order->id);
    expect($syncedAfterReady)->not->toBeNull()
        ->and($syncedAfterReady['order_status'])->toBe('ready')
        ->and($readyRes['counts']['processing'])->toBe(0)
        ->and($readyRes['counts']['ready'])->toBe(1);

    // Step 3: Selesaikan Pesanan (update-status -> completed) via JSON
    $completedRes = $this->actingAs($this->cashier)
        ->postJson(route('cashier.orders.update-status', $order), [
            'status' => 'completed',
            'date' => '2026-10-22',
        ])
        ->assertOk()
        ->json();

    expect($completedRes['success'])->toBeTrue();
    $syncedAfterCompleted = collect($completedRes['orders'])->firstWhere('id', $order->id);
    expect($syncedAfterCompleted)->not->toBeNull()
        ->and($syncedAfterCompleted['order_status'])->toBe('completed')
        ->and($completedRes['counts']['ready'])->toBe(0)
        ->and($completedRes['counts']['completed_today'])->toBe(1);
});

test('csv export sanitizes formula injection characters', function () {
    Order::create([
        'order_number' => '=1+1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => '@malicious_user',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'cash',
        'created_at' => Carbon::create(2026, 10, 22, 10, 0, 0, 'Asia/Jakarta'),
        'paid_at' => Carbon::create(2026, 10, 22, 10, 5, 0, 'Asia/Jakarta'),
    ]);

    $response = $this->actingAs($this->admin)
        ->get(route('admin.financial-reports.export.csv', ['preset' => 'today']));

    $response->assertOk();
    $csvContent = $response->streamedContent();

    expect($csvContent)->toContain("'=1+1")
        ->and($csvContent)->toContain("'@malicious_user");
});

test('product analytics today_ordered_menus lists all non-cancelled active menus ordered today without 10-item limit and excludes yesterday or cancelled orders', function () {
    $now = Carbon::now('Asia/Jakarta');

    // 1. Buat pesanan lunas hari ini berisi 12 menu berbeda (melebihi batas 10 item)
    $paidOrderToday = Order::create([
        'order_number' => 'SO-20261022-MENU1',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Pelanggan Hari Ini',
        'subtotal' => 240000,
        'total_amount' => 240000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'payment_method' => 'qris',
        'paid_at' => $now->copy()->subHour(),
        'created_at' => $now->copy()->subHour(),
    ]);

    for ($i = 1; $i <= 12; $i++) {
        $menu = Menu::create([
            'category_id' => $this->category->id,
            'name' => "Menu Kopi {$i}",
            'slug' => "menu-kopi-{$i}",
            'base_price' => 20000,
            'is_active' => true,
        ]);

        $paidOrderToday->items()->create([
            'menu_id' => $menu->id,
            'menu_name' => $menu->name,
            'base_price' => 20000,
            'quantity' => 1,
            'subtotal_options' => 0,
            'unit_price' => 20000,
            'total_price' => 20000,
            'payment_status' => 'paid',
            'status' => 'active',
        ]);
    }

    // 2. Pesanan hari ini yang belum dibayar (unpaid) + 1 item ditolak (rejected)
    $unpaidOrderToday = Order::create([
        'order_number' => 'SO-20261022-MENU2',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Pelanggan Menunggu Bayar',
        'subtotal' => 30000,
        'total_amount' => 30000,
        'order_status' => 'pending',
        'payment_status' => 'unpaid',
        'payment_method' => 'cash',
        'created_at' => $now->copy()->subMinutes(15),
    ]);

    $unpaidOrderToday->items()->create([
        'menu_id' => $this->menu->id,
        'menu_name' => 'Cappuccino Artisan',
        'base_price' => 30000,
        'quantity' => 1,
        'subtotal_options' => 0,
        'unit_price' => 30000,
        'total_price' => 30000,
        'payment_status' => 'unpaid',
        'status' => 'active',
    ]);

    $unpaidOrderToday->items()->create([
        'menu_id' => null,
        'menu_name' => 'Item Ditolak Dapur',
        'base_price' => 15000,
        'quantity' => 2,
        'subtotal_options' => 0,
        'unit_price' => 15000,
        'total_price' => 30000,
        'payment_status' => 'unpaid',
        'status' => 'rejected',
    ]);

    // 3. Pesanan dibatalkan hari ini & pesanan lunas kemarin -> TIDAK boleh masuk daftar hari ini
    $cancelledOrder = Order::create([
        'order_number' => 'SO-20261022-CNCLMENU',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Pelanggan Batal',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'cancelled',
        'payment_status' => 'unpaid',
        'created_at' => $now->copy()->subMinutes(10),
    ]);
    $cancelledOrder->items()->create([
        'menu_id' => null,
        'menu_name' => 'Menu Batal',
        'base_price' => 25000,
        'quantity' => 1,
        'subtotal_options' => 0,
        'unit_price' => 25000,
        'total_price' => 25000,
        'status' => 'active',
    ]);

    $yesterdayOrder = Order::create([
        'order_number' => 'SO-20261021-YEST',
        'cafe_table_id' => $this->table->id,
        'customer_name' => 'Pelanggan Kemarin',
        'subtotal' => 25000,
        'total_amount' => 25000,
        'order_status' => 'completed',
        'payment_status' => 'paid',
        'paid_at' => $now->copy()->subDay(),
        'created_at' => $now->copy()->subDay(),
    ]);
    $yesterdayOrder->items()->create([
        'menu_id' => null,
        'menu_name' => 'Menu Kemarin',
        'base_price' => 25000,
        'quantity' => 3,
        'subtotal_options' => 0,
        'unit_price' => 25000,
        'total_price' => 75000,
        'status' => 'active',
    ]);

    // Sekalipun filter dashboard default 'this_month', today_ordered_menus tetap mendata menu hari ini secara penuh
    $response = $this->actingAs($this->admin)
        ->getJson(route('dashboard.sync', ['preset' => 'this_month']))
        ->assertOk()
        ->json();

    $todayMenus = collect($response['product_analytics']['today_ordered_menus']);

    expect($response['product_analytics']['today_date_label'])->toBe('Kamis, 22 Okt 2026')
        ->and($todayMenus)->toHaveCount(13)
        ->and($todayMenus->firstWhere('menu_name', 'Menu Kemarin'))->toBeNull()
        ->and($todayMenus->firstWhere('menu_name', 'Menu Batal'))->toBeNull()
        ->and($todayMenus->firstWhere('menu_name', 'Item Ditolak Dapur'))->toBeNull();

    $cappuccino = $todayMenus->firstWhere('menu_name', 'Cappuccino Artisan');
    expect($cappuccino)->not->toBeNull()
        ->and($cappuccino['total_qty'])->toBe(1)
        ->and($cappuccino['paid_qty'])->toBe(0)
        ->and($cappuccino['unpaid_qty'])->toBe(1)
        ->and((float) $cappuccino['total_amount'])->toBe(30000.0);
});
