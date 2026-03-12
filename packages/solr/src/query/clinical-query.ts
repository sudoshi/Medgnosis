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
