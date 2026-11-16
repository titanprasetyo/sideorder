<?php

namespace App\Http\Controllers;

use App\Services\Payments\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentWebhookController extends Controller
{
    public function __construct(
        private readonly PaymentService $paymentService,
    ) {}

    /**
     * Endpoint webhook/callback pembayaran terverifikasi dari Payment Gateway (Xendit, Midtrans, & HMAC Internal).
     * Fail-closed: seluruh webhook dengan token/signature tidak valid langsung ditolak HTTP 401 di semua environment.
     */
    public function handle(Request $request, ?string $driver = null): JsonResponse
    {
        $verification = $this->paymentService->verifyAndParseWebhook($request, $driver);

        if (! $verification['verified']) {
            return response()->json([
                'status' => 'error',
                'message' => 'Signature atau token callback pembayaran tidak valid atau tidak terverifikasi.',
            ], 401);
        }

        $result = $this->paymentService->processGatewayCallback(
            $verification['payload'],
            $verification['driver'],
        );

        $responsePayload = [
            'status' => $result['status'],
            'gateway' => $verification['driver'],
            'already_processed' => $result['already_processed'],
            'message' => $result['message'],
        ];

        if ($result['order'] !== null) {
            $responsePayload['order_number'] = $result['order']->order_number;
        }

        return response()->json($responsePayload, $result['http_status']);
    }

    /**
     * Hasilkan HMAC-SHA256 signature untuk verifikasi callback pembayaran internal.
     */
    public static function generateSignature(string $orderNumber, string $status, float|string $grossAmount): string
    {
        return PaymentService::generateHmacSignature($orderNumber, $status, $grossAmount);
    }
}
