<?php

namespace App\Services\Geofencing;

use App\Models\CafeSetting;
use Illuminate\Http\Request;

class LocationAccessService
{
    private const float EARTH_RADIUS_METERS = 6371000.0;

    private const string SESSION_KEY = 'sideorder_location_verification';

    private const int SESSION_TTL_SECONDS = 1800;

    /**
     * Hitung jarak permukaan bumi (meter) antar dua titik koordinat dengan rumus Haversine.
     */
    public function calculateDistanceMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $deltaLat = deg2rad($lat2 - $lat1);
        $deltaLng = deg2rad($lng2 - $lng1);

        $a = sin($deltaLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * (sin($deltaLng / 2) ** 2);

        $c = 2 * atan2(sqrt($a), sqrt(max(0.0, 1.0 - $a)));

        return round(self::EARTH_RADIUS_METERS * $c, 2);
    }

    /**
     * Evaluasi koordinat customer terhadap titik koordinat & radius Café SIDE LINE di database.
     *
     * @return array{
     *     allowed: bool,
     *     restricted: bool,
     *     distance_meters: float|null,
     *     radius_meters: int,
     *     message: string
     * }
     */
    public function evaluateCoordinates(float $customerLatitude, float $customerLongitude, ?CafeSetting $setting = null): array
    {
        $resolved = $setting ?? CafeSetting::current();

        if (! $resolved->isEnforcementActive()) {
            return [
                'allowed' => true,
                'restricted' => false,
                'distance_meters' => null,
                'radius_meters' => $resolved->access_radius_meters,
                'message' => 'Pembatasan akses lokasi saat ini tidak aktif.',
            ];
        }

        $distanceMeters = $this->calculateDistanceMeters(
            (float) $resolved->latitude,
            (float) $resolved->longitude,
            $customerLatitude,
            $customerLongitude,
        );

        $radiusMeters = $resolved->access_radius_meters;
        $allowed = $distanceMeters <= (float) $radiusMeters;

        return [
            'allowed' => $allowed,
            'restricted' => true,
            'distance_meters' => $distanceMeters,
            'radius_meters' => $radiusMeters,
            'message' => $allowed
                ? "Lokasi Anda terverifikasi di area {$resolved->cafe_name}."
                : 'Lokasi Anda berada di luar jangkauan pemesanan.',
        ];
    }

    /**
     * Verifikasi koordinat dari browser dan simpan bukti validasi di session Laravel (atau cabut jika di luar radius).
     *
     * @return array{
     *     allowed: bool,
     *     restricted: bool,
     *     distance_meters: float|null,
     *     radius_meters: int,
     *     message: string
     * }
     */
    public function verifyAndStoreSession(
        Request $request,
        float $customerLatitude,
        float $customerLongitude,
        ?float $accuracyMeters = null,
        ?CafeSetting $setting = null,
    ): array {
        $resolved = $setting ?? CafeSetting::current();
        $evaluation = $this->evaluateCoordinates($customerLatitude, $customerLongitude, $resolved);

        if (! $evaluation['allowed']) {
            $request->session()->forget(self::SESSION_KEY);

            return $evaluation;
        }

        $request->session()->put(self::SESSION_KEY, [
            'allowed' => true,
            'latitude' => $customerLatitude,
            'longitude' => $customerLongitude,
            'accuracy' => $accuracyMeters,
            'distance_meters' => $evaluation['distance_meters'],
            'setting_version' => $resolved->configVersion(),
            'verified_at' => now()->timestamp,
        ]);

        return $evaluation;
    }

    /**
     * Periksa apakah request diizinkan mengakses menu atau melakukan checkout berdasarkan sesi dan/atau koordinat terbaru.
     *
     * @return array{
     *     allowed: bool,
     *     restricted: bool,
     *     distance_meters: float|null,
     *     radius_meters: int,
     *     message: string
     * }
     */
    public function authorizeRequest(
        Request $request,
        ?float $incomingLatitude = null,
        ?float $incomingLongitude = null,
        ?CafeSetting $setting = null,
    ): array {
        $resolved = $setting ?? CafeSetting::current();

        if (! $resolved->isEnforcementActive()) {
            return [
                'allowed' => true,
                'restricted' => false,
                'distance_meters' => null,
                'radius_meters' => $resolved->access_radius_meters,
                'message' => 'Akses pemesanan dibuka.',
            ];
        }

        if ($incomingLatitude !== null && $incomingLongitude !== null) {
            return $this->verifyAndStoreSession(
                $request,
                $incomingLatitude,
                $incomingLongitude,
                null,
                $resolved,
            );
        }

        $sessionData = $request->session()->get(self::SESSION_KEY);
        if (! is_array($sessionData) || empty($sessionData['allowed'])) {
            return [
                'allowed' => false,
                'restricted' => true,
                'distance_meters' => null,
                'radius_meters' => $resolved->access_radius_meters,
                'message' => 'Lokasi Anda berada di luar jangkauan pemesanan.',
            ];
        }

        $verifiedAt = (int) ($sessionData['verified_at'] ?? 0);
        $storedVersion = (string) ($sessionData['setting_version'] ?? '');
        $storedLat = isset($sessionData['latitude']) && is_numeric($sessionData['latitude'])
            ? (float) $sessionData['latitude']
            : null;
        $storedLng = isset($sessionData['longitude']) && is_numeric($sessionData['longitude'])
            ? (float) $sessionData['longitude']
            : null;

        if (
            $verifiedAt <= 0
            || (time() - $verifiedAt) > self::SESSION_TTL_SECONDS
            || $storedVersion !== $resolved->configVersion()
            || $storedLat === null
            || $storedLng === null
        ) {
            $request->session()->forget(self::SESSION_KEY);

            return [
                'allowed' => false,
                'restricted' => true,
                'distance_meters' => null,
                'radius_meters' => $resolved->access_radius_meters,
                'message' => 'Akses lokasi perlu diperbarui. Silakan muat ulang halaman.',
            ];
        }

        $recheck = $this->evaluateCoordinates($storedLat, $storedLng, $resolved);
        if (! $recheck['allowed']) {
            $request->session()->forget(self::SESSION_KEY);
        }

        return $recheck;
    }

    /**
     * Ringkasan status akses lokasi untuk dirender oleh halaman Inertia customer (tanpa membocorkan koordinat target).
     *
     * @return array{
     *     required: bool,
     *     verified: bool,
     *     cafe_name: string,
     *     address: string|null,
     *     radius_meters: int,
     *     distance_meters: float|null,
     *     message: string|null
     * }
     */
    public function getCustomerGateProps(Request $request, ?CafeSetting $setting = null): array
    {
        $resolved = $setting ?? CafeSetting::current();
        $required = $resolved->isEnforcementActive();

        if (! $required) {
            return [
                'required' => false,
                'verified' => true,
                'cafe_name' => $resolved->cafe_name,
                'address' => $resolved->address,
                'radius_meters' => $resolved->access_radius_meters,
                'distance_meters' => null,
                'message' => null,
            ];
        }

        $check = $this->authorizeRequest($request, null, null, $resolved);

        return [
            'required' => true,
            'verified' => $check['allowed'],
            'cafe_name' => $resolved->cafe_name,
            'address' => $resolved->address,
            'radius_meters' => $resolved->access_radius_meters,
            'distance_meters' => $check['distance_meters'],
            'message' => $check['allowed'] ? $check['message'] : null,
        ];
    }
}
