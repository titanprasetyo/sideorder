<?php

namespace App\Services\Payments;

use App\Events\OrderStatusUpdated;
use App\Exceptions\PaymentGatewayException;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use App\Services\Stock\MenuStockService;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PaymentService
{
    public function __construct(
        private readonly MenuStockService $menuStockService,
    ) {}

    public function defaultGatewayName(): string
    {
        return 'manual';
    }

    public function resolveGatewayForMethod(string $method): string
    {
        return 'manual';
    }

    public function resolveDefaultChannelForMethod(string $method, ?string $requestedChannel = null): string
    {
        if ($requestedChannel !== null && trim($requestedChannel) !== '') {
            return strtoupper(trim($requestedChannel));
        }

        return match ($method) {
            'qris' => 'QRIS_POS',
            'transfer' => 'BANK_TRANSFER',
            'debit' => 'EDC_DEBIT',
            default => 'CASH',
        };
    }

    /**
     * Metadata non-rahasia status pembayaran untuk antarmuka frontend dan laporan.
     * Payment gateway digital belum diintegrasikan (menunggu dokumentasi Midtrans).
     *
     * @return array{
     *     driver: string,
     *     label: string,
     *     is_configured: bool,
     *     is_webhook_configured: bool,
     *     is_ready: bool,
     *     mode: string,
     *     supported_channels: list<string>,
     *     webhook_endpoint: string|null
     * }
     */
    public function getPublicGatewayConfig(): array
    {
        return [
            'driver' => 'manual',
            'label' => 'Kasir POS (Tunai)',
            'is_configured' => false,
            'is_webhook_configured' => false,
            'is_ready' => false,
            'mode' => 'manual_only',
            'supported_channels' => ['CASH'],
            'webhook_endpoint' => null,
        ];
    }

    /**
     * Pastikan pembayaran lunas historis (sebelum tabel payments atau seeding langsung) tercatat pada ledger `payments`.
     */
    public function ensureLegacySettlementLedgered(Order $lockedOrder): void
    {
        if ($lockedOrder->payments()->where('status', 'paid')->exists()) {
            return;
        }

        $settled = 0.0;
        if ($lockedOrder->payment_status === 'paid') {
            $settled = max(0.0, (float) $lockedOrder->total_amount - (float) ($lockedOrder->refunded_amount ?? 0));
        } elseif ($lockedOrder->paid_at !== null && $lockedOrder->cash_received !== null) {
            $netCash = max(0.0, (float) $lockedOrder->cash_received - (float) ($lockedOrder->change_amount ?? 0));
            $settled = min((float) $lockedOrder->total_amount, $netCash);
        }

        if ($settled <= 0) {
            return;
        }

        $method = $lockedOrder->payment_method ?: 'cash';
        $gateway = $lockedOrder->payment_gateway ?: $this->resolveGatewayForMethod($method);
        $channel = $lockedOrder->payment_channel ?: $this->resolveDefaultChannelForMethod($method);
        $reference = $lockedOrder->payment_reference ?: ('LEG-'.$lockedOrder->order_number);

        $existingRef = Payment::where('payment_reference', $reference)->first();
        if ($existingRef) {
            return;
        }

        Payment::create([
            'order_id' => $lockedOrder->id,
            'payment_reference' => $reference,
            'gateway' => $gateway,
            'method' => $method,
            'channel' => $channel,
            'type' => 'initial',
            'amount' => $settled,
            'settled_amount' => $settled,
            'cash_received' => $lockedOrder->cash_received !== null ? (float) $lockedOrder->cash_received : $settled,
            'change_amount' => $lockedOrder->change_amount !== null ? (float) $lockedOrder->change_amount : 0.0,
            'fee_amount' => 0.0,
            'status' => 'paid',
            'external_id' => $reference,
            'gateway_transaction_id' => $reference,
            'paid_at' => $lockedOrder->paid_at ?? now('Asia/Jakarta'),
            'confirmed_by' => $lockedOrder->confirmed_by,
        ]);
    }

    /**
     * Konfirmasi pembayaran langsung oleh kasir/barista di panel POS.
     *
     * @param  array<string, mixed>  $payload
     * @return array{
     *     already_paid: bool,
     *     order: Order,
     *     payment: Payment|null,
     *     previous_status: string
     * }
     */
    public function confirmCashierPayment(
        Order $order,
        int $cashierUserId,
        string $cashierName,
        array $payload = []
    ): array {
        $paymentMethod = strtolower(trim((string) ($payload['payment_method'] ?? 'cash')));
        if (! in_array($paymentMethod, ['cash', 'qris', 'transfer', 'debit'], true)) {
            $paymentMethod = 'cash';
        }

        $alreadyPaid = false;
        $previousOrderStatus = $order->order_status;
        $settledPayment = null;

        /** @var Order $updatedOrder */
        $updatedOrder = DB::transaction(function () use (
            $order,
            $cashierUserId,
            $cashierName,
            $paymentMethod,
            $payload,
            &$alreadyPaid,
            &$previousOrderStatus,
            &$settledPayment
        ): Order {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $previousOrderStatus = $lockedOrder->order_status;

            // Kunci baris item aktif agar penambahan susulan konkuren tidak menyelip sebelum settlement selesai
            $lockedActiveItems = $lockedOrder->items()
                ->where('status', 'active')
                ->lockForUpdate()
                ->get();

            if ($lockedOrder->payment_status === 'paid' && $lockedOrder->getUnpaidBalance() <= 0.01 && ! $lockedOrder->hasUnpaidActiveItems()) {
                if ($lockedOrder->order_status === 'pending') {
                    $lockedOrder->update(['order_status' => 'processing']);
                }
                $alreadyPaid = true;

                return $lockedOrder->fresh(['table', 'items.options', 'items.servedByUser:id,name', 'latestPayment']) ?? $lockedOrder;
            }

            if (in_array($lockedOrder->order_status, ['completed', 'cancelled'], true)) {
                throw new PaymentGatewayException("Pesanan #{$lockedOrder->order_number} berstatus {$lockedOrder->order_status} dan tidak dapat diubah pembayarannya.");
            }

            if ($lockedOrder->payment_method === 'qris' || $paymentMethod === 'qris') {
                throw new PaymentGatewayException("Pesanan #{$lockedOrder->order_number} menggunakan metode QRIS. Silakan alihkan pesanan ke Tunai di Kasir terlebih dahulu sebelum dikonfirmasi.");
            }

            $this->ensureLegacySettlementLedgered($lockedOrder);
            $this->menuStockService->confirmOrderStock($lockedOrder);

            $previouslySettled = $lockedOrder->getSettledAmount();
            $itemsTotal = $lockedActiveItems->isNotEmpty()
                ? (float) $lockedActiveItems->sum('total_price')
                : (float) $lockedOrder->total_amount;
            $expectedTotal = max((float) $lockedOrder->total_amount, $itemsTotal);
            $remainingDue = max(0.0, $expectedTotal - $previouslySettled);
            $newOrderStatus = $lockedOrder->order_status === 'pending' ? 'processing' : $lockedOrder->order_status;
            $rawCashInput = isset($payload['cash_received']) ? (float) $payload['cash_received'] : null;

            if ($previouslySettled > 0 && $remainingDue > 0) {
                $txDue = $remainingDue;
                if ($paymentMethod === 'cash' && $rawCashInput !== null && $rawCashInput > 0) {
                    $changeAmount = max(0.0, $rawCashInput - $remainingDue);
                    $cashReceived = $previouslySettled + $rawCashInput;
                    $txCash = $rawCashInput;
                } else {
                    $cashReceived = $expectedTotal;
                    $changeAmount = 0.0;
                    $txCash = $remainingDue;
                }
            } else {
                $txDue = $expectedTotal;
                $cashReceived = $paymentMethod === 'cash' && $rawCashInput !== null && $rawCashInput > 0
                    ? $rawCashInput
                    : $expectedTotal;
                $changeAmount = $paymentMethod === 'cash'
                    ? max(0.0, $cashReceived - $expectedTotal)
                    : 0.0;
                $txCash = $cashReceived;
            }

            $resolvedGateway = 'manual';
            $resolvedChannel = $this->resolveDefaultChannelForMethod($paymentMethod);

            $providedRef = isset($payload['payment_reference']) && trim((string) $payload['payment_reference']) !== ''
                ? trim((string) $payload['payment_reference'])
                : null;
            $orderRef = $providedRef ?? $lockedOrder->payment_reference ?? ('POS-'.$lockedOrder->order_number);

            /** @var Payment|null $pendingPayment */
            $pendingPayment = $lockedOrder->payments()
                ->where('status', 'pending')
                ->where('method', $paymentMethod)
                ->latest('id')
                ->first();

            $nowWib = now('Asia/Jakarta');

            if ($pendingPayment && abs((float) $pendingPayment->amount - $txDue) < 0.01) {
                $pendingPayment->update([
                    'gateway' => $resolvedGateway,
                    'channel' => $resolvedChannel,
                    'settled_amount' => $txDue,
                    'cash_received' => $txCash,
                    'change_amount' => $changeAmount,
                    'status' => 'paid',
                    'paid_at' => $nowWib,
                    'confirmed_by' => $cashierUserId,
                    'gateway_transaction_id' => $providedRef ?? $pendingPayment->gateway_transaction_id ?? $pendingPayment->payment_reference,
                ]);
                $settledPayment = $pendingPayment->fresh();
            } else {
                $lockedOrder->payments()
                    ->where('status', 'pending')
                    ->update(['status' => 'expired']);

                $txRef = $providedRef && ! Payment::where('payment_reference', $providedRef)->exists()
                    ? $providedRef
                    : $this->generateUniquePaymentReference($lockedOrder->order_number);

                $settledPayment = Payment::create([
                    'order_id' => $lockedOrder->id,
                    'payment_reference' => $txRef,
                    'gateway' => $resolvedGateway,
                    'method' => $paymentMethod,
                    'channel' => $resolvedChannel,
                    'type' => $previouslySettled > 0 ? 'additional' : 'initial',
                    'amount' => $txDue,
                    'settled_amount' => $txDue,
                    'cash_received' => $txCash,
                    'change_amount' => $changeAmount,
                    'fee_amount' => 0.0,
                    'status' => 'paid',
                    'external_id' => $txRef,
                    'gateway_transaction_id' => $txRef,
                    'paid_at' => $nowWib,
                    'confirmed_by' => $cashierUserId,
                ]);
            }

            $lockedOrder->update([
                'subtotal' => $expectedTotal,
                'total_amount' => $expectedTotal,
                'payment_status' => 'paid',
                'payment_method' => $paymentMethod,
                'payment_gateway' => $resolvedGateway,
                'payment_channel' => $resolvedChannel,
                'paid_at' => $lockedOrder->paid_at ?? $nowWib,
                'payment_reference' => $orderRef,
                'cash_received' => $cashReceived,
                'change_amount' => $changeAmount,
                'confirmed_by' => $cashierUserId,
                'order_status' => $newOrderStatus,
            ]);

            $this->allocatePaidStatusToActiveItems(
                $lockedOrder,
                $settledPayment,
                $expectedTotal,
                true,
                $nowWib,
            );

            $methodLabel = match ($paymentMethod) {
                'transfer' => 'Transfer Bank',
                'debit' => 'Kartu Debit',
                default => 'Tunai',
            };

            if ($previouslySettled > 0 && $remainingDue > 0) {
                $remainingFormatted = number_format($remainingDue, 0, ',', '.');
                $totalFormatted = number_format($expectedTotal, 0, ',', '.');
                $notes = "Pembayaran tagihan menu tambahan sebesar Rp {$remainingFormatted} via {$methodLabel} diterima & dikonfirmasi oleh staf {$cashierName}. Total lunas: Rp {$totalFormatted}.";
            } else {
                $notes = "Pembayaran via {$methodLabel} diterima & dikonfirmasi oleh staf {$cashierName}.";
                if ($paymentMethod === 'cash' && $rawCashInput !== null && $rawCashInput > 0) {
                    $cashReceivedFormatted = number_format($cashReceived, 0, ',', '.');
                    $changeFormatted = number_format($changeAmount, 0, ',', '.');
                    $notes .= " (Uang: Rp {$cashReceivedFormatted}, Kembalian: Rp {$changeFormatted})";
                }
            }

            OrderStatusHistory::create([
                'order_id' => $lockedOrder->id,
                'user_id' => $cashierUserId,
                'status' => $newOrderStatus,
                'notes' => $notes,
            ]);

            return $lockedOrder->fresh(['table', 'items.options', 'items.servedByUser:id,name', 'latestPayment']) ?? $lockedOrder;
        });

        if (! $alreadyPaid) {
            try {
                event(new OrderStatusUpdated($updatedOrder, $previousOrderStatus, $updatedOrder->order_status));
            } catch (\Throwable) {
            }
        }

        return [
            'already_paid' => $alreadyPaid,
            'order' => $updatedOrder,
            'payment' => $settledPayment,
            'previous_status' => $previousOrderStatus,
        ];
    }

    /**
     * Kedaluwarsakan secara lokal transaksi pending non-tunai yang melewati `expired_at`
     * dan kembalikan stok menu terbatas yang masih berstatus reserved.
     */
    public function expireOverduePendingPayments(?Order $targetOrder = null): bool
    {
        $now = now('Asia/Jakarta');

        $query = Payment::query()
            ->where('status', 'pending')
            ->whereNotNull('expired_at')
            ->where('expired_at', '<=', $now)
            ->where(function ($q): void {
                $q->where('gateway', '!=', 'manual')
                    ->orWhereIn('method', ['qris', 'transfer']);
            });

        if ($targetOrder !== null) {
            $query->where('order_id', $targetOrder->id);
        }

        $overdueIds = $query->orderBy('id')->pluck('id');
        if ($overdueIds->isEmpty()) {
            return false;
        }

        $didChange = false;

        foreach ($overdueIds as $paymentId) {
            $updatedOrder = DB::transaction(function () use ($paymentId): ?Order {
                /** @var Payment|null $lockedPayment */
                $lockedPayment = Payment::whereKey($paymentId)->lockForUpdate()->first();
                if (! $lockedPayment || $lockedPayment->status !== 'pending') {
                    return null;
                }

                /** @var Order|null $lockedOrder */
                $lockedOrder = Order::whereKey($lockedPayment->order_id)->lockForUpdate()->first();
                if (! $lockedOrder || $lockedOrder->order_status === 'cancelled') {
                    return null;
                }

                $lockedPayment->update(['status' => 'expired']);

                if ($lockedOrder->payment_status === 'paid') {
                    return null;
                }

                $hasOtherPending = $lockedOrder->payments()
                    ->where('status', 'pending')
                    ->where('id', '!=', $lockedPayment->id)
                    ->exists();

                if (! $hasOtherPending) {
                    if (! $lockedOrder->hasAnySettlement()) {
                        $lockedOrder->update(['payment_status' => 'failed']);
                    }
                    $this->menuStockService->releaseUnsettledOrderStock($lockedOrder);
                }

                OrderStatusHistory::create([
                    'order_id' => $lockedOrder->id,
                    'user_id' => null,
                    'status' => $lockedOrder->order_status,
                    'notes' => 'Batas waktu transaksi pembayaran digital telah kedaluwarsa.',
                ]);

                return $lockedOrder->fresh(['table', 'latestPayment']);
            });

            if ($updatedOrder instanceof Order) {
                $didChange = true;
                try {
                    event(new OrderStatusUpdated($updatedOrder, $updatedOrder->order_status, $updatedOrder->order_status));
                } catch (\Throwable) {
                }
            }
        }

        return $didChange;
    }

    /**
     * Sinkronisasi status kedaluwarsa lokal untuk pesanan terkait.
     */
    public function syncPaymentStatus(Order $order): Order
    {
        if (
            $order->order_status === 'cancelled'
            || ($order->payment_status === 'paid' && $order->getUnpaidBalance() <= 0.01 && ! $order->hasUnpaidActiveItems())
        ) {
            return $order;
        }

        if ($this->expireOverduePendingPayments($order)) {
            return $order->fresh(['table', 'items.options', 'items.rejectedByUser:id,name', 'items.servedByUser:id,name', 'statusHistories', 'latestPayment', 'payments']) ?? $order;
        }

        return $order;
    }

    private function generateUniquePaymentReference(string $orderNumber): string
    {
        do {
            $candidate = 'PAY-'.substr(preg_replace('/[^A-Z0-9]/', '', strtoupper($orderNumber)) ?: 'SO', -6).'-'.strtoupper(Str::random(6));
        } while (Payment::where('payment_reference', $candidate)->exists());

        return $candidate;
    }

    /**
     * Tandai status pembayaran pada baris `order_items` secara deterministik:
     * - Jika seluruh tagihan pesanan lunas: seluruh item aktif ditandai `paid`.
     * - Jika baru sebagian terbayar (misal susulan masuk bersamaan): alokasi berurutan berdasarkan batch & ID.
     */
    private function allocatePaidStatusToActiveItems(
        Order $order,
        ?Payment $settledPayment,
        float $totalPaidAmount,
        bool $isFullySettled,
        CarbonInterface $paidAt
    ): void {
        if ($isFullySettled) {
            $order->items()
                ->where('status', 'active')
                ->where('payment_status', '!=', OrderItem::PAYMENT_PAID)
                ->update([
                    'payment_status' => OrderItem::PAYMENT_PAID,
                    'payment_id' => $settledPayment?->id,
                    'paid_at' => $paidAt,
                ]);

            return;
        }

        $activeItems = $order->items()
            ->where('status', 'active')
            ->orderBy('batch_number', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        $alreadyPaidTotal = (float) $activeItems
            ->where('payment_status', OrderItem::PAYMENT_PAID)
            ->sum('total_price');
        $remainingBudget = max(0.0, $totalPaidAmount - $alreadyPaidTotal);

        foreach ($activeItems as $item) {
            if ($item->isPaid()) {
                continue;
            }

            $itemTotal = (float) $item->total_price;
            if ($remainingBudget + 0.01 >= $itemTotal) {
                $remainingBudget = max(0.0, $remainingBudget - $itemTotal);
                $item->update([
                    'payment_status' => OrderItem::PAYMENT_PAID,
                    'payment_id' => $settledPayment?->id,
                    'paid_at' => $paidAt,
                ]);
            } else {
                break;
            }
        }
    }
}
