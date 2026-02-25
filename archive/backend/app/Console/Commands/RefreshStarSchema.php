<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class RefreshStarSchema extends Command
{
    protected $signature = 'phm:refresh-star-schema';
    protected $description = 'Refresh the star schema tables from EDW data';

    public function handle()
    {
        $this->info('Starting star schema refresh...');

        try {
            DB::beginTransaction();

            // Refresh DimDate (if needed)
            $this->refreshDimDate();

            // Refresh dimension tables
            $this->refreshDimPatient();
            $this->refreshDimProvider();
            $this->refreshDimOrganization();

            // Refresh fact tables
            $this->refreshFactEncounter();
            $this->refreshFactDiagnosis();
            $this->refreshFactObservation();

            DB::commit();
            $this->info('Star schema refresh completed successfully.');

        } catch (\Exception $e) {
            DB::rollBack();
            $this->error('Error refreshing star schema: ' . $e->getMessage());
            return 1;
        }

        return 0;
    }

    private function refreshDimDate(): void
    {
        $this->info('Refreshing DimDate...');

        // Check if we need to populate DimDate
        $count = DB::table('phm_star.dim_date')->count();
        if ($count > 0) {
            $this->info('DimDate already populated, skipping...');
            return;
        }

        // Generate dates for 10 years before and after current date
        $startDate = now()->subYears(10);
        $endDate = now()->addYears(10);
        $currentDate = $startDate->copy();

        while ($currentDate <= $endDate) {
            DB::table('phm_star.dim_date')->insert([
                'date_key' => (int)$currentDate->format('Ymd'),
                'full_date' => $currentDate->format('Y-m-d'),
                'day' => $currentDate->day,
                'month' => $currentDate->month,
                'year' => $currentDate->year,
                'quarter' => ceil($currentDate->month / 3),
                'week_of_year' => $currentDate->weekOfYear,
                'day_of_week' => $currentDate->dayOfWeek,
                'day_name' => $currentDate->format('l'),
                'month_name' => $currentDate->format('F'),
                'fiscal_year' => $currentDate->month >= 10 ?
                    $currentDate->year + 1 :
                    $currentDate->year,
                'fiscal_quarter' => $this->getFiscalQuarter($currentDate->month),
            ]);

            $currentDate->addDay();
        }
    }

    private function getFiscalQuarter(int $month): int
    {
        // Assuming fiscal year starts in October
        return floor(((($month + 2) % 12) / 3)) + 1;
    }

    private function refreshDimPatient(): void
    {
        $this->info('Refreshing DimPatient...');

        // Clear existing records that are no longer current
        DB::table('phm_star.dim_patient')
            ->where('is_current', true)
            ->update(['is_current' => false]);

        // Insert current records
        DB::insert("
            INSERT INTO phm_star.dim_patient (
                patient_id,
                first_name,
                last_name,
                date_of_birth,
                gender,
                race,
                ethnicity,
                marital_status,
                primary_language,
                pcp_provider_key,
                effective_start_date,
                is_current,
                created_at
            )
            SELECT
                p.patient_id,
                p.first_name,
                p.last_name,
                p.date_of_birth,
                p.gender,
                p.race,
                p.ethnicity,
                p.marital_status,
                p.primary_language,
                dp.provider_key,
                CURRENT_DATE,
                true,
                NOW()
            FROM phm_edw.patient p
            LEFT JOIN phm_star.dim_provider dp ON p.pcp_provider_id = dp.provider_id
            WHERE p.active_ind = 'Y'
        ");
    }

    private function refreshDimProvider(): void
    {
        $this->info('Refreshing DimProvider...');

        DB::table('phm_star.dim_provider')
            ->where('is_current', true)
            ->update(['is_current' => false]);

        DB::insert("
            INSERT INTO phm_star.dim_provider (
                provider_id,
                first_name,
                last_name,
                npi_number,
                specialty,
                provider_type,
                org_key,
                effective_start_date,
                is_current,
                created_at
            )
            SELECT
                p.provider_id,
                p.first_name,
                p.last_name,
                p.npi_number,
                p.specialty,
                p.provider_type,
                do.org_key,
                CURRENT_DATE,
                true,
                NOW()
            FROM phm_edw.provider p
            LEFT JOIN phm_star.dim_organization do ON p.org_id = do.org_id
            WHERE p.active_ind = 'Y'
        ");
    }

    private function refreshDimOrganization(): void
    {
        $this->info('Refreshing DimOrganization...');

        DB::table('phm_star.dim_organization')
            ->where('is_current', true)
            ->update(['is_current' => false]);

        DB::insert("
            INSERT INTO phm_star.dim_organization (
                org_id,
                organization_name,
                organization_type,
                parent_org_key,
                effective_start_date,
                is_current,
                created_at
            )
            SELECT
                o.org_id,
                o.organization_name,
                o.organization_type,
                po.org_key,
                CURRENT_DATE,
                true,
                NOW()
            FROM phm_edw.organization o
            LEFT JOIN phm_star.dim_organization po ON o.parent_org_id = po.org_id
            WHERE o.active_ind = 'Y'
        ");
    }

    private function refreshFactEncounter(): void
    {
        $this->info('Refreshing FactEncounter...');

        // Clear and reload fact_encounter
        DB::table('phm_star.fact_encounter')->truncate();

        DB::insert("
            INSERT INTO phm_star.fact_encounter (
                encounter_id,
                patient_key,
                provider_key,
                org_key,
                date_key_encounter,
                encounter_type,
                encounter_status,
                length_of_stay,
                count_encounter
            )
            SELECT
                e.encounter_id,
                dp.patient_key,
                dpr.provider_key,
                do.org_key,
                TO_CHAR(e.encounter_datetime, 'YYYYMMDD')::integer as date_key_encounter,
                e.encounter_type,
                e.status,
                CASE
                    WHEN e.discharge_datetime IS NOT NULL
                    THEN EXTRACT(DAY FROM (e.discharge_datetime - e.admission_datetime))
                    ELSE NULL
                END as length_of_stay,
                1 as count_encounter
            FROM phm_edw.encounter e
            JOIN phm_star.dim_patient dp ON e.patient_id = dp.patient_id
            LEFT JOIN phm_star.dim_provider dpr ON e.provider_id = dpr.provider_id
            LEFT JOIN phm_star.dim_organization do ON e.org_id = do.org_id
            WHERE e.active_ind = 'Y'
            AND dp.is_current = true
            AND (dpr.is_current = true OR dpr.provider_key IS NULL)
            AND (do.is_current = true OR do.org_key IS NULL)
        ");
    }

    private function refreshFactDiagnosis(): void
    {
        $this->info('Refreshing FactDiagnosis...');

        DB::table('phm_star.fact_diagnosis')->truncate();

        DB::insert("
            INSERT INTO phm_star.fact_diagnosis (
                patient_key,
                encounter_key,
                provider_key,
                condition_key,
                date_key_onset,
                diagnosis_type,
                diagnosis_status,
                primary_indicator,
                count_diagnosis
            )
            SELECT
                dp.patient_key,
                fe.encounter_key,
                dpr.provider_key,
                dc.condition_key,
                TO_CHAR(cd.onset_date, 'YYYYMMDD')::integer as date_key_onset,
                cd.diagnosis_type,
                cd.diagnosis_status,
                cd.primary_indicator = 'Y',
                1 as count_diagnosis
            FROM phm_edw.condition_diagnosis cd
            JOIN phm_star.dim_patient dp ON cd.patient_id = dp.patient_id
            LEFT JOIN phm_star.fact_encounter fe ON cd.encounter_id = fe.encounter_id
            LEFT JOIN phm_star.dim_provider dpr ON cd.provider_id = dpr.provider_id
            LEFT JOIN phm_star.dim_condition dc ON cd.condition_id = dc.condition_id
            WHERE cd.active_ind = 'Y'
            AND dp.is_current = true
            AND (dpr.is_current = true OR dpr.provider_key IS NULL)
        ");
    }

    private function refreshFactObservation(): void
    {
        $this->info('Refreshing FactObservation...');

        DB::table('phm_star.fact_observation')->truncate();

        DB::insert("
            INSERT INTO phm_star.fact_observation (
                patient_key,
                encounter_key,
                provider_key,
                date_key_obs,
                observation_code,
                observation_desc,
                value_numeric,
                value_text,
                units,
                abnormal_flag,
                count_observation
            )
            SELECT
                dp.patient_key,
                fe.encounter_key,
                dpr.provider_key,
                TO_CHAR(o.observation_datetime, 'YYYYMMDD')::integer as date_key_obs,
                o.observation_code,
                o.observation_desc,
                o.value_numeric,
                o.value_text,
                o.units,
                o.abnormal_flag = 'Y',
                1 as count_observation
            FROM phm_edw.observation o
            JOIN phm_star.dim_patient dp ON o.patient_id = dp.patient_id
            LEFT JOIN phm_star.fact_encounter fe ON o.encounter_id = fe.encounter_id
            LEFT JOIN phm_star.dim_provider dpr ON o.provider_id = dpr.provider_id
            WHERE o.active_ind = 'Y'
            AND o.status = 'FINAL'
            AND dp.is_current = true
            AND (dpr.is_current = true OR dpr.provider_key IS NULL)
        ");
    }
}
