<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MenuOptionItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'option_group_id',
        'name',
        'additional_price',
        'is_default',
        'is_active',
        'sort_order',
    ];

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
     */
    public function optionGroup(): BelongsTo
    {
        return $this->belongsTo(MenuOptionGroup::class, 'option_group_id');
    }

    /**
     * Scope: Hanya ambil item yang aktif / tersedia
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
