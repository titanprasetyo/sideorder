<?php

namespace App\Http\Controllers;

use App\Exceptions\PaymentGatewayException;
use App\Models\Order;
use App\Models\Payment;
use App\Services\Payments\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(
        private readonly PaymentService $paymentService,
    ) {}

    /**
     * Inisiasi transaksi pembayaran melalui slot Payment Gateway (default: Xendit).
     */
    public function initiate(Request $request, string $order_number): JsonResponse
    {
        $validated = $request->validate([
            'payment_method' => ['nullable', 'string', 'in:cash,qris,transfer,debit'],
            'channel' => ['nullable', 'string', 'max:50'],
            'gateway' => ['nullable', 'string', 'in:xendit,midtrans,manual'],
            'force_new' => ['nullable', 'boolean'],
        ]);

        $order = Order::where('order_number', $order_number)->firstOrFail();

        try {
            $result = $this->paymentService->initiatePayment(
                $order,
                isset($validated['payment_method']) ? (string) $validated['payment_method'] : null,
                isset($validated['channel']) ? (string) $validated['channel'] : null,
                isset($validated['gateway']) ? (string) $validated['gateway'] : null,
                (bool) ($validated['force_new'] ?? false),
            );
        } catch (PaymentGatewayException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'gateway' => $this->paymentService->getPublicGatewayConfig(),
            ], 422);
        }

        /** @var Order $updatedOrder */
        $updatedOrder = $result['order'];
        /** @var Payment|null $payment */
        $payment = $result['payment'];
        /** @var array<string, mixed>|null $gatewayResponse */
        $gatewayResponse = $result['gateway_response'];

        return response()->json([
            'success' => true,
            'already_paid' => $result['already_paid'],
            'reused' => $result['reused'],
            'gateway' => $this->paymentService->getPublicGatewayConfig(),
            'payment' => $payment ? $this->serializePublicPayment($payment, $gatewayResponse) : null,
            'order' => [
                'order_number' => $updatedOrder->order_number,
                'payment_status' => $updatedOrder->payment_status,
                'order_status' => $updatedOrder->order_status,
                'payment_method' => $updatedOrder->payment_method,
                'payment_gateway' => $updatedOrder->resolveEffectivePaymentGateway(),
                'payment_gateway_label' => $updatedOrder->resolvePaymentGatewayLabel(),
                'payment_channel' => $updatedOrder->payment_channel,
                'settled_amount' => $updatedOrder->getSettledAmount(),
                'unpaid_balance' => $updatedOrder->getUnpaidBalance(),
                'total_amount' => (float) $updatedOrder->total_amount,
            ],
        ]);
    }

    /**
     * Cek dan rekonsiliasi status transaksi pembayaran terbaru untuk pesanan terkait.
     */
    public function status(Request $request, string $order_number): JsonResponse
    {
        $order = Order::where('order_number', $order_number)
            ->with(['latestPayment', 'payments'])
            ->firstOrFail();

        $syncedOrder = $this->paymentService->syncPaymentStatus($order);
        $syncedOrder->load(['latestPayment', 'payments']);

        /** @var Payment|null $latestPayment */
        $latestPayment = $syncedOrder->latestPayment;

        return response()->json([
            'success' => true,
            'order_number' => $syncedOrder->order_number,
            'is_paid' => $syncedOrder->payment_status === 'paid',
            'payment_status' => $syncedOrder->payment_status,
            'order_status' => $syncedOrder->order_status,
            'payment_method' => $syncedOrder->payment_method,
            'payment_gateway' => $syncedOrder->resolveEffectivePaymentGateway(),
            'payment_gateway_label' => $syncedOrder->resolvePaymentGatewayLabel(),
            'payment_channel' => $syncedOrder->payment_channel,
            'settled_amount' => $syncedOrder->getSettledAmount(),
            'unpaid_balance' => $syncedOrder->getUnpaidBalance(),
            'total_amount' => (float) $syncedOrder->total_amount,
            'gateway' => $this->paymentService->getPublicGatewayConfig(),
            'latest_payment' => $latestPayment ? $this->serializePublicPayment($latestPayment) : null,
            'payments_count' => $syncedOrder->payments->count(),
        ]);
    }

    /**
     * Serialisasi metadata pembayaran tanpa mengekspos kredensial/rahasia gateway.
     *
     * @param  array<string, mixed>|null  $gatewayResponse
     * @return array<string, mixed>
     */
    private function serializePublicPayment(Payment $payment, ?array $gatewayResponse = null): array
    {
        $mode = $gatewayResponse['mode'] ?? ($payment->response_payload['mode'] ?? null);

        return [
            'payment_reference' => $payment->payment_reference,
            'gateway' => $payment->gateway,
            'gateway_label' => $payment->resolveGatewayLabel(),
            'method' => $payment->method,
            'channel' => $payment->channel,
            'channel_label' => $payment->resolveChannelLabel(),
            'type' => $payment->type,
            'amount' => (float) $payment->amount,
            'settled_amount' => (float) $payment->settled_amount,
            'status' => $payment->status,
            'external_id' => $payment->external_id,
            'gateway_transaction_id' => $payment->gateway_transaction_id,
            'checkout_url' => $payment->checkout_url,
            'qr_string' => $payment->qr_string,
            'expired_at' => $payment->expired_at?->toIso8601String(),
            'paid_at' => $payment->paid_at?->toIso8601String(),
            'mode' => is_string($mode) ? $mode : ($payment->gateway === 'manual' ? 'manual_pos' : 'sandbox_slot'),
        ];
    }
}
