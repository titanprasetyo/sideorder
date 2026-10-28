<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderStatusHistory extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id',
        'user_id',
        'status',
        'notes',
    ];

    /**
     * Relasi: Riwayat log milik satu pesanan
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /**
     * Relasi: Staf yang mengubah status (bisa null jika customer/sistem)
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
