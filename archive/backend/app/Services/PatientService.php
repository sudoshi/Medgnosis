<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\Observation;
use App\Models\ConditionDiagnosis;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class PatientService
{
    /**
     * Calculate patient risk score based on various factors.
     */
    public function calculateRiskScore(Patient $patient): array
    {
        $riskFactors = [
            'age' => $this->calculateAgeRisk($patient),
            'conditions' => $this->calculateConditionsRisk($patient),
            'vitals' => $this->calculateVitalsRisk($patient),
            'labs' => $this->calculateLabsRisk($patient),
        ];

        $totalRisk = array_sum($riskFactors) / count($riskFactors);

        return [
            'total' => round($totalRisk, 2),
            'factors' => $riskFactors,
        ];
    }

    /**
     * Calculate age-based risk score.
     */
    private function calculateAgeRisk(Patient $patient): float
    {
        $age = $patient->date_of_birth->age;

        // Basic age-based risk calculation
        if ($age < 30) return 20.0;
        if ($age < 40) return 30.0;
        if ($age < 50) return 40.0;
        if ($age < 60) return 50.0;
        if ($age < 70) return 60.0;
        return 70.0;
    }

    /**
     * Calculate risk based on patient conditions.
     */
    private function calculateConditionsRisk(Patient $patient): float
    {
        $activeConditions = $patient->conditions()
            ->where('diagnosis_status', 'ACTIVE')
            ->get();

        $riskScore = 0.0;

        foreach ($activeConditions as $condition) {
            // Add risk based on condition type
            if ($condition->diagnosis_type === 'CHRONIC') {
                $riskScore += 20.0;
            } else {
                $riskScore += 10.0;
            }
        }

        // Normalize to 0-100 scale
        return min(100.0, $riskScore);
    }

    /**
     * Calculate risk based on vital signs.
     */
    private function calculateVitalsRisk(Patient $patient): float
    {
        $latestVitals = $patient->observations()
            ->whereIn('observation_code', [
                '8480-6',  // Systolic BP
                '8462-4',  // Diastolic BP
                '8867-4',  // Heart rate
                '2710-2',  // Oxygen saturation
                '8310-5',  // Body temperature
            ])
            ->where('status', 'FINAL')
            ->orderBy('observation_datetime', 'desc')
            ->get()
            ->groupBy('observation_code');

        $riskScore = 0.0;
        $count = 0;

        // Check blood pressure
        if (isset($latestVitals['8480-6'][0])) {
            $systolic = $latestVitals['8480-6'][0]->value_numeric;
            if ($systolic > 140 || $systolic < 90) {
                $riskScore += 20.0;
            }
            $count++;
        }

        // Check heart rate
        if (isset($latestVitals['8867-4'][0])) {
            $hr = $latestVitals['8867-4'][0]->value_numeric;
            if ($hr > 100 || $hr < 60) {
                $riskScore += 20.0;
            }
            $count++;
        }

        return $count > 0 ? ($riskScore / $count) : 0.0;
    }

    /**
     * Calculate risk based on lab results.
     */
    private function calculateLabsRisk(Patient $patient): float
    {
        $latestLabs = $patient->observations()
            ->whereIn('observation_code', [
                '2345-7',  // Glucose
                '4548-4',  // HbA1c
                '2093-3',  // Cholesterol
                '2085-9',  // HDL
                '2089-1',  // LDL
            ])
            ->where('status', 'FINAL')
            ->where('observation_datetime', '>=', now()->subMonths(6))
            ->get();

        $abnormalCount = $latestLabs->where('abnormal_flag', 'Y')->count();
        $totalCount = $latestLabs->count();

        return $totalCount > 0 ? (($abnormalCount / $totalCount) * 100) : 0.0;
    }

    /**
     * Get care gaps for a patient.
     */
    public function getCareGaps(Patient $patient): Collection
    {
        return DB::table('phm_star.fact_care_gap as fcg')
            ->join('phm_star.dim_measure as dm', 'fcg.measure_key', '=', 'dm.measure_key')
            ->where('fcg.patient_key', $patient->patient_id)
            ->where('fcg.gap_status', 'OPEN')
            ->select([
                'dm.measure_name',
                'dm.measure_type',
                'fcg.identified_date',
                DB::raw('DATEDIFF(NOW(), fcg.identified_date) as days_open')
            ])
            ->get();
    }

    /**
     * Get patient's risk trend over time.
     */
    public function getRiskTrend(Patient $patient, int $months = 6): Collection
    {
        $startDate = now()->subMonths($months)->startOfMonth();

        return DB::table('phm_star.fact_measure_result as fmr')
            ->join('phm_star.dim_measure as dm', 'fmr.measure_key', '=', 'dm.measure_key')
            ->where('fmr.patient_key', $patient->patient_id)
            ->where('dm.measure_code', 'RISK_SCORE')
            ->where('fmr.date_key_period', '>=', $startDate->format('Ymd'))
            ->orderBy('fmr.date_key_period')
            ->select([
                'fmr.date_key_period',
                'fmr.measure_value as risk_score'
            ])
            ->get();
    }
}
