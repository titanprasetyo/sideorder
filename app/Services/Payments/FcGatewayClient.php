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

    public function baseUrl(): string
    {
        $raw = rtrim(trim((string) config('services.fcgateway.base_url', '')), '/');
        if ($raw === '') {
            return '';
        }

        // Bersihkan otomatis jika pengguna tidak sengaja menempelkan URL endpoint lengkap (mis. /api/v1/gateway/webhook/qris)
        $parsed = parse_url($raw);
        if (is_array($parsed) && ! empty($parsed['scheme']) && ! empty($parsed['host'])) {
            $path = (string) ($parsed['path'] ?? '');
            if (preg_match('#^/(api|gateway)(/|$)#i', $path) === 1) {
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

    public function webhookSecret(): string
    {
        return trim((string) config('services.fcgateway.webhook_secret', ''));
    }

    public function timeout(): int
    {
        return max(5, (int) config('services.fcgateway.timeout', 15));
    }

    public function resolveCallbackUrl(): string
    {
        $override = trim((string) config('services.fcgateway.callback_url', ''));
        if ($override !== '') {
            return $override;
        }

        return route('webhooks.fcgateway');
    }

    /**
     * Kembalikan callback_url hanya jika bisa diakses publik (menghindari penolakan proteksi SSRF FCGateway saat dev lokal).
     */
    public function resolvePublicCallbackUrl(): ?string
    {
        $override = trim((string) config('services.fcgateway.callback_url', ''));
        if ($override !== '') {
            return $override;
        }

        $url = route('webhooks.fcgateway');
        if (app()->runningUnitTests()) {
            return $url;
        }

        return $this->isPublicUrl($url) ? $url : null;
    }

    public function isPublicUrl(string $url): bool
    {
        $parsed = parse_url($url);
        if (! is_array($parsed) || empty($parsed['scheme']) || empty($parsed['host'])) {
            return false;
        }

        $scheme = strtolower((string) $parsed['scheme']);
        if (! in_array($scheme, ['http', 'https'], true)) {
            return false;
        }

        $host = strtolower(trim((string) $parsed['host'], '[]'));
        if (
            $host === ''
            || $host === 'localhost'
            || str_ends_with($host, '.localhost')
            || str_ends_with($host, '.test')
            || str_ends_with($host, '.local')
            || str_ends_with($host, '.internal')
        ) {
            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            ) !== false;
        }

        return str_contains($host, '.');
    }

    /**
     * Header otentikasi standar ke FCGateway (mengirim X-Gateway-Secret & X-Api-Key sekaligus).
     *
     * @return array<string, string>
     */
    private function authHeaders(): array
    {
        $apiKey = $this->apiKey();

        return [
            'X-Gateway-Secret' => $apiKey,
            'X-Api-Key' => $apiKey,
        ];
    }

    /**
     * Buat tagihan QRIS Dinamis pada server FCGateway.
     *
     * @param  array<string, mixed>  $payload
     * @return array{
     *     data: array<string, mixed>,
     *     raw: array<string, mixed>
     * }
     *
     * @throws PaymentGatewayException
     */
    public function createTransaction(array $payload): array
    {
        if (! $this->isConfigured()) {
            throw new PaymentGatewayException(
                'Payment gateway FCGateway belum dikonfigurasi. Lengkapi FCGATEWAY_BASE_URL dan FCGATEWAY_API_KEY di file .env.',
                503
            );
        }

        $endpoint = $this->baseUrl().'/api/v1/gateway/transactions/create';

        try {
            $response = Http::acceptJson()
                ->asJson()
                ->timeout($this->timeout())
                ->withHeaders($this->authHeaders())
                ->post($endpoint, $payload);
        } catch (ConnectionException $e) {
            Log::error('FCGateway createTransaction connection error', [
                'endpoint' => $endpoint,
                'order_id' => $payload['order_id'] ?? null,
                'error' => $e->getMessage(),
            ]);

            throw new PaymentGatewayException(
                'Gagal terhubung ke server pembayaran FCGateway. Silakan coba lagi atau pilih pembayaran Tunai di Kasir.',
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

            Log::warning('FCGateway createTransaction rejected', [
                'endpoint' => $endpoint,
                'status' => $response->status(),
                'order_id' => $payload['order_id'] ?? null,
                'message' => $gatewayMessage,
            ]);

            throw new PaymentGatewayException(
                "FCGateway menolak pembuatan tagihan QRIS ({$gatewayMessage}). Silakan coba lagi atau bayar Tunai di Kasir.",
                502
            );
        }

        $data = isset($body['data']) && is_array($body['data']) ? $body['data'] : null;
        $txId = is_array($data) && isset($data['id']) && is_string($data['id']) ? trim($data['id']) : '';
        $checkoutUrl = is_array($data) && isset($data['checkout_url']) && is_string($data['checkout_url'])
            ? trim($data['checkout_url'])
            : '';

        if ($data === null || $txId === '' || $checkoutUrl === '') {
            Log::error('FCGateway createTransaction malformed response', [
                'endpoint' => $endpoint,
                'order_id' => $payload['order_id'] ?? null,
                'body_keys' => array_keys($body),
            ]);

            throw new PaymentGatewayException(
                'Respons dari FCGateway tidak lengkap (checkout_url tidak ditemukan). Silakan hubungi pengelola kafe.',
                502
            );
        }

        return [
            'data' => $data,
            'raw' => $body,
        ];
    }

    /**
     * Cek status transaksi langsung ke server FCGateway (untuk verifikasi webhook & fallback polling).
     *
     * @return array<string, mixed>
     *
     * @throws PaymentGatewayException
     */
    public function getTransactionStatus(string $transactionIdOrOrderId): array
    {
        if (! $this->isConfigured()) {
            throw new PaymentGatewayException(
                'Payment gateway FCGateway belum dikonfigurasi.',
                503
            );
        }

        $trimmedId = trim($transactionIdOrOrderId);
        if ($trimmedId === '') {
            throw new PaymentGatewayException('ID transaksi FCGateway tidak valid.', 422);
        }

        $endpoint = $this->baseUrl().'/api/v1/gateway/transactions/'.rawurlencode($trimmedId).'/status';

        try {
            $response = Http::acceptJson()
                ->timeout($this->timeout())
                ->withHeaders($this->authHeaders())
                ->get($endpoint);
        } catch (ConnectionException $e) {
            Log::warning('FCGateway getTransactionStatus connection error', [
                'endpoint' => $endpoint,
                'lookup_id' => $trimmedId,
                'error' => $e->getMessage(),
            ]);

            throw new PaymentGatewayException(
                'Tidak dapat memverifikasi status pembayaran ke server FCGateway.',
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
                "Gagal mengambil status transaksi dari FCGateway ({$gatewayMessage}).",
                $response->status() === 404 ? 404 : 502
            );
        }

        $data = isset($body['data']) && is_array($body['data']) ? $body['data'] : null;
        if ($data === null || ! isset($data['status']) || ! is_string($data['status'])) {
            throw new PaymentGatewayException(
                'Format respons status transaksi FCGateway tidak valid.',
                502
            );
        }

        return $data;
    }
}
