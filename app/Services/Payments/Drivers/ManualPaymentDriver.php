<?php

namespace App\Services\Payments\Drivers;

use App\Models\Order;
use App\Models\Payment;
use App\Services\Payments\Contracts\PaymentGatewayInterface;
use Carbon\Carbon;
use Illuminate\Http\Request;

class ManualPaymentDriver implements PaymentGatewayInterface
{
    public function driverName(): string
    {
        return 'manual';
    }

    public function isConfigured(): bool
    {
        return true;
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function createTransaction(Order $order, Payment $payment, array $options = []): array
    {
        $channel = strtoupper((string) ($options['channel'] ?? match ($payment->method) {
            'debit' => 'EDC_DEBIT',
            'transfer' => 'BANK_TRANSFER',
            'qris' => 'QRIS_POS',
            default => 'CASH',
        }));

        return [
            'external_id' => $payment->payment_reference,
            'gateway_transaction_id' => $payment->payment_reference,
            'checkout_url' => null,
            'qr_string' => null,
            'channel' => $channel,
            'expired_at' => Carbon::now('Asia/Jakarta')->addHours(12),
            'mode' => 'manual_pos',
            'is_sandbox' => false,
            'raw_response' => [
                'driver' => 'manual',
                'channel' => $channel,
            ],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function checkTransactionStatus(Payment $payment): ?array
    {
        return null;
    }

    public function verifyWebhookSignature(Request $request, ?Payment $payment = null): bool
    {
        return false;
    }

    /**
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
        return [
            'external_id' => '',
            'order_number' => '',
            'payment_reference' => '',
            'gateway_transaction_id' => '',
            'status' => 'pending',
            'amount' => 0.0,
            'method' => null,
            'channel' => null,
            'paid_at' => null,
            'raw' => [],
        ];
    }
}
