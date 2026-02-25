<?php

namespace App\Http\Controllers;

use App\Models\Patient;
use App\Services\PatientService;
use App\Http\Resources\PatientResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class PatientController extends Controller
{
    protected $patientService;

    public function __construct(PatientService $patientService)
    {
        $this->patientService = $patientService;
    }

    /**
     * Display a listing of patients.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->logAccess('view_patient_list');

        $perPage = $request->input('per_page', 15);
        $patients = Patient::with(['primaryCareProvider', 'address'])
            ->where('active_ind', 'Y')
            ->paginate($perPage);

        return PatientResource::collection($patients);
    }

    /**
     * Store a newly created patient.
     */
    public function store(Request $request): JsonResponse
    {
        $this->logAccess('create_patient');

        try {
            $validated = $request->validate([
                'first_name' => 'required|string|max:100',
                'middle_name' => 'nullable|string|max:100',
                'last_name' => 'required|string|max:100',
                'date_of_birth' => 'required|date',
                'gender' => 'nullable|string|max:50',
                'race' => 'nullable|string|max:50',
                'ethnicity' => 'nullable|string|max:50',
                'marital_status' => 'nullable|string|max:50',
                'primary_language' => 'nullable|string|max:50',
                'address_id' => 'nullable|exists:phm_edw.address,address_id',
                'pcp_provider_id' => 'nullable|exists:phm_edw.provider,provider_id',
                'primary_phone' => 'nullable|string|max:20',
                'email' => 'nullable|email|max:100',
                'next_of_kin_name' => 'nullable|string|max:200',
                'next_of_kin_phone' => 'nullable|string|max:20',
                'ssn' => 'nullable|string|max:11',
                'mrn' => 'nullable|string|max:50',
            ]);

            $patient = Patient::create($validated);
            $this->logAccess('patient_created', ['patient_id' => $patient->patient_id]);

            $patient->load(['primaryCareProvider', 'address']);
            return (new PatientResource($patient))
                ->additional(['message' => 'Patient created successfully'])
                ->response()
                ->setStatusCode(201);

        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        }
    }

    /**
     * Display the specified patient.
     */
    public function show(int $id): PatientResource
    {
        $this->logAccess('view_patient', ['patient_id' => $id]);

        $patient = Patient::with([
            'primaryCareProvider',
            'address',
            'encounters' => function($query) {
                $query->orderBy('encounter_datetime', 'desc')
                    ->take(5);
            },
            'conditions' => function($query) {
                $query->where('active_ind', 'Y')
                    ->orderBy('onset_date', 'desc');
            }
        ])->findOrFail($id);

        // Calculate risk score and get care gaps
        $riskScore = $this->patientService->calculateRiskScore($patient);
        $careGaps = $this->patientService->getCareGaps($patient);
        $riskTrend = $this->patientService->getRiskTrend($patient);

        return (new PatientResource($patient))
            ->additional([
                'risk_score' => $riskScore,
                'care_gaps' => $careGaps,
                'risk_trend' => $riskTrend
            ]);
    }

    /**
     * Update the specified patient.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->logAccess('update_patient', ['patient_id' => $id]);

        try {
            $patient = Patient::findOrFail($id);

            $validated = $request->validate([
                'first_name' => 'sometimes|required|string|max:100',
                'middle_name' => 'nullable|string|max:100',
                'last_name' => 'sometimes|required|string|max:100',
                'date_of_birth' => 'sometimes|required|date',
                'gender' => 'nullable|string|max:50',
                'race' => 'nullable|string|max:50',
                'ethnicity' => 'nullable|string|max:50',
                'marital_status' => 'nullable|string|max:50',
                'primary_language' => 'nullable|string|max:50',
                'address_id' => 'nullable|exists:phm_edw.address,address_id',
                'pcp_provider_id' => 'nullable|exists:phm_edw.provider,provider_id',
                'primary_phone' => 'nullable|string|max:20',
                'email' => 'nullable|email|max:100',
                'next_of_kin_name' => 'nullable|string|max:200',
                'next_of_kin_phone' => 'nullable|string|max:20',
                'ssn' => 'nullable|string|max:11',
                'mrn' => 'nullable|string|max:50',
            ]);

            $patient->update($validated);
            $this->logAccess('patient_updated', ['patient_id' => $id]);

            $patient->load(['primaryCareProvider', 'address']);
            return (new PatientResource($patient))
                ->additional(['message' => 'Patient updated successfully']);

        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        }
    }

    /**
     * Remove the specified patient (soft delete).
     */
    public function destroy(int $id): JsonResponse
    {
        $this->logAccess('delete_patient', ['patient_id' => $id]);

        $patient = Patient::findOrFail($id);
        $patient->active_ind = 'N';
        $patient->save();

        $this->logAccess('patient_deleted', ['patient_id' => $id]);

        return response()->json([
            'message' => 'Patient deactivated successfully'
        ]);
    }

    /**
     * Log access to patient data for audit purposes.
     */
    private function logAccess(string $action, array $context = []): void
    {
        $user = Auth::user();
        $context = array_merge([
            'user_id' => $user?->id,
            'user_email' => $user?->email,
            'ip_address' => request()->ip(),
        ], $context);

        Log::channel('audit')->info("Patient data access: {$action}", $context);
    }
}
