<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class TestPatientSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create test addresses
        $addressId = DB::table('phm_edw.address')->insertGetId([
            'address_line1' => '123 Main St',
            'city' => 'Boston',
            'state' => 'MA',
            'zip' => '02108',
            'country' => 'USA',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Create test provider
        $providerId = DB::table('phm_edw.provider')->insertGetId([
            'first_name' => 'John',
            'last_name' => 'Smith',
            'display_name' => 'Dr. John Smith',
            'npi_number' => '1234567890',
            'provider_type' => 'MD',
            'specialty' => 'Internal Medicine',
            'org_id' => 1, // From CoreReferenceSeeder
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Create test patient
        $patientId = DB::table('phm_edw.patient')->insertGetId([
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'date_of_birth' => '1970-01-15',
            'gender' => 'F',
            'race' => 'White',
            'ethnicity' => 'Non-Hispanic',
            'marital_status' => 'Married',
            'primary_language' => 'English',
            'address_id' => $addressId,
            'pcp_provider_id' => $providerId,
            'primary_phone' => '555-123-4567',
            'email' => 'jane.doe@example.com',
            'mrn' => 'MRN123456',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Create encounters
        $encounterId = DB::table('phm_edw.encounter')->insertGetId([
            'patient_id' => $patientId,
            'provider_id' => $providerId,
            'org_id' => 1,
            'encounter_type' => 'OUTPATIENT',
            'encounter_reason' => 'Follow-up',
            'encounter_datetime' => now()->subDays(30),
            'status' => 'COMPLETED',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Create diagnoses
        DB::table('phm_edw.condition_diagnosis')->insert([
            [
                'patient_id' => $patientId,
                'encounter_id' => $encounterId,
                'provider_id' => $providerId,
                'condition_id' => 1, // Type 2 Diabetes from CoreReferenceSeeder
                'diagnosis_type' => 'CHRONIC',
                'diagnosis_status' => 'ACTIVE',
                'onset_date' => now()->subYears(2),
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
            [
                'patient_id' => $patientId,
                'encounter_id' => $encounterId,
                'provider_id' => $providerId,
                'condition_id' => 2, // Hypertension from CoreReferenceSeeder
                'diagnosis_type' => 'CHRONIC',
                'diagnosis_status' => 'ACTIVE',
                'onset_date' => now()->subYears(1),
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
        ]);

        // Create observations (vital signs and labs)
        DB::table('phm_edw.observation')->insert([
            [
                'patient_id' => $patientId,
                'encounter_id' => $encounterId,
                'provider_id' => $providerId,
                'observation_datetime' => now()->subDays(30),
                'observation_code' => '8480-6',
                'observation_desc' => 'Systolic blood pressure',
                'value_numeric' => 142,
                'units' => 'mmHg',
                'abnormal_flag' => 'Y',
                'status' => 'FINAL',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
            [
                'patient_id' => $patientId,
                'encounter_id' => $encounterId,
                'provider_id' => $providerId,
                'observation_datetime' => now()->subDays(30),
                'observation_code' => '4548-4',
                'observation_desc' => 'Hemoglobin A1c',
                'value_numeric' => 8.2,
                'units' => '%',
                'abnormal_flag' => 'Y',
                'status' => 'FINAL',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
        ]);

        // Create care gaps
        DB::table('phm_star.fact_care_gap')->insert([
            [
                'patient_key' => $patientId,
                'measure_key' => 1, // DM_A1C_CONTROL from CoreReferenceSeeder
                'gap_status' => 'OPEN',
                'identified_date' => now()->subDays(60),
                'count_care_gap' => 1,
            ],
            [
                'patient_key' => $patientId,
                'measure_key' => 2, // HTN_BP_CONTROL from CoreReferenceSeeder
                'gap_status' => 'OPEN',
                'identified_date' => now()->subDays(30),
                'count_care_gap' => 1,
            ],
        ]);

        // Create risk scores
        for ($i = 6; $i >= 0; $i--) {
            DB::table('phm_star.fact_measure_result')->insert([
                'patient_key' => $patientId,
                'measure_key' => 3, // RISK_SCORE from CoreReferenceSeeder
                'date_key_period' => now()->subMonths($i)->format('Ymd'),
                'measure_value' => 65 + rand(-5, 5),
                'count_measure' => 1,
            ]);
        }
    }
}
