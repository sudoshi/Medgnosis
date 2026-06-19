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
export type * from './types/bundle.js';
export type * from './types/encounter-note.js';

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
  registerRequestSchema,
  changePasswordSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  mfaSetupConfirmSchema,
  mfaVerifySchema,
  mfaDisableSchema,
  patientSearchSchema,
  patientCreateSchema,
  careGapUpdateSchema,
  alertAcknowledgeSchema,
  measureFilterSchema,
  clinicalNoteCreateSchema,
  clinicalNoteUpdateSchema,
  scribeRequestSchema,
  placeOrderSchema,
  placeOrderBatchSchema,
  bulkProblemActionSchema,
  finderDismissSchema,
  loopResolveSchema,
  protocolEnrollSchema,
  ampDispositionSchema,
  superNoteFinalizeSchema,
  cohortCreateSchema,
  cohortMessageSchema,
} from './schemas/index.js';
export type {
  LoginRequest,
  RegisterRequest,
  ChangePasswordRequest,
  PasswordResetRequest,
  PasswordResetConfirmRequest,
  MfaSetupConfirmRequest,
  MfaVerifyRequest,
  MfaDisableRequest,
  PatientSearchParams,
  PatientCreateRequest,
  CareGapUpdateRequest,
  AlertAcknowledgeRequest,
  MeasureFilterParams,
  ClinicalNoteCreateRequest,
  ClinicalNoteUpdateRequest,
  ScribeRequest,
  PlaceOrderRequest,
  PlaceOrderBatchRequest,
  BulkProblemActionRequest,
  FinderDismissRequest,
  LoopResolveRequest,
  ProtocolEnrollRequest,
  AmpDispositionRequest,
  SuperNoteFinalizeRequest,
  CohortCreateRequest,
  CohortMessageRequest,
} from './schemas/index.js';
