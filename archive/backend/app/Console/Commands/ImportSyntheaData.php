<?php

namespace App\Console\Commands;

use App\Services\SyntheaImportService;
use Illuminate\Console\Command;

class ImportSyntheaData extends Command
{
    protected $signature = 'phm:import-synthea
                          {--limit= : Limit the number of records to import}
                          {--type=all : Type of data to import (patients, encounters, conditions, observations, all)}';

    protected $description = 'Import data from Synthea database into PHM EDW';

    private SyntheaImportService $syntheaService;

    public function __construct(SyntheaImportService $syntheaService)
    {
        parent::__construct();
        $this->syntheaService = $syntheaService;
    }

    public function handle(): int
    {
        $limit = $this->option('limit') ? (int)$this->option('limit') : null;
        $type = strtolower($this->option('type'));

        $this->info('Starting Synthea data import...');
        $startTime = now();

        try {
            if (in_array($type, ['all', 'patients'])) {
                $this->importPatients($limit);
            }

            if (in_array($type, ['all', 'encounters'])) {
                $this->importEncounters($limit);
            }

            if (in_array($type, ['all', 'conditions'])) {
                $this->importConditions($limit);
            }

            if (in_array($type, ['all', 'observations'])) {
                $this->importObservations($limit);
            }

            $duration = $startTime->diffInSeconds(now());
            $this->info("Import completed in {$duration} seconds.");

            // Refresh star schema if needed
            if ($this->confirm('Would you like to refresh the star schema with the new data?')) {
                $this->call('phm:refresh-star-schema');
            }

            return 0;

        } catch (\Exception $e) {
            $this->error("Import failed: " . $e->getMessage());
            return 1;
        }
    }

    private function importPatients(?int $limit): void
    {
        $this->info('Importing patients...');
        $stats = $this->syntheaService->importPatients($limit);
        $this->displayStats('Patients', $stats);
    }

    private function importEncounters(?int $limit): void
    {
        $this->info('Importing encounters...');
        $stats = $this->syntheaService->importEncounters($limit);
        $this->displayStats('Encounters', $stats);
    }

    private function importConditions(?int $limit): void
    {
        $this->info('Importing conditions...');
        $stats = $this->syntheaService->importConditions($limit);
        $this->displayStats('Conditions', $stats);
    }

    private function importObservations(?int $limit): void
    {
        $this->info('Importing observations...');
        $stats = $this->syntheaService->importObservations($limit);
        $this->displayStats('Observations', $stats);
    }

    private function displayStats(string $type, array $stats): void
    {
        $this->table(
            [$type, 'Count'],
            [
                ['Imported', $stats['imported']],
                ['Skipped', $stats['skipped']],
                ['Failed', $stats['failed']],
                ['Total', array_sum($stats)],
            ]
        );
    }
}
