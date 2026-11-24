<?php

namespace App\Services\Payments;

use App\Events\OrderStatusUpdated;
use App\Exceptions\PaymentGatewayException;
use App\Models\CafeSetting;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use App\Services\Payments\Contracts\PaymentGatewayInterface;
use App\Services\Payments\Drivers\ManualPaymentDriver;
use App\Services\Payments\Drivers\MidtransGatewayDriver;
use App\Services\Payments\Drivers\XenditGatewayDriver;
use App\Services\Stock\MenuStockService;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PaymentService
{
    public function __construct(
        private readonly XenditGatewayDriver $xenditDriver,
        private readonly MidtransGatewayDriver $midtransDriver,
        private readonly ManualPaymentDriver $manualDriver,
        private readonly MenuStockService $menuStockService,
    ) {}

    public function defaultGatewayName(): string
    {
        $configured = strtolower(trim((string) config('services.payment_gateway.default_driver', 'xendit')));

        return in_array($configured, ['xendit', 'midtrans', 'manual'], true) ? $configured : 'xendit';
    }

    public function driver(?string $name = null): PaymentGatewayInterface
    {
        $resolved = strtolower(trim((string) ($name ?: $this->defaultGatewayName())));

        return match ($resolved) {
            'midtrans' => $this->midtransDriver,
            'manual' => $this->manualDriver,
            default => $this->xenditDriver,
        };
    }

    public function resolveGatewayForMethod(string $method, ?string $preferredGateway = null): string
    {
        $normalizedPreferred = $preferredGateway !== null ? strtolower(trim($preferredGateway)) : null;

        if ($normalizedPreferred !== null && in_array($normalizedPreferred, ['xendit', 'midtrans', 'manual'], true)) {
            if (in_array($method, ['qris', 'transfer'], true) || $normalizedPreferred === 'manual') {
                return $normalizedPreferred;
            }
        }

        if (in_array($method, ['cash', 'debit'], true)) {
            return 'manual';
        }

        $default = $this->defaultGatewayName();

        return $default === 'manual' ? 'xendit' : $default;
    }

    public function resolveDefaultChannelForMethod(string $method, ?string $requestedChannel = null): string
    {
        if ($requestedChannel !== null && trim($requestedChannel) !== '') {
            return strtoupper(trim($requestedChannel));
        }

        return match ($method) {
            'qris' => 'QRIS',
            'transfer' => 'VIRTUAL_ACCOUNT',
            'debit' => 'EDC_DEBIT',
            default => 'CASH',
        };
    }

    /**
     * Metadata non-rahasia konfigurasi gateway untuk antarmuka frontend dan laporan.
     *
     * @return array{
     *     driver: string,
     *     label: string,
     *     is_configured: bool,
     *     is_webhook_configured: bool,
     *     is_ready: bool,
     *     mode: string,
     *     supported_channels: list<string>,
     *     webhook_endpoint: string
     * }
     */
    public function getPublicGatewayConfig(): array
    {
        $defaultDriver = $this->defaultGatewayName();
        $driver = $this->driver($defaultDriver);
        $isConfigured = $driver->isConfigured();
        $isWebhookConfigured = match ($defaultDriver) {
            'xendit' => $this->xenditDriver->isWebhookConfigured(),
            'midtrans' => $this->midtransDriver->isConfigured(),
            default => true,
        };
        $isProduction = match ($defaultDriver) {
            'xendit' => (bool) config('services.xendit.is_production', false),
            'midtrans' => (bool) config('services.midtrans.is_production', false),
            default => false,
        };

        $mode = $defaultDriver === 'manual'
            ? 'manual_pos'
            : ($isConfigured ? ($isProduction ? 'production' : 'sandbox') : 'sandbox_slot');

        return [
            'driver' => $defaultDriver,
            'label' => match ($defaultDriver) {
                'xendit' => 'Pembayaran Digital',
                'midtrans' => 'Midtrans Snap',
                default => 'Kasir POS',
            },
            'is_configured' => $isConfigured,
            'is_webhook_configured' => $isWebhookConfigured,
            'is_ready' => $isConfigured && $isWebhookConfigured,
            'mode' => $mode,
            'supported_channels' => ['QRIS', 'CASH'],
            'webhook_endpoint' => route('payments.webhook', $defaultDriver !== 'manual' ? ['driver' => $defaultDriver] : [], false),
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
     * Membuat atau mengambil sesi transaksi pembayaran aktif pada gateway yang dipilih (Xendit / Midtrans / Manual).
     *
     * @return array{
     *     already_paid: bool,
     *     is_expired: bool,
     *     reused: bool,
     *     order: Order,
     *     payment: Payment|null,
     *     gateway_response: array<string, mixed>|null
     * }
     */
    public function initiatePayment(
        Order $order,
        ?string $method = null,
        ?string $channel = null,
        ?string $preferredGateway = null,
        bool $forceNew = false
    ): array {
        $resolvedMethod = strtolower(trim((string) ($method ?: ($order->payment_method ?: 'qris'))));
        if (! in_array($resolvedMethod, ['cash', 'qris', 'transfer', 'debit'], true)) {
            $resolvedMethod = 'qris';
        }

        $setting = CafeSetting::current();
        if ($resolvedMethod === 'cash' && ! $setting->allow_cash_payment) {
            throw new PaymentGatewayException('Metode pembayaran tunai sedang dinonaktifkan oleh manajemen kafe. Silakan pilih pembayaran digital.');
        }

        if (in_array($resolvedMethod, ['qris', 'transfer'], true) && ! $setting->allow_xendit_payment) {
            throw new PaymentGatewayException('Pembayaran QRIS sedang dinonaktifkan sementara. Silakan bayar tunai langsung di kasir.');
        }

        $expiryMinutes = max(
            CafeSetting::MIN_PAYMENT_EXPIRY_MINUTES,
            min(CafeSetting::MAX_PAYMENT_EXPIRY_MINUTES, (int) ($setting->payment_expiry_minutes ?: CafeSetting::DEFAULT_PAYMENT_EXPIRY_MINUTES)),
        );
        $invoiceDurationSeconds = $expiryMinutes * 60;

        $resolvedGateway = $this->resolveGatewayForMethod($resolvedMethod, $preferredGateway);
        $resolvedChannel = $this->resolveDefaultChannelForMethod($resolvedMethod, $channel);

        /** @var array{status: string, payment: Payment|null, order: Order, reused: bool, expired_now?: bool} $prep */
        $prep = DB::transaction(function () use ($order, $resolvedMethod, $resolvedGateway, $resolvedChannel, $forceNew): array {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($lockedOrder->order_status === 'cancelled') {
                throw new PaymentGatewayException("Pesanan #{$lockedOrder->order_number} sudah dibatalkan dan tidak dapat membuat transaksi pembayaran.");
            }

            if ($lockedOrder->payment_status === 'refunded') {
                throw new PaymentGatewayException("Pesanan #{$lockedOrder->order_number} berstatus tidak aktif untuk pembayaran baru.");
            }

            $this->ensureLegacySettlementLedgered($lockedOrder);

            $unpaidBalance = $lockedOrder->getUnpaidBalance();
            if ($lockedOrder->payment_status === 'paid' || $unpaidBalance <= 0) {
                return [
                    'status' => 'already_paid',
                    'payment' => $lockedOrder->latestPayment()->first(),
                    'order' => $lockedOrder->fresh(['table', 'latestPayment']) ?? $lockedOrder,
                    'reused' => true,
                ];
            }

            // Tutup & lepaskan stok untuk transaksi pending gateway yang sudah melewati batas kedaluwarsa
            $expiredPendingNow = false;
            $overduePendings = $lockedOrder->payments()
                ->where('status', 'pending')
                ->whereNotNull('expired_at')
                ->where('expired_at', '<=', now('Asia/Jakarta'))
                ->where(function ($q): void {
                    $q->whereIn('gateway', ['xendit', 'midtrans'])
                        ->orWhereIn('method', ['qris', 'transfer']);
                })
                ->lockForUpdate()
                ->get();

            if ($overduePendings->isNotEmpty()) {
                $expiredPendingNow = true;
                $lockedOrder->payments()
                    ->whereIn('id', $overduePendings->pluck('id')->all())
                    ->update(['status' => 'expired']);

                $hasOtherActivePending = $lockedOrder->payments()
                    ->where('status', 'pending')
                    ->exists();

                if (! $hasOtherActivePending) {
                    if (! $lockedOrder->hasAnySettlement()) {
                        $lockedOrder->update(['payment_status' => 'failed']);
                    }
                    $this->menuStockService->releaseUnsettledOrderStock($lockedOrder);
                }

                OrderStatusHistory::create([
                    'order_id' => $lockedOrder->id,
                    'user_id' => null,
                    'status' => $lockedOrder->order_status,
                    'notes' => 'Batas waktu pembayaran QRIS / digital telah kedaluwarsa.',
                ]);
            }

            if (! $forceNew) {
                /** @var Payment|null $reusable */
                $reusable = $lockedOrder->payments()
                    ->where('status', 'pending')
                    ->where('gateway', $resolvedGateway)
                    ->where('method', $resolvedMethod)
                    ->where(function ($q) use ($resolvedChannel): void {
                        $q->where('channel', $resolvedChannel)->orWhereNull('channel');
                    })
                    ->latest('id')
                    ->first();

                if (
                    $reusable
                    && abs((float) $reusable->amount - $unpaidBalance) < 0.01
                    && ($reusable->expired_at === null || $reusable->expired_at->isFuture())
                ) {
                    $lockedOrder->update([
                        'payment_method' => $resolvedMethod,
                        'payment_gateway' => $resolvedGateway,
                        'payment_channel' => $resolvedChannel,
                        'payment_reference' => $reusable->payment_reference,
                    ]);

                    return [
                        'status' => 'reused',
                        'payment' => $reusable,
                        'order' => $lockedOrder->fresh(['table', 'latestPayment']) ?? $lockedOrder,
                        'reused' => true,
                    ];
                }

                /** @var Payment|null $latestForAttempt */
                $latestForAttempt = $lockedOrder->payments()
                    ->where('gateway', $resolvedGateway)
                    ->where('method', $resolvedMethod)
                    ->latest('id')
                    ->first();

                if (
                    $latestForAttempt
                    && abs((float) $latestForAttempt->amount - $unpaidBalance) < 0.01
                    && in_array($latestForAttempt->status, ['expired', 'failed'], true)
                ) {
                    return [
                        'status' => 'expired',
                        'payment' => $latestForAttempt,
                        'order' => $lockedOrder->fresh(['table', 'latestPayment', 'payments']) ?? $lockedOrder,
                        'reused' => false,
                        'expired_now' => $expiredPendingNow,
                    ];
                }
            }

            $this->menuStockService->reserveBeforePaymentRetry($lockedOrder);

            // Kedaluwarsakan percobaan pending sebelumnya yang nominal/metodenya berbeda
            $lockedOrder->payments()
                ->where('status', 'pending')
                ->update(['status' => 'expired']);

            $hasPaidPrior = $lockedOrder->paidPayments()->exists();
            $reference = $this->generateUniquePaymentReference($lockedOrder->order_number);

            $payment = Payment::create([
                'order_id' => $lockedOrder->id,
                'payment_reference' => $reference,
                'gateway' => $resolvedGateway,
                'method' => $resolvedMethod,
                'channel' => $resolvedChannel,
                'type' => $hasPaidPrior ? 'additional' : 'initial',
                'amount' => $unpaidBalance,
                'settled_amount' => 0.0,
                'fee_amount' => 0.0,
                'status' => 'pending',
                'external_id' => $reference,
                'request_payload' => [
                    'order_number' => $lockedOrder->order_number,
                    'customer_name' => $lockedOrder->customer_name,
                    'amount' => $unpaidBalance,
                    'method' => $resolvedMethod,
                    'channel' => $resolvedChannel,
                    'gateway' => $resolvedGateway,
                ],
            ]);

            $orderResetPayload = [
                'payment_method' => $resolvedMethod,
                'payment_gateway' => $resolvedGateway,
                'payment_channel' => $resolvedChannel,
                'payment_reference' => $lockedOrder->hasAnySettlement()
                    ? ($lockedOrder->payment_reference ?: $reference)
                    : $reference,
            ];
            if ($lockedOrder->payment_status === 'failed' && ! $lockedOrder->hasAnySettlement()) {
                $orderResetPayload['payment_status'] = 'unpaid';
            }

            $lockedOrder->update($orderResetPayload);

            return [
                'status' => 'created',
                'payment' => $payment,
                'order' => $lockedOrder->fresh(['table']) ?? $lockedOrder,
                'reused' => false,
            ];
        });

        if ($prep['status'] === 'already_paid') {
            return [
                'already_paid' => true,
                'is_expired' => false,
                'reused' => true,
                'order' => $prep['order'],
                'payment' => $prep['payment'],
                'gateway_response' => null,
            ];
        }

        if ($prep['status'] === 'expired') {
            if (! empty($prep['expired_now'])) {
                try {
                    event(new OrderStatusUpdated($prep['order'], $prep['order']->order_status, $prep['order']->order_status));
                } catch (\Throwable) {
                }
            }

            return [
                'already_paid' => false,
                'is_expired' => true,
                'reused' => false,
                'order' => $prep['order'],
                'payment' => $prep['payment'],
                'gateway_response' => null,
            ];
        }

        /** @var Payment $payment */
        $payment = $prep['payment'];
        /** @var Order $freshOrder */
        $freshOrder = $prep['order'];

        if ($prep['reused'] && is_array($payment->response_payload)) {
            return [
                'already_paid' => false,
                'is_expired' => false,
                'reused' => true,
                'order' => $freshOrder,
                'payment' => $payment,
                'gateway_response' => $payment->response_payload,
            ];
        }

        $driver = $this->driver($resolvedGateway);

        try {
            $gatewayResult = $driver->createTransaction($freshOrder, $payment, [
                'channel' => $resolvedChannel,
                'invoice_duration_seconds' => $invoiceDurationSeconds,
            ]);
        } catch (PaymentGatewayException $e) {
            $payment->update([
                'status' => 'failed',
                'response_payload' => ['error' => $e->getMessage()],
            ]);

            throw $e;
        }

        $payment->update([
            'external_id' => (string) ($gatewayResult['external_id'] ?? $payment->external_id),
            'gateway_transaction_id' => isset($gatewayResult['gateway_transaction_id']) ? (string) $gatewayResult['gateway_transaction_id'] : null,
            'checkout_url' => isset($gatewayResult['checkout_url']) ? (string) $gatewayResult['checkout_url'] : null,
            'qr_string' => isset($gatewayResult['qr_string']) ? (string) $gatewayResult['qr_string'] : null,
            'channel' => (string) ($gatewayResult['channel'] ?? $resolvedChannel),
            'expired_at' => $gatewayResult['expired_at'] ?? null,
            'response_payload' => $gatewayResult['raw_response'] ?? $gatewayResult,
        ]);

        return [
            'already_paid' => false,
            'is_expired' => false,
            'reused' => false,
            'order' => $freshOrder->fresh(['table', 'latestPayment']) ?? $freshOrder,
            'payment' => $payment->fresh() ?? $payment,
            'gateway_response' => $gatewayResult,
        ];
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
                throw new PaymentGatewayException("Pesanan #{$lockedOrder->order_number} menggunakan metode QRIS. Pembayaran dilakukan mandiri oleh pelanggan dan pesanan akan otomatis diterima setelah QRIS lunas.");
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

            $resolvedGateway = in_array($paymentMethod, ['qris', 'transfer'], true)
                ? ($lockedOrder->payment_gateway ?: $this->defaultGatewayName())
                : 'manual';
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
     * Proses callback/webhook pembayaran terverifikasi untuk Order / Payment tertentu.
     * Menerapkan locking, validasi nominal anti-manipulasi, idempotency, dan larangan refund.
     *
     * @param  array<string, mixed>  $normalized
     * @return array{
     *     http_status: int,
     *     status: string,
     *     already_processed: bool,
     *     message: string,
     *     order: Order|null
     * }
     */
    public function processGatewayCallback(array $normalized, string $gatewaySource = 'xendit'): array
    {
        $externalId = trim((string) ($normalized['external_id'] ?? $normalized['payment_reference'] ?? ''));
        $orderNumber = trim((string) ($normalized['order_number'] ?? ''));
        $txStatus = strtolower(trim((string) ($normalized['status'] ?? '')));
        $grossAmount = (float) ($normalized['amount'] ?? 0);

        if ($gatewaySource === 'xendit' && $externalId === '' && $orderNumber === '') {
            Log::info('Xendit webhook ping terverifikasi tanpa referensi pesanan (diabaikan).', [
                'gateway' => $gatewaySource,
                'status' => $txStatus,
            ]);

            return [
                'http_status' => 200,
                'status' => 'ok',
                'already_processed' => false,
                'message' => 'Webhook Xendit terverifikasi (ping uji koneksi diterima).',
                'order' => null,
            ];
        }

        if (($externalId === '' && $orderNumber === '') || $txStatus === '') {
            return [
                'http_status' => 422,
                'status' => 'error',
                'already_processed' => false,
                'message' => 'Payload transaksi pembayaran tidak lengkap.',
                'order' => null,
            ];
        }

        if (in_array($txStatus, ['refund', 'refunded'], true)) {
            return [
                'http_status' => 422,
                'status' => 'error',
                'already_processed' => false,
                'message' => 'Pembayaran yang sudah lunas bersifat final dan tidak mendukung pengembalian dana (refund).',
                'order' => null,
            ];
        }

        try {
            /** @var array{http_status: int, status: string, already_processed: bool, message: string, order: Order|null, dispatch_event: bool, prev_status: string, new_status: string} $result */
            $result = DB::transaction(function () use ($normalized, $gatewaySource, $externalId, $orderNumber, $txStatus, $grossAmount): array {
                /** @var Payment|null $targetPayment */
                $targetPayment = null;
                if ($externalId !== '') {
                    $targetPayment = Payment::where('payment_reference', $externalId)
                        ->orWhere('external_id', $externalId)
                        ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
                        ->latest('id')
                        ->lockForUpdate()
                        ->first();
                }

                /** @var Order|null $order */
                $order = null;
                if ($targetPayment) {
                    $order = Order::whereKey($targetPayment->order_id)->lockForUpdate()->first();
                }

                if (! $order) {
                    $lookupOrderNumber = $orderNumber !== '' ? $orderNumber : $externalId;
                    $order = Order::where('order_number', $lookupOrderNumber)->lockForUpdate()->first();
                }

                if (! $order) {
                    if ($gatewaySource === 'xendit') {
                        Log::info('Xendit webhook terverifikasi tetapi referensi tidak ditemukan di SideOrder (uji Test & Save atau transaksi eksternal).', [
                            'external_id' => $externalId,
                            'order_number' => $orderNumber,
                            'status' => $txStatus,
                        ]);

                        return [
                            'http_status' => 200,
                            'status' => 'ok',
                            'already_processed' => false,
                            'message' => 'Webhook Xendit terverifikasi (transaksi uji atau di luar SideOrder diabaikan).',
                            'order' => null,
                            'dispatch_event' => false,
                            'prev_status' => '',
                            'new_status' => '',
                        ];
                    }

                    return [
                        'http_status' => 404,
                        'status' => 'error',
                        'already_processed' => false,
                        'message' => 'Pesanan tidak ditemukan.',
                        'order' => null,
                        'dispatch_event' => false,
                        'prev_status' => '',
                        'new_status' => '',
                    ];
                }

                $this->ensureLegacySettlementLedgered($order);

                $lockedActiveItems = $order->items()
                    ->where('status', 'active')
                    ->lockForUpdate()
                    ->get();

                $resolvedMethod = strtolower(trim((string) ($normalized['method'] ?? ($targetPayment !== null ? $targetPayment->method : null) ?? $order->payment_method ?? 'qris')));
                if (! in_array($resolvedMethod, ['cash', 'qris', 'transfer', 'debit'], true)) {
                    $resolvedMethod = 'qris';
                }

                $resolvedChannel = strtoupper(trim((string) ($normalized['channel'] ?? ($targetPayment !== null ? $targetPayment->channel : null) ?? $this->resolveDefaultChannelForMethod($resolvedMethod))));
                $gatewayTxId = trim((string) ($normalized['gateway_transaction_id'] ?? ($targetPayment !== null ? $targetPayment->gateway_transaction_id : null) ?? ('GW-'.$order->order_number)));
                $rawPayload = is_array($normalized['raw'] ?? null) ? $normalized['raw'] : [];

                if (in_array($txStatus, ['paid', 'settlement', 'capture', 'completed', 'succeeded'], true)) {
                    $hasUnpaidItems = $lockedActiveItems->contains(fn (OrderItem $item): bool => ! $item->isPaid());

                    // Jika webhook menggunakan fallback order_number yang dulu sempat tersimpan di pembayaran awal,
                    // jangan blokir pembayaran susulan baru selama ID transaksi gateway-nya berbeda dan masih ada tagihan belum bayar.
                    if (
                        $targetPayment
                        && $targetPayment->isPaid()
                        && $externalId === $order->order_number
                        && $targetPayment->payment_reference !== $externalId
                        && $gatewayTxId !== ''
                        && $targetPayment->gateway_transaction_id !== $gatewayTxId
                        && ($order->getUnpaidBalance() > 0.01 || $hasUnpaidItems)
                    ) {
                        $targetPayment = null;
                    }

                    if (($targetPayment && $targetPayment->isPaid()) || ($targetPayment === null && $order->payment_status === 'paid' && $order->getUnpaidBalance() <= 0.01 && ! $hasUnpaidItems)) {
                        return [
                            'http_status' => 200,
                            'status' => 'ok',
                            'already_processed' => true,
                            'message' => 'Pembayaran sudah tercatat lunas sebelumnya (webhook duplikat diabaikan).',
                            'order' => $order,
                            'dispatch_event' => false,
                            'prev_status' => $order->order_status,
                            'new_status' => $order->order_status,
                        ];
                    }

                    if ($order->order_status === 'cancelled') {
                        return [
                            'http_status' => 409,
                            'status' => 'error',
                            'already_processed' => false,
                            'message' => 'Pesanan sudah dibatalkan dan tidak dapat dikonfirmasi pembayarannya.',
                            'order' => $order,
                            'dispatch_event' => false,
                            'prev_status' => $order->order_status,
                            'new_status' => $order->order_status,
                        ];
                    }

                    $unpaidItemsSum = (float) $lockedActiveItems->where('payment_status', '!=', OrderItem::PAYMENT_PAID)->sum('total_price');
                    $expectedAmount = $targetPayment
                        ? (float) $targetPayment->amount
                        : ($order->getUnpaidBalance() > 0 ? max($order->getUnpaidBalance(), $unpaidItemsSum) : (float) $order->total_amount);

                    if ($grossAmount <= 0 || abs($grossAmount - $expectedAmount) > 0.01) {
                        return [
                            'http_status' => 422,
                            'status' => 'error',
                            'already_processed' => false,
                            'message' => 'Nominal pembayaran callback tidak sesuai dengan total tagihan pesanan di database.',
                            'order' => $order,
                            'dispatch_event' => false,
                            'prev_status' => $order->order_status,
                            'new_status' => $order->order_status,
                        ];
                    }

                    $this->menuStockService->confirmOrderStock($order);

                    $paidAtInput = $normalized['paid_at'] ?? null;
                    $paidAt = ! empty($paidAtInput)
                        ? Carbon::parse((string) $paidAtInput)->timezone('Asia/Jakarta')
                        : now('Asia/Jakarta');

                    if ($targetPayment) {
                        $targetPayment->update([
                            'gateway' => $gatewaySource,
                            'method' => $resolvedMethod,
                            'channel' => $resolvedChannel,
                            'settled_amount' => $expectedAmount,
                            'status' => 'paid',
                            'gateway_transaction_id' => $gatewayTxId,
                            'webhook_payload' => $rawPayload,
                            'paid_at' => $paidAt,
                        ]);
                    } else {
                        $hasPaidPrior = $order->paidPayments()->exists();
                        $ref = $this->generateUniquePaymentReference($order->order_number);
                        $targetPayment = Payment::create([
                            'order_id' => $order->id,
                            'payment_reference' => $ref,
                            'gateway' => $gatewaySource,
                            'method' => $resolvedMethod,
                            'channel' => $resolvedChannel,
                            'type' => $hasPaidPrior ? 'additional' : 'initial',
                            'amount' => $expectedAmount,
                            'settled_amount' => $expectedAmount,
                            'cash_received' => $expectedAmount,
                            'change_amount' => 0.0,
                            'fee_amount' => 0.0,
                            'status' => 'paid',
                            'external_id' => $externalId !== '' ? $externalId : $ref,
                            'gateway_transaction_id' => $gatewayTxId,
                            'webhook_payload' => $rawPayload,
                            'paid_at' => $paidAt,
                        ]);
                    }

                    $totalPaidSum = (float) $order->paidPayments()->sum('settled_amount');
                    $itemsTotal = $lockedActiveItems->isNotEmpty()
                        ? (float) $lockedActiveItems->sum('total_price')
                        : (float) $order->total_amount;
                    $orderTotal = max((float) $order->total_amount, $itemsTotal);
                    $isFullySettled = $totalPaidSum >= ($orderTotal - 0.01);

                    $previousOrderStatus = $order->order_status;
                    $newOrderStatus = ($isFullySettled && $order->order_status === 'pending')
                        ? 'processing'
                        : $order->order_status;

                    if ($isFullySettled) {
                        $order->payments()
                            ->where('status', 'pending')
                            ->where('id', '!=', $targetPayment->id)
                            ->update(['status' => 'expired']);
                    }

                    $order->update([
                        'subtotal' => $orderTotal,
                        'total_amount' => $orderTotal,
                        'payment_status' => $isFullySettled ? 'paid' : 'unpaid',
                        'payment_method' => $resolvedMethod,
                        'payment_gateway' => $gatewaySource,
                        'payment_channel' => $resolvedChannel,
                        'paid_at' => $order->paid_at ?? $paidAt,
                        'payment_reference' => $order->payment_reference ?: $gatewayTxId,
                        'cash_received' => max((float) ($order->cash_received ?? 0), $totalPaidSum),
                        'change_amount' => $order->change_amount ?? 0.0,
                        'order_status' => $newOrderStatus,
                    ]);

                    $this->allocatePaidStatusToActiveItems(
                        $order,
                        $targetPayment,
                        $totalPaidSum,
                        $isFullySettled,
                        $paidAt,
                    );

                    $gatewayLabel = $gatewaySource === 'xendit'
                        ? 'Pembayaran Digital'
                        : ($gatewaySource === 'midtrans' ? 'Midtrans Snap' : 'Gateway');

                    OrderStatusHistory::create([
                        'order_id' => $order->id,
                        'user_id' => null,
                        'status' => $newOrderStatus,
                        'notes' => "Pembayaran {$gatewayLabel} (".strtoupper($resolvedMethod)."/{$resolvedChannel}) terverifikasi otomatis. Ref: {$gatewayTxId}",
                    ]);

                    return [
                        'http_status' => 200,
                        'status' => 'ok',
                        'already_processed' => false,
                        'message' => 'Pembayaran berhasil diverifikasi.',
                        'order' => $order->fresh(['table', 'items.options', 'items.servedByUser:id,name', 'latestPayment']),
                        'dispatch_event' => true,
                        'prev_status' => $previousOrderStatus,
                        'new_status' => $newOrderStatus,
                    ];
                }

                if (in_array($txStatus, ['failed', 'deny', 'expire', 'expired', 'cancel', 'voided'], true)) {
                    $mappedPaymentStatus = in_array($txStatus, ['expire', 'expired'], true) ? 'expired' : 'failed';

                    if ($targetPayment && $targetPayment->isPaid()) {
                        return [
                            'http_status' => 200,
                            'status' => 'ok',
                            'already_processed' => true,
                            'message' => 'Transaksi sudah lunas, status gagal diabaikan.',
                            'order' => $order,
                            'dispatch_event' => false,
                            'prev_status' => $order->order_status,
                            'new_status' => $order->order_status,
                        ];
                    }

                    if ($targetPayment) {
                        if ($targetPayment->status === $mappedPaymentStatus) {
                            return [
                                'http_status' => 200,
                                'status' => 'ok',
                                'already_processed' => true,
                                'message' => 'Status gagal sudah tercatat sebelumnya.',
                                'order' => $order,
                                'dispatch_event' => false,
                                'prev_status' => $order->order_status,
                                'new_status' => $order->order_status,
                            ];
                        }

                        $targetPayment->update([
                            'status' => $mappedPaymentStatus,
                            'webhook_payload' => $rawPayload,
                        ]);
                    }

                    // Jangan pernah menimpa order yang sudah memiliki pelunasan penuh atau pelunasan awal (Tambah Menu)
                    if ($order->payment_status === 'paid') {
                        return [
                            'http_status' => 200,
                            'status' => 'ok',
                            'already_processed' => true,
                            'message' => 'Transaksi sudah lunas, status gagal diabaikan.',
                            'order' => $order,
                            'dispatch_event' => false,
                            'prev_status' => $order->order_status,
                            'new_status' => $order->order_status,
                        ];
                    }

                    if ($order->payment_status === 'failed' && ! $targetPayment) {
                        return [
                            'http_status' => 200,
                            'status' => 'ok',
                            'already_processed' => true,
                            'message' => 'Status gagal sudah tercatat sebelumnya.',
                            'order' => $order,
                            'dispatch_event' => false,
                            'prev_status' => $order->order_status,
                            'new_status' => $order->order_status,
                        ];
                    }

                    $hasOtherPendingPayment = $targetPayment
                        ? $order->payments()->where('status', 'pending')->where('id', '!=', $targetPayment->id)->exists()
                        : false;

                    if (! $hasOtherPendingPayment) {
                        if (! $order->hasAnySettlement()) {
                            $order->update([
                                'payment_status' => 'failed',
                            ]);
                        }
                        $this->menuStockService->releaseUnsettledOrderStock($order);
                    }

                    OrderStatusHistory::create([
                        'order_id' => $order->id,
                        'user_id' => null,
                        'status' => $order->order_status,
                        'notes' => "Pembayaran gagal/kedaluwarsa ({$txStatus}) dari {$gatewaySource}.",
                    ]);

                    return [
                        'http_status' => 200,
                        'status' => 'ok',
                        'already_processed' => false,
                        'message' => 'Status pembayaran gagal berhasil dicatat.',
                        'order' => $order->fresh(['table', 'latestPayment']),
                        'dispatch_event' => true,
                        'prev_status' => $order->order_status,
                        'new_status' => $order->order_status,
                    ];
                }

                return [
                    'http_status' => 200,
                    'status' => 'ok',
                    'already_processed' => true,
                    'message' => 'Status pending diterima.',
                    'order' => $order,
                    'dispatch_event' => false,
                    'prev_status' => $order->order_status,
                    'new_status' => $order->order_status,
                ];
            });
        } catch (PaymentGatewayException $e) {
            return [
                'http_status' => 422,
                'status' => 'error',
                'already_processed' => false,
                'message' => $e->getMessage(),
                'order' => null,
            ];
        }

        if ($result['dispatch_event'] && $result['order']) {
            try {
                event(new OrderStatusUpdated($result['order'], $result['prev_status'], $result['new_status']));
            } catch (\Throwable) {
            }
        }

        return [
            'http_status' => $result['http_status'],
            'status' => $result['status'],
            'already_processed' => $result['already_processed'],
            'message' => $result['message'],
            'order' => $result['order'],
        ];
    }

    /**
     * Kedaluwarsakan otomatis transaksi pembayaran digital (QRIS / gateway) yang sudah melewati `expired_at`
     * dan kembalikan stok menu terbatas yang masih berstatus reserved.
     */
    public function expireOverduePendingPayments(?Order $targetOrder = null): bool
    {
        $now = now('Asia/Jakarta');

        $query = Payment::query()
            ->with('order')
            ->where('status', 'pending')
            ->whereNotNull('expired_at')
            ->where('expired_at', '<=', $now)
            ->where(function ($q): void {
                $q->whereIn('gateway', ['xendit', 'midtrans'])
                    ->orWhereIn('method', ['qris', 'transfer']);
            });

        if ($targetOrder !== null) {
            $query->where('order_id', $targetOrder->id);
        }

        $overduePayments = $query->orderBy('id')->get();
        if ($overduePayments->isEmpty()) {
            return false;
        }

        $didChange = false;

        foreach ($overduePayments as $pendingPayment) {
            /** @var Order|null $order */
            $order = $pendingPayment->order;
            if (! $order || $order->order_status === 'cancelled') {
                continue;
            }

            if (in_array($pendingPayment->gateway, ['xendit', 'midtrans'], true)) {
                $driver = $this->driver($pendingPayment->gateway);
                if ($driver->isConfigured()) {
                    $cacheKey = 'gateway_status_check_'.$pendingPayment->payment_reference;
                    /** @var array<string, mixed>|null $gatewayStatus */
                    $gatewayStatus = Cache::remember($cacheKey, 5, fn () => $driver->checkTransactionStatus($pendingPayment));

                    if (is_array($gatewayStatus) && ($gatewayStatus['normalized_status'] ?? null) === 'paid') {
                        $paidRes = $this->processGatewayCallback([
                            'external_id' => $pendingPayment->payment_reference ?: $order->order_number,
                            'order_number' => $order->order_number,
                            'payment_reference' => $pendingPayment->payment_reference ?: $order->order_number,
                            'gateway_transaction_id' => (string) ($gatewayStatus['gateway_transaction_id'] ?? ('GW-'.$order->order_number)),
                            'status' => 'paid',
                            'amount' => (float) ($gatewayStatus['amount'] ?? $pendingPayment->amount),
                            'method' => $pendingPayment->method ?: ($order->payment_method ?: 'qris'),
                            'channel' => (string) ($gatewayStatus['channel'] ?? $pendingPayment->channel ?? 'QRIS'),
                            'paid_at' => null,
                            'raw' => is_array($gatewayStatus['raw'] ?? null) ? $gatewayStatus['raw'] : $gatewayStatus,
                        ], $pendingPayment->gateway);

                        if (! $paidRes['already_processed']) {
                            $didChange = true;
                        }

                        continue;
                    }
                }
            }

            $expiredRes = $this->processGatewayCallback([
                'external_id' => $pendingPayment->payment_reference ?: $order->order_number,
                'order_number' => $order->order_number,
                'payment_reference' => $pendingPayment->payment_reference ?: $order->order_number,
                'gateway_transaction_id' => $pendingPayment->gateway_transaction_id ?: ('EXP-'.$pendingPayment->payment_reference),
                'status' => 'expired',
                'amount' => (float) $pendingPayment->amount,
                'method' => $pendingPayment->method ?: ($order->payment_method ?: 'qris'),
                'channel' => (string) ($pendingPayment->channel ?: $this->resolveDefaultChannelForMethod($pendingPayment->method ?: 'qris')),
                'paid_at' => null,
                'raw' => [
                    'auto_expired' => true,
                    'expired_at' => $pendingPayment->expired_at?->toIso8601String(),
                ],
            ], $pendingPayment->gateway ?: 'xendit');

            if (! $expiredRes['already_processed']) {
                $didChange = true;
            }
        }

        return $didChange;
    }

    /**
     * Rekonsiliasi status transaksi pending ke API gateway aktif (Xendit / Midtrans) serta kedaluwarsa lokal.
     */
    public function syncPaymentStatus(Order $order): Order
    {
        if (
            $order->order_status === 'cancelled'
            || ($order->payment_status === 'paid' && $order->getUnpaidBalance() <= 0.01 && ! $order->hasUnpaidActiveItems())
        ) {
            return $order;
        }

        $didExpireOrSettle = $this->expireOverduePendingPayments($order);
        if ($didExpireOrSettle) {
            $order = $order->fresh(['table', 'items.options', 'items.rejectedByUser:id,name', 'items.servedByUser:id,name', 'statusHistories', 'latestPayment', 'payments']) ?? $order;
        }

        if (
            $order->order_status === 'cancelled'
            || ($order->payment_status === 'paid' && $order->getUnpaidBalance() <= 0.01 && ! $order->hasUnpaidActiveItems())
        ) {
            return $order;
        }

        /** @var Payment|null $pendingPayment */
        $pendingPayment = $order->payments()
            ->where('status', 'pending')
            ->latest('id')
            ->first();

        $gatewayName = $pendingPayment?->gateway ?: $order->resolveEffectivePaymentGateway();
        if (! in_array($gatewayName, ['xendit', 'midtrans'], true)) {
            return $order;
        }

        $driver = $this->driver($gatewayName);
        if (! $driver->isConfigured()) {
            return $order;
        }

        $cacheTarget = $pendingPayment ?? new Payment([
            'order_id' => $order->id,
            'payment_reference' => $order->payment_reference ?: $order->order_number,
            'gateway' => $gatewayName,
            'method' => $order->payment_method ?: 'qris',
            'channel' => $order->payment_channel ?: 'QRIS',
            'amount' => $order->getUnpaidBalance() > 0 ? $order->getUnpaidBalance() : (float) $order->total_amount,
            'external_id' => $order->order_number,
        ]);
        if (! $pendingPayment) {
            $cacheTarget->setRelation('order', $order);
        }

        $cacheKey = 'gateway_status_check_'.($pendingPayment ? $pendingPayment->payment_reference : $order->order_number);

        /** @var array<string, mixed>|null $gatewayStatus */
        $gatewayStatus = Cache::remember($cacheKey, 5, fn () => $driver->checkTransactionStatus($cacheTarget));

        if (! is_array($gatewayStatus) || ! isset($gatewayStatus['normalized_status'])) {
            return $order;
        }

        $normalizedStatus = (string) $gatewayStatus['normalized_status'];
        if (in_array($normalizedStatus, ['paid', 'failed', 'expired'], true)) {
            $this->processGatewayCallback([
                'external_id' => $cacheTarget->payment_reference ?: $order->order_number,
                'order_number' => $order->order_number,
                'payment_reference' => $cacheTarget->payment_reference ?: $order->order_number,
                'gateway_transaction_id' => (string) ($gatewayStatus['gateway_transaction_id'] ?? ('GW-'.$order->order_number)),
                'status' => $normalizedStatus,
                'amount' => (float) ($gatewayStatus['amount'] ?? $cacheTarget->amount),
                'method' => $cacheTarget->method ?: ($order->payment_method ?: 'qris'),
                'channel' => (string) ($gatewayStatus['channel'] ?? $cacheTarget->channel ?? 'QRIS'),
                'paid_at' => null,
                'raw' => is_array($gatewayStatus['raw'] ?? null) ? $gatewayStatus['raw'] : $gatewayStatus,
            ], $gatewayName);

            return $order->fresh(['table', 'items.options', 'items.rejectedByUser:id,name', 'items.servedByUser:id,name', 'statusHistories', 'latestPayment', 'payments']) ?? $order;
        }

        return $order;
    }

    /**
     * Verifikasi signature webhook dan tentukan driver sumber callback.
     *
     * @return array{verified: bool, driver: string, payload: array<string, mixed>}
     */
    public function verifyAndParseWebhook(Request $request, ?string $explicitDriver = null): array
    {
        $driverHint = $explicitDriver !== null ? strtolower(trim($explicitDriver)) : null;

        // 1. Cek callback resmi Xendit via header X-CALLBACK-TOKEN
        if (
            ($driverHint === null || $driverHint === 'xendit')
            && ($request->hasHeader('X-CALLBACK-TOKEN') || $request->hasHeader('x-callback-token'))
        ) {
            $verified = $this->xenditDriver->verifyWebhookSignature($request);

            return [
                'verified' => $verified,
                'driver' => 'xendit',
                'payload' => $this->xenditDriver->parseWebhookPayload($request),
            ];
        }

        // 2. Cek callback Midtrans Snap SHA512
        if (($driverHint === null || $driverHint === 'midtrans') && $request->filled('signature_key')) {
            $verified = $this->midtransDriver->verifyWebhookSignature($request);

            return [
                'verified' => $verified,
                'driver' => 'midtrans',
                'payload' => $this->midtransDriver->parseWebhookPayload($request),
            ];
        }

        // 3. Cek HMAC-SHA256 Internal SideOrder (X-Callback-Signature / signature)
        $rawOrderNumber = (string) ($request->input('order_number') ?? $request->input('order_id') ?? '');
        $rawStatus = strtolower((string) ($request->input('status') ?? $request->input('transaction_status') ?? ''));
        $rawAmount = (float) ($request->input('gross_amount') ?? $request->input('amount') ?? 0);
        $providedHmac = (string) (
            $request->header('X-Callback-Signature')
            ?? $request->input('signature')
            ?? ''
        );

        $secret = self::resolveHmacSecret();
        $expectedHmac = self::generateHmacSignature($rawOrderNumber, $rawStatus, $rawAmount);
        $isHmacValid = $secret !== '' && $providedHmac !== '' && hash_equals($expectedHmac, $providedHmac);

        $rawGateway = strtolower(trim((string) ($request->input('gateway') ?? $driverHint ?? $this->defaultGatewayName())));
        $driverName = in_array($rawGateway, ['xendit', 'midtrans', 'manual'], true) ? $rawGateway : 'xendit';

        /** @var array<string, mixed> $rawAll */
        $rawAll = $request->all();

        $normalized = [
            'external_id' => (string) ($request->input('payment_reference') ?? $request->input('external_id') ?? $rawOrderNumber),
            'order_number' => $rawOrderNumber,
            'payment_reference' => (string) ($request->input('payment_reference') ?? $rawOrderNumber),
            'gateway_transaction_id' => (string) ($request->input('transaction_id') ?? ('GW-'.$rawOrderNumber)),
            'status' => $rawStatus,
            'amount' => $rawAmount,
            'method' => $request->input('payment_type') ? strtolower((string) $request->input('payment_type')) : null,
            'channel' => $request->input('payment_channel') ? strtoupper((string) $request->input('payment_channel')) : null,
            'paid_at' => $request->input('paid_at') ? (string) $request->input('paid_at') : null,
            'raw' => $rawAll,
        ];

        return [
            'verified' => $isHmacValid,
            'driver' => $driverName,
            'payload' => $normalized,
        ];
    }

    public static function resolveHmacSecret(): string
    {
        $configured = trim((string) config('services.payment_gateway.webhook_secret', ''));
        if ($configured !== '') {
            return $configured;
        }

        return trim((string) config('app.key', ''));
    }

    public static function generateHmacSignature(string $orderNumber, string $status, float|string $grossAmount): string
    {
        $secret = self::resolveHmacSecret();
        $normalizedAmount = number_format((float) $grossAmount, 2, '.', '');

        return hash_hmac('sha256', "{$orderNumber}|{$status}|{$normalizedAmount}", $secret);
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
