<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Catatan pengeluaran operasional dan kas keluar kafe SIDE LINE.
 *
 * @property int $id
 * @property Carbon $expense_date
 * @property string $category
 * @property string $title
 * @property string $amount
 * @property string $payment_source
 * @property string|null $notes
 * @property int|null $recorded_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $recordedByUser
 */
class Expense extends Model
{
    /** @use HasFactory<Factory<self>> */
    use HasFactory;

    public const array CATEGORIES = [
        'raw_materials' => 'Bahan Baku & Stok',
        'utilities' => 'Listrik, Air & Internet',
        'payroll' => 'Gaji & Honor Staf',
        'maintenance' => 'Perawatan & Alat Kafe',
        'marketing' => 'Promosi & Kemasan',
        'other' => 'Operasional Lainnya',
    ];

    public const array PAYMENT_SOURCES = [
        'cash' => 'Kas Tunai Laci',
        'bank' => 'Rekening Bank',
        'xendit_balance' => 'Saldo Digital (QRIS)',
    ];

    protected $fillable = [
        'expense_date',
        'category',
        'title',
        'amount',
        'payment_source',
        'notes',
        'recorded_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expense_date' => 'date:Y-m-d',
            'amount' => 'decimal:2',
        ];
    }

    /**
     * Relasi: Admin yang mencatat pengeluaran.
     *
     * @return BelongsTo<User, $this>
     */
    public function recordedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function getCategoryLabelAttribute(): string
    {
        return self::CATEGORIES[$this->category] ?? 'Operasional Lainnya';
    }

    public function getPaymentSourceLabelAttribute(): string
    {
        return self::PAYMENT_SOURCES[$this->payment_source] ?? 'Kas Tunai Laci';
    }
}
