<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UserRequest;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    /**
     * Menampilkan daftar seluruh akun staf kafe (Admin & Kasir).
     */
    public function index(Request $request): Response
    {
        $currentUser = $request->user();
        abort_unless($currentUser instanceof User, 403);

        $users = User::select(['id', 'name', 'email', 'role', 'created_at'])
            ->orderBy('id', 'asc')
            ->get();

        return Inertia::render('admin/users/index', [
            'users' => $users,
            'currentUserId' => $currentUser->id,
        ]);
    }

    /**
     * Mendaftarkan akun staf / kasir baru (hanya role cashier yang diizinkan).
     */
    public function store(UserRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        User::create([
            'name' => (string) $validated['name'],
            'email' => (string) $validated['email'],
            'password' => Hash::make((string) $validated['password']),
            'role' => 'cashier',
            'email_verified_at' => now(),
        ]);

        return back()->with(
            'success',
            "Akun kasir {$validated['name']} berhasil didaftarkan."
        );
    }

    /**
     * Memperbarui data akun staf dengan menjaga kebijakan Admin tunggal.
     */
    public function update(UserRequest $request, User $user): RedirectResponse
    {
        $currentUser = $request->user();
        abort_unless($currentUser instanceof User, 403);

        $validated = $request->validated();
        $requestedRole = (string) ($validated['role'] ?? $user->role);

        if ($user->isAdmin() && $requestedRole !== 'admin') {
            return back()->with(
                'error',
                'Role Administrator tunggal tidak dapat diturunkan ke kasir.'
            );
        }

        if (! $user->isAdmin() && $requestedRole === 'admin') {
            return back()->with(
                'error',
                'Hanya satu akun Administrator yang diizinkan dalam sistem.'
            );
        }

        $dataToUpdate = [
            'name' => (string) $validated['name'],
            'email' => (string) $validated['email'],
            'role' => $user->isAdmin() ? 'admin' : 'cashier',
        ];

        // Perbarui password hanya jika diisi.
        if (! empty($validated['password'])) {
            $dataToUpdate['password'] = Hash::make(
                (string) $validated['password']
            );
        }

        $user->update($dataToUpdate);

        return back()->with(
            'success',
            "Data akun {$user->name} berhasil diperbarui."
        );
    }

    /**
     * Menghapus akun kasir dengan proteksi terhadap penghapusan Admin tunggal.
     */
    public function destroy(Request $request, User $user): RedirectResponse
    {
        $currentUser = $request->user();
        abort_unless($currentUser instanceof User, 403);

        if ($user->id === $currentUser->id) {
            return back()->with(
                'error',
                'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.'
            );
        }

        if ($user->isAdmin()) {
            return back()->with(
                'error',
                'Akun Administrator tunggal tidak dapat dihapus.'
            );
        }

        $userName = $user->name;

        $user->delete();

        return back()->with(
            'success',
            "Akun kasir {$userName} berhasil dihapus."
        );
    }
}
