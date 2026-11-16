<?php

use App\Http\Controllers\Admin\CafeTableController;
use App\Http\Controllers\Admin\CategoryController;
use App\Http\Controllers\Admin\FinancialReportController;
use App\Http\Controllers\Admin\LocationSettingController;
use App\Http\Controllers\Admin\MenuController;
use App\Http\Controllers\Admin\OrderController as AdminOrderController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Cashier\OrderController as CashierOrderController;
use App\Http\Controllers\Customer\OrderController as CustomerOrderController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PaymentWebhookController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

// RUTE PUBLIK CUSTOMER (Pemesanan Tanpa Perlu Login)
Route::get('order', [CustomerOrderController::class, 'index'])->name('order.index');
Route::post('order/verify-location', [CustomerOrderController::class, 'verifyLocation'])->name('order.verify-location');
Route::get('order/stock-sync', [CustomerOrderController::class, 'stockSync'])->name('order.stock-sync');
Route::post('order/checkout', [CustomerOrderController::class, 'checkout'])->name('order.checkout');
Route::get('order/status/{order_number}', [CustomerOrderController::class, 'status'])->name('order.status');
Route::get('order/payment/{order_number}', [CustomerOrderController::class, 'payment'])->name('order.payment');
Route::get('order/check-payment/{order_number}', [CustomerOrderController::class, 'checkPayment'])->name('order.check-payment');
Route::post('order/simulate-payment/{order_number}', [CustomerOrderController::class, 'simulatePayment'])->name('order.simulate-payment');
Route::post('order/switch-payment-method/{order_number}', [CustomerOrderController::class, 'switchPaymentMethod'])->name('order.switch-payment-method');

// RUTE TERPISAH PAYMENT GATEWAY (Xendit / Midtrans Slot & Terverifikasi Webhook)
Route::prefix('payments')->name('payments.')->group(function () {
    Route::post('orders/{order_number}/initiate', [PaymentController::class, 'initiate'])->name('initiate');
    Route::get('orders/{order_number}/status', [PaymentController::class, 'status'])->name('status');
    Route::post('webhook/{driver?}', [PaymentWebhookController::class, 'handle'])->name('webhook');
});

// Rute Dashboard Autentikasi Staf (Admin diarahkan ke Dashboard Terpadu, Kasir otomatis dialihkan ke Pesanan Masuk)
Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
});

Route::middleware(['auth', 'role:admin'])->group(function () {
    Route::get('dashboard/sync', [DashboardController::class, 'sync'])->name('dashboard.sync');
    Route::redirect('admin', 'dashboard');
});

// Rute Operasional Kasir & Barista (Admin & Kasir Boleh Akses)
Route::middleware(['auth', 'role:admin,cashier'])->prefix('cashier')->name('cashier.')->group(function () {
    Route::get('orders', [CashierOrderController::class, 'index'])->name('orders.index');
    Route::get('orders/sync', [CashierOrderController::class, 'sync'])->name('orders.sync');
    Route::get('orders/stream', [CashierOrderController::class, 'stream'])->name('orders.stream');
    Route::post('orders/{order}/confirm-payment', [CashierOrderController::class, 'confirmPayment'])->name('orders.confirm-payment');
    Route::post('orders/{order}/update-status', [CashierOrderController::class, 'updateStatus'])->name('orders.update-status');
});

// Rute Khusus Administrator SIDE LINE (Hanya Admin)
Route::middleware(['auth', 'role:admin'])->prefix('admin')->name('admin.')->group(function () {
    // Manajemen Pesanan Admin
    Route::get('orders', [AdminOrderController::class, 'index'])->name('orders.index');
    Route::get('orders/sync', [AdminOrderController::class, 'sync'])->name('orders.sync');
    Route::get('orders/stream', [AdminOrderController::class, 'stream'])->name('orders.stream');
    Route::post('orders/{order}/confirm-payment', [AdminOrderController::class, 'confirmPayment'])->name('orders.confirm-payment');
    Route::post('orders/{order}/update-status', [AdminOrderController::class, 'updateStatus'])->name('orders.update-status');
    Route::delete('orders/{order}', [AdminOrderController::class, 'destroy'])->name('orders.destroy');

    // Laporan Keuangan & Analitik Pendapatan Admin
    Route::get('financial-reports', [FinancialReportController::class, 'index'])->name('financial-reports.index');
    Route::get('financial-reports/sync', [FinancialReportController::class, 'sync'])->name('financial-reports.sync');
    Route::get('financial-reports/export/excel', [FinancialReportController::class, 'exportExcel'])->name('financial-reports.export.excel');
    Route::get('financial-reports/export/csv', [FinancialReportController::class, 'exportCsv'])->name('financial-reports.export.csv');
    Route::get('financial-reports/export/pdf', [FinancialReportController::class, 'exportPdf'])->name('financial-reports.export.pdf');

    Route::resource('categories', CategoryController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('menus/size-icons', [MenuController::class, 'updateSizeIcons'])->name('menus.size-icons');
    Route::resource('menus', MenuController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::resource('tables', CafeTableController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('tables/{table}/regenerate-token', [CafeTableController::class, 'regenerateToken'])->name('tables.regenerate-token');

    // Pengaturan Lokasi & Radius Geofencing Kafe
    Route::get('location-settings', [LocationSettingController::class, 'edit'])->name('location-settings.edit');
    Route::put('location-settings', [LocationSettingController::class, 'update'])->name('location-settings.update');

    // Manajemen Akun Staf
    Route::resource('users', UserController::class)->only(['index', 'store', 'update', 'destroy']);
});

require __DIR__.'/settings.php';
