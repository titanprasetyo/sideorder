<?php

use App\Http\Controllers\Admin\CafeTableController;
use App\Http\Controllers\Admin\CategoryController;
use App\Http\Controllers\Admin\FinancialReportController;
use App\Http\Controllers\Admin\MenuController;
use App\Http\Controllers\Admin\OrderController as AdminOrderController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Cashier\OrderController as CashierOrderController;
use App\Http\Controllers\Customer\OrderController as CustomerOrderController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\PaymentWebhookController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

// RUTE PUBLIK CUSTOMER (Pemesanan Tanpa Perlu Login)
Route::get('order', [CustomerOrderController::class, 'index'])->name('order.index');
Route::post('order/checkout', [CustomerOrderController::class, 'checkout'])->name('order.checkout');
Route::get('order/status/{order_number}', [CustomerOrderController::class, 'status'])->name('order.status');

// RUTE CALLBACK / WEBHOOK PAYMENT GATEWAY (Terverifikasi Signature dari Backend)
Route::post('payments/webhook', [PaymentWebhookController::class, 'handle'])->name('payments.webhook');

// Rute Dashboard Autentikasi Staf (Admin diarahkan ke Dashboard, Kasir otomatis dialihkan ke Pesanan Masuk)
Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
    Route::redirect('admin', 'dashboard');
});

// Rute Operasional Kasir & Barista (Admin & Kasir Boleh Akses)
Route::middleware(['auth', 'role:admin,cashier'])->prefix('cashier')->name('cashier.')->group(function () {
    Route::get('orders', [CashierOrderController::class, 'index'])->name('orders.index');
    Route::get('orders/sync', [CashierOrderController::class, 'sync'])->name('orders.sync');
    Route::get('orders/stream', [CashierOrderController::class, 'stream'])->name('orders.stream');
    Route::post('orders/{order}/confirm-payment', [CashierOrderController::class, 'confirmPayment'])->name('orders.confirm-payment');
    Route::post('orders/{order}/update-status', [CashierOrderController::class, 'updateStatus'])->name('orders.update-status');
    Route::post('orders/{order}/items/{item}/reject', [CashierOrderController::class, 'rejectItem'])->name('orders.items.reject');
});

// Rute Khusus Administrator SIDE LINE (Hanya Admin)
Route::middleware(['auth', 'role:admin'])->prefix('admin')->name('admin.')->group(function () {
    // Manajemen Pesanan Admin
    Route::get('orders', [AdminOrderController::class, 'index'])->name('orders.index');
    Route::get('orders/sync', [AdminOrderController::class, 'sync'])->name('orders.sync');
    Route::get('orders/stream', [AdminOrderController::class, 'stream'])->name('orders.stream');
    Route::post('orders/{order}/confirm-payment', [AdminOrderController::class, 'confirmPayment'])->name('orders.confirm-payment');
    Route::post('orders/{order}/update-status', [AdminOrderController::class, 'updateStatus'])->name('orders.update-status');
    Route::post('orders/{order}/items/{item}/reject', [AdminOrderController::class, 'rejectItem'])->name('orders.items.reject');
    Route::delete('orders/{order}', [AdminOrderController::class, 'destroy'])->name('orders.destroy');

    // Laporan Keuangan & Analitik Pendapatan Admin
    Route::get('financial-reports', [FinancialReportController::class, 'index'])->name('financial-reports.index');
    Route::get('financial-reports/sync', [FinancialReportController::class, 'sync'])->name('financial-reports.sync');
    Route::get('financial-reports/export/csv', [FinancialReportController::class, 'exportCsv'])->name('financial-reports.export.csv');
    Route::get('financial-reports/export/pdf', [FinancialReportController::class, 'exportPdf'])->name('financial-reports.export.pdf');

    Route::resource('categories', CategoryController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::resource('menus', MenuController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::resource('tables', CafeTableController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('tables/{table}/regenerate-token', [CafeTableController::class, 'regenerateToken'])->name('tables.regenerate-token');

    // Manajemen Akun Staf
    Route::resource('users', UserController::class)->only(['index', 'store', 'update', 'destroy']);
});

require __DIR__.'/settings.php';
