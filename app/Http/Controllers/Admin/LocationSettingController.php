<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LocationSettingRequest;
use App\Models\CafeSetting;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class LocationSettingController extends Controller
{
    /**
     * Halaman pengaturan titik koordinat GPS dan radius akses Café SIDE LINE.
     */
    public function edit(): Response
    {
        $setting = CafeSetting::current()->loadMissing('updatedByUser:id,name');

        return Inertia::render('admin/location-settings/index', [
            'setting' => [
                'id' => $setting->id,
                'cafe_name' => $setting->cafe_name,
                'address' => $setting->address,
                'is_location_restricted' => (bool) $setting->is_location_restricted,
                'latitude' => $setting->latitude !== null ? (float) $setting->latitude : null,
                'longitude' => $setting->longitude !== null ? (float) $setting->longitude : null,
                'access_radius_meters' => (int) $setting->access_radius_meters,
                'min_radius_meters' => CafeSetting::MIN_RADIUS_METERS,
                'max_radius_meters' => CafeSetting::MAX_RADIUS_METERS,
                'is_enforcement_active' => $setting->isEnforcementActive(),
                'updated_at' => $setting->updated_at?->toIso8601String(),
                'updated_by_name' => $setting->updatedByUser?->name,
            ],
        ]);
    }

    /**
     * Simpan pembaruan titik koordinat kafe dan radius akses dari Admin.
     */
    public function update(LocationSettingRequest $request): RedirectResponse
    {
        $validated = $request->validated();
        $user = $request->user();
        $setting = CafeSetting::current();

        $latitude = isset($validated['latitude']) && $validated['latitude'] !== '' && is_numeric($validated['latitude'])
            ? round((float) $validated['latitude'], 7)
            : null;
        $longitude = isset($validated['longitude']) && $validated['longitude'] !== '' && is_numeric($validated['longitude'])
            ? round((float) $validated['longitude'], 7)
            : null;

        $setting->update([
            'cafe_name' => trim((string) $validated['cafe_name']),
            'address' => isset($validated['address']) && trim((string) $validated['address']) !== ''
                ? trim((string) $validated['address'])
                : null,
            'is_location_restricted' => $request->boolean('is_location_restricted'),
            'latitude' => $latitude,
            'longitude' => $longitude,
            'access_radius_meters' => (int) $validated['access_radius_meters'],
            'updated_by' => $user?->id,
        ]);

        return back()->with('success', 'Pengaturan titik koordinat & radius akses Café SIDE LINE berhasil disimpan.');
    }
}
