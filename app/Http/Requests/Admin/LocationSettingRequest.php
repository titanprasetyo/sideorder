<?php

namespace App\Http\Requests\Admin;

use App\Models\CafeSetting;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class LocationSettingRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->isAdmin();
    }

    /**
     * Aturan validasi konfigurasi titik koordinat & radius geofencing kafe.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'cafe_name' => ['required', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'is_location_restricted' => ['required', 'boolean'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'access_radius_meters' => [
                'required',
                'integer',
                'min:'.CafeSetting::MIN_RADIUS_METERS,
                'max:'.CafeSetting::MAX_RADIUS_METERS,
            ],
        ];
    }

    /**
     * Pesan validasi kustom dalam Bahasa Indonesia.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        $minRadius = CafeSetting::MIN_RADIUS_METERS;
        $maxRadius = number_format(CafeSetting::MAX_RADIUS_METERS, 0, ',', '.');

        return [
            'cafe_name.required' => 'Nama lokasi kafe wajib diisi.',
            'latitude.between' => 'Latitude harus berada pada rentang -90 hingga 90.',
            'longitude.between' => 'Longitude harus berada pada rentang -180 hingga 180.',
            'access_radius_meters.required' => 'Radius akses lokasi (meter) wajib diisi.',
            'access_radius_meters.min' => "Radius akses minimal adalah {$minRadius} meter.",
            'access_radius_meters.max' => "Radius akses maksimal adalah {$maxRadius} meter.",
        ];
    }

    /**
     * Pastikan latitude & longitude terisi apabila pembatasan lokasi diaktifkan.
     *
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if (! $this->boolean('is_location_restricted')) {
                    return;
                }

                $lat = $this->input('latitude');
                $lng = $this->input('longitude');

                if ($lat === null || $lat === '' || ! is_numeric($lat)) {
                    $validator->errors()->add('latitude', 'Koordinat latitude kafe wajib diisi saat pembatasan lokasi diaktifkan.');
                }

                if ($lng === null || $lng === '' || ! is_numeric($lng)) {
                    $validator->errors()->add('longitude', 'Koordinat longitude kafe wajib diisi saat pembatasan lokasi diaktifkan.');
                }
            },
        ];
    }
}
