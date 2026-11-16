<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $order_item_id
 * @property string $group_name
 * @property string $option_name
 * @property string $additional_price
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read OrderItem|null $orderItem
 */
class OrderItemOption extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    protected $fillable = [
        'order_item_id',
        'group_name',
        'option_name',
        'additional_price',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'additional_price' => 'decimal:2',
        ];
    }

    /**
     * Relasi: Opsi milik satu item pesanan
     *
     * @return BelongsTo<OrderItem, $this>
     */
    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }
}
