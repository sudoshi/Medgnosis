<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        // Schedule the star schema refresh to run daily at midnight
        $schedule->command('phm:refresh-star-schema')
            ->dailyAt('00:00')
            ->withoutOverlapping()
            ->appendOutputTo(storage_path('logs/star-schema-refresh.log'));

        // Optional: Schedule Synthea data import (commented out by default)
        // Uncomment and adjust schedule as needed
        /*
        $schedule->command('phm:import-synthea --limit=100')
            ->weekly()
            ->sundays()
            ->at('01:00')
            ->withoutOverlapping()
            ->appendOutputTo(storage_path('logs/synthea-import.log'));
        */
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
