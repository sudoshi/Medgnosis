<?php

namespace Database\Seeders;

use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Create test users
        User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => Hash::make('password'),
        ]);

        User::factory()->create([
            'name' => 'Sudoshi',
            'email' => 'sudoshi@acumenus.io',
            'password' => Hash::make('acumenus'),
        ]);

        // Seed reference data first
        $this->call([
            CoreReferenceSeeder::class,
            TestPatientSeeder::class,
        ]);
    }
}
