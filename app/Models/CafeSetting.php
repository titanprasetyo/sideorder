<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Pengaturan lokasi geografis & radius akses Café SIDE LINE (single-record configuration).
 *
 * @property int $id
 * @property string $cafe_name
 * @property string|null $address
 * @property string|null $phone
 * @property string|null $receipt_footer
 * @property bool $is_ordering_enabled
 * @property string|null $closed_message
 * @property bool $allow_cash_payment
 * @property bool $allow_xendit_payment
 * @property int $payment_expiry_minutes
 * @property bool $is_location_restricted
 * @property float|null $latitude
 * @property float|null $longitude
 * @property int $access_radius_meters
 * @property int|null $updated_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $updatedByUser
 */
class CafeSetting extends Model
{
    public const int DEFAULT_RADIUS_METERS = 100;

    public const int MIN_RADIUS_METERS = 10;

    public const int MAX_RADIUS_METERS = 10000;

    public const int DEFAULT_PAYMENT_EXPIRY_MINUTES = 15;

    public const int MIN_PAYMENT_EXPIRY_MINUTES = 5;

    public const int MAX_PAYMENT_EXPIRY_MINUTES = 120;

    protected $fillable = [
        'cafe_name',
        'address',
        'phone',
        'receipt_footer',
        'is_ordering_enabled',
        'closed_message',
        'allow_cash_payment',
        'allow_xendit_payment',
        'payment_expiry_minutes',
        'is_location_restricted',
        'latitude',
        'longitude',
        'access_radius_meters',
        'updated_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_ordering_enabled' => 'boolean',
            'allow_cash_payment' => 'boolean',
            'allow_xendit_payment' => 'boolean',
            'payment_expiry_minutes' => 'integer',
            'is_location_restricted' => 'boolean',
            'latitude' => 'float',
            'longitude' => 'float',
            'access_radius_meters' => 'integer',
        ];
    }

    /**
     * Ambil baris konfigurasi aktif atau buat default jika belum tersedia.
     */
    public static function current(): self
    {
        /** @var self|null $existing */
        $existing = self::query()->orderBy('id')->first();

        if ($existing instanceof self) {
            return $existing;
        }

        return self::query()->create([
            'cafe_name' => 'Café SIDE LINE',
            'address' => null,
            'phone' => null,
            'receipt_footer' => 'Terima kasih atas kunjungan Anda! Nikmati momen hangat di SIDE LINE.',
            'is_ordering_enabled' => true,
            'closed_message' => 'Pemesanan mandiri sedang ditutup sementara. Silakan hubungi kasir kami.',
            'allow_cash_payment' => true,
            'allow_xendit_payment' => true,
            'payment_expiry_minutes' => self::DEFAULT_PAYMENT_EXPIRY_MINUTES,
            'is_location_restricted' => false,
            'latitude' => null,
            'longitude' => null,
            'access_radius_meters' => self::DEFAULT_RADIUS_METERS,
        ]);
    }

    /**
     * Relasi: Admin terakhir yang memperbarui konfigurasi lokasi.
     *
     * @return BelongsTo<User, $this>
     */
    public function updatedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Cek apakah pembatasan geofencing aktif dan koordinat kafe telah valid.
     */
    public function isEnforcementActive(): bool
    {
        return $this->is_location_restricted
            && $this->latitude !== null
            && $this->longitude !== null
            && $this->access_radius_meters > 0;
    }

    /**
     * Signature versi konfigurasi agar sesi lama otomatis kedaluwarsa saat Admin mengubah titik atau radius.
     */
    public function configVersion(): string
    {
        $lat = $this->latitude !== null ? number_format((float) $this->latitude, 7, '.', '') : 'null';
        $lng = $this->longitude !== null ? number_format((float) $this->longitude, 7, '.', '') : 'null';

        return hash('sha256', implode('|', [
            $this->is_location_restricted ? '1' : '0',
            $lat,
            $lng,
            (string) $this->access_radius_meters,
        ]));
    }
}
