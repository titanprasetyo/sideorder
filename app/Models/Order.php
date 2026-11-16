<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * @property int $id
 * @property string $order_number
 * @property int $cafe_table_id
 * @property string $customer_name
 * @property string $subtotal
 * @property string $total_amount
 * @property string $order_status
 * @property string $payment_status
 * @property string|null $payment_method
 * @property string|null $payment_gateway
 * @property string|null $payment_channel
 * @property Carbon|null $paid_at
 * @property string|null $payment_reference
 * @property string|null $cash_received
 * @property string|null $change_amount
 * @property int|null $confirmed_by
 * @property string $refunded_amount
 * @property Carbon|null $refunded_at
 * @property string|null $refund_reason
 * @property string|null $notes
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read float $settled_amount
 * @property-read float $unpaid_balance
 * @property-read CafeTable|null $table
 * @property-read User|null $confirmedByUser
 * @property-read Payment|null $latestPayment
 * @property-read Collection<int, OrderItem> $items
 * @property-read Collection<int, OrderItem> $activeItems
 * @property-read Collection<int, OrderItem> $rejectedItems
 * @property-read Collection<int, OrderStatusHistory> $statusHistories
 * @property-read Collection<int, Payment> $payments
 * @property-read Collection<int, Payment> $paidPayments
 */
class Order extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    protected $fillable = [
        'order_number',
        'cafe_table_id',
        'customer_name',
        'subtotal',
        'total_amount',
        'order_status',
        'payment_status',
        'payment_method',
        'payment_gateway',
        'payment_channel',
        'paid_at',
        'payment_reference',
        'cash_received',
        'change_amount',
        'confirmed_by',
        'refunded_amount',
        'refunded_at',
        'refund_reason',
        'notes',
    ];

    protected $appends = [
        'settled_amount',
        'unpaid_balance',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2',
            'total_amount' => 'decimal:2',
            'cash_received' => 'decimal:2',
            'change_amount' => 'decimal:2',
            'refunded_amount' => 'decimal:2',
            'paid_at' => 'datetime',
            'refunded_at' => 'datetime',
        ];
    }

    /**
     * Otomatis generate nomor pesanan unik sebelum disimpan.
     */
    protected static function booted(): void
    {
        static::creating(function (Order $order): void {
            if (empty($order->order_number)) {
                do {
                    $candidate = 'SO-'.date('Ymd').'-'.strtoupper(Str::random(4));
                } while (static::where('order_number', $candidate)->exists());
                $order->order_number = $candidate;
            }
        });
    }

    /**
     * Relasi: Pesanan berada di satu meja.
     *
     * @return BelongsTo<CafeTable, $this>
     */
    public function table(): BelongsTo
    {
        return $this->belongsTo(CafeTable::class, 'cafe_table_id');
    }

    /**
     * Relasi: Semua item produk (aktif maupun ditolak).
     *
     * @return HasMany<OrderItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * Relasi: Item yang masih aktif (belum ditolak).
     *
     * @return HasMany<OrderItem, $this>
     */
    public function activeItems(): HasMany
    {
        return $this->hasMany(OrderItem::class)->where('status', 'active');
    }

    /**
     * Relasi: Item yang ditolak.
     *
     * @return HasMany<OrderItem, $this>
     */
    public function rejectedItems(): HasMany
    {
        return $this->hasMany(OrderItem::class)->where('status', 'rejected');
    }

    /**
     * Relasi: Staf kasir yang mengonfirmasi pembayaran.
     *
     * @return BelongsTo<User, $this>
     */
    public function confirmedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    /**
     * Relasi: Riwayat perpindahan status pesanan.
     *
     * @return HasMany<OrderStatusHistory, $this>
     */
    public function statusHistories(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->latest();
    }

    /**
     * Relasi: Seluruh transaksi pembayaran yang terkait pada pesanan ini (initial + tambahan menu).
     *
     * @return HasMany<Payment, $this>
     */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->latest('id');
    }

    /**
     * Relasi: Transaksi pembayaran yang sudah lunas.
     *
     * @return HasMany<Payment, $this>
     */
    public function paidPayments(): HasMany
    {
        return $this->hasMany(Payment::class)->where('status', 'paid');
    }

    /**
     * Relasi: Record pembayaran terbaru.
     *
     * @return HasOne<Payment, $this>
     */
    public function latestPayment(): HasOne
    {
        return $this->hasOne(Payment::class)->latestOfMany();
    }

    // Helper status
    public function isPaid(): bool
    {
        return $this->payment_status === 'paid';
    }

    public function isCompleted(): bool
    {
        return $this->order_status === 'completed';
    }

    public function isCancelled(): bool
    {
        return $this->order_status === 'cancelled';
    }

    public function hasAnySettlement(): bool
    {
        return $this->payment_status === 'paid'
            || $this->paid_at !== null
            || $this->getSettledAmount() > 0;
    }

    /**
     * Apakah pesanan masih aktif dan dapat ditambahkan menu baru (pending / processing).
     */
    public function canAcceptAdditionalItems(): bool
    {
        return in_array($this->order_status, ['pending', 'processing'], true);
    }

    /**
     * Nominal yang sudah dibayar/diselesaikan pada pesanan ini.
     * Membaca ledger tabel `payments` terlebih dahulu agar pembayaran awal tidak hilang
     * ketika pelanggan melakukan Tambah Menu atau percobaan pembayaran kedua gagal/expired.
     */
    public function getSettledAmount(): float
    {
        if ($this->order_status === 'cancelled' || $this->payment_status === 'refunded') {
            return 0.0;
        }

        $refunded = (float) ($this->refunded_amount ?? 0);

        $paidLedgerSum = $this->relationLoaded('payments')
            ? (float) $this->payments->where('status', 'paid')->sum('settled_amount')
            : (float) $this->payments()->where('status', 'paid')->sum('settled_amount');

        if ($paidLedgerSum > 0) {
            return max(0.0, min((float) $this->total_amount, $paidLedgerSum) - $refunded);
        }

        if ($this->payment_status === 'failed') {
            return 0.0;
        }

        if ($this->payment_status === 'paid') {
            return max(0.0, (float) $this->total_amount - $refunded);
        }

        if ($this->paid_at !== null && $this->cash_received !== null) {
            $netPaid = max(0.0, (float) $this->cash_received - (float) ($this->change_amount ?? 0));

            return max(0.0, min((float) $this->total_amount, $netPaid) - $refunded);
        }

        return 0.0;
    }

    /**
     * Sisa tagihan yang belum dibayar (termasuk tagihan menu tambahan).
     */
    public function getUnpaidBalance(): float
    {
        if ($this->order_status === 'cancelled' || in_array($this->payment_status, ['paid', 'refunded'], true)) {
            return 0.0;
        }

        return max(0.0, (float) $this->total_amount - $this->getSettledAmount());
    }

    public function getSettledAmountAttribute(): float
    {
        return $this->getSettledAmount();
    }

    public function getUnpaidBalanceAttribute(): float
    {
        return $this->getUnpaidBalance();
    }

    /**
     * Label ringkas Payment Gateway yang memproses transaksi pesanan ini.
     */
    public function resolveEffectivePaymentGateway(): string
    {
        if (! empty($this->payment_gateway)) {
            return $this->payment_gateway;
        }

        if ($this->relationLoaded('latestPayment') && $this->latestPayment) {
            return $this->latestPayment->gateway;
        }

        return match ($this->payment_method) {
            'qris', 'transfer', 'debit' => 'xendit',
            default => 'manual',
        };
    }

    public function resolvePaymentGatewayLabel(): string
    {
        return match ($this->resolveEffectivePaymentGateway()) {
            'xendit' => 'Xendit Payment Gateway',
            'midtrans' => 'Midtrans Snap',
            default => 'Kasir POS',
        };
    }

    /**
     * Apakah pesanan ini dihitung sebagai pendapatan bersih terealisasi.
     */
    public function isRealizedRevenue(): bool
    {
        return $this->payment_status === 'paid' && $this->order_status !== 'cancelled';
    }

    /**
     * Nilai bersih pendapatan yang diakui dari transaksi ini.
     */
    public function getRealizedNetAmount(): float
    {
        if (! $this->isRealizedRevenue()) {
            return 0.0;
        }

        $total = (float) $this->total_amount;
        $refunded = (float) ($this->refunded_amount ?? 0);

        return max(0.0, $total - $refunded);
    }
}
