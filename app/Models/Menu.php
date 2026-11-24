<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Date;

/**
 * @property int $id
 * @property int $category_id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string|null $image_path
 * @property string $base_price
 * @property string|null $cost_price
 * @property bool $is_discount_active
 * @property string|null $discount_type
 * @property string $discount_value
 * @property bool $is_active
 * @property bool $is_limited_stock
 * @property int $stock_quantity
 * @property int $stock_valid_days
 * @property CarbonInterface|null $stock_updated_at
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 * @property-read float $final_price
 * @property-read float $discount_amount
 * @property-read float|null $gross_margin_amount
 * @property-read float|null $gross_margin_percent
 * @property-read int $effective_stock_quantity
 * @property-read bool $is_stock_expired
 * @property-read string|null $stock_expires_at
 * @property-read string|null $stock_valid_until_label
 * @property-read string|null $stock_updated_at_label
 * @property-read Category|null $category
 * @property-read Collection<int, MenuOptionGroup> $optionGroups
 */
class Menu extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    public const string TIMEZONE = 'Asia/Jakarta';

    public const int DEFAULT_STOCK_VALID_DAYS = 1;

    protected $fillable = [
        'category_id',
        'name',
        'slug',
        'description',
        'image_path',
        'base_price',
        'cost_price',
        'is_discount_active',
        'discount_type',
        'discount_value',
        'is_active',
        'is_limited_stock',
        'stock_quantity',
        'stock_valid_days',
        'stock_updated_at',
    ];

    protected $appends = [
        'final_price',
        'discount_amount',
        'gross_margin_amount',
        'gross_margin_percent',
        'effective_stock_quantity',
        'is_stock_expired',
        'stock_expires_at',
        'stock_valid_until_label',
        'stock_updated_at_label',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $menu): void {
            if ((int) ($menu->stock_valid_days ?? 0) < 1) {
                $menu->stock_valid_days = self::DEFAULT_STOCK_VALID_DAYS;
            }

            if ($menu->is_limited_stock && $menu->stock_updated_at === null) {
                $menu->stock_updated_at = Date::now(self::TIMEZONE);
            }
        });
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'base_price' => 'decimal:2',
            'cost_price' => 'decimal:2',
            'is_discount_active' => 'boolean',
            'discount_value' => 'decimal:2',
            'is_active' => 'boolean',
            'is_limited_stock' => 'boolean',
            'stock_quantity' => 'integer',
            'stock_valid_days' => 'integer',
            'stock_updated_at' => 'datetime',
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
     * Hitung selisih laba kotor per porsi terhadap harga modal (HPP).
     */
    public function getGrossMarginAmountAttribute(): ?float
    {
        if ($this->cost_price === null) {
            return null;
        }

        return round($this->final_price - (float) $this->cost_price, 2);
    }

    /**
     * Hitung persentase margin kotor terhadap harga jual efektif.
     */
    public function getGrossMarginPercentAttribute(): ?float
    {
        $margin = $this->gross_margin_amount;
        if ($margin === null || $this->final_price <= 0) {
            return null;
        }

        return round(($margin / $this->final_price) * 100, 1);
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
     * Jumlah hari masa berlaku stok terbatas (minimal 1 hari kalender WIB).
     */
    public function stockValidDays(): int
    {
        return max(1, (int) ($this->stock_valid_days ?: self::DEFAULT_STOCK_VALID_DAYS));
    }

    /**
     * Batas waktu kedaluwarsa eksklusif (00:00:00 WIB setelah N hari masa berlaku selesai).
     */
    public function resolveStockExpiresAt(): ?CarbonInterface
    {
        if (! $this->is_limited_stock) {
            return null;
        }

        $ref = $this->stock_updated_at ?? $this->updated_at ?? $this->created_at;
        if (! $ref instanceof CarbonInterface) {
            return null;
        }

        return $ref->copy()
            ->timezone(self::TIMEZONE)
            ->startOfDay()
            ->addDays($this->stockValidDays());
    }

    /**
     * Cek apakah masa berlaku stok terbatas telah habis/kedaluwarsa.
     */
    public function hasExpiredStock(): bool
    {
        if (! $this->is_limited_stock) {
            return false;
        }

        $expiresAt = $this->resolveStockExpiresAt();
        if (! $expiresAt instanceof CarbonInterface) {
            return true;
        }

        return Date::now(self::TIMEZONE)->gte($expiresAt);
    }

    /**
     * Jumlah stok efektif yang dapat dipesan pelanggan (0 bila masa stok kedaluwarsa).
     */
    public function resolveEffectiveStockQuantity(): int
    {
        if (! $this->is_limited_stock) {
            return max(0, (int) $this->stock_quantity);
        }

        if ($this->hasExpiredStock()) {
            return 0;
        }

        return max(0, (int) $this->stock_quantity);
    }

    public function getEffectiveStockQuantityAttribute(): int
    {
        return $this->resolveEffectiveStockQuantity();
    }

    public function getIsStockExpiredAttribute(): bool
    {
        return $this->hasExpiredStock();
    }

    public function getStockExpiresAtAttribute(): ?string
    {
        $expiresAt = $this->resolveStockExpiresAt();

        return $expiresAt instanceof CarbonInterface ? $expiresAt->toIso8601String() : null;
    }

    public function getStockValidUntilLabelAttribute(): ?string
    {
        $expiresAt = $this->resolveStockExpiresAt();
        if (! $expiresAt instanceof CarbonInterface) {
            return null;
        }

        $lastDay = $expiresAt->copy()->subDay()->timezone(self::TIMEZONE);

        return $this->formatShortIndoDate($lastDay);
    }

    public function getStockUpdatedAtLabelAttribute(): ?string
    {
        if (! $this->stock_updated_at instanceof CarbonInterface) {
            return null;
        }

        $dt = $this->stock_updated_at->copy()->timezone(self::TIMEZONE);

        return $this->formatShortIndoDate($dt).', '.$dt->format('H:i').' WIB';
    }

    /**
     * Cek apakah menu pembatasan stok sudah habis atau kedaluwarsa.
     */
    public function isOutOfStock(): bool
    {
        return $this->is_limited_stock && $this->resolveEffectiveStockQuantity() <= 0;
    }

    /**
     * Cek apakah stok efektif mencukupi untuk kuantitas pesanan tertentu.
     */
    public function hasEnoughStock(int $quantity): bool
    {
        if (! $this->is_limited_stock) {
            return true;
        }

        return $this->resolveEffectiveStockQuantity() >= max(1, $quantity);
    }

    private function formatShortIndoDate(CarbonInterface $date): string
    {
        $months = [
            1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr',
            5 => 'Mei', 6 => 'Jun', 7 => 'Jul', 8 => 'Agu',
            9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des',
        ];

        return $date->format('d').' '.$months[$date->month].' '.$date->format('Y');
    }
}
