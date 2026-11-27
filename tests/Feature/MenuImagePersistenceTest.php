<?php

use App\Models\Category;
use App\Models\Menu;
use App\Models\MenuImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->create([
        'name' => 'Admin Media',
        'email' => 'admin.media@sideline.com',
        'role' => 'admin',
    ]);

    $this->category = Category::create([
        'name' => 'Signature Coffee',
        'slug' => 'signature-coffee',
        'sort_order' => 1,
        'is_active' => true,
    ]);
});

test('uploaded menu image persists in database and survives ephemeral disk wipe on cloud hosting', function () {
    Storage::fake('public');

    $pngBytes = base64_decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        true,
    );
    expect($pngBytes)->toBeString();

    $uploadedFile = UploadedFile::fake()->createWithContent('latte.png', (string) $pngBytes);

    $this->actingAs($this->admin)
        ->post(route('admin.menus.store'), [
            'category_id' => $this->category->id,
            'name' => 'Cloud Latte',
            'base_price' => 28000,
            'is_active' => true,
            'image' => $uploadedFile,
        ])
        ->assertRedirect();

    $menu = Menu::where('name', 'Cloud Latte')->firstOrFail();
    expect($menu->image_path)->toStartWith('menus/')
        ->and($menu->image_url)->toStartWith('/menu-images/');

    $record = MenuImage::where('path', $menu->image_path)->first();
    expect($record)->not->toBeNull()
        ->and($record->mime_type)->toBe('image/png');

    // Simulasikan redeploy container Laravel Cloud (seluruh file lokal di disk public terhapus)
    Storage::disk('public')->delete((string) $menu->image_path);
    expect(Storage::disk('public')->exists((string) $menu->image_path))->toBeFalse();

    $response = $this->get((string) $menu->image_url);
    $response->assertOk()
        ->assertHeader('Content-Type', 'image/png')
        ->assertHeader('X-Content-Type-Options', 'nosniff');

    expect((string) $response->headers->get('Cache-Control'))
        ->toContain('public')
        ->toContain('max-age=31536000')
        ->toContain('immutable')
        ->and($response->headers->getCookies())->toBeEmpty();

    $etag = (string) $response->headers->get('ETag');
    expect($etag)->not->toBe('');

    // Verifikasi dukungan 304 Not Modified untuk caching CDN/browser
    $this->withHeaders(['If-None-Match' => $etag])
        ->get((string) $menu->image_url)
        ->assertStatus(304);

    // Menghapus menu juga menghapus record gambar di tabel menu_images
    $this->actingAs($this->admin)
        ->delete(route('admin.menus.destroy', $menu))
        ->assertRedirect();

    expect(MenuImage::where('path', $menu->image_path)->exists())->toBeFalse();
});

test('existing bundled production menu photos are served cleanly without needing storage symlink', function () {
    Storage::fake('public');

    $existingFilename = 'UCzNzGeoMT9ZE8Q3macwLaLsGpwqvBuDGUUHVqXQ.jpg';
    expect(is_file(public_path('images/menus/'.$existingFilename)))->toBeTrue();

    $menu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Existing Menu',
        'slug' => 'existing-menu',
        'image_path' => 'menus/'.$existingFilename,
        'base_price' => 25000,
        'is_active' => true,
    ]);

    expect($menu->image_url)->toBe('/menu-images/'.$existingFilename);

    $this->get((string) $menu->image_url)
        ->assertOk()
        ->assertHeader('Content-Type', 'image/jpeg');

    // Path traversal wajib ditolak
    $this->get('/menu-images/..%2F..%2F.env')->assertNotFound();
    $this->get('/menu-images/tidak-ada-file.jpg')->assertNotFound();
});
