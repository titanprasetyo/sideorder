<?php

namespace App\Services\Payments\Drivers;

use App\Exceptions\PaymentGatewayException;
use App\Models\Order;
use App\Models\Payment;
use App\Services\Payments\Contracts\PaymentGatewayInterface;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class XenditGatewayDriver implements PaymentGatewayInterface
{
    public function driverName(): string
    {
        return 'xendit';
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.xendit.secret_key', '')) !== '';
    }

    public function isWebhookConfigured(): bool
    {
        return trim((string) config('services.xendit.webhook_token', '')) !== '';
    }

    public function getBaseUrl(): string
    {
        return rtrim((string) config('services.xendit.base_url', 'https://api.xendit.co'), '/');
    }

    /**
     * Inisiasi transaksi pembayaran melalui API Xendit (QRIS Dynamic atau v2 Invoice).
     *
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function createTransaction(Order $order, Payment $payment, array $options = []): array
    {
        $amount = (int) round((float) $payment->amount);
        $externalId = $payment->external_id ?: $payment->payment_reference;
        $channel = strtoupper((string) ($options['channel'] ?? $payment->channel ?? ($payment->method === 'transfer' ? 'VIRTUAL_ACCOUNT' : 'QRIS')));
        $duration = max(300, (int) ($options['invoice_duration_seconds'] ?? config('services.payment_gateway.invoice_duration_seconds', 900)));
        $expiresAt = Carbon::now('Asia/Jakarta')->addSeconds($duration);

        if (! $this->isConfigured()) {
            if (app()->environment('production')) {
                throw new PaymentGatewayException('Kredensial payment gateway belum dikonfigurasi pada server produksi.');
            }

            return [
                'external_id' => $externalId,
                'gateway_transaction_id' => 'XND-SBX-'.$payment->payment_reference,
                'checkout_url' => route('order.payment', ['order_number' => $order->order_number]),
                'qr_string' => null,
                'channel' => $channel,
                'expired_at' => $expiresAt,
                'mode' => 'sandbox_slot',
                'is_sandbox' => true,
                'raw_response' => [
                    'gateway' => 'xendit',
                    'mode' => 'sandbox_slot',
                    'external_id' => $externalId,
                    'channel' => $channel,
                    'currency' => 'IDR',
                    'amount' => $amount,
                    'expires_at' => $expiresAt->toIso8601String(),
                ],
            ];
        }

        $secretKey = (string) config('services.xendit.secret_key');
        $baseUrl = $this->getBaseUrl();

        if ($payment->method === 'qris') {
            $payload = [
                'reference_id' => $externalId,
                'type' => 'DYNAMIC',
                'currency' => 'IDR',
                'amount' => $amount,
                'expires_at' => $expiresAt->utc()->format('Y-m-d\TH:i:s.v\Z'),
                'metadata' => [
                    'order_number' => $order->order_number,
                    'payment_reference' => $payment->payment_reference,
                    'customer_name' => $order->customer_name,
                ],
            ];

            try {
                $response = Http::withBasicAuth($secretKey, '')
                    ->withHeaders([
                        'api-version' => '2022-07-31',
                        'Accept' => 'application/json',
                        'Content-Type' => 'application/json',
                    ])
                    ->timeout(12)
                    ->post("{$baseUrl}/qr_codes", $payload);

                if ($response->successful()) {
                    /** @var array<string, mixed> $data */
                    $data = $response->json() ?? [];

                    return [
                        'external_id' => (string) ($data['reference_id'] ?? $externalId),
                        'gateway_transaction_id' => isset($data['id']) ? (string) $data['id'] : null,
                        'checkout_url' => route('order.payment', ['order_number' => $order->order_number]),
                        'qr_string' => isset($data['qr_string']) ? (string) $data['qr_string'] : null,
                        'channel' => 'QRIS',
                        'expired_at' => $expiresAt,
                        'mode' => config('services.xendit.is_production', false) ? 'production' : 'sandbox',
                        'is_sandbox' => ! config('services.xendit.is_production', false),
                        'raw_response' => $data,
                    ];
                }

                Log::error('Xendit QRIS API Error', [
                    'status' => $response->status(),
                    'reference_id' => $externalId,
                    'body' => $response->body(),
                ]);

                throw new PaymentGatewayException('Gagal menginisiasi pembayaran QRIS ke payment gateway (HTTP '.$response->status().').');
            } catch (PaymentGatewayException $e) {
                throw $e;
            } catch (\Throwable $e) {
                Log::error('Xendit QRIS Exception: '.$e->getMessage(), ['reference_id' => $externalId]);

                throw new PaymentGatewayException('Koneksi ke payment gateway gagal saat membuat QRIS.');
            }
        }

        // Invoice Xendit v2 (fallback channel nontunai)
        $invoicePayload = [
            'external_id' => $externalId,
            'amount' => $amount,
            'description' => "Pembayaran Pesanan #{$order->order_number} - SIDE LINE Coffee",
            'invoice_duration' => $duration,
            'currency' => 'IDR',
            'customer' => [
                'given_names' => $order->customer_name,
            ],
            'success_redirect_url' => route('order.status', ['order_number' => $order->order_number]),
            'failure_redirect_url' => route('order.status', ['order_number' => $order->order_number]),
            'metadata' => [
                'order_number' => $order->order_number,
                'payment_reference' => $payment->payment_reference,
            ],
        ];

        try {
            $response = Http::withBasicAuth($secretKey, '')
                ->withHeaders([
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                ])
                ->timeout(12)
                ->post("{$baseUrl}/v2/invoices", $invoicePayload);

            if ($response->successful()) {
                /** @var array<string, mixed> $data */
                $data = $response->json() ?? [];

                return [
                    'external_id' => (string) ($data['external_id'] ?? $externalId),
                    'gateway_transaction_id' => isset($data['id']) ? (string) $data['id'] : null,
                    'checkout_url' => isset($data['invoice_url']) ? (string) $data['invoice_url'] : route('order.payment', ['order_number' => $order->order_number]),
                    'qr_string' => null,
                    'channel' => $channel,
                    'expired_at' => $expiresAt,
                    'mode' => config('services.xendit.is_production', false) ? 'production' : 'sandbox',
                    'is_sandbox' => ! config('services.xendit.is_production', false),
                    'raw_response' => $data,
                ];
            }

            Log::error('Xendit Invoice API Error', [
                'status' => $response->status(),
                'external_id' => $externalId,
                'body' => $response->body(),
            ]);

            throw new PaymentGatewayException('Gagal menginisiasi invoice pembayaran ke payment gateway (HTTP '.$response->status().').');
        } catch (PaymentGatewayException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Xendit Invoice Exception: '.$e->getMessage(), ['external_id' => $externalId]);

            throw new PaymentGatewayException('Koneksi ke payment gateway gagal saat membuat invoice.');
        }
    }

    /**
     * Rekonsiliasi status transaksi langsung ke API Xendit bila secret key aktif.
     *
     * @return array<string, mixed>|null
     */
    public function checkTransactionStatus(Payment $payment): ?array
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $secretKey = (string) config('services.xendit.secret_key');
        $baseUrl = $this->getBaseUrl();

        try {
            if ($payment->method === 'qris' && ! empty($payment->gateway_transaction_id) && str_starts_with($payment->gateway_transaction_id, 'qr_')) {
                $response = Http::withBasicAuth($secretKey, '')
                    ->withHeaders([
                        'api-version' => '2022-07-31',
                        'Accept' => 'application/json',
                    ])
                    ->timeout(8)
                    ->get("{$baseUrl}/qr_codes/{$payment->gateway_transaction_id}/payments");

                if ($response->successful()) {
                    /** @var array<int|string, mixed> $body */
                    $body = $response->json() ?? [];
                    $payments = is_array($body['data'] ?? null)
                        ? $body['data']
                        : (array_is_list($body) ? $body : []);
                    $latest = null;
                    foreach ($payments as $item) {
                        if (! is_array($item)) {
                            continue;
                        }
                        if ($latest === null) {
                            $latest = $item;
                        }
                        if ($this->normalizeXenditStatus((string) ($item['status'] ?? '')) === 'paid') {
                            $latest = $item;
                            break;
                        }
                    }
                    if ($latest !== null) {
                        return [
                            'normalized_status' => $this->normalizeXenditStatus((string) ($latest['status'] ?? 'PENDING')),
                            'gateway_transaction_id' => (string) ($latest['id'] ?? $payment->gateway_transaction_id),
                            'amount' => (float) ($latest['amount'] ?? $payment->amount),
                            'channel' => 'QRIS',
                            'raw' => $latest,
                        ];
                    }
                }

                return null;
            }

            if (! empty($payment->gateway_transaction_id) && ! str_starts_with($payment->gateway_transaction_id, 'XND-SBX-')) {
                $response = Http::withBasicAuth($secretKey, '')
                    ->withHeaders(['Accept' => 'application/json'])
                    ->timeout(8)
                    ->get("{$baseUrl}/v2/invoices/{$payment->gateway_transaction_id}");

                if ($response->successful()) {
                    /** @var array<string, mixed> $data */
                    $data = $response->json() ?? [];

                    return [
                        'normalized_status' => $this->normalizeXenditStatus((string) ($data['status'] ?? 'PENDING')),
                        'gateway_transaction_id' => (string) ($data['id'] ?? $payment->gateway_transaction_id),
                        'amount' => (float) ($data['paid_amount'] ?? $data['amount'] ?? $payment->amount),
                        'channel' => (string) ($data['payment_channel'] ?? $payment->channel ?? 'QRIS'),
                        'raw' => $data,
                    ];
                }
            }
        } catch (\Throwable $e) {
            Log::warning("Xendit status check failed for {$payment->payment_reference}: ".$e->getMessage());
        }

        return null;
    }

    /**
     * Verifikasi X-CALLBACK-TOKEN resmi Xendit secara fail-closed.
     */
    public function verifyWebhookSignature(Request $request, ?Payment $payment = null): bool
    {
        $configuredToken = trim((string) config('services.xendit.webhook_token', ''));
        if ($configuredToken === '') {
            return false;
        }

        $providedToken = trim((string) ($request->header('X-CALLBACK-TOKEN') ?? $request->header('x-callback-token') ?? ''));
        if ($providedToken === '') {
            return false;
        }

        return hash_equals($configuredToken, $providedToken);
    }

    /**
     * Normalisasi payload callback Xendit Invoice & Xendit QRIS Webhook ke struktur standar SideOrder.
     *
     * @return array{
     *     external_id: string,
     *     order_number: string,
     *     payment_reference: string,
     *     gateway_transaction_id: string,
     *     status: string,
     *     amount: float,
     *     method: string|null,
     *     channel: string|null,
     *     paid_at: string|null,
     *     raw: array<string, mixed>
     * }
     */
    public function parseWebhookPayload(Request $request): array
    {
        /** @var array<string, mixed> $raw */
        $raw = $request->all();
        /** @var array<string, mixed>|null $nestedData */
        $nestedData = is_array($raw['data'] ?? null) ? $raw['data'] : null;
        /** @var array<string, mixed>|null $nestedQrCode */
        $nestedQrCode = is_array($raw['qr_code'] ?? null) ? $raw['qr_code'] : null;
        $event = strtolower((string) ($raw['event'] ?? ''));

        $externalId = (string) (
            $nestedData['reference_id']
            ?? $nestedQrCode['reference_id']
            ?? $nestedQrCode['external_id']
            ?? $raw['external_id']
            ?? $raw['reference_id']
            ?? $raw['payment_reference']
            ?? ''
        );

        $isLegacyQrPayment = $nestedQrCode !== null && str_starts_with((string) ($raw['id'] ?? ''), 'qrpy_');

        $rawStatus = (string) (
            $nestedData['status']
            ?? $raw['status']
            ?? ($event === 'qr.payment' || $isLegacyQrPayment ? 'COMPLETED' : '')
        );

        $firstCaptureAmount = is_array($nestedData['captures'] ?? null)
            && is_array($nestedData['captures'][0] ?? null)
            && isset($nestedData['captures'][0]['amount'])
            ? $nestedData['captures'][0]['amount']
            : null;

        $amount = (float) (
            $nestedData['amount']
            ?? $firstCaptureAmount
            ?? $nestedData['request_amount']
            ?? $raw['paid_amount']
            ?? $raw['amount']
            ?? $nestedQrCode['amount']
            ?? $raw['gross_amount']
            ?? 0
        );

        $channel = strtoupper((string) (
            $nestedData['channel_code']
            ?? $nestedQrCode['channel_code']
            ?? $raw['payment_channel']
            ?? $raw['channel_code']
            ?? $raw['payment_method']
            ?? 'QRIS'
        ));

        $method = $this->mapChannelToMethod($channel);
        $transactionId = (string) ($nestedData['id'] ?? $nestedData['payment_id'] ?? $raw['id'] ?? $externalId);
        $paidAt = isset($nestedData['updated'])
            ? (string) $nestedData['updated']
            : (isset($raw['paid_at'])
                ? (string) $raw['paid_at']
                : ($nestedQrCode !== null && isset($raw['created']) ? (string) $raw['created'] : null));

        $nestedMetadata = is_array($nestedData['metadata'] ?? null) ? $nestedData['metadata'] : null;
        $qrMetadata = is_array($nestedQrCode['metadata'] ?? null) ? $nestedQrCode['metadata'] : null;
        $rootMetadata = is_array($raw['metadata'] ?? null) ? $raw['metadata'] : null;

        $orderNumber = (string) (
            $raw['order_number']
            ?? $nestedMetadata['order_number']
            ?? $qrMetadata['order_number']
            ?? $rootMetadata['order_number']
            ?? ''
        );

        return [
            'external_id' => $externalId,
            'order_number' => $orderNumber,
            'payment_reference' => $externalId,
            'gateway_transaction_id' => $transactionId,
            'status' => $this->normalizeXenditStatus($rawStatus),
            'amount' => $amount,
            'method' => $method,
            'channel' => $channel,
            'paid_at' => $paidAt,
            'raw' => $raw,
        ];
    }

    public function normalizeXenditStatus(string $status): string
    {
        return match (strtoupper(trim($status))) {
            'PAID', 'SETTLED', 'COMPLETED', 'SUCCEEDED' => 'paid',
            'EXPIRED' => 'expired',
            'FAILED', 'VOIDED' => 'failed',
            default => 'pending',
        };
    }

    private function mapChannelToMethod(string $channel): string
    {
        if (str_contains($channel, 'QRIS')) {
            return 'qris';
        }

        if (str_contains($channel, 'VA') || str_contains($channel, 'BANK') || in_array($channel, ['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'BJB', 'BSI'], true)) {
            return 'transfer';
        }

        return 'qris';
    }
}
