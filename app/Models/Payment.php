<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $order_id
 * @property string $payment_reference
 * @property string $gateway
 * @property string $method
 * @property string|null $channel
 * @property string $type
 * @property string $amount
 * @property string $settled_amount
 * @property string|null $cash_received
 * @property string|null $change_amount
 * @property string $fee_amount
 * @property string $status
 * @property string|null $external_id
 * @property string|null $gateway_transaction_id
 * @property string|null $checkout_url
 * @property string|null $qr_string
 * @property array<string, mixed>|null $request_payload
 * @property array<string, mixed>|null $response_payload
 * @property array<string, mixed>|null $webhook_payload
 * @property Carbon|null $paid_at
 * @property Carbon|null $expired_at
 * @property int|null $confirmed_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Order $order
 * @property-read User|null $confirmedByUser
 */
class Payment extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    protected $fillable = [
        'order_id',
        'payment_reference',
        'gateway',
        'method',
        'channel',
        'type',
        'amount',
        'settled_amount',
        'cash_received',
        'change_amount',
        'fee_amount',
        'status',
        'external_id',
        'gateway_transaction_id',
        'checkout_url',
        'qr_string',
        'request_payload',
        'response_payload',
        'webhook_payload',
        'paid_at',
        'expired_at',
        'confirmed_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'settled_amount' => 'decimal:2',
            'cash_received' => 'decimal:2',
            'change_amount' => 'decimal:2',
            'fee_amount' => 'decimal:2',
            'request_payload' => 'array',
            'response_payload' => 'array',
            'webhook_payload' => 'array',
            'paid_at' => 'datetime',
            'expired_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Order, $this>
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function confirmedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function isPaid(): bool
    {
        return $this->status === 'paid';
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function resolveGatewayLabel(): string
    {
        return match ($this->gateway) {
            'manual' => 'Kasir POS',
            default => 'Pembayaran Digital',
        };
    }

    public function resolveChannelLabel(): string
    {
        $channel = strtoupper((string) ($this->channel ?? ''));

        if ($channel !== '') {
            return match ($channel) {
                'QRIS' => 'QRIS',
                'VIRTUAL_ACCOUNT', 'BANK_TRANSFER' => 'Transfer Bank',
                'EWALLET' => 'QRIS',
                'EDC_DEBIT', 'DEBIT' => 'Kartu Debit (EDC)',
                'CASH' => 'Tunai (Cash)',
                default => $channel,
            };
        }

        return match ($this->method) {
            'qris' => 'QRIS',
            'transfer' => 'Transfer Bank',
            'debit' => 'Kartu Debit',
            default => 'Tunai',
        };
    }
}
