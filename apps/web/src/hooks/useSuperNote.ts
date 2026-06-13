// =============================================================================
// Medgnosis Web — SuperNote hooks
// =============================================================================

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../services/api.js';

export interface ApScaffoldEntry {
  icd10_code: string;
  diagnosis_name: string;
  organ_system: string;
  ontology_id: number | null;
  generate_plan: boolean;
  previous_plan: string | null;
  current_plan: string;
}

export interface AssembledSuperNote {
  patient: { patient_id: number; first_name: string; last_name: string; age: number; gender: string };
  last_seen: string | null;
  brief_history: string;
  whats_due: string;
  problems_by_system: { organ_system: string; problems: { icd10_code: string; dx_name: string; disease_process?: string | null }[] }[];
  interval_events: { kind: string; event_date: string; detail: string | null; reason: string | null }[];
  care_gaps: { care_gap_id: number; measure_name: string; due_date: string | null; gap_priority: string | null }[];
  lab_review: { observation_code: string; value_numeric: string | null; observed_date: string }[];
  assessment_plan: ApScaffoldEntry[];
}

export function useSuperNote(patientId: string | undefined) {
  return useQuery({
    queryKey: ['supernote', patientId],
    queryFn: () => api.get<AssembledSuperNote>(`/supernote/${patientId}`),
    enabled: !!patientId,
  });
}

export interface FinalizeApEntry {
  icd10_code: string;
  diagnosis_name?: string;
  plan: string;
}

export function useFinalizeSuperNote(patientId: string | undefined) {
  return useMutation({
    mutationFn: (body: { chief_complaint?: string; ap: FinalizeApEntry[] }) =>
      api.post<{ note_id: string; coded: number }>(`/supernote/${patientId}/finalize`, body),
  });
}

const LAB_LABELS: Record<string, string> = {
  '4548-4': 'HbA1c', '18262-6': 'LDL', '33914-3': 'eGFR', '38483-4': 'Creatinine',
  '6298-4': 'Potassium', '2947-0': 'Sodium', '2339-0': 'Glucose', '6299-2': 'BUN',
};
export function labLabel(code: string): string {
  return LAB_LABELS[code] ?? code;
}
