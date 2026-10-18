<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class CafeTable extends Model
{
    use HasFactory;

    protected $fillable = [
        'table_number',
        'name',
        'qr_token',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    /**
     * Boot model event: Otomatis generate qr_token acak jika belum ada
     */
    protected static function booted(): void
    {
        static::creating(function (CafeTable $table) {
            if (empty($table->qr_token)) {
                $table->qr_token = Str::random(32);
            }
        });
    }

    /**
     * Generate ulang token QR meja jika diperlukan
     */
    public function regenerateQrToken(): void
    {
        $this->update([
            'qr_token' => Str::random(32),
        ]);
    }

    /**
     * Relasi: Satu meja memiliki banyak pesanan
     */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    /**
     * Relasi: Pesanan yang masih aktif di meja ini (belum selesai / belum batal)
     */
    public function activeOrders(): HasMany
    {
        return $this->hasMany(Order::class)
            ->whereNotIn('order_status', ['completed', 'cancelled']);
    }

    /**
     * Scope: Hanya meja yang aktif
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}