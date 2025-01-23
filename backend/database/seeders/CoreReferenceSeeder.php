<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CoreReferenceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Seed Conditions (ICD-10 codes)
        DB::table('phm_edw.condition')->insert([
            [
                'condition_code' => 'E11.9',
                'condition_name' => 'Type 2 diabetes mellitus without complications',
                'code_system' => 'ICD-10',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
            [
                'condition_code' => 'I10',
                'condition_name' => 'Essential (primary) hypertension',
                'code_system' => 'ICD-10',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
            [
                'condition_code' => 'E78.5',
                'condition_name' => 'Dyslipidemia',
                'code_system' => 'ICD-10',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
        ]);

        // Seed Procedures (CPT codes)
        DB::table('phm_edw.procedure')->insert([
            [
                'procedure_code' => '99213',
                'procedure_desc' => 'Office/outpatient visit established',
                'code_system' => 'CPT',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
            [
                'procedure_code' => '85025',
                'procedure_desc' => 'Complete blood count (CBC)',
                'code_system' => 'CPT',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
            [
                'procedure_code' => '80053',
                'procedure_desc' => 'Comprehensive metabolic panel',
                'code_system' => 'CPT',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
        ]);

        // Seed Quality Measures
        DB::table('phm_star.dim_measure')->insert([
            [
                'measure_code' => 'DM_A1C_CONTROL',
                'measure_name' => 'Diabetes: HbA1c Poor Control (>9%)',
                'measure_type' => 'CHRONIC',
                'description' => 'Percentage of patients 18-75 years of age with diabetes who had hemoglobin A1c > 9.0% during the measurement period.',
                'created_at' => now(),
            ],
            [
                'measure_code' => 'HTN_BP_CONTROL',
                'measure_name' => 'Controlling High Blood Pressure',
                'measure_type' => 'CHRONIC',
                'description' => 'Percentage of patients 18-85 years of age who had a diagnosis of hypertension and whose blood pressure was adequately controlled during the measurement period.',
                'created_at' => now(),
            ],
            [
                'measure_code' => 'RISK_SCORE',
                'measure_name' => 'Patient Risk Score',
                'measure_type' => 'ANALYTICS',
                'description' => 'Composite risk score based on clinical, demographic, and social determinants of health factors.',
                'created_at' => now(),
            ],
        ]);

        // Seed Organizations
        DB::table('phm_edw.organization')->insert([
            [
                'organization_name' => 'Primary Care Medical Group',
                'organization_type' => 'CLINIC',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
            [
                'organization_name' => 'Community Hospital',
                'organization_type' => 'HOSPITAL',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
        ]);
    }
}
