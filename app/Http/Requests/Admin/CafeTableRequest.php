<?php

namespace App\Http\Requests\Admin;

use App\Models\CafeTable;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CafeTableRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->isAdmin();
    }

    /**
     * Aturan validasi data meja.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $routeTable = $this->route('table');
        $tableId = $routeTable instanceof CafeTable ? $routeTable->id : null;

        return [
            'table_number' => ['required', 'string', 'max:50', Rule::unique('cafe_tables', 'table_number')->ignore($tableId)],
            'name' => ['nullable', 'string', 'max:100'],
            'is_active' => ['boolean'],
        ];
    }
}
