<?php

use App\Http\Controllers\Admin\CafeTableController;
use App\Http\Controllers\Admin\CategoryController;
use App\Http\Controllers\Admin\MenuController;
use App\Http\Controllers\Customer\OrderController as CustomerOrderController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

// RUTE PUBLIK CUSTOMER (Pemesanan Tanpa Perlu Login)
Route::get('order', [CustomerOrderController::class, 'index'])->name('order.index');
Route::post('order/checkout', [CustomerOrderController::class, 'checkout'])->name('order.checkout');
Route::get('order/status/{order_number}', [CustomerOrderController::class, 'status'])->name('order.status');

// Rute Dashboard Autentikasi Staf
Route::middleware(['auth'])->group(function () {
    Route::inertia('dashboard', 'dashboard')->name('dashboard');
});

// Rute Khusus Administrator SIDE LINE
Route::middleware(['auth', 'role:admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::resource('categories', CategoryController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::resource('menus', MenuController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::resource('tables', CafeTableController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('tables/{table}/regenerate-token', [CafeTableController::class, 'regenerateToken'])->name('tables.regenerate-token');
});

require __DIR__ . '/settings.php';