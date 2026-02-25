<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class EnsureTestUsers extends Command
{
    protected $signature = 'users:ensure-test';
    protected $description = 'Ensure test users exist in the database';

    public function handle()
    {
        try {
            $testUsers = [
                [
                    'name' => 'Test User',
                    'email' => 'test@example.com',
                    'password' => 'password'
                ],
                [
                    'name' => 'Sudoshi',
                    'email' => 'sudoshi@acumenus.io',
                    'password' => 'acumenus'
                ]
            ];

            foreach ($testUsers as $userData) {
                $user = User::firstOrCreate(
                    ['email' => $userData['email']],
                    [
                        'name' => $userData['name'],
                        'password' => Hash::make($userData['password'])
                    ]
                );

                if ($user->wasRecentlyCreated) {
                    $this->info("Created user: {$userData['email']}");
                    Log::info("Test user created", ['email' => $userData['email']]);
                } else {
                    $this->info("User already exists: {$userData['email']}");

                    // Update password if it might have changed
                    $user->password = Hash::make($userData['password']);
                    $user->save();

                    Log::info("Test user password updated", ['email' => $userData['email']]);
                }
            }

            $this->info('Test users verified successfully');
            return Command::SUCCESS;
        } catch (\Exception $e) {
            $this->error("Error ensuring test users: {$e->getMessage()}");
            Log::error("Error in EnsureTestUsers command", [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return Command::FAILURE;
        }
    }
}
