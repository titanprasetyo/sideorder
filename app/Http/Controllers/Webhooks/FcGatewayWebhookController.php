<?php

namespace App\Http\Controllers\Webhooks;

use App\Exceptions\PaymentGatewayException;
use App\Http\Controllers\Controller;
use App\Services\Payments\FcGatewayClient;
use App\Services\Payments\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class FcGatewayWebhookController extends Controller
{
    public function __construct(
        private readonly PaymentService $paymentService,
        private readonly FcGatewayClient $fcGatewayClient,
    ) {}

    /**
     * Terima notifikasi webhook/callback status pembayaran dari FCGateway.
     */
    public function handle(Request $request): JsonResponse
    {
        $configuredSecret = $this->fcGatewayClient->webhookSecret();
        $isSecretVerified = false;
        if ($configuredSecret !== '') {
            $incomingSecret = (string) (
                $request->header('X-Gateway-Secret')
                ?? $request->header('X-Webhook-Secret')
                ?? $request->header('X-Callback-Token')
                ?? ''
            );

            if ($incomingSecret === '' || ! hash_equals($configuredSecret, $incomingSecret)) {
                Log::warning('FCGateway webhook rejected: invalid secret header', [
                    'ip' => $request->ip(),
                ]);

                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized webhook request.',
                ], 401);
            }

            $isSecretVerified = true;
        }

        $payload = $request->all();

        $orderId = isset($payload['order_id']) && is_scalar($payload['order_id'])
            ? trim((string) $payload['order_id'])
            : '';
        $transactionId = isset($payload['transaction_id']) && is_scalar($payload['transaction_id'])
            ? trim((string) $payload['transaction_id'])
            : '';
        $status = isset($payload['status']) && is_scalar($payload['status'])
            ? strtoupper(trim((string) $payload['status']))
            : '';

        Log::info('FCGateway webhook received', [
            'event' => $payload['event'] ?? null,
            'order_id' => $orderId,
            'transaction_id' => $transactionId,
            'status' => $status,
            'total_amount' => $payload['total_amount'] ?? null,
            'provider' => $payload['provider'] ?? null,
        ]);

        if (($orderId === '' && $transactionId === '') || $status === '') {
            return response()->json([
                'success' => false,
                'message' => 'Payload webhook tidak valid (order_id/transaction_id dan status wajib diisi).',
            ], 422);
        }

        try {
            $result = $this->paymentService->handleFcGatewayWebhook($payload, $isSecretVerified);

            return response()->json([
                'success' => true,
                'status' => $result['status'],
                'order_number' => $result['order']?->order_number,
                'payment_reference' => $result['payment']?->payment_reference,
            ]);
        } catch (PaymentGatewayException $e) {
            $code = (int) $e->getCode();
            $httpStatus = in_array($code, [400, 401, 403, 404, 422, 502, 503], true) ? $code : 422;

            Log::warning('FCGateway webhook handling failed', [
                'order_id' => $orderId,
                'transaction_id' => $transactionId,
                'status' => $status,
                'http_status' => $httpStatus,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], $httpStatus);
        }
    }
}
