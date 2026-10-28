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
        $users = User::select(['id', 'name', 'email', 'role', 'created_at'])
            ->orderBy('id', 'asc')
            ->get();


        return Inertia::render('admin/users/index', [
            'users' => $users,
            
            'currentUserId' => $request->user()->id,
        ]);
    }

    /**
     * Mendaftarkan akun staf / kasir baru.
     */
    public function store(UserRequest $request): RedirectResponse 

    {
        $validated = $request->validated();

        User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
        ]);

        return back()->with(
            'success',
            "Akun staf {$validated['name']} berhasil didaftarkan."
        );
    }

    /**
     * Memperbarui data akun staf.
     */
    public function update(UserRequest $request, User $user): RedirectResponse
    {
        $validated = $request->validated();

        // Cegah admin menurunkan role akun aktifnya sendiri.
        if (
            $user->id === $request->user()->id &&
            $validated['role'] !== 'admin'
        ) {
            return back()->with(
                'error',
                'Anda tidak dapat menurunkan role akun Anda sendiri yang sedang aktif.'
            );
        }

        $dataToUpdate = [
            'name' => $validated['name'],
            'email' => $validated['email'],
            'role' => $validated['role'],
        ];

        // Perbarui password hanya jika diisi.
        if (! empty($validated['password'])) {
            $dataToUpdate['password'] = Hash::make(
                $validated['password']
            );
        }

        $user->update($dataToUpdate);

        return back()->with(
            'success',
            "Data akun {$user->name} berhasil diperbarui."
        );
    }

    /**
     * Menghapus akun staf dengan proteksi anti self-deletion.
     */
    public function destroy(Request $request, User $user): RedirectResponse
    {
        // Cegah admin menghapus akun aktifnya sendiri.
        if ($user->id === $request->user()->id) {
            return back()->with(
                'error',
                'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.'
            );
        }

        $userName = $user->name;

        $user->delete();

        return back()->with(
            'success',
            "Akun staf {$userName} berhasil dihapus."
        );
    }
}
