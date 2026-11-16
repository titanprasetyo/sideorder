<?php

namespace App\Http\Requests\Customer;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class CheckoutOrderRequest extends FormRequest
{
    /**
     * Customer umum tanpa login diizinkan melakukan pemesanan.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Aturan validasi data pesanan dari customer.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'qr_token' => ['required', 'string', 'exists:cafe_tables,qr_token'],
            'order_number' => ['nullable', 'string', 'max:50'],
            'force_new_order' => ['nullable', 'boolean'],
            'customer_name' => ['required_without:order_number', 'nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:500'],
            'payment_method' => ['nullable', 'string', 'in:cash,qris,transfer,debit'],
            'payment_channel' => ['nullable', 'string', 'max:50'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
            'customer_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'customer_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.menu_id' => ['required', 'integer', 'exists:menus,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'items.*.customer_notes' => ['nullable', 'string', 'max:255'],
            'items.*.selected_option_ids' => ['nullable', 'array'],
            'items.*.selected_option_ids.*' => ['integer', 'distinct', 'exists:menu_option_items,id'],
        ];
    }

    /**
     * Pesan kustom jika validasi gagal.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'customer_name.required' => 'Nama pemesan wajib diisi agar kasir dan barista dapat memanggil Anda.',
            'items.required' => 'Keranjang belanja Anda masih kosong.',
            'qr_token.exists' => 'Meja tidak valid atau tidak ditemukan.',
            'customer_latitude.between' => 'Koordinat lokasi GPS tidak valid.',
            'customer_longitude.between' => 'Koordinat lokasi GPS tidak valid.',
        ];
    }
}
