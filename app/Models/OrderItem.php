<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OrderItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id',
        'menu_id',
        'menu_name',
        'base_price',
        'quantity',
        'subtotal_options',
        'unit_price',
        'total_price',
        'customer_notes',
        'status',
        'rejection_reason',
        'rejected_at',
        'rejected_by',
    ];

    protected function casts(): array
    {
        return [
            'base_price' => 'decimal:2',
            'quantity' => 'integer',
            'subtotal_options' => 'decimal:2',
            'unit_price' => 'decimal:2',
            'total_price' => 'decimal:2',
            'rejected_at' => 'datetime',
        ];
    }

    /**
     * Relasi: Item milik satu pesanan induk
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /**
     * Relasi: Referensi ke menu asal (bisa null jika menu dihapus)
     */
    public function menu(): BelongsTo
    {
        return $this->belongsTo(Menu::class);
    }

    /**
     * Relasi: Kasir/staf yang menolak menu ini
     */
    public function rejectedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    /**
     * Relasi: Satu item pesanan memiliki banyak rincian opsi
     */
    public function options(): HasMany
    {
        return $this->hasMany(OrderItemOption::class);
    }

    /**
     * Scope: Hanya item aktif (belum ditolak)
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope: Hanya item yang ditolak
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
}
