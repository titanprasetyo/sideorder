<?php

namespace App\Http\Requests\Admin;

use App\Models\Menu;
use App\Models\MenuOptionItem;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class MenuRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->isAdmin();
    }

    /**
     * Aturan validasi data menu dan opsi kustomisasi.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $routeMenu = $this->route('menu');
        $menuId = $routeMenu instanceof Menu ? $routeMenu->id : null;

        return [
            'category_id' => ['required', 'exists:categories,id'],
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:150', Rule::unique('menus', 'slug')->ignore($menuId)],
            'description' => ['nullable', 'string'],
            'image' => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:2048'], // Max 2MB
            'base_price' => ['required', 'numeric', 'min:0'],
            'cost_price' => ['nullable', 'numeric', 'min:0'],
            'is_discount_active' => ['nullable', 'boolean'],
            'discount_type' => ['nullable', 'string', 'in:percent,fixed'],
            'discount_value' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['boolean'],
            'is_limited_stock' => ['nullable', 'boolean'],
            'stock_quantity' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'stock_valid_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'refresh_stock_timestamp' => ['nullable', 'boolean'],

            // Validasi Opsi Kustomisasi (Ukuran / Topping)
            'option_groups' => ['nullable', 'array'],
            'option_groups.*.name' => ['required', 'string', 'max:100'],
            'option_groups.*.selection_type' => ['required', 'in:single,multiple'],
            'option_groups.*.is_required' => ['boolean'],
            'option_groups.*.min_selection' => ['integer', 'min:0'],
            'option_groups.*.max_selection' => ['nullable', 'integer', 'min:1'],
            'option_groups.*.items' => ['required', 'array', 'min:1'],
            'option_groups.*.items.*.name' => ['required', 'string', 'max:100'],
            'option_groups.*.items.*.icon' => ['nullable', 'string', 'max:60', Rule::in(MenuOptionItem::ALLOWED_ICONS)],
            'option_groups.*.items.*.additional_price' => ['numeric', 'min:0'],
            'option_groups.*.items.*.is_default' => ['boolean'],
            'option_groups.*.items.*.is_active' => ['boolean'],
        ];
    }

    /**
     * Validasi konsistensi nilai diskon terhadap tipe dan harga dasar serta stok terbatas.
     *
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($this->boolean('is_limited_stock')) {
                    $rawStock = $this->input('stock_quantity');
                    if ($rawStock === null || $rawStock === '') {
                        $validator->errors()->add('stock_quantity', 'Jumlah stok tersedia wajib diisi jika menu menggunakan pembatasan stok.');
                    }
                }

                if (! $this->boolean('is_discount_active')) {
                    return;
                }

                $discountType = (string) ($this->input('discount_type') ?: 'percent');
                $discountValue = (float) $this->input('discount_value', 0);
                $basePrice = (float) $this->input('base_price', 0);

                if ($discountType === 'percent' && $discountValue > 100) {
                    $validator->errors()->add('discount_value', 'Diskon persentase tidak boleh melebihi 100%.');
                }

                if ($discountType === 'fixed' && $discountValue > $basePrice) {
                    $validator->errors()->add('discount_value', 'Potongan diskon nominal tidak boleh melebihi harga dasar menu.');
                }
            },
        ];
    }
}
