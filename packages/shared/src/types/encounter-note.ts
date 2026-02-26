// =============================================================================
// Medgnosis — Encounter Note Types (Clinical SOAP Notes + AI Scribe)
// =============================================================================

import type { VisitType } from './clinical.js';

export type NoteStatus = 'draft' | 'finalized' | 'amended';

export type SOAPSection = 'subjective' | 'objective' | 'assessment' | 'plan_text';

export interface ClinicalNote {
  note_id: string;
  patient_id: number;
  author_user_id: string;
  encounter_id: number | null;
  visit_type: VisitType;
  status: NoteStatus;
  chief_complaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan_text: string | null;
  ai_generated: AiProvenance | null;
  finalized_at: string | null;
  amended_at: string | null;
  amendment_reason: string | null;
  created_date: string;
  updated_date: string;
}

export interface AiProvenance {
  sections: SOAPSection[];
  model: string;
  generated_at: string;
}

export interface ScribeRequest {
  patient_id: number;
  visit_type: VisitType;
  sections: SOAPSection[];
  existing_content?: Partial<Record<SOAPSection, string>>;
  chief_complaint?: string;
}

export interface ScribeResponse {
  sections: Partial<Record<SOAPSection, string>>;
  model: string;
  provider: string;
}
