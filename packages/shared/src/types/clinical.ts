// =============================================================================
// Medgnosis — Clinical Documentation Types
// Ported from frontend/types/soap-note.ts and initial-visit.ts
// =============================================================================

export type VisitType = 'initial' | 'followup' | 'procedure' | 'telehealth';

export interface SOAPNote {
  visit_type: VisitType;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  metadata: {
    patient_id?: string;
    provider_id?: string;
    encounter_date: string;
    last_updated: string;
  };
  initial_visit_details?: InitialVisitDetails;
  follow_up_details?: FollowUpDetails;
}

export interface InitialVisitDetails {
  demographics?: string | Record<string, string>;
  insurance_info?: string | Record<string, string>;
  chief_complaint?: string | Record<string, string>;
  hpi?: string | Record<string, string>;
  allergies?: string | Record<string, string>;
  medications?: string | Record<string, string>;
  pmh?: string | Record<string, string>;
  family_history?: string | Record<string, string>;
  social_history?: string | Record<string, string>;
  preventive_care?: string | Record<string, string>;
  ros?: string | Record<string, string>;
  vital_signs?: string | Record<string, string>;
  physical_exam?: string | Record<string, string>;
  assessment?: string | Record<string, string>;
  problem_list?: string | Record<string, string>;
  plan?: string | Record<string, string>;
  patient_education?: string | Record<string, string>;
  follow_up_plan?: string | Record<string, string>;
  ebm_guidelines?: string | Record<string, string>;
}

export interface FollowUpDetails {
  visit_info?: Record<string, string>;
  interval_history?: Record<string, string>;
  treatment_response?: Record<string, string>;
  medication_review?: Record<string, string>;
  vital_signs?: Record<string, string>;
  targeted_ros?: Record<string, string>;
  focused_exam?: Record<string, string>;
  test_results?: Record<string, string>;
  assessment?: Record<string, string>;
  plan?: Record<string, string>;
  goal_progress?: Record<string, string>;
  patient_education?: Record<string, string>;
  follow_up_plan?: Record<string, string>;
  ebm_guidelines?: string;
}

export type InitialVisitSectionKey =
  | 'demographics'
  | 'insurance_info'
  | 'chief_complaint'
  | 'hpi'
  | 'allergies'
  | 'medications'
  | 'pmh'
  | 'family_history'
  | 'social_history'
  | 'preventive_care'
  | 'ros'
  | 'vital_signs'
  | 'physical_exam'
  | 'assessment'
  | 'problem_list'
  | 'plan'
  | 'patient_education'
  | 'follow_up_plan'
  | 'ebm_guidelines';
