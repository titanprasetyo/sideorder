<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->create([
        'name' => 'Owner Admin',
        'email' => 'admin@sideline.com',
        'role' => 'admin',
    ]);

    $this->cashier = User::factory()->create([
        'name' => 'Staf Kasir',
        'email' => 'kasir@sideline.com',
        'role' => 'cashier',
    ]);
});

test('guest cannot access cashier or admin endpoints', function () {
    $this->get(route('cashier.orders.index'))->assertRedirect(route('login'));
    $this->get(route('admin.orders.index'))->assertRedirect(route('login'));
    $this->get(route('dashboard'))->assertRedirect(route('login'));
});

test('cashier cannot access admin-only management routes', function () {
    $this->actingAs($this->cashier)
        ->get(route('admin.orders.index'))
        ->assertForbidden();

    $this->actingAs($this->cashier)
        ->get(route('admin.users.index'))
        ->assertForbidden();

    $this->actingAs($this->cashier)
        ->get(route('admin.categories.index'))
        ->assertForbidden();
});

test('cashier can access cashier order board', function () {
    $this->actingAs($this->cashier)
        ->get(route('cashier.orders.index'))
        ->assertOk();
});

test('admin can access both cashier order board and admin panel', function () {
    $this->actingAs($this->admin)
        ->get(route('cashier.orders.index'))
        ->assertOk();

    $this->actingAs($this->admin)
        ->get(route('admin.orders.index'))
        ->assertOk();

    $this->actingAs($this->admin)
        ->get(route('dashboard'))
        ->assertOk();
});
