<?php

namespace App\Services\Payments;

use App\Exceptions\PaymentGatewayException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class FcGatewayClient
{
    public function isConfigured(): bool
    {
        return (bool) config('services.fcgateway.enabled', true)
            && $this->baseUrl() !== ''
            && $this->apiKey() !== '';
    }

    public function isWebhookSecretConfigured(): bool
    {
        return $this->secretKey() !== '';
    }

    public function baseUrl(): string
    {
        $raw = rtrim(trim((string) config('services.fcgateway.base_url', 'https://pay.fcs.my.id')), '/');
        if ($raw === '') {
            return '';
        }

        // Bersihkan otomatis jika pengguna tidak sengaja menempelkan path dokumentasi/endpoint lengkap
        $parsed = parse_url($raw);
        if (is_array($parsed) && ! empty($parsed['scheme']) && ! empty($parsed['host'])) {
            $path = (string) ($parsed['path'] ?? '');
            if (preg_match('#^/(api|fc|gateway)(/|$)#i', $path) === 1) {
                $clean = $parsed['scheme'].'://'.$parsed['host'];
                if (! empty($parsed['port'])) {
                    $clean .= ':'.$parsed['port'];
                }

                return $clean;
            }
        }

        return $raw;
    }

    public function apiKey(): string
    {
        return trim((string) config('services.fcgateway.api_key', ''));
    }

    public function secretKey(): string
    {
        return trim((string) config('services.fcgateway.secret_key', ''));
    }

    public function upstreamGateway(): string
    {
        $gateway = strtoupper(trim((string) config('services.fcgateway.gateway', 'MIDTRANS')));

        return in_array($gateway, ['MIDTRANS', 'XENDIT'], true) ? $gateway : 'MIDTRANS';
    }

    public function paymentMethod(): string
    {
        $method = strtoupper(trim((string) config('services.fcgateway.payment_method', 'QRIS')));

        return $method !== '' ? $method : 'QRIS';
    }

    public function timeout(): int
    {
        return max(5, (int) config('services.fcgateway.timeout', 15));
    }

    public function webhookEndpointUrl(): string
    {
        return route('webhooks.fcgateway');
    }

    /**
     * Verifikasi signature webhook HMAC-SHA256 sesuai standar FCGateway (header X-FC-Signature).
     */
    public function verifyWebhookSignature(string $rawPayload, string $incomingSignature): bool
    {
        $secret = $this->secretKey();
        $signature = trim($incomingSignature);

        if ($secret === '' || $signature === '') {
            return false;
        }

        $expected = hash_hmac('sha256', $rawPayload, $secret);

        return hash_equals($expected, $signature);
    }

    /**
     * Inisiasi tagihan pembayaran FCGateway & Midtrans (Snap & Multi-Channel).
     * Endpoint: POST /api/v1/fc/payments/create
     *
     * @param  array<string, mixed>  $payload
     * @return array{
     *     data: array<string, mixed>,
     *     raw: array<string, mixed>
     * }
     *
     * @throws PaymentGatewayException
     */
    public function createPayment(array $payload): array
    {
        if (! $this->isConfigured()) {
            throw new PaymentGatewayException(
                'Payment gateway FCGateway Midtrans belum dikonfigurasi. Lengkapi FCGATEWAY_API_KEY di file .env.',
                503
            );
        }

        $endpoint = $this->baseUrl().'/api/v1/fc/payments/create';

        try {
            $response = Http::acceptJson()
                ->asJson()
                ->timeout($this->timeout())
                ->withHeaders([
                    'X-Api-Key' => $this->apiKey(),
                ])
                ->post($endpoint, $payload);
        } catch (ConnectionException $e) {
            Log::error('FCGateway createPayment connection error', [
                'endpoint' => $endpoint,
                'order_id' => $payload['order_id'] ?? null,
                'error' => $e->getMessage(),
            ]);

            throw new PaymentGatewayException(
                'Gagal terhubung ke server pembayaran FCGateway Midtrans. Silakan coba lagi atau pilih pembayaran Tunai di Kasir.',
                503,
                $e
            );
        }

        $decoded = $response->json();
        $body = is_array($decoded) ? $decoded : [];

        if (! $response->successful()) {
            $gatewayMessage = isset($body['message']) && is_string($body['message']) && trim($body['message']) !== ''
                ? trim($body['message'])
                : "HTTP {$response->status()}";

            Log::warning('FCGateway createPayment rejected', [
                'endpoint' => $endpoint,
                'status' => $response->status(),
                'order_id' => $payload['order_id'] ?? null,
                'message' => $gatewayMessage,
            ]);

            throw new PaymentGatewayException(
                "FCGateway Midtrans menolak pembuatan tagihan ({$gatewayMessage}). Silakan coba lagi atau bayar Tunai di Kasir.",
                502
            );
        }

        $data = isset($body['data']) && is_array($body['data']) ? $body['data'] : null;
        $referenceId = is_array($data) && isset($data['reference_id']) && is_scalar($data['reference_id'])
            ? trim((string) $data['reference_id'])
            : '';
        $paymentUrl = is_array($data) && isset($data['payment_url']) && is_string($data['payment_url'])
            ? trim($data['payment_url'])
            : '';
        if ($paymentUrl === '' && is_array($data) && isset($data['upstream_payment_url']) && is_string($data['upstream_payment_url'])) {
            $paymentUrl = trim($data['upstream_payment_url']);
        }

        if ($data === null || $referenceId === '' || $paymentUrl === '') {
            Log::error('FCGateway createPayment malformed response', [
                'endpoint' => $endpoint,
                'order_id' => $payload['order_id'] ?? null,
                'body_keys' => array_keys($body),
            ]);

            throw new PaymentGatewayException(
                'Respons dari FCGateway Midtrans tidak lengkap (reference_id / payment_url tidak ditemukan).',
                502
            );
        }

        return [
            'data' => $data,
            'raw' => $body,
        ];
    }

    /**
     * Cek status tagihan realtime berdasarkan reference_id, merchant_order_id, atau short_code.
     * Endpoint: GET /api/v1/fc/payments/{referenceId}/status
     *
     * @return array<string, mixed>
     *
     * @throws PaymentGatewayException
     */
    public function getPaymentStatus(string $referenceIdOrOrderId): array
    {
        if (! $this->isConfigured()) {
            throw new PaymentGatewayException(
                'Payment gateway FCGateway Midtrans belum dikonfigurasi.',
                503
            );
        }

        $trimmedId = trim($referenceIdOrOrderId);
        if ($trimmedId === '') {
            throw new PaymentGatewayException('Referensi transaksi FCGateway tidak valid.', 422);
        }

        $endpoint = $this->baseUrl().'/api/v1/fc/payments/'.rawurlencode($trimmedId).'/status';

        try {
            $response = Http::acceptJson()
                ->timeout($this->timeout())
                ->withHeaders([
                    'X-Api-Key' => $this->apiKey(),
                ])
                ->get($endpoint);
        } catch (ConnectionException $e) {
            Log::warning('FCGateway getPaymentStatus connection error', [
                'endpoint' => $endpoint,
                'lookup_id' => $trimmedId,
                'error' => $e->getMessage(),
            ]);

            throw new PaymentGatewayException(
                'Tidak dapat memverifikasi status pembayaran ke server FCGateway Midtrans.',
                503,
                $e
            );
        }

        $decoded = $response->json();
        $body = is_array($decoded) ? $decoded : [];

        if (! $response->successful()) {
            $gatewayMessage = isset($body['message']) && is_string($body['message']) && trim($body['message']) !== ''
                ? trim($body['message'])
                : "HTTP {$response->status()}";

            throw new PaymentGatewayException(
                "Gagal mengambil status transaksi dari FCGateway Midtrans ({$gatewayMessage}).",
                $response->status() === 404 ? 404 : 502
            );
        }

        $data = isset($body['data']) && is_array($body['data']) ? $body['data'] : null;
        if ($data === null || ! isset($data['status']) || ! is_string($data['status'])) {
            throw new PaymentGatewayException(
                'Format respons status transaksi FCGateway Midtrans tidak valid.',
                502
            );
        }

        return $data;
    }

    /**
     * Batalkan transaksi Midtrans yang masih berstatus pending (best-effort).
     * Endpoint: POST /api/v1/fc/midtrans/cancel/{orderId}
     */
    public function cancelMidtransTransaction(string $orderId): bool
    {
        $trimmedOrderId = trim($orderId);
        if (! $this->isConfigured() || $trimmedOrderId === '' || $this->upstreamGateway() !== 'MIDTRANS') {
            return false;
        }

        $endpoint = $this->baseUrl().'/api/v1/fc/midtrans/cancel/'.rawurlencode($trimmedOrderId);

        try {
            $response = Http::acceptJson()
                ->timeout(min(8, $this->timeout()))
                ->withHeaders([
                    'X-Api-Key' => $this->apiKey(),
                ])
                ->post($endpoint);

            return $response->successful();
        } catch (\Throwable $e) {
            Log::debug('FCGateway cancelMidtransTransaction skipped', [
                'order_id' => $trimmedOrderId,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
