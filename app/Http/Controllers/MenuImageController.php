<?php

namespace App\Http\Controllers;

use App\Services\Media\MenuImageStorageService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class MenuImageController extends Controller
{
    public function __construct(
        private readonly MenuImageStorageService $menuImageStorage,
    ) {}

    /**
     * Sajikan gambar menu secara stateless agar dapat di-cache penuh oleh browser & CDN (Cloudflare/Laravel Cloud).
     */
    public function show(Request $request, string $path): Response
    {
        $payload = $this->menuImageStorage->resolveImagePayload($path);
        if ($payload === null) {
            abort(404);
        }

        $etag = '"'.$payload['etag'].'"';
        $ifNoneMatch = trim((string) $request->header('If-None-Match', ''));

        if ($ifNoneMatch === $etag || $ifNoneMatch === 'W/'.$etag) {
            return response('', 304, [
                'ETag' => $etag,
                'Cache-Control' => 'public, max-age=31536000, immutable',
                'X-Content-Type-Options' => 'nosniff',
            ]);
        }

        return response($payload['binary'], 200, [
            'Content-Type' => $payload['mime_type'],
            'Content-Length' => (string) $payload['size_bytes'],
            'ETag' => $etag,
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
