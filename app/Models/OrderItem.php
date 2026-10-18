<?php

namespace App\Models;

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
    ];

    protected function casts(): array
    {
        return [
            'base_price' => 'decimal:2',
            'quantity' => 'integer',
            'subtotal_options' => 'decimal:2',
            'unit_price' => 'decimal:2',
            'total_price' => 'decimal:2',
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
     * Relasi: Satu item pesanan memiliki banyak rincian opsi
     */
    public function options(): HasMany
    {
        return $this->hasMany(OrderItemOption::class);
    }
}