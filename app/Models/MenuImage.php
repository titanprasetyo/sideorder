<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Penyimpanan persisten gambar menu (aman pada container ephemeral seperti Laravel Cloud).
 *
 * @property int $id
 * @property string $path
 * @property string $mime_type
 * @property string $content_base64
 * @property int $size_bytes
 * @property string $etag
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class MenuImage extends Model
{
    protected $fillable = [
        'path',
        'mime_type',
        'content_base64',
        'size_bytes',
        'etag',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
        ];
    }
}
