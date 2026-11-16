<?php

namespace App\Services\Payments\Contracts;

use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\Request;

interface PaymentGatewayInterface
{
    /**
     * Nama driver gateway ('xendit', 'midtrans', 'manual').
     */
    public function driverName(): string;

    /**
     * Apakah kredensial API gateway aktif di environment saat ini.
     */
    public function isConfigured(): bool;

    /**
     * Inisiasi pembuatan transaksi / invoice / QRIS ke API Payment Gateway.
     *
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function createTransaction(Order $order, Payment $payment, array $options = []): array;

    /**
     * Cek status terbaru dari API gateway untuk rekonsiliasi / polling.
     *
     * @return array<string, mixed>|null
     */
    public function checkTransactionStatus(Payment $payment): ?array;

    /**
     * Verifikasi signature / token callback webhook resmi dari gateway.
     */
    public function verifyWebhookSignature(Request $request, ?Payment $payment = null): bool;

    /**
     * Normalisasi payload webhook gateway ke struktur standar SideOrder.
     *
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
    public function parseWebhookPayload(Request $request): array;
}
