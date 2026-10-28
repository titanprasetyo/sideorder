<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CafeTableRequest;
use App\Models\CafeTable;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class CafeTableController extends Controller
{
    /**
     * Menampilkan daftar meja kafe beserta jumlah pesanan aktif.
     */
    public function index(): Response
    {
        $tables = CafeTable::withCount(['orders', 'activeOrders'])
            ->orderBy('table_number', 'asc')
            ->get();

        return Inertia::render('admin/tables/index', [
            'tables' => $tables,
            'appUrl' => config('app.url'),
        ]);
    }

    /**
     * Menyimpan meja baru (qr_token otomatis digenerate model).
     */
    public function store(CafeTableRequest $request): RedirectResponse
    {
        $validated = $request->validated();
        $validated['is_active'] = $request->boolean('is_active', true);

        CafeTable::create($validated);

        return back()->with('success', 'Meja baru berhasil ditambahkan.');
    }

    /**
     * Memperbarui informasi meja.
     */
    public function update(CafeTableRequest $request, CafeTable $table): RedirectResponse
    {
        $validated = $request->validated();
        $validated['is_active'] = $request->boolean('is_active', true);

        $table->update($validated);

        return back()->with('success', 'Data meja berhasil diperbarui.');
    }

    /**
     * Menghapus meja fisik.
     */
    public function destroy(CafeTable $table): RedirectResponse
    {
        if ($table->orders()->exists()) {
            return back()->with('error', 'Meja tidak dapat dihapus karena memiliki riwayat pesanan. Anda dapat menonaktifkan statusnya.');
        }

        $table->delete();

        return back()->with('success', 'Meja berhasil dihapus.');
    }

    /**
     * Membuat ulang token QR meja jika QR lama rusak atau bocor.
     */
    public function regenerateToken(CafeTable $table): RedirectResponse
    {
        $table->regenerateQrToken();

        return back()->with('success', "Token QR Meja {$table->table_number} berhasil diperbarui.");
    }
}
