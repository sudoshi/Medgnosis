// =============================================================================
// Medgnosis — Zod Validation Schemas
// Runtime validation for API requests shared between client and server
// =============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

export const loginRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const mfaVerifySchema = z.object({
  code: z.string().length(6, 'MFA code must be 6 digits'),
  factor_id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Patient schemas
// ---------------------------------------------------------------------------

export const patientSearchSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(25),
  sort_by: z.enum(['name', 'mrn', 'risk_score', 'last_encounter']).default('name'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

export const patientCreateSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  mrn: z.string().min(1).max(50),
  date_of_birth: z.string().date(),
  gender: z.string().min(1).max(20),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Care gap schemas
// ---------------------------------------------------------------------------

export const careGapUpdateSchema = z.object({
  status: z.enum([
    'open', 'closed', 'resolved', 'in_progress',
    'met', 'not_met', 'overdue', 'due_soon', 'due', 'ongoing', 'na', 'at_risk',
  ]),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Alert schemas
// ---------------------------------------------------------------------------

export const alertAcknowledgeSchema = z.object({
  alert_id: z.string().uuid(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Measure filter schema
// ---------------------------------------------------------------------------

export const measureFilterSchema = z.object({
  domain: z.enum(['preventive', 'chronic', 'acute', 'safety']).optional(),
  type: z.enum(['process', 'outcome', 'structural']).optional(),
  search: z.string().optional(),
  status: z.enum(['active', 'draft', 'retired']).optional(),
});

// ---------------------------------------------------------------------------
// Clinical note schemas
// ---------------------------------------------------------------------------

export const clinicalNoteCreateSchema = z.object({
  patient_id: z.coerce.number().int().positive(),
  visit_type: z.enum(['initial', 'followup', 'procedure', 'telehealth']).default('followup'),
  encounter_id: z.coerce.number().int().positive().optional(),
  chief_complaint: z.string().optional(),
});

export const clinicalNoteUpdateSchema = z.object({
  chief_complaint: z.string().optional(),
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan_text: z.string().optional(),
  visit_type: z.enum(['initial', 'followup', 'procedure', 'telehealth']).optional(),
});

export const scribeRequestSchema = z.object({
  patient_id: z.coerce.number().int().positive(),
  visit_type: z.enum(['initial', 'followup', 'procedure', 'telehealth']).default('followup'),
  sections: z.array(z.enum(['subjective', 'objective', 'assessment', 'plan_text'])).min(1),
  chief_complaint: z.string().optional(),
  existing_content: z.record(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Order placement schemas
// ---------------------------------------------------------------------------

export const placeOrderSchema = z.object({
  patient_id: z.coerce.number().int().positive(),
  care_gap_id: z.coerce.number().int().positive(),
  order_set_item_id: z.coerce.number().int().positive(),
  priority: z.enum(['stat', 'urgent', 'routine']).default('routine'),
  instructions: z.string().max(1000).optional(),
});

export const placeOrderBatchSchema = z.object({
  patient_id: z.coerce.number().int().positive(),
  priority: z.enum(['stat', 'urgent', 'routine']).default('routine'),
  orders: z.array(z.object({
    care_gap_id: z.coerce.number().int().positive(),
    order_set_item_id: z.coerce.number().int().positive(),
  })).min(1).max(50),
});

// ---------------------------------------------------------------------------
// Infer types from schemas
// ---------------------------------------------------------------------------

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type MfaVerifyRequest = z.infer<typeof mfaVerifySchema>;
export type PatientSearchParams = z.infer<typeof patientSearchSchema>;
export type PatientCreateRequest = z.infer<typeof patientCreateSchema>;
export type CareGapUpdateRequest = z.infer<typeof careGapUpdateSchema>;
export type AlertAcknowledgeRequest = z.infer<typeof alertAcknowledgeSchema>;
export type MeasureFilterParams = z.infer<typeof measureFilterSchema>;
export type ClinicalNoteCreateRequest = z.infer<typeof clinicalNoteCreateSchema>;
export type ClinicalNoteUpdateRequest = z.infer<typeof clinicalNoteUpdateSchema>;
export type ScribeRequest = z.infer<typeof scribeRequestSchema>;
export type PlaceOrderRequest = z.infer<typeof placeOrderSchema>;
export type PlaceOrderBatchRequest = z.infer<typeof placeOrderBatchSchema>;
