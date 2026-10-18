<?php

use App\Http\Controllers\Admin\CategoryController;
use App\Http\Controllers\Admin\MenuController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

Route::middleware(['auth'])->group(function () {
    Route::inertia('dashboard', 'dashboard')->name('dashboard');
});

// Rute Khusus Administrator SIDE LINE
Route::middleware(['auth', 'role:admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::resource('categories', CategoryController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::resource('menus', MenuController::class)->only(['index', 'store', 'update', 'destroy']);
});

require __DIR__ . '/settings.php';