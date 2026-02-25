<?php

namespace App\Http\Controllers;

use App\Models\Patient;
use App\Models\Encounter;
use App\Models\ConditionDiagnosis;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function getData(): JsonResponse
    {
        $now = Carbon::now();
        $monthStart = $now->copy()->startOfMonth();
        $lastMonthStart = $now->copy()->subMonth()->startOfMonth();

        // Get patient counts
        $totalPatients = Patient::count();
        $lastMonthPatients = Patient::where('created_at', '<', $monthStart)->count();
        $patientChange = $totalPatients - $lastMonthPatients;
        $patientChangePercent = $lastMonthPatients > 0
            ? round(($patientChange / $lastMonthPatients) * 100, 1)
            : 0;

        // Get encounter counts
        $encounters = Encounter::where('encounter_date', '>=', $monthStart)->count();
        $lastMonthEncounters = Encounter::whereBetween('encounter_date', [
            $lastMonthStart,
            $monthStart
        ])->count();
        $encounterChange = $encounters - $lastMonthEncounters;
        $encounterChangePercent = $lastMonthEncounters > 0
            ? round(($encounterChange / $lastMonthEncounters) * 100, 1)
            : 0;

        // Calculate risk scores
        $riskScores = Patient::select(DB::raw('AVG(risk_score) as avg_score'))
            ->whereNotNull('risk_score')
            ->first();
        $lastMonthRiskScores = Patient::select(DB::raw('AVG(risk_score) as avg_score'))
            ->whereNotNull('risk_score')
            ->where('updated_at', '<', $monthStart)
            ->first();
        $riskScoreChange = $riskScores->avg_score - $lastMonthRiskScores->avg_score;
        $riskScoreChangePercent = $lastMonthRiskScores->avg_score > 0
            ? round(($riskScoreChange / $lastMonthRiskScores->avg_score) * 100, 1)
            : 0;

        // Get care gaps
        $careGaps = DB::table('care_gaps')
            ->where('status', 'open')
            ->count();
        $lastMonthCareGaps = DB::table('care_gaps')
            ->where('created_at', '<', $monthStart)
            ->where('status', 'open')
            ->count();
        $careGapChange = $careGaps - $lastMonthCareGaps;
        $careGapChangePercent = $lastMonthCareGaps > 0
            ? round(($careGapChange / $lastMonthCareGaps) * 100, 1)
            : 0;

        // Get high risk patients with their conditions
        $highRiskPatients = Patient::with(['conditions.condition'])
            ->where('risk_score', '>=', 70)
            ->orderBy('risk_score', 'desc')
            ->take(3)
            ->get()
            ->map(function ($patient) {
                return [
                    'id' => $patient->id,
                    'name' => $patient->full_name,
                    'riskScore' => round($patient->risk_score),
                    'conditions' => $patient->conditions->map(function ($cd) {
                        return $cd->condition->name;
                    })->take(3)->toArray(),
                    'lastEncounter' => $patient->encounters()
                        ->latest('encounter_date')
                        ->first()?->encounter_date
                ];
            });

        // Get care gap details
        $careGapDetails = DB::table('care_gaps')
            ->join('patients', 'care_gaps.patient_id', '=', 'patients.id')
            ->join('quality_measures', 'care_gaps.measure_id', '=', 'quality_measures.id')
            ->select(
                'care_gaps.id',
                'patients.full_name as patient',
                'quality_measures.name as measure',
                DB::raw('DATEDIFF(NOW(), care_gaps.created_at) as days_open'),
                'care_gaps.priority'
            )
            ->where('care_gaps.status', 'open')
            ->orderBy('care_gaps.priority', 'desc')
            ->orderBy('days_open', 'desc')
            ->take(3)
            ->get();

        return response()->json([
            'stats' => [
                'totalPatients' => [
                    'value' => $totalPatients,
                    'trend' => $patientChangePercent
                ],
                'riskScore' => [
                    'value' => round($riskScores->avg_score, 1),
                    'trend' => $riskScoreChangePercent
                ],
                'careGaps' => [
                    'value' => $careGaps,
                    'trend' => $careGapChangePercent
                ],
                'encounters' => [
                    'value' => $encounters,
                    'trend' => $encounterChangePercent
                ]
            ],
            'highRiskPatients' => $highRiskPatients,
            'careGaps' => $careGapDetails
        ]);
    }
}
