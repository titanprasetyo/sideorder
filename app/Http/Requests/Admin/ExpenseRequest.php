<?php

namespace App\Http\Requests\Admin;

use App\Models\Expense;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->isAdmin();
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'expense_date' => ['required', 'date_format:Y-m-d'],
            'category' => ['required', 'string', Rule::in(array_keys(Expense::CATEGORIES))],
            'title' => ['required', 'string', 'max:150'],
            'amount' => ['required', 'numeric', 'min:1'],
            'payment_source' => ['required', 'string', Rule::in(array_keys(Expense::PAYMENT_SOURCES))],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'expense_date.required' => 'Tanggal pengeluaran wajib diisi.',
            'expense_date.date_format' => 'Format tanggal pengeluaran harus YYYY-MM-DD.',
            'category.required' => 'Kategori pengeluaran wajib dipilih.',
            'title.required' => 'Keterangan pengeluaran wajib diisi.',
            'amount.required' => 'Nominal pengeluaran wajib diisi.',
            'amount.min' => 'Nominal pengeluaran minimal Rp 1.',
            'payment_source.required' => 'Sumber kas pembayaran wajib dipilih.',
        ];
    }
}
