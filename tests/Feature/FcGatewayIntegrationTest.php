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
        'base_url' => 'https://pay.fcs.my.id',
        'api_key' => 'fc_live_pk_test_123456',
        'secret_key' => 'fc_secret_hmac_test_999',
        'gateway' => 'MIDTRANS',
        'payment_method' => 'QRIS',
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

/**
 * Helper: kirim webhook JSON mentah dengan header X-FC-Signature (HMAC-SHA256).
 *
 * @param  array<string, mixed>  $payload
 */
function postSignedFcWebhook(mixed $testCase, array $payload, ?string $secret = 'fc_secret_hmac_test_999')
{
    $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
    $headers = [
        'Content-Type' => 'application/json',
        'Accept' => 'application/json',
    ];

    if ($secret !== null) {
        $headers['X-FC-Signature'] = hash_hmac('sha256', $rawBody, $secret);
    }

    return $testCase->call(
        'POST',
        route('webhooks.fcgateway'),
        [],
        [],
        [],
        collect($headers)->mapWithKeys(fn ($v, $k) => ['HTTP_'.strtoupper(str_replace('-', '_', $k)) => $v])->merge(['CONTENT_TYPE' => 'application/json'])->all(),
        $rawBody
    );
}

test('customer qris checkout calls fcgateway midtrans create api, redirects to payment_url, and hmac webhook settles order', function () {
    $capturedCreatePayload = [];

    Http::fake([
        'https://pay.fcs.my.id/api/v1/fc/payments/create' => function (HttpClientRequest $request) use (&$capturedCreatePayload) {
            expect($request->header('X-Api-Key'))->toBe(['fc_live_pk_test_123456']);
            $capturedCreatePayload = $request->data();

            return Http::response([
                'status' => 'success',
                'message' => 'Transaksi pembayaran FCGateway berhasil dibuat.',
                'data' => [
                    'reference_id' => 'FCG-20261127-98A7B2',
                    'merchant_order_id' => $capturedCreatePayload['order_id'],
                    'amount' => 50000,
                    'admin_fee' => 100,
                    'net_amount' => 49900,
                    'gateway' => 'MIDTRANS',
                    'payment_url' => 'https://pay.fcs.my.id/p/kUYBtP2Z',
                    'upstream_payment_url' => 'https://app.sandbox.midtrans.com/snap/v4/redirection/abc',
                    'short_code' => 'kUYBtP2Z',
                    'status' => 'PENDING',
                    'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
                ],
            ], 201);
        },
        'https://pay.fcs.my.id/api/v1/fc/payments/FCG-20261127-98A7B2/status' => function (HttpClientRequest $request) use (&$capturedCreatePayload) {
            expect($request->header('X-Api-Key'))->toBe(['fc_live_pk_test_123456']);

            return Http::response([
                'status' => 'success',
                'data' => [
                    'reference_id' => 'FCG-20261127-98A7B2',
                    'merchant_order_id' => $capturedCreatePayload['order_id'],
                    'amount' => 50000,
                    'net_amount' => 49900,
                    'admin_fee' => 100,
                    'gateway' => 'MIDTRANS',
                    'payment_method' => 'QRIS',
                    'status' => 'PAID',
                    'paid_at' => now('Asia/Jakarta')->toIso8601String(),
                    'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
                ],
            ], 200);
        },
    ]);

    // 1. Checkout QRIS (2 cup x Rp 25.000 = Rp 50.000) -> redirect ke payment_url Midtrans Snap FCGateway
    $checkoutResponse = $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Budi Santoso',
        'payment_method' => 'qris',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 2, 'selected_option_ids' => []],
        ],
    ]);

    $checkoutResponse->assertRedirect('https://pay.fcs.my.id/p/kUYBtP2Z');

    $order = Order::where('customer_name', 'Budi Santoso')->firstOrFail();
    $payment = Payment::where('order_id', $order->id)->firstOrFail();

    expect($order->payment_method)->toBe('qris')
        ->and($order->payment_gateway)->toBe('fcgateway')
        ->and($order->payment_status)->toBe('unpaid')
        ->and($order->order_status)->toBe('pending')
        ->and($payment->gateway)->toBe('fcgateway')
        ->and($payment->status)->toBe('pending')
        ->and($payment->gateway_transaction_id)->toBe('FCG-20261127-98A7B2')
        ->and($payment->checkout_url)->toBe('https://pay.fcs.my.id/p/kUYBtP2Z')
        ->and((float) $payment->fee_amount)->toBe(100.0)
        ->and($capturedCreatePayload['amount'])->toBe(50000)
        ->and($capturedCreatePayload['payment_method'])->toBe('QRIS')
        ->and($capturedCreatePayload['gateway'])->toBe('MIDTRANS')
        ->and($this->menu->fresh()->stock_quantity)->toBe(8);

    // 2. FCGateway menembak webhook dengan header X-FC-Signature (HMAC-SHA256)
    $webhookPayload = [
        'reference_id' => 'FCG-20261127-98A7B2',
        'merchant_order_id' => $payment->payment_reference,
        'amount' => 50000,
        'admin_fee' => 100,
        'net_amount' => 49900,
        'gateway' => 'MIDTRANS',
        'payment_method' => 'QRIS',
        'status' => 'PAID',
        'paid_at' => now('Asia/Jakarta')->toIso8601String(),
    ];

    postSignedFcWebhook($this, $webhookPayload)
        ->assertOk()
        ->assertJsonPath('status', 'OK')
        ->assertJsonPath('success', true)
        ->assertJsonPath('payment_status', 'paid')
        ->assertJsonPath('order_number', $order->order_number);

    $order->refresh();
    $payment->refresh();
    $item = OrderItem::where('order_id', $order->id)->firstOrFail();

    expect($order->payment_status)->toBe('paid')
        ->and($order->order_status)->toBe('processing')
        ->and($payment->status)->toBe('paid')
        ->and((float) $payment->settled_amount)->toBe(50000.0)
        ->and((float) $payment->fee_amount)->toBe(100.0)
        ->and($item->payment_status)->toBe(OrderItem::PAYMENT_PAID)
        ->and($item->stock_state)->toBe(OrderItem::STOCK_STATE_CONFIRMED);

    // 3. Idempotency: webhook dikirim ulang 2x -> tetap 200 OK tanpa duplikasi payment
    postSignedFcWebhook($this, $webhookPayload)
        ->assertOk()
        ->assertJsonPath('status', 'OK')
        ->assertJsonPath('payment_status', 'already_paid');

    expect(Payment::where('order_id', $order->id)->count())->toBe(1);
});

test('webhook with missing or invalid X-FC-Signature HMAC is rejected with 401', function () {
    $payload = [
        'reference_id' => 'FCG-20261127-UNAUTH',
        'merchant_order_id' => 'PAY-UNAUTH-001',
        'status' => 'PAID',
    ];

    // Tanpa header X-FC-Signature
    postSignedFcWebhook($this, $payload, null)
        ->assertUnauthorized()
        ->assertJsonPath('error', 'Invalid signature');

    // Dengan secret yang salah
    postSignedFcWebhook($this, $payload, 'wrong_secret_key')
        ->assertUnauthorized()
        ->assertJsonPath('error', 'Invalid signature');
});

test('spoofed webhook claiming PAID without secret is rejected when fcgateway status api reports PENDING', function () {
    config()->set('services.fcgateway.secret_key', '');
    $createdRef = '';

    Http::fake([
        'https://pay.fcs.my.id/api/v1/fc/payments/create' => function (HttpClientRequest $request) use (&$createdRef) {
            $createdRef = (string) $request->data()['order_id'];

            return Http::response([
                'status' => 'success',
                'data' => [
                    'reference_id' => 'FCG-SPOOF-001',
                    'merchant_order_id' => $createdRef,
                    'amount' => 25000,
                    'admin_fee' => 50,
                    'net_amount' => 24950,
                    'gateway' => 'MIDTRANS',
                    'payment_url' => 'https://pay.fcs.my.id/p/spoof1',
                    'status' => 'PENDING',
                    'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
                ],
            ], 201);
        },
        'https://pay.fcs.my.id/api/v1/fc/payments/FCG-SPOOF-001/status' => function () use (&$createdRef) {
            return Http::response([
                'status' => 'success',
                'data' => [
                    'reference_id' => 'FCG-SPOOF-001',
                    'merchant_order_id' => $createdRef,
                    'amount' => 25000,
                    'status' => 'PENDING',
                ],
            ], 200);
        },
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

    $this->postJson(route('webhooks.fcgateway'), [
        'reference_id' => 'FCG-SPOOF-001',
        'merchant_order_id' => $createdRef,
        'status' => 'PAID',
        'amount' => 25000,
    ])->assertStatus(422);

    expect($order->fresh()->payment_status)->toBe('unpaid')
        ->and($order->fresh()->order_status)->toBe('pending');
});

test('expired or failed midtrans webhook marks payment terminal and releases reserved stock', function () {
    $createdRef = '';

    Http::fake([
        'https://pay.fcs.my.id/api/v1/fc/payments/create' => function (HttpClientRequest $request) use (&$createdRef) {
            $createdRef = (string) $request->data()['order_id'];

            return Http::response([
                'status' => 'success',
                'data' => [
                    'reference_id' => 'FCG-EXP-001',
                    'merchant_order_id' => $createdRef,
                    'amount' => 25000,
                    'gateway' => 'MIDTRANS',
                    'payment_url' => 'https://pay.fcs.my.id/p/exp01',
                    'status' => 'PENDING',
                    'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
                ],
            ], 201);
        },
        'https://pay.fcs.my.id/api/v1/fc/payments/FCG-EXP-001/status' => function () use (&$createdRef) {
            return Http::response([
                'status' => 'success',
                'data' => [
                    'reference_id' => 'FCG-EXP-001',
                    'merchant_order_id' => $createdRef,
                    'amount' => 25000,
                    'status' => 'EXPIRED',
                ],
            ], 200);
        },
    ]);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Rudi Expired',
        'payment_method' => 'qris',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 2, 'selected_option_ids' => []],
        ],
    ])->assertRedirect();

    expect($this->menu->fresh()->stock_quantity)->toBe(8);

    postSignedFcWebhook($this, [
        'reference_id' => 'FCG-EXP-001',
        'merchant_order_id' => $createdRef,
        'status' => 'EXPIRED',
    ])->assertOk()->assertJsonPath('payment_status', 'expired');

    $order = Order::where('customer_name', 'Rudi Expired')->firstOrFail();
    expect($order->payment_status)->toBe('failed')
        ->and($this->menu->fresh()->stock_quantity)->toBe(10);
});

test('follow-up order via qris only charges unpaid difference and settles full order cleanly', function () {
    $createPayloads = [];
    $callCount = 0;

    Http::fake([
        'https://pay.fcs.my.id/api/v1/fc/payments/create' => function (HttpClientRequest $request) use (&$createPayloads, &$callCount) {
            $callCount++;
            $payload = $request->data();
            $createPayloads[] = $payload;
            $refId = "FCG-FOLLOWUP-{$callCount}";

            return Http::response([
                'status' => 'success',
                'data' => [
                    'reference_id' => $refId,
                    'merchant_order_id' => $payload['order_id'],
                    'amount' => $payload['amount'],
                    'admin_fee' => 50,
                    'net_amount' => $payload['amount'] - 50,
                    'gateway' => 'MIDTRANS',
                    'payment_url' => "https://pay.fcs.my.id/p/fu{$callCount}",
                    'status' => 'PENDING',
                    'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
                ],
            ], 201);
        },
        'https://pay.fcs.my.id/api/v1/fc/payments/FCG-FOLLOWUP-1/status' => function () use (&$createPayloads) {
            return Http::response([
                'status' => 'success',
                'data' => [
                    'reference_id' => 'FCG-FOLLOWUP-1',
                    'merchant_order_id' => $createPayloads[0]['order_id'],
                    'amount' => 25000,
                    'gateway' => 'MIDTRANS',
                    'payment_method' => 'QRIS',
                    'status' => 'PAID',
                    'paid_at' => now('Asia/Jakarta')->toIso8601String(),
                ],
            ], 200);
        },
        'https://pay.fcs.my.id/api/v1/fc/payments/FCG-FOLLOWUP-2/status' => function () use (&$createPayloads) {
            return Http::response([
                'status' => 'success',
                'data' => [
                    'reference_id' => 'FCG-FOLLOWUP-2',
                    'merchant_order_id' => $createPayloads[1]['order_id'],
                    'amount' => 25000,
                    'gateway' => 'MIDTRANS',
                    'payment_method' => 'QRIS',
                    'status' => 'PAID',
                    'paid_at' => now('Asia/Jakarta')->toIso8601String(),
                ],
            ], 200);
        },
    ]);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Siti Followup',
        'payment_method' => 'qris',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect('https://pay.fcs.my.id/p/fu1');

    $order = Order::where('customer_name', 'Siti Followup')->firstOrFail();

    postSignedFcWebhook($this, [
        'reference_id' => 'FCG-FOLLOWUP-1',
        'merchant_order_id' => $createPayloads[0]['order_id'],
        'status' => 'PAID',
        'amount' => 25000,
    ])->assertOk();

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'order_number' => $order->order_number,
        'payment_method' => 'qris',
        'items' => [
            ['menu_id' => $this->menu->id, 'quantity' => 1, 'selected_option_ids' => []],
        ],
    ])->assertRedirect('https://pay.fcs.my.id/p/fu2');

    expect($createPayloads)->toHaveCount(2)
        ->and($createPayloads[1]['amount'])->toBe(25000)
        ->and($createPayloads[1]['order_id'])->not->toBe($createPayloads[0]['order_id']);

    postSignedFcWebhook($this, [
        'reference_id' => 'FCG-FOLLOWUP-2',
        'merchant_order_id' => $createPayloads[1]['order_id'],
        'status' => 'PAID',
        'amount' => 25000,
    ])->assertOk();

    $order->refresh();
    expect($order->payment_status)->toBe('paid')
        ->and((float) $order->total_amount)->toBe(50000.0)
        ->and($order->getSettledAmount())->toBe(50000.0)
        ->and($order->getUnpaidBalance())->toBe(0.0);
});

test('customer can switch cash <-> qris (cancelling pending midtrans order) and admin can toggle digital policy', function () {
    $createdRef = '';
    $cancelCalled = false;

    Http::fake([
        'https://pay.fcs.my.id/api/v1/fc/payments/create' => function (HttpClientRequest $request) use (&$createdRef) {
            $createdRef = (string) $request->data()['order_id'];

            return Http::response([
                'status' => 'success',
                'data' => [
                    'reference_id' => 'FCG-SWITCH-001',
                    'merchant_order_id' => $createdRef,
                    'amount' => 25000,
                    'gateway' => 'MIDTRANS',
                    'payment_url' => 'https://pay.fcs.my.id/p/sw01',
                    'status' => 'PENDING',
                    'expired_at' => now('Asia/Jakarta')->addMinutes(30)->toIso8601String(),
                ],
            ], 201);
        },
        'https://pay.fcs.my.id/api/v1/fc/midtrans/cancel/*' => function () use (&$cancelCalled) {
            $cancelCalled = true;

            return Http::response([
                'status_code' => '200',
                'transaction_status' => 'cancel',
            ], 200);
        },
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

    // 2. Pindah ke QRIS -> diarahkan ke payment_url FCGateway Midtrans
    $this->post(route('order.switch-payment-method', ['order_number' => $order->order_number]), [
        'payment_method' => 'qris',
    ])->assertRedirect('https://pay.fcs.my.id/p/sw01');

    expect($order->fresh()->payment_method)->toBe('qris')
        ->and($order->fresh()->payment_gateway)->toBe('fcgateway');

    // 3. Pindah balik ke Tunai -> memanggil cancel Midtrans best-effort
    $this->post(route('order.switch-payment-method', ['order_number' => $order->order_number]), [
        'payment_method' => 'cash',
    ])->assertRedirect();

    expect($cancelCalled)->toBeTrue()
        ->and($order->fresh()->payment_method)->toBe('cash')
        ->and($order->fresh()->payment_gateway)->toBe('manual');

    // 4. Admin dapat menonaktifkan tunai selama QRIS Midtrans aktif
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
