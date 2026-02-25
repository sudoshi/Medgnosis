<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class SyntheaImportService
{
    /**
     * Import patients from Synthea database.
     */
    public function importPatients(int $limit = null): array
    {
        $stats = ['imported' => 0, 'skipped' => 0, 'failed' => 0];

        $query = DB::connection('synthea')
            ->table('patients')
            ->select([
                'id',
                'prefix',
                'first',
                'last',
                'maiden',
                'birthdate',
                'gender',
                'race',
                'ethnicity',
                'marital',
                'address',
                'city',
                'state',
                'zip'
            ]);

        if ($limit) {
            $query->limit($limit);
        }

        $patients = $query->get();

        foreach ($patients as $syntheaPatient) {
            try {
                DB::beginTransaction();

                // Create address first
                $addressId = DB::table('phm_edw.address')->insertGetId([
                    'address_line1' => $syntheaPatient->address,
                    'city' => $syntheaPatient->city,
                    'state' => $syntheaPatient->state,
                    'zip' => $syntheaPatient->zip,
                    'country' => 'USA',
                    'active_ind' => 'Y',
                    'created_date' => now(),
                ]);

                // Create patient
                DB::table('phm_edw.patient')->insert([
                    'first_name' => $syntheaPatient->first,
                    'middle_name' => null,
                    'last_name' => $syntheaPatient->last,
                    'date_of_birth' => $syntheaPatient->birthdate,
                    'gender' => $this->mapGender($syntheaPatient->gender),
                    'race' => $syntheaPatient->race,
                    'ethnicity' => $syntheaPatient->ethnicity,
                    'marital_status' => $this->mapMaritalStatus($syntheaPatient->marital),
                    'address_id' => $addressId,
                    'active_ind' => 'Y',
                    'created_date' => now(),
                ]);

                DB::commit();
                $stats['imported']++;

            } catch (\Exception $e) {
                DB::rollBack();
                Log::error("Failed to import patient {$syntheaPatient->id}: " . $e->getMessage());
                $stats['failed']++;
            }
        }

        return $stats;
    }

    /**
     * Import encounters from Synthea database.
     */
    public function importEncounters(int $limit = null): array
    {
        $stats = ['imported' => 0, 'skipped' => 0, 'failed' => 0];

        $query = DB::connection('synthea')
            ->table('encounters as e')
            ->join('patients as p', 'e.patient', '=', 'p.id')
            ->select([
                'e.id',
                'e.patient',
                'e.start',
                'e.stop',
                'e.encounterclass',
                'e.code',
                'e.description',
                'e.reasoncode',
                'e.reasondescription'
            ]);

        if ($limit) {
            $query->limit($limit);
        }

        $encounters = $query->get();

        foreach ($encounters as $syntheaEncounter) {
            try {
                // Find corresponding patient in our system
                $patient = DB::table('phm_edw.patient')
                    ->where('first_name', $syntheaEncounter->first)
                    ->where('last_name', $syntheaEncounter->last)
                    ->first();

                if (!$patient) {
                    $stats['skipped']++;
                    continue;
                }

                DB::table('phm_edw.encounter')->insert([
                    'patient_id' => $patient->patient_id,
                    'encounter_type' => $this->mapEncounterType($syntheaEncounter->encounterclass),
                    'encounter_reason' => $syntheaEncounter->reasondescription,
                    'encounter_datetime' => $syntheaEncounter->start,
                    'admission_datetime' => $syntheaEncounter->start,
                    'discharge_datetime' => $syntheaEncounter->stop,
                    'status' => 'COMPLETED',
                    'active_ind' => 'Y',
                    'created_date' => now(),
                ]);

                $stats['imported']++;

            } catch (\Exception $e) {
                Log::error("Failed to import encounter {$syntheaEncounter->id}: " . $e->getMessage());
                $stats['failed']++;
            }
        }

        return $stats;
    }

    /**
     * Import conditions from Synthea database.
     */
    public function importConditions(int $limit = null): array
    {
        $stats = ['imported' => 0, 'skipped' => 0, 'failed' => 0];

        $query = DB::connection('synthea')
            ->table('conditions as c')
            ->join('patients as p', 'c.patient', '=', 'p.id')
            ->select([
                'c.id',
                'c.patient',
                'c.encounter',
                'c.code',
                'c.description',
                'c.start',
                'c.stop'
            ]);

        if ($limit) {
            $query->limit($limit);
        }

        $conditions = $query->get();

        foreach ($conditions as $syntheaCondition) {
            try {
                // First ensure we have this condition in our master table
                $conditionId = $this->ensureCondition($syntheaCondition->code, $syntheaCondition->description);

                // Find corresponding patient
                $patient = DB::table('phm_edw.patient')
                    ->where('first_name', $syntheaCondition->first)
                    ->where('last_name', $syntheaCondition->last)
                    ->first();

                if (!$patient) {
                    $stats['skipped']++;
                    continue;
                }

                DB::table('phm_edw.condition_diagnosis')->insert([
                    'patient_id' => $patient->patient_id,
                    'condition_id' => $conditionId,
                    'diagnosis_type' => 'CHRONIC', // Default to chronic
                    'diagnosis_status' => $syntheaCondition->stop ? 'RESOLVED' : 'ACTIVE',
                    'onset_date' => $syntheaCondition->start,
                    'resolution_date' => $syntheaCondition->stop,
                    'active_ind' => 'Y',
                    'created_date' => now(),
                ]);

                $stats['imported']++;

            } catch (\Exception $e) {
                Log::error("Failed to import condition {$syntheaCondition->id}: " . $e->getMessage());
                $stats['failed']++;
            }
        }

        return $stats;
    }

    /**
     * Import observations from Synthea database.
     */
    public function importObservations(int $limit = null): array
    {
        $stats = ['imported' => 0, 'skipped' => 0, 'failed' => 0];

        $query = DB::connection('synthea')
            ->table('observations as o')
            ->join('patients as p', 'o.patient', '=', 'p.id')
            ->select([
                'o.id',
                'o.patient',
                'o.encounter',
                'o.code',
                'o.description',
                'o.value',
                'o.units',
                'o.date'
            ]);

        if ($limit) {
            $query->limit($limit);
        }

        $observations = $query->get();

        foreach ($observations as $syntheaObs) {
            try {
                // Find corresponding patient
                $patient = DB::table('phm_edw.patient')
                    ->where('first_name', $syntheaObs->first)
                    ->where('last_name', $syntheaObs->last)
                    ->first();

                if (!$patient) {
                    $stats['skipped']++;
                    continue;
                }

                DB::table('phm_edw.observation')->insert([
                    'patient_id' => $patient->patient_id,
                    'observation_datetime' => $syntheaObs->date,
                    'observation_code' => $syntheaObs->code,
                    'observation_desc' => $syntheaObs->description,
                    'value_numeric' => is_numeric($syntheaObs->value) ? $syntheaObs->value : null,
                    'value_text' => !is_numeric($syntheaObs->value) ? $syntheaObs->value : null,
                    'units' => $syntheaObs->units,
                    'status' => 'FINAL',
                    'active_ind' => 'Y',
                    'created_date' => now(),
                ]);

                $stats['imported']++;

            } catch (\Exception $e) {
                Log::error("Failed to import observation {$syntheaObs->id}: " . $e->getMessage());
                $stats['failed']++;
            }
        }

        return $stats;
    }

    /**
     * Ensure condition exists in master table and return its ID.
     */
    private function ensureCondition(string $code, string $description): int
    {
        $condition = DB::table('phm_edw.condition')
            ->where('condition_code', $code)
            ->first();

        if ($condition) {
            return $condition->condition_id;
        }

        return DB::table('phm_edw.condition')->insertGetId([
            'condition_code' => $code,
            'condition_name' => $description,
            'code_system' => 'SNOMED-CT',
            'active_ind' => 'Y',
            'created_date' => now(),
        ]);
    }

    /**
     * Map Synthea gender to our format.
     */
    private function mapGender(?string $gender): string
    {
        return match (strtoupper($gender)) {
            'M' => 'Male',
            'F' => 'Female',
            default => 'Unknown',
        };
    }

    /**
     * Map Synthea marital status to our format.
     */
    private function mapMaritalStatus(?string $status): string
    {
        return match (strtoupper($status)) {
            'M' => 'Married',
            'S' => 'Single',
            'D' => 'Divorced',
            'W' => 'Widowed',
            default => 'Unknown',
        };
    }

    /**
     * Map Synthea encounter type to our format.
     */
    private function mapEncounterType(string $type): string
    {
        return match (strtoupper($type)) {
            'AMBULATORY' => 'OUTPATIENT',
            'EMERGENCY' => 'EMERGENCY',
            'INPATIENT' => 'INPATIENT',
            'WELLNESS' => 'OUTPATIENT',
            'URGENTCARE' => 'URGENT_CARE',
            default => 'OTHER',
        };
    }
}
