<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class MenuRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() && $this->user()->isAdmin();
    }

    public function rules(): array
    {
        $menuId = $this->route('menu')?->id;

        return [
            'category_id' => ['required', 'exists:categories,id'],
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:150', Rule::unique('menus', 'slug')->ignore($menuId)],
            'description' => ['nullable', 'string'],
            'image' => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:2048'], // Max 2MB
            'base_price' => ['required', 'numeric', 'min:0'],
            'is_active' => ['boolean'],

            // Validasi Opsi Kustomisasi (Ukuran / Topping)
            'option_groups' => ['nullable', 'array'],
            'option_groups.*.name' => ['required', 'string', 'max:100'],
            'option_groups.*.selection_type' => ['required', 'in:single,multiple'],
            'option_groups.*.is_required' => ['boolean'],
            'option_groups.*.min_selection' => ['integer', 'min:0'],
            'option_groups.*.max_selection' => ['nullable', 'integer', 'min:1'],
            'option_groups.*.items' => ['required', 'array', 'min:1'],
            'option_groups.*.items.*.name' => ['required', 'string', 'max:100'],
            'option_groups.*.items.*.additional_price' => ['numeric', 'min:0'],
            'option_groups.*.items.*.is_default' => ['boolean'],
            'option_groups.*.items.*.is_active' => ['boolean'],
        ];
    }
}
