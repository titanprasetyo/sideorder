<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Menu extends Model
{
    use HasFactory;

    protected $fillable = [
        'category_id',
        'name',
        'slug',
        'description',
        'image_path',
        'base_price',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'base_price' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    /**
     * Relasi: Setiap menu milik satu kategori
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /**
     * Relasi: Satu menu memiliki banyak grup opsi (ukuran, es, gula, topping)
     */
    public function optionGroups(): HasMany
    {
        return $this->hasMany(MenuOptionGroup::class);
    }

    /**
     * Scope untuk mengambil hanya menu yang aktif
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}