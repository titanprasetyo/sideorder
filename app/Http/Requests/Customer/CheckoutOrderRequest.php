<?php

namespace App\Http\Requests\Customer;

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
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'qr_token' => ['required', 'string', 'exists:cafe_tables,qr_token'],
            'customer_name' => ['required', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.menu_id' => ['required', 'exists:menus,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'items.*.customer_notes' => ['nullable', 'string', 'max:255'],
            'items.*.selected_option_ids' => ['nullable', 'array'],
            'items.*.selected_option_ids.*' => ['exists:menu_option_items,id'],
        ];
    }

    /**
     * Pesan kustom jika validasi gagal.
     */
    public function messages(): array
    {
        return [
            'customer_name.required' => 'Nama pemesan wajib diisi agar kasir dan barista dapat memanggil Anda.',
            'items.required' => 'Keranjang belanja Anda masih kosong.',
            'qr_token.exists' => 'Meja tidak valid atau tidak ditemukan.',
        ];
    }
}