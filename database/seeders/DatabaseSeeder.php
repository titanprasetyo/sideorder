<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Buat akun Admin default
        User::firstOrCreate(
            ['email' => 'astaa@gmail.com'], // Ganti sesuai email admin Anda
            [
                'name' => 'astaa',
                'password' => Hash::make('astaa@gmail.com'), // Ganti dengan password yang diinginkan
                'role' => 'admin',
                'email_verified_at' => now(),
            ]
        );
    }
}