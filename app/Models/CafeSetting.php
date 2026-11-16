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

    protected $fillable = [
        'cafe_name',
        'address',
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
