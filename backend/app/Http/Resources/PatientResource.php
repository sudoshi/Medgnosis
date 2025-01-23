<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PatientResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->patient_id,
            'demographics' => [
                'first_name' => $this->first_name,
                'middle_name' => $this->middle_name,
                'last_name' => $this->last_name,
                'full_name' => trim("{$this->first_name} {$this->middle_name} {$this->last_name}"),
                'date_of_birth' => $this->date_of_birth?->format('Y-m-d'),
                'age' => $this->date_of_birth?->age,
                'gender' => $this->gender,
                'race' => $this->race,
                'ethnicity' => $this->ethnicity,
                'marital_status' => $this->marital_status,
                'primary_language' => $this->primary_language,
            ],
            'contact' => [
                'primary_phone' => $this->primary_phone,
                'email' => $this->email,
                'address' => $this->when($this->address, function () {
                    return [
                        'line1' => $this->address->address_line1,
                        'line2' => $this->address->address_line2,
                        'city' => $this->address->city,
                        'state' => $this->address->state,
                        'zip' => $this->address->zip,
                        'county' => $this->address->county,
                        'country' => $this->address->country,
                    ];
                }),
            ],
            'emergency_contact' => [
                'name' => $this->next_of_kin_name,
                'phone' => $this->next_of_kin_phone,
            ],
            'identifiers' => [
                'mrn' => $this->mrn,
                'ssn' => $this->when($request->user()?->can('view_ssn'), $this->ssn),
            ],
            'care_team' => [
                'primary_care_provider' => $this->when($this->primaryCareProvider, function () {
                    return [
                        'id' => $this->primaryCareProvider->provider_id,
                        'name' => $this->primaryCareProvider->display_name,
                        'specialty' => $this->primaryCareProvider->specialty,
                        'npi' => $this->primaryCareProvider->npi_number,
                    ];
                }),
            ],
            'clinical_summary' => [
                'conditions' => $this->when($this->conditions, function () {
                    return $this->conditions->map(function ($condition) {
                        return [
                            'id' => $condition->condition_diagnosis_id,
                            'name' => $condition->condition->condition_name,
                            'code' => $condition->condition->condition_code,
                            'type' => $condition->diagnosis_type,
                            'status' => $condition->diagnosis_status,
                            'onset_date' => $condition->onset_date?->format('Y-m-d'),
                            'is_active' => $condition->is_active,
                            'is_chronic' => $condition->is_chronic,
                        ];
                    });
                }),
                'recent_encounters' => $this->when($this->encounters, function () {
                    return $this->encounters->map(function ($encounter) {
                        return [
                            'id' => $encounter->encounter_id,
                            'type' => $encounter->encounter_type,
                            'date' => $encounter->encounter_datetime?->format('Y-m-d H:i:s'),
                            'provider' => $encounter->provider?->display_name,
                            'reason' => $encounter->encounter_reason,
                            'disposition' => $encounter->disposition,
                        ];
                    });
                }),
            ],
            'status' => [
                'active' => $this->active_ind === 'Y',
                'effective_start' => $this->effective_start_date?->format('Y-m-d'),
                'effective_end' => $this->effective_end_date?->format('Y-m-d'),
            ],
            'metadata' => [
                'created_at' => $this->created_date?->format('Y-m-d H:i:s'),
                'updated_at' => $this->updated_date?->format('Y-m-d H:i:s'),
            ],
            // Include risk score and care gaps if they were loaded
            'risk_assessment' => $this->when(isset($this->additional['risk_score']), function () {
                return $this->additional['risk_score'];
            }),
            'care_gaps' => $this->when(isset($this->additional['care_gaps']), function () {
                return $this->additional['care_gaps'];
            }),
            'risk_trend' => $this->when(isset($this->additional['risk_trend']), function () {
                return $this->additional['risk_trend'];
            }),
        ];
    }
}
