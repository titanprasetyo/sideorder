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
     * Batas maksimum toleransi ketidakpastian GPS (meter) agar pelanggan di dalam gedung kafe
     * tidak tertolak akibat drift GPS indoor, sekaligus mencegah bypass dari lokasi jauh.
     */
    private const float MAX_ACCURACY_TOLERANCE_METERS = 250.0;

    private const float MIN_ACCURACY_CAP_METERS = 150.0;

    private const float MAX_RECORDED_ACCURACY_METERS = 10000000.0;

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
     * Evaluasi koordinat customer terhadap titik koordinat & radius Café SIDE LINE di database,
     * dengan toleransi terukur untuk ketidakpastian sinyal GPS di dalam ruangan.
     *
     * @return array{
     *     allowed: bool,
     *     restricted: bool,
     *     distance_meters: float|null,
     *     radius_meters: int,
     *     accuracy_meters: float|null,
     *     effective_radius_meters: float,
     *     message: string
     * }
     */
    public function evaluateCoordinates(
        float $customerLatitude,
        float $customerLongitude,
        ?CafeSetting $setting = null,
        ?float $accuracyMeters = null,
    ): array {
        $resolved = $setting ?? CafeSetting::current();
        $normalizedAccuracy = $this->normalizeAccuracyMeters($accuracyMeters);

        if (! $resolved->isEnforcementActive()) {
            return [
                'allowed' => true,
                'restricted' => false,
                'distance_meters' => null,
                'radius_meters' => $resolved->access_radius_meters,
                'accuracy_meters' => $normalizedAccuracy,
                'effective_radius_meters' => (float) $resolved->access_radius_meters,
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
        $accuracyTolerance = $this->resolveAccuracyToleranceMeters($normalizedAccuracy, $radiusMeters);
        $effectiveRadiusMeters = round((float) $radiusMeters + $accuracyTolerance, 2);
        $allowed = $distanceMeters <= $effectiveRadiusMeters;

        $message = $allowed
            ? "Lokasi Anda terverifikasi di area {$resolved->cafe_name}."
            : 'Lokasi Anda berada di luar jangkauan pemesanan.';

        return [
            'allowed' => $allowed,
            'restricted' => true,
            'distance_meters' => $distanceMeters,
            'radius_meters' => $radiusMeters,
            'accuracy_meters' => $normalizedAccuracy,
            'effective_radius_meters' => $effectiveRadiusMeters,
            'message' => $message,
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
     *     accuracy_meters: float|null,
     *     effective_radius_meters: float,
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
        $normalizedAccuracy = $this->normalizeAccuracyMeters($accuracyMeters);
        $evaluation = $this->evaluateCoordinates($customerLatitude, $customerLongitude, $resolved, $normalizedAccuracy);

        if (! $evaluation['allowed']) {
            $request->session()->forget(self::SESSION_KEY);

            return $evaluation;
        }

        $request->session()->put(self::SESSION_KEY, [
            'allowed' => true,
            'latitude' => $customerLatitude,
            'longitude' => $customerLongitude,
            'accuracy' => $normalizedAccuracy,
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
     *     accuracy_meters: float|null,
     *     effective_radius_meters: float,
     *     message: string
     * }
     */
    public function authorizeRequest(
        Request $request,
        ?float $incomingLatitude = null,
        ?float $incomingLongitude = null,
        ?CafeSetting $setting = null,
        ?float $incomingAccuracy = null,
    ): array {
        $resolved = $setting ?? CafeSetting::current();

        if (! $resolved->isEnforcementActive()) {
            return [
                'allowed' => true,
                'restricted' => false,
                'distance_meters' => null,
                'radius_meters' => $resolved->access_radius_meters,
                'accuracy_meters' => null,
                'effective_radius_meters' => (float) $resolved->access_radius_meters,
                'message' => 'Akses pemesanan dibuka.',
            ];
        }

        $sessionData = $request->session()->get(self::SESSION_KEY);

        if ($incomingLatitude !== null && $incomingLongitude !== null) {
            $resolvedAccuracy = $this->normalizeAccuracyMeters($incomingAccuracy);

            // Jika request checkout mengirim ulang koordinat yang sama persis dengan sesi terverifikasi
            // tanpa menyertakan field akurasi, gunakan nilai akurasi yang tercatat pada sesi tersebut.
            if (
                $resolvedAccuracy === null
                && is_array($sessionData)
                && ! empty($sessionData['allowed'])
                && isset($sessionData['latitude'], $sessionData['longitude'], $sessionData['accuracy'])
                && is_numeric($sessionData['latitude'])
                && is_numeric($sessionData['longitude'])
                && is_numeric($sessionData['accuracy'])
                && abs((float) $sessionData['latitude'] - $incomingLatitude) < 0.000001
                && abs((float) $sessionData['longitude'] - $incomingLongitude) < 0.000001
            ) {
                $resolvedAccuracy = $this->normalizeAccuracyMeters((float) $sessionData['accuracy']);
            }

            return $this->verifyAndStoreSession(
                $request,
                $incomingLatitude,
                $incomingLongitude,
                $resolvedAccuracy,
                $resolved,
            );
        }

        if (! is_array($sessionData) || empty($sessionData['allowed'])) {
            return [
                'allowed' => false,
                'restricted' => true,
                'distance_meters' => null,
                'radius_meters' => $resolved->access_radius_meters,
                'accuracy_meters' => null,
                'effective_radius_meters' => (float) $resolved->access_radius_meters,
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
        $storedAccuracy = isset($sessionData['accuracy']) && is_numeric($sessionData['accuracy'])
            ? $this->normalizeAccuracyMeters((float) $sessionData['accuracy'])
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
                'accuracy_meters' => null,
                'effective_radius_meters' => (float) $resolved->access_radius_meters,
                'message' => 'Akses lokasi perlu diperbarui. Silakan muat ulang halaman.',
            ];
        }

        $recheck = $this->evaluateCoordinates($storedLat, $storedLng, $resolved, $storedAccuracy);
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

    private function normalizeAccuracyMeters(?float $accuracyMeters): ?float
    {
        if ($accuracyMeters === null || ! is_finite($accuracyMeters) || $accuracyMeters < 0.0) {
            return null;
        }

        return round(min($accuracyMeters, self::MAX_RECORDED_ACCURACY_METERS), 2);
    }

    private function resolveAccuracyToleranceMeters(?float $accuracyMeters, int $radiusMeters): float
    {
        if ($accuracyMeters === null || $accuracyMeters <= 0.0) {
            return 0.0;
        }

        $maxBuffer = min(
            self::MAX_ACCURACY_TOLERANCE_METERS,
            max(self::MIN_ACCURACY_CAP_METERS, (float) $radiusMeters),
        );

        return round(min($accuracyMeters, $maxBuffer), 2);
    }
}
