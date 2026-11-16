<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $option_group_id
 * @property string $name
 * @property string|null $icon
 * @property string $additional_price
 * @property bool $is_default
 * @property bool $is_active
 * @property int $sort_order
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read MenuOptionGroup|null $optionGroup
 */
class MenuOptionItem extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    public const ALLOWED_ICONS = [
        'cup-small',
        'cup-medium',
        'cup-large',
        'pint-small',
        'pint-medium',
        'pint-large',
        'coffee-small',
        'coffee-medium',
        'coffee-large',
        'mug',
        'tea-cup',
        'wine-glass',
        'martini-glass',
        'bottle',
        'bowl',
        'ice-cream',
        'cookie',
    ];

    protected $fillable = [
        'option_group_id',
        'name',
        'icon',
        'additional_price',
        'is_default',
        'is_active',
        'sort_order',
    ];

    public static function resolveIcon(?string $icon, string $name, int $index = 0): string
    {
        if ($icon && in_array($icon, self::ALLOWED_ICONS, true)) {
            return $icon;
        }

        $lower = strtolower(trim($name));

        if (
            str_contains($lower, 'small') ||
            str_contains($lower, 'kecil') ||
            str_contains($lower, 'mini') ||
            $lower === 's'
        ) {
            return 'cup-small';
        }

        if (
            str_contains($lower, 'large') ||
            str_contains($lower, 'besar') ||
            str_contains($lower, 'jumbo') ||
            str_contains($lower, 'upsize') ||
            $lower === 'l' ||
            $lower === 'xl'
        ) {
            return 'cup-large';
        }

        if (
            str_contains($lower, 'medium') ||
            str_contains($lower, 'sedang') ||
            str_contains($lower, 'regular') ||
            str_contains($lower, 'reguler') ||
            $lower === 'm' ||
            $lower === 'r'
        ) {
            return 'cup-medium';
        }

        if (str_contains($lower, 'botol') || str_contains($lower, 'bottle')) {
            return 'bottle';
        }

        if (str_contains($lower, 'bowl') || str_contains($lower, 'mangkuk')) {
            return 'bowl';
        }

        $defaults = ['cup-small', 'cup-medium', 'cup-large'];

        return $defaults[min(max(0, $index), 2)];
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'additional_price' => 'decimal:2',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /**
     * Relasi: Pilihan item dimiliki oleh satu grup opsi
     *
     * @return BelongsTo<MenuOptionGroup, $this>
     */
    public function optionGroup(): BelongsTo
    {
        return $this->belongsTo(MenuOptionGroup::class, 'option_group_id');
    }

    /**
     * Scope: Hanya ambil item yang aktif / tersedia
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
