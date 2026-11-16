<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * @property int $id
 * @property string $table_number
 * @property string|null $name
 * @property string $qr_token
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Order> $orders
 * @property-read Collection<int, Order> $activeOrders
 */
class CafeTable extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    protected $fillable = [
        'table_number',
        'name',
        'qr_token',
        'is_active',
    ];

    /**
     * @return array<string, string>
     */
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
        static::creating(function (CafeTable $table): void {
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
     *
     * @return HasMany<Order, $this>
     */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    /**
     * Relasi: Pesanan yang masih aktif di meja ini (belum selesai / belum batal)
     *
     * @return HasMany<Order, $this>
     */
    public function activeOrders(): HasMany
    {
        return $this->hasMany(Order::class)
            ->whereNotIn('order_status', ['completed', 'cancelled']);
    }

    /**
     * Scope: Hanya meja yang aktif
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
