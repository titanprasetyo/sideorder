<?php

use App\Models\CafeSetting;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    config()->set('services.fcgateway', [
        'enabled' => true,
        'base_url' => 'https://gateway.example.test',
        'api_key' => 'fc-test-api-key-123',
        'webhook_secret' => '',
        'callback_url' => '',
        'timeout' => 15,
    ]);

    $this->admin = User::factory()->create([
        'name' => 'Owner SideLine',
        'email' => 'owner.fc@sideline.test',
        'role' => 'admin',
    ]);

    $this->table = CafeTable::create([
        'table_number' => '12',
        'name' => 'Table Outdoor',
        'is_active' => true,
    ]);

    $this->category = Category::create([
        'name' => 'Coffee',
        'slug' => 'coffee-fc',
        'is_active' => true,
    ]);

    $this->menu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Kopi Susu Gula Aren',
        'slug' => 'kopi-susu-gula-aren',
        'base_price' => 25000,
        'cost_price' => 9000,
        'is_active' => true,
        'is_limited_stock' => true,
        'stock_quantity' => 10,
        'stock_valid_days' => 1,
        'stock_updated_at' => now('Asia/Jakarta'),
    ]);

    CafeSetting::create([
        'cafe_name' => 'Café SIDE LINE',
        'is_ordering_enabled' => true,
        'allow_cash_payment' => true,
        'allow_xendit_payment' => true,
        'payment_expiry_minutes' => 30,
        'is_location_restricted' => false,
        'access_radius_meters' => 100,
    ]);
});

test('customer qris checkout hits fcgateway create api, redirects to checkout page, and webhook settles order after server verification', function () {
    $capturedCreatePayload = [];

    Http::fake([
        'https://gateway.example.test/api/v1/gateway/transactions/create' => function (HttpClientRequest $request) use (&$capturedCreatePayload) {
            expect($request->header('X-Gateway-Secret'))->toBe(['fc-test-api-key-123'])
                ->and($request->header('X-Api-Key'))->toBe(['fc-test-api-key-123']);
            $capturedCreatePayload = $request->data();

            return Http::response([
                'status' => 'success',
                'message' => 'Tagihan QRIS berhasil dibuat.',
                'data' => [
                    'id' => '01a0ba35-1358-71f1-8354-503473f749d4',
                    'order_id' => $capturedCreatePayload['order_id'],
                    'base_amount' => 50000,
                    'unique_code' => 42,
                    'formatted_unique_code' => '042',
                    'total_amount' => 50042,
                    'status' => 'PENDING',
                    'checkout_url' => 'https://gateway.example.test/gateway/pay/01a0ba35-1358-71f1-8354-503473f749d4',
                    'qr_image_url' => 'https://gateway.example.test/gateway/pay/01a0ba35-1358-71f1-8354-503473f749d4/qr.png',
                    'dynamic_qris' => '000201010212MOCKQRIS540850042.006304ABCD',
                    'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
                ],
            ], 201);
        },
        'https://gateway.example.test/api/v1/gateway/transactions/01a0ba35-1358-71f1-8354-503473f749d4/status' => function () use (&$capturedCreatePayload) {
            return Http::response([
                'status' => 'success',
                'data' => [
                    'id' => '01a0ba35-1358-71f1-8354-503473f749d4',
                    'order_id' => $capturedCreatePayload['order_id'],
                    'status' => 'PAID',
                    'base_amount' => 50000,
                    'unique_code' => 42,
                    'formatted_unique_code' => '042',
                    'total_amount' => 50042,
                    'paid_at' => now('Asia/Jakarta')->toIso8601String(),
                ],
            ], 200);
        },
    ]);

    // 1. Checkout QRIS (2 cup x Rp 25.000 = Rp 50.000) -> redirect ke checkout_url FCGateway
    $checkoutResponse = $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Budi Santoso',
        'payment_method' => 'qris',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 2, 'selected_option_ids' => []],
        ],
    ]);

    $checkoutResponse->assertRedirect('https://gateway.example.test/gateway/pay/01a0ba35-1358-71f1-8354-503473f749d4');

    $order = Order::where('customer_name', 'Budi Santoso')->firstOrFail();
    $payment = Payment::where('order_id', $order->id)->firstOrFail();

    expect($order->payment_method)->toBe('qris')
        ->and($order->payment_gateway)->toBe('fcgateway')
        ->and($order->payment_status)->toBe('unpaid')
        ->and($order->order_status)->toBe('pending')
        ->and($payment->gateway)->toBe('fcgateway')
        ->and($payment->status)->toBe('pending')
        ->and($payment->checkout_url)->toBe('https://gateway.example.test/gateway/pay/01a0ba35-1358-71f1-8354-503473f749d4')
        ->and($capturedCreatePayload['amount'])->toBe(50000)
        ->and($capturedCreatePayload['callback_url'])->toBe(route('webhooks.fcgateway'))
        ->and($capturedCreatePayload['return_url'])->toBe(route('order.status', ['order_number' => $order->order_number]))
        ->and($this->menu->fresh()->stock_quantity)->toBe(8);

    // 2. FCGateway menembak callback webhook -> SideOrder verifikasi ke GET /status -> Order LUNAS & Processing
    $webhookPayload = [
        'event' => 'payment.success',
        'transaction_id' => '01a0ba35-1358-71f1-8354-503473f749d4',
        'order_id' => $payment->payment_reference,
        'base_amount' => 50000,
        'unique_code' => 42,
        'total_amount' => 50042,
        'status' => 'PAID',
        'paid_at' => now('Asia/Jakarta')->toIso8601String(),
        'provider' => 'GOPAY',
        'customer_name' => 'Budi Santoso',
    ];

    $this->postJson(route('webhooks.fcgateway'), $webhookPayload)
        ->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonPath('status', 'paid')
        ->assertJsonPath('order_number', $order->order_number);

    $order->refresh();
    $payment->refresh();
    $item = OrderItem::where('order_id', $order->id)->firstOrFail();

    expect($order->payment_status)->toBe('paid')
        ->and($order->order_status)->toBe('processing')
        ->and($payment->status)->toBe('paid')
        ->and((float) $payment->settled_amount)->toBe(50000.0)
        ->and($item->payment_status)->toBe(OrderItem::PAYMENT_PAID)
        ->and($item->stock_state)->toBe(OrderItem::STOCK_STATE_CONFIRMED);

    // 3. Idempotency: webhook dikirim ulang 2x -> tetap 200 OK tanpa duplikasi payment
    $this->postJson(route('webhooks.fcgateway'), $webhookPayload)
        ->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonPath('status', 'already_paid');

    expect(Payment::where('order_id', $order->id)->count())->toBe(1);
});

test('fake spoofed webhook claiming PAID is rejected when fcgateway status api still reports PENDING', function () {
    $createdRef = '';

    Http::fake([
        'https://gateway.example.test/api/v1/gateway/transactions/create' => function (HttpClientRequest $request) use (&$createdRef) {
            $createdRef = (string) $request->data()['order_id'];

            return Http::response([
                'status' => 'success',
                'data' => [
                    'id' => 'tx-spoof-check-001',
                    'order_id' => $createdRef,
                    'base_amount' => 25000,
                    'unique_code' => 11,
                    'total_amount' => 25011,
                    'status' => 'PENDING',
                    'checkout_url' => 'https://gateway.example.test/gateway/pay/tx-spoof-check-001',
                    'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
                ],
            ], 201);
        },
        'https://gateway.example.test/api/v1/gateway/transactions/tx-spoof-check-001/status' => Http::response([
            'status' => 'success',
            'data' => [
                'id' => 'tx-spoof-check-001',
                'order_id' => 'ignored-mismatch-or-pending',
                'status' => 'PENDING',
                'base_amount' => 25000,
                'total_amount' => 25011,
            ],
        ], 200),
    ]);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Attacker Test',
        'payment_method' => 'qris',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect();

    $order = Order::where('customer_name', 'Attacker Test')->firstOrFail();

    // Kirim webhook palsu PAID -> harus ditolak 422 karena gateway masih PENDING
    $this->postJson(route('webhooks.fcgateway'), [
        'transaction_id' => 'tx-spoof-check-001',
        'order_id' => $createdRef,
        'status' => 'PAID',
        'total_amount' => 25011,
    ])->assertStatus(422);

    expect($order->fresh()->payment_status)->toBe('unpaid')
        ->and($order->fresh()->order_status)->toBe('pending');
});

test('webhook secret header is enforced when configured', function () {
    config()->set('services.fcgateway.webhook_secret', 'super-secret-token');

    $this->postJson(route('webhooks.fcgateway'), [
        'transaction_id' => 'tx-123',
        'order_id' => 'PAY-123',
        'status' => 'PAID',
    ])->assertUnauthorized();

    $this->withHeaders(['X-Gateway-Secret' => 'wrong-secret'])
        ->postJson(route('webhooks.fcgateway'), [
            'transaction_id' => 'tx-123',
            'order_id' => 'PAY-123',
            'status' => 'PAID',
        ])->assertUnauthorized();
});

test('follow-up order via qris only charges the unpaid difference and settles full order cleanly', function () {
    $createPayloads = [];
    $callCount = 0;

    Http::fake([
        'https://gateway.example.test/api/v1/gateway/transactions/create' => function (HttpClientRequest $request) use (&$createPayloads, &$callCount) {
            $callCount++;
            $payload = $request->data();
            $createPayloads[] = $payload;
            $txId = "tx-followup-{$callCount}";

            return Http::response([
                'status' => 'success',
                'data' => [
                    'id' => $txId,
                    'order_id' => $payload['order_id'],
                    'base_amount' => $payload['amount'],
                    'unique_code' => 15,
                    'total_amount' => $payload['amount'] + 15,
                    'status' => 'PENDING',
                    'checkout_url' => "https://gateway.example.test/gateway/pay/{$txId}",
                    'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
                ],
            ], 201);
        },
        'https://gateway.example.test/api/v1/gateway/transactions/tx-followup-1/status' => function () use (&$createPayloads) {
            return Http::response([
                'status' => 'success',
                'data' => [
                    'id' => 'tx-followup-1',
                    'order_id' => $createPayloads[0]['order_id'],
                    'status' => 'PAID',
                    'base_amount' => 25000,
                    'total_amount' => 25015,
                    'paid_at' => now('Asia/Jakarta')->toIso8601String(),
                ],
            ], 200);
        },
        'https://gateway.example.test/api/v1/gateway/transactions/tx-followup-2/status' => function () use (&$createPayloads) {
            return Http::response([
                'status' => 'success',
                'data' => [
                    'id' => 'tx-followup-2',
                    'order_id' => $createPayloads[1]['order_id'],
                    'status' => 'PAID',
                    'base_amount' => 25000,
                    'total_amount' => 25015,
                    'paid_at' => now('Asia/Jakarta')->toIso8601String(),
                ],
            ], 200);
        },
    ]);

    // Pesanan awal 1 cup (Rp 25.000)
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Siti Followup',
        'payment_method' => 'qris',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect('https://gateway.example.test/gateway/pay/tx-followup-1');

    $order = Order::where('customer_name', 'Siti Followup')->firstOrFail();

    // Lunasi pesanan awal
    $this->postJson(route('webhooks.fcgateway'), [
        'transaction_id' => 'tx-followup-1',
        'order_id' => $createPayloads[0]['order_id'],
        'status' => 'PAID',
        'total_amount' => 25015,
    ])->assertOk();

    // Tambah 1 cup susulan -> nominal tagihan ke gateway HANYA Rp 25.000 (bukan Rp 50.000)
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'order_number' => $order->order_number,
        'payment_method' => 'qris',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect('https://gateway.example.test/gateway/pay/tx-followup-2');

    expect($createPayloads)->toHaveCount(2)
        ->and($createPayloads[1]['amount'])->toBe(25000)
        ->and($createPayloads[1]['order_id'])->not->toBe($createPayloads[0]['order_id']);

    // Lunasi pesanan tambahan via webhook
    $this->postJson(route('webhooks.fcgateway'), [
        'transaction_id' => 'tx-followup-2',
        'order_id' => $createPayloads[1]['order_id'],
        'status' => 'PAID',
        'total_amount' => 25015,
    ])->assertOk();

    $order->refresh();
    expect($order->payment_status)->toBe('paid')
        ->and((float) $order->total_amount)->toBe(50000.0)
        ->and($order->getSettledAmount())->toBe(50000.0)
        ->and($order->getUnpaidBalance())->toBe(0.0);
});

test('customer can switch cash order to qris and admin can toggle digital payment policy', function () {
    Http::fake([
        'https://gateway.example.test/api/v1/gateway/transactions/create' => Http::response([
            'status' => 'success',
            'data' => [
                'id' => 'tx-switch-001',
                'order_id' => 'PAY-SWITCH',
                'base_amount' => 25000,
                'unique_code' => 7,
                'total_amount' => 25007,
                'status' => 'PENDING',
                'checkout_url' => 'https://gateway.example.test/gateway/pay/tx-switch-001',
                'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
            ],
        ], 201),
    ]);

    // 1. Checkout tunai dulu
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Dina Switch',
        'payment_method' => 'cash',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect();

    $order = Order::where('customer_name', 'Dina Switch')->firstOrFail();

    // 2. Pindah ke QRIS -> diarahkan ke checkout_url FCGateway
    $this->post(route('order.switch-payment-method', ['order_number' => $order->order_number]), [
        'payment_method' => 'qris',
    ])->assertRedirect('https://gateway.example.test/gateway/pay/tx-switch-001');

    expect($order->fresh()->payment_method)->toBe('qris')
        ->and($order->fresh()->payment_gateway)->toBe('fcgateway');

    // 3. Admin dapat menonaktifkan tunai selama QRIS digital aktif
    $this->actingAs($this->admin)
        ->put(route('admin.location-settings.update'), [
            'cafe_name' => 'Café SIDE LINE',
            'is_ordering_enabled' => true,
            'allow_cash_payment' => false,
            'allow_digital_payment' => true,
            'payment_expiry_minutes' => 30,
            'is_location_restricted' => false,
            'access_radius_meters' => 100,
        ])
        ->assertSessionHas('success');

    expect(CafeSetting::current()->allow_cash_payment)->toBeFalse()
        ->and(CafeSetting::current()->allow_xendit_payment)->toBeTrue();
});
