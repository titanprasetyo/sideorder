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
     * Terima notifikasi webhook/callback status pembayaran dari FCGateway & Midtrans.
     * Memverifikasi signature HMAC-SHA256 melalui header `X-FC-Signature`.
     */
    public function handle(Request $request): JsonResponse
    {
        $isSignatureVerified = false;
        if ($this->fcGatewayClient->isWebhookSecretConfigured()) {
            $incomingSignature = (string) $request->header('X-FC-Signature', '');
            $rawContent = $request->getContent();

            if (! $this->fcGatewayClient->verifyWebhookSignature($rawContent, $incomingSignature)) {
                Log::warning('FCGateway webhook rejected: invalid X-FC-Signature', [
                    'ip' => $request->ip(),
                    'has_signature' => $incomingSignature !== '',
                ]);

                return response()->json([
                    'error' => 'Invalid signature',
                    'success' => false,
                ], 401);
            }

            $isSignatureVerified = true;
        }

        $payload = $request->all();
        $data = isset($payload['data']) && is_array($payload['data']) ? $payload['data'] : [];

        $merchantOrderId = $this->extractFirstString([$payload['merchant_order_id'] ?? null, $payload['order_id'] ?? null, $data['merchant_order_id'] ?? null, $data['order_id'] ?? null]);
        $referenceId = $this->extractFirstString([$payload['reference_id'] ?? null, $payload['transaction_id'] ?? null, $data['reference_id'] ?? null, $data['transaction_id'] ?? null]);
        $status = strtoupper($this->extractFirstString([$payload['status'] ?? null, $payload['transaction_status'] ?? null, $data['status'] ?? null, $data['transaction_status'] ?? null]));

        Log::info('FCGateway Midtrans webhook received', [
            'event' => $payload['event'] ?? null,
            'merchant_order_id' => $merchantOrderId,
            'reference_id' => $referenceId,
            'status' => $status,
            'amount' => $payload['amount'] ?? $data['amount'] ?? null,
            'gateway' => $payload['gateway'] ?? $data['gateway'] ?? null,
            'payment_method' => $payload['payment_method'] ?? $data['payment_method'] ?? null,
            'signature_verified' => $isSignatureVerified,
        ]);

        if (($merchantOrderId === '' && $referenceId === '') || $status === '') {
            return response()->json([
                'success' => false,
                'message' => 'Payload webhook tidak valid (merchant_order_id/reference_id dan status wajib diisi).',
            ], 422);
        }

        try {
            $result = $this->paymentService->handleFcGatewayWebhook($payload, $isSignatureVerified);

            return response()->json([
                'status' => 'OK',
                'success' => true,
                'payment_status' => $result['status'],
                'order_number' => $result['order']?->order_number,
                'payment_reference' => $result['payment']?->payment_reference,
            ]);
        } catch (PaymentGatewayException $e) {
            $code = (int) $e->getCode();
            $httpStatus = in_array($code, [400, 401, 403, 404, 422, 502, 503], true) ? $code : 422;

            Log::warning('FCGateway Midtrans webhook handling failed', [
                'merchant_order_id' => $merchantOrderId,
                'reference_id' => $referenceId,
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

    /**
     * @param  list<mixed>  $candidates
     */
    private function extractFirstString(array $candidates): string
    {
        foreach ($candidates as $value) {
            if (is_scalar($value)) {
                $trimmed = trim((string) $value);
                if ($trimmed !== '') {
                    return $trimmed;
                }
            }
        }

        return '';
    }
}
