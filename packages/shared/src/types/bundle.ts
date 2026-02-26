// =============================================================================
// Medgnosis — Care Gap Bundle Types (Phase 10.6)
// Condition-based care gap bundles with deduplication support
// =============================================================================

/** Richer gap status values for bundle-aware care gaps */
export type BundleGapStatus =
  | 'met'
  | 'not_met'
  | 'overdue'
  | 'due_soon'
  | 'due'
  | 'ongoing'
  | 'na'
  | 'at_risk'
  | 'open'
  | 'closed';

// ─── Reference data ──────────────────────────────────────────────────────────

export interface ConditionBundle {
  bundle_id: number;
  bundle_code: string;
  condition_name: string;
  icd10_pattern: string;
  bundle_size: number;
  key_ecqm_refs: string | null;
  description: string | null;
}

export interface BundleMeasure {
  measure_id: number;
  measure_code: string;
  measure_name: string;
  description: string | null;
  frequency: string | null;
  ecqm_reference: string | null;
  ordinal: number;
}

export interface BundleWithMeasures extends ConditionBundle {
  measures: BundleMeasure[];
}

export interface OverlapRule {
  overlap_rule_id: number;
  rule_code: string;
  shared_domain: string;
  applicable_bundles: string;
  canonical_measure_code: string | null;
  dedup_rule: string;
}

// ─── Patient-level computed bundle ───────────────────────────────────────────

export interface PatientBundleMeasure {
  measure_code: string;
  measure_name: string;
  description: string | null;
  frequency: string | null;
  ecqm_reference: string | null;
  status: BundleGapStatus;
  due_date: string | null;
  identified_date: string | null;
  resolved_date: string | null;
  care_gap_id: number | null;
  is_deduplicated: boolean;
  dedup_source: string | null;
}

export interface PatientBundle {
  bundle_code: string;
  condition_name: string;
  bundle_size: number;
  compliance_pct: number;
  met_count: number;
  measures: PatientBundleMeasure[];
}

export interface OverlapDeduction {
  domain: string;
  canonical: string;
  satisfied_for: string[];
}

export interface PatientCareBundleResponse {
  patient_id: number;
  total_measures: number;
  deduplicated_measures: number;
  overall_compliance_pct: number;
  bundles: PatientBundle[];
  overlap_deductions: OverlapDeduction[];
}

// ─── Population-level ────────────────────────────────────────────────────────

export interface BundleComplianceSummary {
  bundle_code: string;
  condition_name: string;
  patients_with_condition: number;
  gaps_met: number;
  total_gaps: number;
  compliance_pct: number;
}
