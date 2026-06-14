// =============================================================================
// Clinical core query builder — builds Solr queries for the "clinical" core
// (encounters, conditions, observations, medications)
// =============================================================================

import type { SolrQueryParams } from '../client.js';

export type ClinicalDocType = 'encounter' | 'condition' | 'observation' | 'medication';

export interface ClinicalCoreQueryOptions {
  patientId: number;
  docType: ClinicalDocType;
  searchTerm?: string;
  filters?: Record<string, string>;
  limit: number;
  offset: number;
  fields?: string;
}

const FIELD_MAP: Record<ClinicalDocType, string> = {
  encounter:
    'id,encounter_id,patient_id,encounter_datetime,encounter_type,disposition,facility_name,doc_type',
  condition:
    'id,condition_id,patient_id,condition_name,icd10_code,diagnosis_status,onset_date,doc_type',
  observation:
    'id,observation_id,patient_id,observation_code,observation_name,value_numeric,value_text,units,observation_datetime,doc_type',
  medication:
    'id,medication_order_id,patient_id,medication_name,prescription_status,doc_type',
};

const DEFAULT_SORT: Record<ClinicalDocType, string> = {
  encounter: 'encounter_datetime desc',
  condition: 'condition_name asc',
  observation: 'observation_datetime desc',
  medication: 'medication_name asc',
};

export function buildClinicalCoreQuery(
  opts: ClinicalCoreQueryOptions,
): SolrQueryParams {
  const fq: string[] = [
    `patient_id:${opts.patientId}`,
    `doc_type:${opts.docType}`,
  ];

  if (opts.filters) {
    for (const [key, value] of Object.entries(opts.filters)) {
      if (value) fq.push(`${key}:${value}`);
    }
  }

  return {
    q: opts.searchTerm ?? '*:*',
    fq,
    fl: opts.fields ?? FIELD_MAP[opts.docType],
    sort: DEFAULT_SORT[opts.docType],
    start: opts.offset,
    rows: opts.limit,
  };
}

// =============================================================================
// Cohort / denominator observation query (population-scoped, NOT patient-scoped)
// Answers "which patients have an observation in {codes} with value in {range}
// during {period}" — e.g. the CMS122 numerator "most recent HbA1c > 9%". Served
// by the clinical core (value_numeric is pdouble, observation_datetime is pdate)
// so it never scans the ~1B-row phm_edw.observation. Returns matching observation
// docs (each carries patient_id); the caller dedupes patient_id for the cohort.
// =============================================================================

export interface ObservationCohortQueryOptions {
  /** observation_code values, e.g. a value set's HbA1c LOINCs. */
  codes: string[];
  /** Inclusive value_numeric bounds (omit a side for open-ended). */
  valueRange?: { min?: number; max?: number };
  /** observation_datetime window (ISO instants). */
  period?: { start: string; end: string };
  limit: number;
  offset: number;
  /** Newest-first by default (supports "most recent" logic downstream). */
  sort?: string;
}

// Escape Solr query-syntax specials in code tokens (LOINC has '-', which is fine,
// but be defensive about ':' and whitespace).
function solrTerm(v: string): string {
  return /[\s:"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function rangeClause(min?: number, max?: number): string {
  const lo = min ?? '*';
  const hi = max ?? '*';
  return `value_numeric:[${lo} TO ${hi}]`;
}

export function buildObservationCohortQuery(
  opts: ObservationCohortQueryOptions,
): SolrQueryParams {
  const fq: string[] = ['doc_type:observation'];

  if (opts.codes.length > 0) {
    fq.push(`observation_code:(${opts.codes.map(solrTerm).join(' OR ')})`);
  }
  if (opts.valueRange && (opts.valueRange.min !== undefined || opts.valueRange.max !== undefined)) {
    fq.push(rangeClause(opts.valueRange.min, opts.valueRange.max));
  }
  if (opts.period) {
    fq.push(`observation_datetime:[${opts.period.start} TO ${opts.period.end}]`);
  }

  return {
    q: '*:*',
    fq,
    fl: FIELD_MAP.observation,
    sort: opts.sort ?? DEFAULT_SORT.observation,
    start: opts.offset,
    rows: opts.limit,
  };
}
