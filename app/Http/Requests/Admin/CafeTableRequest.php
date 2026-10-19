<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CafeTableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() && $this->user()->isAdmin();
    }

    public function rules(): array
    {
        $tableId = $this->route('table')?->id;

        return [
            'table_number' => ['required', 'string', 'max:50', Rule::unique('cafe_tables', 'table_number')->ignore($tableId)],
            'name' => ['nullable', 'string', 'max:100'],
            'is_active' => ['boolean'],
        ];
    }
}