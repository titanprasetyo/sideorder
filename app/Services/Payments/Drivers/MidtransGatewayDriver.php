<?php

namespace App\Services\Payments\Drivers;

use App\Exceptions\PaymentGatewayException;
use App\Models\Order;
use App\Models\Payment;
use App\Services\MidtransService;
use App\Services\Payments\Contracts\PaymentGatewayInterface;
use Carbon\Carbon;
use Illuminate\Http\Request;

class MidtransGatewayDriver implements PaymentGatewayInterface
{
    public function driverName(): string
    {
        return 'midtrans';
    }

    public function isConfigured(): bool
    {
        return MidtransService::isConfigured();
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function createTransaction(Order $order, Payment $payment, array $options = []): array
    {
        $externalId = $payment->external_id ?: $payment->payment_reference;
        $duration = max(300, (int) config('services.payment_gateway.invoice_duration_seconds', 900));
        $expiresAt = Carbon::now('Asia/Jakarta')->addSeconds($duration);

        if (! $this->isConfigured() && app()->environment('production')) {
            throw new PaymentGatewayException('Kredensial Midtrans (MIDTRANS_SERVER_KEY) belum dikonfigurasi pada server produksi.');
        }

        $snap = MidtransService::createSnapTransactionForPayment($order, $externalId, (float) $payment->amount);

        if ($this->isConfigured() && $snap['is_demo'] && app()->environment('production')) {
            throw new PaymentGatewayException('Gagal menginisiasi transaksi Snap ke server Midtrans.');
        }

        $isProduction = (bool) config('services.midtrans.is_production', false);

        return [
            'external_id' => $externalId,
            'gateway_transaction_id' => $snap['token'],
            'checkout_url' => $snap['redirect_url'] ?? route('order.payment', ['order_number' => $order->order_number]),
            'qr_string' => null,
            'channel' => strtoupper((string) ($payment->channel ?? 'QRIS')),
            'expired_at' => $expiresAt,
            'mode' => $snap['is_demo'] ? 'sandbox_slot' : ($isProduction ? 'production' : 'sandbox'),
            'is_sandbox' => $snap['is_demo'] ? true : ! $isProduction,
            'raw_response' => $snap,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function checkTransactionStatus(Payment $payment): ?array
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $lookupId = $payment->external_id ?: $payment->order->order_number;
        $status = MidtransService::checkTransactionStatus($lookupId);
        if (! is_array($status) || ! isset($status['transaction_status'])) {
            return null;
        }

        $txStatus = strtolower((string) $status['transaction_status']);
        $normalized = match ($txStatus) {
            'settlement', 'capture' => 'paid',
            'expire' => 'expired',
            'deny', 'cancel', 'failure' => 'failed',
            default => 'pending',
        };

        return [
            'normalized_status' => $normalized,
            'gateway_transaction_id' => isset($status['transaction_id']) ? (string) $status['transaction_id'] : $payment->gateway_transaction_id,
            'amount' => (float) ($status['gross_amount'] ?? $payment->amount),
            'channel' => strtoupper((string) ($status['payment_type'] ?? $payment->channel ?? 'QRIS')),
            'raw' => $status,
        ];
    }

    public function verifyWebhookSignature(Request $request, ?Payment $payment = null): bool
    {
        $orderId = (string) ($request->input('order_id') ?? $request->input('order_number') ?? '');
        $statusCode = (string) ($request->input('status_code') ?? '200');
        $grossAmount = (string) $request->input('gross_amount', '0');
        $signatureKey = (string) ($request->input('signature_key') ?? '');

        if ($orderId === '' || $signatureKey === '') {
            return false;
        }

        return MidtransService::verifySignature($orderId, $statusCode, $grossAmount, $signatureKey);
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
        /** @var array<string, mixed> $raw */
        $raw = $request->all();
        $externalId = (string) ($raw['order_id'] ?? $raw['order_number'] ?? '');
        $txStatus = strtolower((string) ($raw['transaction_status'] ?? $raw['status'] ?? ''));

        $normalizedStatus = match ($txStatus) {
            'paid', 'settlement', 'capture' => 'paid',
            'expire' => 'expired',
            'failed', 'deny', 'cancel' => 'failed',
            'refund', 'refunded' => 'refund',
            default => 'pending',
        };

        return [
            'external_id' => $externalId,
            'order_number' => (string) ($raw['order_number'] ?? $externalId),
            'payment_reference' => $externalId,
            'gateway_transaction_id' => (string) ($raw['transaction_id'] ?? ('MID-'.$externalId)),
            'status' => $normalizedStatus,
            'amount' => (float) ($raw['gross_amount'] ?? 0),
            'method' => isset($raw['payment_type']) ? strtolower((string) $raw['payment_type']) : null,
            'channel' => isset($raw['payment_type']) ? strtoupper((string) $raw['payment_type']) : null,
            'paid_at' => isset($raw['settlement_time']) ? (string) $raw['settlement_time'] : (isset($raw['paid_at']) ? (string) $raw['paid_at'] : null),
            'raw' => $raw,
        ];
    }
}
