<?php

namespace App\Http\Controllers;

use App\Events\OrderStatusUpdated;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentWebhookController extends Controller
{
    /**
     * Endpoint webhook/callback pembayaran terverifikasi dari Payment Gateway.
     * Memverifikasi signature HMAC, memvalidasi nominal tagihan dari database (tidak mempercayai frontend),
     * dan menerapkan idempotency / row locking agar webhook duplikat tidak menggandakan pendapatan.
     */
    public function handle(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_number' => ['required', 'string'],
            'status' => ['required', 'string', 'in:paid,settlement,capture,pending,failed,deny,expire,cancel,refund,refunded'],
            'gross_amount' => ['required', 'numeric', 'min:0'],
            'payment_type' => ['nullable', 'string', 'in:qris,transfer,debit,cash'],
            'transaction_id' => ['nullable', 'string', 'max:100'],
            'paid_at' => ['nullable', 'date'],
            'refund_amount' => ['nullable', 'numeric', 'min:0'],
            'reason' => ['nullable', 'string', 'max:500'],
            'signature' => ['nullable', 'string'],
        ]);

        $orderNumber = $validated['order_number'];
        $status = $validated['status'];
        $grossAmount = (float) $validated['gross_amount'];

        // 1. Verifikasi Signature Callback dari Backend
        $providedSignature = (string) ($request->header('X-Callback-Signature') ?? $validated['signature'] ?? '');
        $expectedSignature = self::generateSignature($orderNumber, $status, $grossAmount);

        if ($providedSignature === '' || ! hash_equals($expectedSignature, $providedSignature)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Signature callback pembayaran tidak valid.',
            ], 401);
        }

        // 2. Proses dengan Database Transaction & Row-Level Lock untuk mencegah race condition / duplikasi
        return DB::transaction(function () use ($validated, $orderNumber, $status, $grossAmount) {
            /** @var Order|null $order */
            $order = Order::where('order_number', $orderNumber)->lockForUpdate()->first();

            if (! $order) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Pesanan tidak ditemukan.',
                ], 404);
            }

            $expectedAmount = (float) $order->total_amount;

            // 3. Validasi nominal tagihan terhadap database (anti-manipulasi nominal)
            if (in_array($status, ['paid', 'settlement', 'capture'], true) && abs($grossAmount - $expectedAmount) > 0.01) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Nominal pembayaran callback tidak sesuai dengan total tagihan pesanan di database.',
                ], 422);
            }

            $paymentMethod = $validated['payment_type'] ?? $order->payment_method ?? 'qris';
            $transactionId = $validated['transaction_id'] ?? ('GW-'.$order->order_number);

            // 4. Penanganan Pembayaran Berhasil (Idempotent terhadap webhook duplikat/retry)
            if (in_array($status, ['paid', 'settlement', 'capture'], true)) {
                if ($order->payment_status === 'paid') {
                    return response()->json([
                        'status' => 'ok',
                        'already_processed' => true,
                        'message' => 'Pembayaran sudah tercatat lunas sebelumnya (webhook duplikat diabaikan).',
                        'order_number' => $order->order_number,
                    ], 200);
                }

                if ($order->order_status === 'cancelled') {
                    return response()->json([
                        'status' => 'error',
                        'message' => 'Pesanan sudah dibatalkan dan tidak dapat dikonfirmasi pembayarannya.',
                    ], 409);
                }

                $previousOrderStatus = $order->order_status;
                $newOrderStatus = $order->order_status === 'pending' ? 'processing' : $order->order_status;
                $paidAt = ! empty($validated['paid_at'])
                    ? Carbon::parse($validated['paid_at'])->timezone('Asia/Jakarta')
                    : now('Asia/Jakarta');

                $order->update([
                    'payment_status' => 'paid',
                    'payment_method' => $paymentMethod,
                    'paid_at' => $paidAt,
                    'payment_reference' => $transactionId,
                    'cash_received' => $expectedAmount,
                    'change_amount' => 0,
                    'order_status' => $newOrderStatus,
                ]);

                OrderStatusHistory::create([
                    'order_id' => $order->id,
                    'user_id' => null,
                    'status' => $newOrderStatus,
                    'notes' => 'Pembayaran gateway ('.strtoupper($paymentMethod).") terverifikasi otomatis. Ref: {$transactionId}",
                ]);

                try {
                    event(new OrderStatusUpdated($order, $previousOrderStatus, $newOrderStatus));
                } catch (\Throwable) {
                }

                return response()->json([
                    'status' => 'ok',
                    'already_processed' => false,
                    'message' => 'Pembayaran berhasil diverifikasi.',
                    'order_number' => $order->order_number,
                ], 200);
            }

            // 5. Penanganan Refund
            if (in_array($status, ['refund', 'refunded'], true)) {
                if ($order->payment_status === 'refunded') {
                    return response()->json([
                        'status' => 'ok',
                        'already_processed' => true,
                        'message' => 'Refund sudah tercatat sebelumnya.',
                    ], 200);
                }

                $refundAmount = isset($validated['refund_amount'])
                    ? min($expectedAmount, (float) $validated['refund_amount'])
                    : $expectedAmount;
                $reason = $validated['reason'] ?? 'Pengembalian dana (refund) terverifikasi melalui gateway';

                $order->update([
                    'payment_status' => $refundAmount >= $expectedAmount ? 'refunded' : 'paid',
                    'refunded_amount' => $refundAmount,
                    'refunded_at' => now('Asia/Jakarta'),
                    'refund_reason' => $reason,
                ]);

                OrderStatusHistory::create([
                    'order_id' => $order->id,
                    'user_id' => null,
                    'status' => $order->order_status,
                    'notes' => 'Refund sebesar Rp '.number_format($refundAmount, 0, ',', '.')." tercatat. Alasan: {$reason}",
                ]);

                return response()->json([
                    'status' => 'ok',
                    'already_processed' => false,
                    'message' => 'Refund berhasil dicatat.',
                ], 200);
            }

            // 6. Penanganan Pembayaran Gagal / Kedaluwarsa / Ditolak
            if (in_array($status, ['failed', 'deny', 'expire', 'cancel'], true)) {
                // Jangan pernah menimpa transaksi yang sudah berhasil dibayar
                if ($order->payment_status === 'paid') {
                    return response()->json([
                        'status' => 'ok',
                        'already_processed' => true,
                        'message' => 'Transaksi sudah lunas, status gagal diabaikan.',
                    ], 200);
                }

                if ($order->payment_status === 'failed') {
                    return response()->json([
                        'status' => 'ok',
                        'already_processed' => true,
                        'message' => 'Status gagal sudah tercatat sebelumnya.',
                    ], 200);
                }

                $order->update([
                    'payment_status' => 'failed',
                ]);

                OrderStatusHistory::create([
                    'order_id' => $order->id,
                    'user_id' => null,
                    'status' => $order->order_status,
                    'notes' => "Pembayaran gagal/kedaluwarsa ({$status}) dari gateway.",
                ]);

                return response()->json([
                    'status' => 'ok',
                    'already_processed' => false,
                    'message' => 'Status pembayaran gagal berhasil dicatat.',
                ], 200);
            }

            return response()->json([
                'status' => 'ok',
                'already_processed' => true,
                'message' => 'Status pending diterima.',
            ], 200);
        });
    }

    /**
     * Hasilkan HMAC-SHA256 signature untuk verifikasi callback pembayaran.
     */
    public static function generateSignature(string $orderNumber, string $status, float|string $grossAmount): string
    {
        $secret = (string) config('services.payment_gateway.webhook_secret', config('app.key'));
        $normalizedAmount = number_format((float) $grossAmount, 2, '.', '');

        return hash_hmac('sha256', "{$orderNumber}|{$status}|{$normalizedAmount}", $secret);
    }
}
