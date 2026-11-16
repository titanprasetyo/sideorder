<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $menu_id
 * @property string $name
 * @property string $selection_type
 * @property bool $is_required
 * @property int $min_selection
 * @property int|null $max_selection
 * @property int $sort_order
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Menu|null $menu
 * @property-read Collection<int, MenuOptionItem> $optionItems
 */
class MenuOptionGroup extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    protected $fillable = [
        'menu_id',
        'name',
        'selection_type',
        'is_required',
        'min_selection',
        'max_selection',
        'sort_order',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_required' => 'boolean',
            'min_selection' => 'integer',
            'max_selection' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    /**
     * Relasi: Grup opsi dimiliki oleh satu menu
     *
     * @return BelongsTo<Menu, $this>
     */
    public function menu(): BelongsTo
    {
        return $this->belongsTo(Menu::class);
    }

    /**
     * Relasi: Satu grup memiliki banyak pilihan item
     *
     * @return HasMany<MenuOptionItem, $this>
     */
    public function optionItems(): HasMany
    {
        return $this->hasMany(MenuOptionItem::class, 'option_group_id')->orderBy('sort_order');
    }

    /**
     * Helper: Apakah pilihan tunggal (Radio button)
     */
    public function isSingle(): bool
    {
        return $this->selection_type === 'single';
    }

    /**
     * Helper: Apakah pilihan ganda (Checkbox)
     */
    public function isMultiple(): bool
    {
        return $this->selection_type === 'multiple';
    }
}
