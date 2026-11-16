<?php

use App\Events\OrderCreated;
use App\Models\CafeSetting;
use App\Models\CafeTable;
use App\Models\Category;
use App\Models\Menu;
use App\Models\Order;
use App\Models\User;
use App\Services\Geofencing\LocationAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->create([
        'name' => 'Owner Admin',
        'email' => 'admin.geo@sideline.com',
        'role' => 'admin',
    ]);

    $this->cashier = User::factory()->create([
        'name' => 'Kasir Shift',
        'email' => 'kasir.geo@sideline.com',
        'role' => 'cashier',
    ]);

    $this->table = CafeTable::create([
        'table_number' => '12',
        'name' => 'Meja Indoor 12',
        'is_active' => true,
    ]);

    $this->category = Category::create([
        'name' => 'Coffee Bar',
        'slug' => 'coffee-bar',
        'sort_order' => 1,
        'is_active' => true,
    ]);

    $this->menu = Menu::create([
        'category_id' => $this->category->id,
        'name' => 'Es Kopi Susu SIDE LINE',
        'slug' => 'es-kopi-susu-side-line',
        'base_price' => 24000,
        'is_active' => true,
    ]);

    // Titik koordinat referensi Café SIDE LINE (Bandung)
    $this->cafeLat = -6.914744;
    $this->cafeLng = 107.609810;

    // Titik dalam radius (~50 meter selatan dari kafe)
    $this->insideLat = -6.915190;
    $this->insideLng = 107.609810;

    // Titik di luar radius (~530 meter selatan dari kafe)
    $this->outsideLat = -6.919500;
    $this->outsideLng = 107.609810;
});

test('only admin can view and update location geofencing settings', function () {
    $this->get(route('admin.location-settings.edit'))
        ->assertRedirect(route('login'));

    $this->actingAs($this->cashier)
        ->get(route('admin.location-settings.edit'))
        ->assertForbidden();

    $this->actingAs($this->cashier)
        ->put(route('admin.location-settings.update'), [
            'cafe_name' => 'Café SIDE LINE',
            'is_location_restricted' => true,
            'latitude' => $this->cafeLat,
            'longitude' => $this->cafeLng,
            'access_radius_meters' => 150,
        ])
        ->assertForbidden();

    $this->actingAs($this->admin)
        ->get(route('admin.location-settings.edit'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('admin/location-settings/index'));

    $this->actingAs($this->admin)
        ->put(route('admin.location-settings.update'), [
            'cafe_name' => 'Café SIDE LINE Pusat',
            'address' => 'Jl. Braga No. 88, Bandung',
            'is_location_restricted' => true,
            'latitude' => $this->cafeLat,
            'longitude' => $this->cafeLng,
            'access_radius_meters' => 150,
        ])
        ->assertSessionHas('success');

    $setting = CafeSetting::current();
    expect($setting->cafe_name)->toBe('Café SIDE LINE Pusat')
        ->and($setting->address)->toBe('Jl. Braga No. 88, Bandung')
        ->and($setting->is_location_restricted)->toBeTrue()
        ->and((float) $setting->latitude)->toBe(-6.914744)
        ->and((float) $setting->longitude)->toBe(107.60981)
        ->and($setting->access_radius_meters)->toBe(150);
});

test('enabling location restriction validates coordinates and radius bounds', function () {
    $this->actingAs($this->admin)
        ->put(route('admin.location-settings.update'), [
            'cafe_name' => 'Café SIDE LINE',
            'is_location_restricted' => true,
            'latitude' => null,
            'longitude' => null,
            'access_radius_meters' => 100,
        ])
        ->assertSessionHasErrors(['latitude', 'longitude']);

    $this->actingAs($this->admin)
        ->put(route('admin.location-settings.update'), [
            'cafe_name' => 'Café SIDE LINE',
            'is_location_restricted' => false,
            'latitude' => $this->cafeLat,
            'longitude' => $this->cafeLng,
            'access_radius_meters' => 5,
        ])
        ->assertSessionHasErrors(['access_radius_meters']);
});

test('admin and cashier panels remain completely unrestricted when geofencing is active', function () {
    CafeSetting::query()->delete();
    CafeSetting::create([
        'cafe_name' => 'Café SIDE LINE',
        'is_location_restricted' => true,
        'latitude' => $this->cafeLat,
        'longitude' => $this->cafeLng,
        'access_radius_meters' => 100,
    ]);

    $this->actingAs($this->admin)
        ->get(route('dashboard'))
        ->assertOk();

    $this->actingAs($this->admin)
        ->get(route('admin.orders.index'))
        ->assertOk();

    $this->actingAs($this->admin)
        ->get(route('admin.menus.index'))
        ->assertOk();

    $this->actingAs($this->admin)
        ->get(route('admin.location-settings.edit'))
        ->assertOk();

    $this->actingAs($this->cashier)
        ->get(route('cashier.orders.index'))
        ->assertOk();

    $this->actingAs($this->cashier)
        ->get(route('cashier.orders.sync'))
        ->assertOk();
});

test('customer access is open normally when location restriction is disabled', function () {
    Event::fake([OrderCreated::class]);

    $this->get(route('order.index', ['table' => $this->table->qr_token]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('locationAccess.required', false)
            ->where('locationAccess.verified', true)
            ->has('categories', 1));

    $this->getJson(route('order.stock-sync'))
        ->assertOk()
        ->assertJsonStructure(['menus', 'synced_at']);

    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Tamu Bebas',
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 1,
            ],
        ],
    ])->assertRedirect();

    expect(Order::count())->toBe(1);
});

test('customer outside radius cannot view catalog sync stock or checkout and inside radius unlocks access', function () {
    Event::fake([OrderCreated::class]);

    CafeSetting::query()->delete();
    CafeSetting::create([
        'cafe_name' => 'Café SIDE LINE',
        'address' => 'Jl. Braga No. 88',
        'is_location_restricted' => true,
        'latitude' => $this->cafeLat,
        'longitude' => $this->cafeLng,
        'access_radius_meters' => 150,
    ]);

    // 1. Belum terverifikasi -> halaman order tidak membeberkan daftar menu
    $this->get(route('order.index', ['table' => $this->table->qr_token]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('locationAccess.required', true)
            ->where('locationAccess.verified', false)
            ->has('categories', 0));

    // 2. Endpoint sinkronisasi stok ditolak 403 bila belum terverifikasi
    $this->getJson(route('order.stock-sync'))
        ->assertForbidden()
        ->assertJsonPath('location_required', true);

    // 3. Verifikasi dengan titik di luar radius -> 403 + jarak akurat > 150 m
    $outsideVerify = $this->postJson(route('order.verify-location'), [
        'latitude' => $this->outsideLat,
        'longitude' => $this->outsideLng,
        'accuracy' => 15,
    ]);

    $outsideVerify->assertForbidden()
        ->assertJsonPath('allowed', false)
        ->assertJsonPath('restricted', true)
        ->assertJsonPath('radius_meters', 150);

    expect((float) $outsideVerify->json('distance_meters'))->toBeGreaterThan(150.0);

    // 4. Checkout langsung tanpa verifikasi atau dengan koordinat luar radius ditolak backend
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Tamu Jauh',
        'customer_latitude' => $this->outsideLat,
        'customer_longitude' => $this->outsideLng,
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 1,
            ],
        ],
    ])->assertSessionHasErrors('location');

    expect(Order::count())->toBe(0);

    // 5. Verifikasi di dalam radius (~50m <= 150m) -> diizinkan & disimpan ke session
    $insideVerify = $this->postJson(route('order.verify-location'), [
        'latitude' => $this->insideLat,
        'longitude' => $this->insideLng,
        'accuracy' => 10,
    ]);

    $insideVerify->assertOk()
        ->assertJsonPath('allowed', true)
        ->assertJsonPath('restricted', true);

    expect((float) $insideVerify->json('distance_meters'))->toBeLessThanOrEqual(150.0);

    // 6. Katalog dan stock-sync sekarang terbuka di sesi yang sama
    $this->get(route('order.index', ['table' => $this->table->qr_token]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('locationAccess.required', true)
            ->where('locationAccess.verified', true)
            ->has('categories', 1));

    $this->getJson(route('order.stock-sync'))
        ->assertOk();

    // 7. Checkout dengan koordinat valid berhasil membuat pesanan
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Tamu Dalam Kafe',
        'customer_latitude' => $this->insideLat,
        'customer_longitude' => $this->insideLng,
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 2,
            ],
        ],
    ])->assertRedirect();

    expect(Order::count())->toBe(1);
});

test('checkout rechecks incoming coordinates and invalidates prior session when location settings change', function () {
    CafeSetting::query()->delete();
    CafeSetting::create([
        'cafe_name' => 'Café SIDE LINE',
        'is_location_restricted' => true,
        'latitude' => $this->cafeLat,
        'longitude' => $this->cafeLng,
        'access_radius_meters' => 150,
    ]);

    // Verifikasi masuk radius terlebih dahulu
    $this->postJson(route('order.verify-location'), [
        'latitude' => $this->insideLat,
        'longitude' => $this->insideLng,
    ])->assertOk();

    // Jika pada saat checkout koordinat terbaru berpindah ke luar radius -> tetap ditolak & sesi dicabut
    $this->post(route('order.checkout'), [
        'qr_token' => $this->table->qr_token,
        'customer_name' => 'Tamu Berjalan Keluar',
        'customer_latitude' => $this->outsideLat,
        'customer_longitude' => $this->outsideLng,
        'items' => [
            [
                'menu_id' => $this->menu->id,
                'quantity' => 1,
            ],
        ],
    ])->assertSessionHasErrors('location');

    $this->getJson(route('order.stock-sync'))
        ->assertForbidden()
        ->assertJsonPath('location_required', true);

    // Verifikasi ulang di dalam radius, lalu admin memperketat radius menjadi 20 meter -> sesi lama otomatis hangus
    $this->postJson(route('order.verify-location'), [
        'latitude' => $this->insideLat,
        'longitude' => $this->insideLng,
    ])->assertOk();

    $this->actingAs($this->admin)
        ->put(route('admin.location-settings.update'), [
            'cafe_name' => 'Café SIDE LINE',
            'is_location_restricted' => true,
            'latitude' => $this->cafeLat,
            'longitude' => $this->cafeLng,
            'access_radius_meters' => 20,
        ])
        ->assertSessionHas('success');

    $this->getJson(route('order.stock-sync'))
        ->assertForbidden()
        ->assertJsonPath('location_required', true);
});

test('haversine distance calculation yields expected surface meters', function () {
    $service = app(LocationAccessService::class);

    $zeroDistance = $service->calculateDistanceMeters($this->cafeLat, $this->cafeLng, $this->cafeLat, $this->cafeLng);
    $nearDistance = $service->calculateDistanceMeters($this->cafeLat, $this->cafeLng, $this->insideLat, $this->insideLng);
    $farDistance = $service->calculateDistanceMeters($this->cafeLat, $this->cafeLng, $this->outsideLat, $this->outsideLng);

    expect($zeroDistance)->toBe(0.0)
        ->and($nearDistance)->toBeGreaterThan(40.0)->toBeLessThan(60.0)
        ->and($farDistance)->toBeGreaterThan(500.0)->toBeLessThan(560.0);
});
