<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function getData(): JsonResponse
    {
        // Mock data for development
        return response()->json([
            'riskData' => [
                'riskScore' => [
                    'total' => 65.5
                ],
                'factorBreakdown' => [
                    'age' => 45.0,
                    'bmi' => 70.2,
                    'blood_pressure' => 65.5,
                    'cholesterol' => 55.8
                ],
                'trending' => [
                    ['month' => 'Jan', 'risk_score' => 68.5],
                    ['month' => 'Feb', 'risk_score' => 67.2],
                    ['month' => 'Mar', 'risk_score' => 66.8],
                    ['month' => 'Apr', 'risk_score' => 65.5]
                ]
            ],
            'measureData' => [
                'historical_trend' => [
                    ['month_name' => 'Jan', 'compliance_rate' => 75],
                    ['month_name' => 'Feb', 'compliance_rate' => 78],
                    ['month_name' => 'Mar', 'compliance_rate' => 82],
                    ['month_name' => 'Apr', 'compliance_rate' => 85]
                ],
                'current_rate' => [
                    'rate' => 85
                ],
                'improvement_opportunities' => [
                    [
                        'description' => 'Increase medication adherence monitoring',
                        'potential_impact' => 'Could improve compliance by 10%'
                    ],
                    [
                        'description' => 'Implement regular follow-up schedule',
                        'potential_impact' => 'Could reduce readmission by 15%'
                    ]
                ]
            ],
            'alerts' => [
                [
                    'level' => 'critical',
                    'message' => 'High risk patients requiring immediate attention',
                    'action_required' => 'Schedule follow-up within 48 hours',
                    'contributing_factors' => [
                        'missed_appointments' => 3.0,
                        'medication_adherence' => 65.5
                    ]
                ],
                [
                    'level' => 'warning',
                    'message' => 'Declining compliance trend in diabetic patients',
                    'action_required' => 'Review care management strategy'
                ],
                [
                    'level' => 'info',
                    'message' => 'New clinical guidelines available for hypertension management'
                ]
            ]
        ]);
    }
