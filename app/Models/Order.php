<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Order extends Model
{
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
     * Otomatis generate nomor pesanan unik sebelum disimpan
     */
    protected static function booted(): void
    {
        static::creating(function (Order $order) {
            if (empty($order->order_number)) {
                do {
                    $candidate = 'SO-'.date('Ymd').'-'.strtoupper(Str::random(4));
                } while (static::where('order_number', $candidate)->exists());
                $order->order_number = $candidate;
            }
        });
    }

    /**
     * Relasi: Pesanan berada di satu meja
     */
    public function table(): BelongsTo
    {
        return $this->belongsTo(CafeTable::class, 'cafe_table_id');
    }

    /**
     * Relasi: Semua item produk (aktif maupun ditolak)
     */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * Relasi: Item yang masih aktif (belum ditolak)
     */
    public function activeItems(): HasMany
    {
        return $this->hasMany(OrderItem::class)->where('status', 'active');
    }

    /**
     * Relasi: Item yang ditolak
     */
    public function rejectedItems(): HasMany
    {
        return $this->hasMany(OrderItem::class)->where('status', 'rejected');
    }

    /**
     * Relasi: Staf kasir yang mengonfirmasi pembayaran
     */
    public function confirmedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    /**
     * Relasi: Riwayat perpindahan status pesanan
     */
    public function statusHistories(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->latest();
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

    /**
     * Apakah pesanan masih aktif dan dapat ditambahkan menu baru (pending / processing)
     */
    public function canAcceptAdditionalItems(): bool
    {
        return in_array($this->order_status, ['pending', 'processing'], true);
    }

    /**
     * Nominal yang sudah dibayar/diselesaikan pada pesanan ini.
     * Tetap aman ketika customer menambahkan menu baru setelah pembayaran awal dilakukan.
     */
    public function getSettledAmount(): float
    {
        if ($this->order_status === 'cancelled' || in_array($this->payment_status, ['refunded', 'failed'], true)) {
            return 0.0;
        }

        $refunded = (float) ($this->refunded_amount ?? 0);

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
     * Apakah pesanan ini dihitung sebagai pendapatan bersih terealisasi
     */
    public function isRealizedRevenue(): bool
    {
        return $this->payment_status === 'paid' && $this->order_status !== 'cancelled';
    }

    /**
     * Nilai bersih pendapatan yang diakui dari transaksi ini
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
