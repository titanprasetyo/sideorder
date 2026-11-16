<?php

namespace App\Services;

use App\Models\Order;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MidtransService
{
    /**
     * Memeriksa apakah kredensial Midtrans sudah dikonfigurasi di environment.
     */
    public static function isConfigured(): bool
    {
        return trim((string) config('services.midtrans.server_key', '')) !== '';
    }

    /**
     * URL dasar API Midtrans (Sandbox vs Production).
     */
    public static function getBaseApiUrl(): string
    {
        return config('services.midtrans.is_production', false)
            ? 'https://api.midtrans.com'
            : 'https://api.sandbox.midtrans.com';
    }

    /**
     * URL dasar Snap Midtrans.
     */
    public static function getSnapBaseUrl(): string
    {
        return config('services.midtrans.is_production', false)
            ? 'https://app.midtrans.com/snap/v1/transactions'
            : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
    }

    /**
     * Verifikasi signature callback Midtrans:
     * SHA512(order_id + status_code + gross_amount + ServerKey)
     */
    public static function verifySignature(
        string $orderId,
        string $statusCode,
        string|float $grossAmount,
        string $signatureKey
    ): bool {
        $serverKey = (string) config('services.midtrans.server_key');
        if (empty($serverKey) || $signatureKey === '') {
            return false;
        }

        $formattedAmount = number_format((float) $grossAmount, 2, '.', '');
        // Midtrans terkadang mengirimkan amount tanpa desimal jika bulat (contoh: "50000.00" atau "50000")
        $hash1 = hash('sha512', $orderId.$statusCode.$formattedAmount.$serverKey);
        $hash2 = hash('sha512', $orderId.$statusCode.(string) ((int) $grossAmount).'.00'.$serverKey);
        $hash3 = hash('sha512', $orderId.$statusCode.(string) ((int) $grossAmount).$serverKey);

        return hash_equals($hash1, $signatureKey)
            || hash_equals($hash2, $signatureKey)
            || hash_equals($hash3, $signatureKey);
    }

    /**
     * Buat transaksi Snap Midtrans untuk sebuah pembayaran dengan externalId unik.
     *
     * @return array{token: string|null, redirect_url: string|null, is_demo: bool}
     */
    public static function createSnapTransactionForPayment(Order $order, string $externalId, float $amount): array
    {
        if (! self::isConfigured()) {
            return [
                'token' => 'DEMO-SNAP-TOKEN-'.$externalId,
                'redirect_url' => null,
                'is_demo' => true,
            ];
        }

        $serverKey = (string) config('services.midtrans.server_key');
        $roundedAmount = (int) round($amount > 0 ? $amount : (float) $order->total_amount);

        $payload = [
            'transaction_details' => [
                'order_id' => $externalId,
                'gross_amount' => $roundedAmount,
            ],
            'customer_details' => [
                'first_name' => $order->customer_name,
                'phone' => '080000000000',
            ],
            'enabled_payments' => ['gopay', 'shopeepay', 'qris', 'other_qris'],
        ];

        try {
            $response = Http::withBasicAuth($serverKey, '')
                ->withHeaders([
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                ])
                ->timeout(10)
                ->post(self::getSnapBaseUrl(), $payload);

            if ($response->successful()) {
                /** @var array<string, mixed> $data */
                $data = $response->json() ?? [];

                return [
                    'token' => isset($data['token']) ? (string) $data['token'] : null,
                    'redirect_url' => isset($data['redirect_url']) ? (string) $data['redirect_url'] : null,
                    'is_demo' => false,
                ];
            }

            Log::error('Midtrans Snap Error: '.$response->body());
        } catch (\Throwable $e) {
            Log::error('Midtrans Snap Exception: '.$e->getMessage());
        }

        return [
            'token' => null,
            'redirect_url' => null,
            'is_demo' => true,
        ];
    }

    /**
     * Buat transaksi Snap Midtrans untuk sebuah pesanan (backward-compatible helper).
     *
     * @return array{token: string|null, redirect_url: string|null, is_demo: bool}
     */
    public static function createSnapTransaction(Order $order): array
    {
        $unpaid = $order->getUnpaidBalance();
        $amount = $unpaid > 0 ? $unpaid : (float) $order->total_amount;

        return self::createSnapTransactionForPayment($order, $order->order_number, $amount);
    }

    /**
     * Memeriksa status transaksi langsung ke API Midtrans:
     * GET /v2/{order_id}/status
     *
     * @return array<string, mixed>|null
     */
    public static function checkTransactionStatus(string $orderNumber): ?array
    {
        if (! self::isConfigured()) {
            return null;
        }

        $serverKey = (string) config('services.midtrans.server_key');

        try {
            $response = Http::withBasicAuth($serverKey, '')
                ->withHeaders(['Accept' => 'application/json'])
                ->timeout(8)
                ->get(self::getBaseApiUrl()."/v2/{$orderNumber}/status");

            if ($response->successful()) {
                /** @var array<string, mixed> $decoded */
                $decoded = $response->json() ?? [];

                return $decoded;
            }
        } catch (\Throwable $e) {
            Log::warning("Midtrans checkTransactionStatus failed for {$orderNumber}: ".$e->getMessage());
        }

        return null;
    }
}
