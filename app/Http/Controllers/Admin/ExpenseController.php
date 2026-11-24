<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ExpenseRequest;
use App\Models\Expense;
use Illuminate\Http\RedirectResponse;

class ExpenseController extends Controller
{
    /**
     * Simpan catatan pengeluaran operasional baru.
     */
    public function store(ExpenseRequest $request): RedirectResponse
    {
        $validated = $request->validated();
        $user = $request->user();

        Expense::create([
            'expense_date' => (string) $validated['expense_date'],
            'category' => (string) $validated['category'],
            'title' => trim((string) $validated['title']),
            'amount' => (float) $validated['amount'],
            'payment_source' => (string) $validated['payment_source'],
            'notes' => isset($validated['notes']) && trim((string) $validated['notes']) !== ''
                ? trim((string) $validated['notes'])
                : null,
            'recorded_by' => $user?->id,
        ]);

        return back()->with('success', 'Catatan pengeluaran operasional berhasil disimpan.');
    }

    /**
     * Perbarui catatan pengeluaran operasional.
     */
    public function update(ExpenseRequest $request, Expense $expense): RedirectResponse
    {
        $validated = $request->validated();

        $expense->update([
            'expense_date' => (string) $validated['expense_date'],
            'category' => (string) $validated['category'],
            'title' => trim((string) $validated['title']),
            'amount' => (float) $validated['amount'],
            'payment_source' => (string) $validated['payment_source'],
            'notes' => isset($validated['notes']) && trim((string) $validated['notes']) !== ''
                ? trim((string) $validated['notes'])
                : null,
        ]);

        return back()->with('success', 'Catatan pengeluaran berhasil diperbarui.');
    }

    /**
     * Hapus catatan pengeluaran operasional.
     */
    public function destroy(Expense $expense): RedirectResponse
    {
        $expense->delete();

        return back()->with('success', 'Catatan pengeluaran berhasil dihapus.');
    }
}
