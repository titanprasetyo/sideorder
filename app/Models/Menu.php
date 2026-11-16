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
 * @property int $category_id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string|null $image_path
 * @property string $base_price
 * @property bool $is_discount_active
 * @property string|null $discount_type
 * @property string $discount_value
 * @property bool $is_active
 * @property bool $is_limited_stock
 * @property int $stock_quantity
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read float $final_price
 * @property-read float $discount_amount
 * @property-read Category|null $category
 * @property-read Collection<int, MenuOptionGroup> $optionGroups
 */
class Menu extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    protected $fillable = [
        'category_id',
        'name',
        'slug',
        'description',
        'image_path',
        'base_price',
        'is_discount_active',
        'discount_type',
        'discount_value',
        'is_active',
        'is_limited_stock',
        'stock_quantity',
    ];

    protected $appends = [
        'final_price',
        'discount_amount',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'base_price' => 'decimal:2',
            'is_discount_active' => 'boolean',
            'discount_value' => 'decimal:2',
            'is_active' => 'boolean',
            'is_limited_stock' => 'boolean',
            'stock_quantity' => 'integer',
        ];
    }

    /**
     * Hitung harga akhir setelah diskon aktif diterapkan.
     */
    public function getFinalPriceAttribute(): float
    {
        $base = (float) $this->base_price;
        if (! $this->is_discount_active) {
            return $base;
        }

        $type = $this->discount_type;
        $val = (float) $this->discount_value;

        if ($type === 'percent' && $val > 0) {
            $cut = $base * ($val / 100);

            return max(0.0, round($base - $cut, 2));
        }

        if ($type === 'fixed' && $val > 0) {
            return max(0.0, round($base - $val, 2));
        }

        return $base;
    }

    /**
     * Hitung nominal potongan diskon yang didapat.
     */
    public function getDiscountAmountAttribute(): float
    {
        $base = (float) $this->base_price;
        $final = $this->final_price;

        return max(0.0, round($base - $final, 2));
    }

    /**
     * Relasi: Setiap menu milik satu kategori
     *
     * @return BelongsTo<Category, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /**
     * Relasi: Satu menu memiliki banyak grup opsi (ukuran, es, gula, topping)
     *
     * @return HasMany<MenuOptionGroup, $this>
     */
    public function optionGroups(): HasMany
    {
        return $this->hasMany(MenuOptionGroup::class);
    }

    /**
     * Scope untuk mengambil hanya menu yang aktif
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Cek apakah menu pembatasan stok sudah habis.
     */
    public function isOutOfStock(): bool
    {
        return $this->is_limited_stock && (int) $this->stock_quantity <= 0;
    }

    /**
     * Cek apakah stok mencukupi untuk kuantitas pesanan tertentu.
     */
    public function hasEnoughStock(int $quantity): bool
    {
        if (! $this->is_limited_stock) {
            return true;
        }

        return (int) $this->stock_quantity >= max(1, $quantity);
    }
}
