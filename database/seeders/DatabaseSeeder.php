<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $configuredEmail = config('auth.default_admin.email');
        $email = is_string($configuredEmail) && $configuredEmail !== '' ? $configuredEmail : 'astaa@gmail.com';

        $configuredName = config('auth.default_admin.name');
        $name = is_string($configuredName) && $configuredName !== '' ? $configuredName : 'astaa';

        $rawPassword = config('auth.default_admin.password');
        $generatedFallback = false;

        if (! is_string($rawPassword) || trim($rawPassword) === '') {
            $rawPassword = Str::password(16);
            $generatedFallback = true;
        }

        User::firstOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make($rawPassword),
                'role' => 'admin',
                'email_verified_at' => now(),
            ]
        );

        if ($generatedFallback) {
            $this->command->warn("ADMIN_DEFAULT_PASSWORD belum disetel di .env. Password acak sementara untuk {$email}: {$rawPassword}");
        }
    }
}
