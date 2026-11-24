<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $order_id
 * @property int|null $menu_id
 * @property string $menu_name
 * @property string $base_price
 * @property string|null $cost_price
 * @property int $quantity
 * @property int $batch_number
 * @property bool $is_followup
 * @property string $payment_status
 * @property int|null $payment_id
 * @property Carbon|null $paid_at
 * @property string $subtotal_options
 * @property string $unit_price
 * @property string $total_price
 * @property string|null $customer_notes
 * @property string $status
 * @property bool $is_served
 * @property Carbon|null $served_at
 * @property int|null $served_by
 * @property int $stock_deducted_quantity
 * @property string $stock_state
 * @property Carbon|null $stock_deducted_at
 * @property Carbon|null $stock_released_at
 * @property string|null $rejection_reason
 * @property Carbon|null $rejected_at
 * @property int|null $rejected_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Order|null $order
 * @property-read Menu|null $menu
 * @property-read Payment|null $payment
 * @property-read User|null $servedByUser
 * @property-read User|null $rejectedByUser
 * @property-read Collection<int, OrderItemOption> $options
 */
class OrderItem extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    public const string PAYMENT_UNPAID = 'unpaid';

    public const string PAYMENT_PAID = 'paid';

    public const string STOCK_STATE_NONE = 'none';

    public const string STOCK_STATE_RESERVED = 'reserved';

    public const string STOCK_STATE_CONFIRMED = 'confirmed';

    public const string STOCK_STATE_RELEASED = 'released';

    protected $fillable = [
        'order_id',
        'menu_id',
        'menu_name',
        'base_price',
        'cost_price',
        'quantity',
        'batch_number',
        'is_followup',
        'payment_status',
        'payment_id',
        'paid_at',
        'stock_deducted_quantity',
        'stock_state',
        'stock_deducted_at',
        'stock_released_at',
        'subtotal_options',
        'unit_price',
        'total_price',
        'customer_notes',
        'status',
        'is_served',
        'served_at',
        'served_by',
        'rejection_reason',
        'rejected_at',
        'rejected_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'base_price' => 'decimal:2',
            'cost_price' => 'decimal:2',
            'quantity' => 'integer',
            'batch_number' => 'integer',
            'is_followup' => 'boolean',
            'stock_deducted_quantity' => 'integer',
            'subtotal_options' => 'decimal:2',
            'unit_price' => 'decimal:2',
            'total_price' => 'decimal:2',
            'paid_at' => 'datetime',
            'is_served' => 'boolean',
            'served_at' => 'datetime',
            'stock_deducted_at' => 'datetime',
            'stock_released_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    /**
     * Relasi: Item milik satu pesanan induk
     *
     * @return BelongsTo<Order, $this>
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /**
     * Relasi: Referensi ke menu asal (bisa null jika menu dihapus)
     *
     * @return BelongsTo<Menu, $this>
     */
    public function menu(): BelongsTo
    {
        return $this->belongsTo(Menu::class);
    }

    /**
     * Relasi: Transaksi pembayaran yang melunasi item ini
     *
     * @return BelongsTo<Payment, $this>
     */
    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    /**
     * Relasi: Kasir/barista yang menandai item ini selesai/diantar
     *
     * @return BelongsTo<User, $this>
     */
    public function servedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'served_by');
    }

    /**
     * Relasi: Kasir/staf yang menolak menu ini
     *
     * @return BelongsTo<User, $this>
     */
    public function rejectedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    /**
     * Relasi: Satu item pesanan memiliki banyak rincian opsi
     *
     * @return HasMany<OrderItemOption, $this>
     */
    public function options(): HasMany
    {
        return $this->hasMany(OrderItemOption::class);
    }

    /**
     * Scope: Hanya item aktif (belum ditolak)
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope: Hanya item yang ditolak
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeRejected(Builder $query): Builder
    {
        return $query->where('status', 'rejected');
    }

    public function isRejected(): bool
    {
        return $this->status === 'rejected';
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isPaid(): bool
    {
        return $this->payment_status === self::PAYMENT_PAID;
    }

    public function isServed(): bool
    {
        return (bool) $this->is_served;
    }

    public function canBeServed(): bool
    {
        return $this->isActive() && $this->isPaid();
    }
}
