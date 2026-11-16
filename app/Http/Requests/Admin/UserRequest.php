<?php

namespace App\Http\Requests\Admin;

use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UserRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->isAdmin();
    }

    /**
     * Aturan validasi data akun staf.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $routeUser = $this->route('user');
        $targetUser = $routeUser instanceof User ? $routeUser : null;
        $userId = $targetUser?->id;
        $isUpdate = $this->isMethod('PUT') || $this->isMethod('PATCH');

        // Hanya 1 akun Admin yang diizinkan; Admin hanya dapat membuat/mengelola akun Kasir.
        $allowedRoles = ($isUpdate && $targetUser?->isAdmin())
            ? ['admin']
            : ['cashier'];

        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($userId)],
            'password' => [$isUpdate ? 'nullable' : 'required', 'string', 'min:8'],
            'role' => ['required', 'string', Rule::in($allowedRoles)],
        ];
    }

    /**
     * Pesan validasi kustom.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'role.in' => 'Hanya satu akun Administrator yang diizinkan. Akun staf baru harus memiliki role Kasir / Barista.',
        ];
    }
}
