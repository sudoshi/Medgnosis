<?php

namespace Tests\Unit\Services;

use App\Models\Patient;
use App\Models\Observation;
use App\Models\ConditionDiagnosis;
use App\Services\PatientService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PatientServiceTest extends TestCase
{
    use RefreshDatabase;

    private PatientService $service;
    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new PatientService();

        // Create test patient
        $this->patient = Patient::create([
            'first_name' => 'John',
            'last_name' => 'Doe',
            'date_of_birth' => '1960-01-15', // 64 years old
            'gender' => 'Male',
            'active_ind' => 'Y',
        ]);

        // Create test conditions
        DB::table('phm_edw.condition')->insert([
            [
                'condition_code' => 'E11.9',
                'condition_name' => 'Type 2 diabetes',
                'code_system' => 'ICD-10',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
            [
                'condition_code' => 'I10',
                'condition_name' => 'Hypertension',
                'code_system' => 'ICD-10',
                'active_ind' => 'Y',
                'created_date' => now(),
            ],
        ]);

        // Create test measures
        DB::table('phm_star.dim_measure')->insert([
            [
                'measure_code' => 'DM_A1C_CONTROL',
                'measure_name' => 'Diabetes: HbA1c Control',
                'measure_type' => 'CHRONIC',
                'created_at' => now(),
            ],
            [
                'measure_code' => 'HTN_BP_CONTROL',
                'measure_name' => 'Hypertension: BP Control',
                'measure_type' => 'CHRONIC',
                'created_at' => now(),
            ],
        ]);
    }

    public function test_calculates_risk_score_correctly()
    {
        // Add chronic conditions
        ConditionDiagnosis::create([
            'patient_id' => $this->patient->patient_id,
            'condition_id' => 1, // Diabetes
            'diagnosis_type' => 'CHRONIC',
            'diagnosis_status' => 'ACTIVE',
            'onset_date' => now()->subYears(2),
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        ConditionDiagnosis::create([
            'patient_id' => $this->patient->patient_id,
            'condition_id' => 2, // Hypertension
            'diagnosis_type' => 'CHRONIC',
            'diagnosis_status' => 'ACTIVE',
            'onset_date' => now()->subYear(),
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Add abnormal vital signs
        Observation::create([
            'patient_id' => $this->patient->patient_id,
            'observation_datetime' => now(),
            'observation_code' => '8480-6',
            'observation_desc' => 'Systolic blood pressure',
            'value_numeric' => 145,
            'units' => 'mmHg',
            'abnormal_flag' => 'Y',
            'status' => 'FINAL',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Add abnormal labs
        Observation::create([
            'patient_id' => $this->patient->patient_id,
            'observation_datetime' => now(),
            'observation_code' => '4548-4',
            'observation_desc' => 'HbA1c',
            'value_numeric' => 8.5,
            'units' => '%',
            'abnormal_flag' => 'Y',
            'status' => 'FINAL',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);

        // Calculate risk score
        $riskScore = $this->service->calculateRiskScore($this->patient);

        // Verify risk components
        $this->assertEquals(60.0, $riskScore['factors']['age'], 'Age risk score incorrect');
        $this->assertEquals(40.0, $riskScore['factors']['conditions'], 'Conditions risk score incorrect');
        $this->assertEquals(20.0, $riskScore['factors']['vitals'], 'Vitals risk score incorrect');
        $this->assertEquals(100.0, $riskScore['factors']['labs'], 'Labs risk score incorrect');

        // Verify total risk (average of all factors)
        $this->assertEquals(55.0, $riskScore['total'], 'Total risk score incorrect');
    }

    public function test_identifies_care_gaps()
    {
        // Mock care gaps in star schema
        DB::table('phm_star.fact_care_gap')->insert([
            [
                'patient_key' => $this->patient->patient_id,
                'measure_key' => 1, // DM_A1C_CONTROL
                'gap_status' => 'OPEN',
                'identified_date' => now()->subDays(30),
                'count_care_gap' => 1,
            ],
            [
                'patient_key' => $this->patient->patient_id,
                'measure_key' => 2, // HTN_BP_CONTROL
                'gap_status' => 'OPEN',
                'identified_date' => now()->subDays(15),
                'count_care_gap' => 1,
            ],
        ]);

        // Get care gaps
        $careGaps = $this->service->getCareGaps($this->patient);

        // Verify care gaps
        $this->assertCount(2, $careGaps, 'Should have 2 care gaps');

        $diabetesGap = $careGaps->firstWhere('measure_name', 'Diabetes: HbA1c Control');
        $this->assertNotNull($diabetesGap, 'Should have diabetes care gap');
        $this->assertEquals(30, $diabetesGap->days_open);

        $bpGap = $careGaps->firstWhere('measure_name', 'Hypertension: BP Control');
        $this->assertNotNull($bpGap, 'Should have hypertension care gap');
        $this->assertEquals(15, $bpGap->days_open);
    }

    public function test_tracks_risk_trend()
    {
        // Mock risk scores in star schema
        $startDate = now()->subMonths(6)->startOfMonth();

        for ($i = 0; $i < 6; $i++) {
            DB::table('phm_star.fact_measure_result')->insert([
                'patient_key' => $this->patient->patient_id,
                'measure_key' => 3, // RISK_SCORE
                'date_key_period' => $startDate->copy()->addMonths($i)->format('Ymd'),
                'measure_value' => 50 + $i * 2, // Increasing trend
                'count_measure' => 1,
            ]);
        }

        // Get risk trend
        $trend = $this->service->getRiskTrend($this->patient);

        // Verify trend
        $this->assertCount(6, $trend, 'Should have 6 months of trend data');

        // Verify increasing trend
        $previousScore = 0;
        foreach ($trend as $point) {
            $this->assertGreaterThanOrEqual($previousScore, $point->risk_score);
            $previousScore = $point->risk_score;
        }
    }
}
