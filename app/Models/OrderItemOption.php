<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItemOption extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_item_id',
        'group_name',
        'option_name',
        'additional_price',
    ];

    protected function casts(): array
    {
        return [
            'additional_price' => 'decimal:2',
        ];
    }

    /**
     * Relasi: Opsi milik satu item pesanan
     */
    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }
}
