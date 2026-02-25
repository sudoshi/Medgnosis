// =============================================================================
// Medgnosis — Shared Constants
// =============================================================================

/** Versioned API prefix for all routes */
export const API_PREFIX = '/api/v1';

/** WebSocket event names */
export const WS_EVENTS = {
  PING: 'ping',
  PONG: 'pong',
  ALERT_CREATED: 'alert:created',
  ALERT_ACKNOWLEDGED: 'alert:acknowledged',
  ALERT_RESOLVED: 'alert:resolved',
  PATIENT_STATUS_CHANGED: 'patient:status_changed',
  CARE_GAP_CLOSED: 'care_gap:closed',
  MEASURE_UPDATED: 'measure:updated',
} as const;

/** Clinical alert rule keys */
export const ALERT_RULE_KEYS = {
  CARE_GAP_OVERDUE: 'RULE-001',
  RISK_THRESHOLD: 'RULE-002',
  MEASURE_NON_COMPLIANCE: 'RULE-003',
  LAB_CRITICAL: 'RULE-004',
  MEDICATION_ADHERENCE: 'RULE-005',
  ENCOUNTER_FOLLOWUP: 'RULE-006',
  POPULATION_DRIFT: 'RULE-007',
  AI_ANOMALY: 'RULE-008',
} as const;

export type AlertRuleKey = (typeof ALERT_RULE_KEYS)[keyof typeof ALERT_RULE_KEYS];

/** Thresholds for clinical alert rules */
export const ALERT_THRESHOLDS = {
  // RULE-001: Care gap overdue
  CARE_GAP_WARNING_DAYS: 14,
  CARE_GAP_CRITICAL_DAYS: 30,
  // RULE-002: Risk score thresholds
  RISK_HIGH_THRESHOLD: 70,
  RISK_CRITICAL_THRESHOLD: 85,
  // RULE-003: Measure compliance
  MEASURE_COMPLIANCE_WARNING: 0.7,
  MEASURE_COMPLIANCE_CRITICAL: 0.5,
  // RULE-004: Lab critical values (general)
  LAB_CRITICAL_CHECK_HOURS: 24,
  // RULE-005: Medication adherence
  MED_ADHERENCE_WARNING_DAYS: 3,
  MED_ADHERENCE_CRITICAL_DAYS: 7,
  // RULE-006: Encounter follow-up
  FOLLOWUP_OVERDUE_DAYS: 7,
  // RULE-007: Population drift
  POPULATION_DRIFT_THRESHOLD: 0.05,
} as const;

/** Risk scoring bands */
export const RISK_BANDS = {
  LOW: { min: 0, max: 24, label: 'Low', color: 'green' },
  MODERATE: { min: 25, max: 49, label: 'Moderate', color: 'yellow' },
  HIGH: { min: 50, max: 74, label: 'High', color: 'orange' },
  CRITICAL: { min: 75, max: 100, label: 'Critical', color: 'red' },
} as const;

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PER_PAGE: 25,
  MAX_PER_PAGE: 100,
} as const;
