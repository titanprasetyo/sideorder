<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MenuOptionGroup extends Model
{
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
     */
    public function menu(): BelongsTo
    {
        return $this->belongsTo(Menu::class);
    }

    /**
     * Relasi: Satu grup memiliki banyak pilihan item
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
