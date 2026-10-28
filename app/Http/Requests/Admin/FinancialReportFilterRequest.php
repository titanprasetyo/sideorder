<?php

namespace App\Http\Requests\Admin;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class FinancialReportFilterRequest extends FormRequest
{
    /**
     * Hanya Admin yang diizinkan mengakses laporan keuangan.
     */
    public function authorize(): bool
    {
        return $this->user() !== null && $this->user()->isAdmin();
    }

    /**
     * Aturan validasi parameter filter laporan keuangan.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'preset' => ['nullable', 'string', 'in:today,yesterday,last_7_days,this_week,this_month,last_month,custom'],
            'start_date' => ['nullable', 'date_format:Y-m-d'],
            'end_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'aggregation' => ['nullable', 'string', 'in:auto,daily,weekly,monthly'],
            'recap_view' => ['nullable', 'string', 'in:daily,weekly,monthly'],
            'search' => ['nullable', 'string', 'max:100'],
            'payment_status' => ['nullable', 'string', 'in:all,paid,unpaid,failed,refunded'],
            'order_status' => ['nullable', 'string', 'in:all,pending,processing,ready,completed,cancelled'],
            'payment_method' => ['nullable', 'string', 'in:all,cash,qris,transfer,debit'],
            'sort_by' => ['nullable', 'string', 'in:transaction_date,total_amount,order_number,created_at'],
            'sort_dir' => ['nullable', 'string', 'in:asc,desc'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'start_date.date_format' => 'Format tanggal mulai harus YYYY-MM-DD.',
            'end_date.date_format' => 'Format tanggal akhir harus YYYY-MM-DD.',
            'end_date.after_or_equal' => 'Tanggal akhir tidak boleh lebih awal dari tanggal mulai.',
        ];
    }
}
