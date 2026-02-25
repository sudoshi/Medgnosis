// =============================================================================
// @medgnosis/shared — Public API
// =============================================================================

// Types
export type * from './types/auth.js';
export type * from './types/patient.js';
export type * from './types/measure.js';
export type * from './types/alert.js';
export type * from './types/dashboard.js';
export type * from './types/clinical.js';
export type * from './types/fhir.js';
export type * from './types/api.js';

// Constants
export {
  API_PREFIX,
  WS_EVENTS,
  ALERT_RULE_KEYS,
  ALERT_THRESHOLDS,
  RISK_BANDS,
  PAGINATION,
} from './constants/index.js';
export type { AlertRuleKey } from './constants/index.js';

// Zod schemas
export {
  loginRequestSchema,
  mfaVerifySchema,
  patientSearchSchema,
  patientCreateSchema,
  careGapUpdateSchema,
  alertAcknowledgeSchema,
  measureFilterSchema,
} from './schemas/index.js';
export type {
  LoginRequest,
  MfaVerifyRequest,
  PatientSearchParams,
  PatientCreateRequest,
  CareGapUpdateRequest,
  AlertAcknowledgeRequest,
  MeasureFilterParams,
} from './schemas/index.js';
