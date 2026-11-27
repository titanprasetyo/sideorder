<?php

namespace App\Services\Media;

use App\Models\MenuImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MenuImageStorageService
{
    /**
     * Daftar MIME gambar yang diizinkan untuk disajikan ke browser.
     *
     * @var array<string, string>
     */
    private const array EXTENSION_TO_MIME = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
    ];

    /**
     * Simpan file foto menu secara persisten agar tetap aman di hosting ephemeral (Laravel Cloud)
     * maupun lingkungan pengembangan lokal.
     */
    public function store(UploadedFile $file): ?string
    {
        $cloudDisk = $this->resolveExternalCloudDisk();
        if ($cloudDisk !== null) {
            $stored = $file->store('menus', $cloudDisk);

            return is_string($stored) ? $stored : null;
        }

        $realPath = $file->getRealPath();
        if (! is_string($realPath) || $realPath === '' || ! is_file($realPath)) {
            $fallback = $file->store('menus', 'public');

            return is_string($fallback) ? $fallback : null;
        }

        $binary = file_get_contents($realPath);
        if (! is_string($binary) || $binary === '') {
            return null;
        }

        $extension = $this->resolveSafeExtension($file);
        $mimeType = $this->resolveSafeMimeType($file->getMimeType(), $extension);
        $path = 'menus/'.Str::random(40).'.'.$extension;
        $etag = hash('sha256', $binary);

        // 1. Simpan permanen ke database agar tidak hilang saat redeploy/restart container Laravel Cloud
        try {
            MenuImage::query()->updateOrCreate(
                ['path' => $path],
                [
                    'mime_type' => $mimeType,
                    'content_base64' => base64_encode($binary),
                    'size_bytes' => strlen($binary),
                    'etag' => $etag,
                ],
            );
        } catch (\Throwable) {
            // Fallback bila tabel menu_images belum dimigrasi; tetap simpan ke disk public
        }

        // 2. Sinkronkan pula ke disk public (best-effort untuk kompatibilitas lokal & tooling)
        try {
            Storage::disk('public')->put($path, $binary);
        } catch (\Throwable) {
            // Abaikan bila filesystem container read-only
        }

        return $path;
    }

    /**
     * Hapus foto menu lama dari seluruh lapisan penyimpanan (cloud disk, database, dan disk public).
     */
    public function delete(?string $imagePath): void
    {
        $normalized = $this->normalizeStoragePath($imagePath);
        if ($normalized === null) {
            return;
        }

        $cloudDisk = $this->resolveExternalCloudDisk();
        if ($cloudDisk !== null) {
            try {
                if (Storage::disk($cloudDisk)->exists($normalized)) {
                    Storage::disk($cloudDisk)->delete($normalized);
                }
            } catch (\Throwable) {
                // Abaikan error penghapusan cloud disk
            }
        }

        try {
            MenuImage::query()->where('path', $normalized)->delete();
        } catch (\Throwable) {
            // Abaikan bila tabel belum dimigrasi
        }

        try {
            if (Storage::disk('public')->exists($normalized)) {
                Storage::disk('public')->delete($normalized);
            }
        } catch (\Throwable) {
            // Abaikan error penghapusan lokal
        }
    }

    /**
     * Resolusi URL publik gambar menu tanpa melakukan query DB / I/O filesystem
     * sehingga tetap sangat cepat pada endpoint sinkronisasi real-time.
     */
    public function resolvePublicUrl(?string $imagePath): ?string
    {
        if ($imagePath === null) {
            return null;
        }

        $trimmed = trim($imagePath);
        if ($trimmed === '') {
            return null;
        }

        if (str_starts_with($trimmed, 'http://') || str_starts_with($trimmed, 'https://')) {
            return $trimmed;
        }

        $normalized = $this->normalizeStoragePath($trimmed);
        if ($normalized === null) {
            return null;
        }

        $cloudDisk = $this->resolveExternalCloudDisk();
        if ($cloudDisk !== null) {
            try {
                return Storage::disk($cloudDisk)->url($normalized);
            } catch (\Throwable) {
                // Lanjut ke endpoint media internal
            }
        }

        $relative = str_starts_with($normalized, 'menus/')
            ? substr($normalized, strlen('menus/'))
            : $normalized;

        if ($relative === '' || str_contains($relative, '..')) {
            return null;
        }

        $encodedSegments = array_map(
            static fn (string $segment): string => rawurlencode($segment),
            explode('/', $relative),
        );

        return '/menu-images/'.implode('/', $encodedSegments);
    }

    /**
     * Ambil payload biner gambar menu berdasarkan path relatif di route `/menu-images/{path}`.
     * Urutan prioritas: Database (`menu_images`) -> Disk `public` -> Aset bawaan `public/images/menus`.
     *
     * @return array{binary: string, mime_type: string, etag: string, size_bytes: int}|null
     */
    public function resolveImagePayload(string $requestedPath): ?array
    {
        $clean = $this->sanitizeRelativePath($requestedPath);
        if ($clean === null) {
            return null;
        }

        $storagePath = str_starts_with($clean, 'menus/') ? $clean : 'menus/'.$clean;
        $relativeInsideMenus = str_starts_with($clean, 'menus/')
            ? substr($clean, strlen('menus/'))
            : $clean;

        // 1. Cek penyimpanan persisten di database (foto baru yang diupload di Laravel Cloud / Admin)
        try {
            /** @var MenuImage|null $record */
            $record = MenuImage::query()
                ->where('path', $storagePath)
                ->orWhere('path', $clean)
                ->first();

            if ($record instanceof MenuImage) {
                $decoded = base64_decode($record->content_base64, true);
                if (is_string($decoded) && $decoded !== '') {
                    return [
                        'binary' => $decoded,
                        'mime_type' => $this->resolveSafeMimeType($record->mime_type, pathinfo($storagePath, PATHINFO_EXTENSION)),
                        'etag' => $record->etag !== '' ? $record->etag : hash('sha256', $decoded),
                        'size_bytes' => strlen($decoded),
                    ];
                }
            }
        } catch (\Throwable) {
            // Lanjut ke fallback filesystem bila tabel belum dimigrasi
        }

        // 2. Cek disk public lokal (`storage/app/public/menus/...`)
        try {
            $disk = Storage::disk('public');
            $candidate = $disk->exists($storagePath)
                ? $storagePath
                : ($disk->exists($clean) ? $clean : null);

            if ($candidate !== null) {
                $binary = $disk->get($candidate);
                if (is_string($binary) && $binary !== '') {
                    $detectedMime = $disk->mimeType($candidate);

                    return [
                        'binary' => $binary,
                        'mime_type' => $this->resolveSafeMimeType(
                            is_string($detectedMime) ? $detectedMime : null,
                            pathinfo($candidate, PATHINFO_EXTENSION),
                        ),
                        'etag' => hash('sha256', $binary),
                        'size_bytes' => strlen($binary),
                    ];
                }
            }
        } catch (\Throwable) {
            // Lanjut ke aset statis public/images/menus
        }

        // 3. Cek aset gambar menu yang ikut ter-deploy di `public/images/menus/...`
        $bundledPath = public_path('images/menus/'.$relativeInsideMenus);
        $realBundledDir = realpath(public_path('images/menus'));
        $realBundledFile = realpath($bundledPath);

        if (
            is_string($realBundledDir)
            && is_string($realBundledFile)
            && str_starts_with($realBundledFile, $realBundledDir.DIRECTORY_SEPARATOR)
            && is_file($realBundledFile)
        ) {
            $binary = file_get_contents($realBundledFile);
            if (is_string($binary) && $binary !== '') {
                $detectedMime = function_exists('mime_content_type') ? mime_content_type($realBundledFile) : false;

                return [
                    'binary' => $binary,
                    'mime_type' => $this->resolveSafeMimeType(
                        is_string($detectedMime) ? $detectedMime : null,
                        pathinfo($realBundledFile, PATHINFO_EXTENSION),
                    ),
                    'etag' => hash('sha256', $binary),
                    'size_bytes' => strlen($binary),
                ];
            }
        }

        return null;
    }

    /**
     * Deteksi apakah Object Storage S3/R2 secara eksplisit dikonfigurasi untuk menyimpan media.
     */
    private function resolveExternalCloudDisk(): ?string
    {
        $configuredDisk = config('filesystems.default');
        if ($configuredDisk === 's3') {
            $bucket = config('filesystems.disks.s3.bucket');
            if (is_string($bucket) && trim($bucket) !== '') {
                return 's3';
            }
        }

        return null;
    }

    private function normalizeStoragePath(?string $imagePath): ?string
    {
        if ($imagePath === null) {
            return null;
        }

        $trimmed = trim(str_replace('\\', '/', $imagePath));
        if ($trimmed === '') {
            return null;
        }

        $trimmed = ltrim($trimmed, '/');
        if (str_starts_with($trimmed, 'storage/')) {
            $trimmed = substr($trimmed, strlen('storage/'));
        }

        if ($trimmed === '' || str_contains($trimmed, '..') || str_contains($trimmed, "\0")) {
            return null;
        }

        return $trimmed;
    }

    private function sanitizeRelativePath(string $rawPath): ?string
    {
        $decoded = trim(str_replace('\\', '/', rawurldecode($rawPath)));
        $decoded = ltrim($decoded, '/');

        if (
            $decoded === ''
            || str_contains($decoded, '..')
            || str_contains($decoded, "\0")
            || preg_match('/^[A-Za-z0-9._\-\/]+$/', $decoded) !== 1
        ) {
            return null;
        }

        return $decoded;
    }

    private function resolveSafeExtension(UploadedFile $file): string
    {
        $ext = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'jpg');
        if ($ext === 'jpeg') {
            return 'jpg';
        }

        return array_key_exists($ext, self::EXTENSION_TO_MIME) ? $ext : 'jpg';
    }

    private function resolveSafeMimeType(?string $detectedMime, string $extension): string
    {
        $normalizedExt = strtolower(trim($extension));
        $allowedMimes = array_values(array_unique(self::EXTENSION_TO_MIME));

        if (is_string($detectedMime) && in_array(strtolower($detectedMime), $allowedMimes, true)) {
            return strtolower($detectedMime);
        }

        return self::EXTENSION_TO_MIME[$normalizedExt] ?? 'image/jpeg';
    }
}
