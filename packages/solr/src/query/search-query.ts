// =============================================================================
// Search core query builder — builds Solr queries for the "search" core
// (patients + care_gaps)
// =============================================================================

import type { SolrQueryParams } from '../client.js';

export interface SearchCoreQueryOptions {
  searchTerm: string;
  docType?: 'patient' | 'care_gap';
  providerId?: number;
  filters?: Record<string, string>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit: number;
  offset: number;
  fields?: string;
}

const PATIENT_FIELDS =
  'id,patient_id,mrn,first_name,last_name,full_name,date_of_birth,gender,risk_tier,risk_score,doc_type';
const CARE_GAP_FIELDS =
  'id,care_gap_id,patient_id,patient_name,measure_name,measure_code,gap_status,gap_priority,due_date,identified_date,resolved_date,doc_type';
const ALL_FIELDS = `${PATIENT_FIELDS},${CARE_GAP_FIELDS}`;

function buildSort(
  docType?: string,
  sortBy?: string,
  sortOrder?: string,
): string {
  if (sortBy === 'name') return `last_name ${sortOrder ?? 'asc'}`;
  if (sortBy === 'mrn') return `mrn ${sortOrder ?? 'asc'}`;
  if (sortBy === 'risk_score') return `risk_score ${sortOrder ?? 'desc'}`;
  if (docType === 'care_gap') return 'gap_priority asc, due_date asc';
  return 'score desc';
}

export function buildSearchCoreQuery(
  opts: SearchCoreQueryOptions,
): SolrQueryParams {
  const fq: string[] = [];

  if (opts.docType) fq.push(`doc_type:${opts.docType}`);
  if (opts.providerId) fq.push(`provider_id:${opts.providerId}`);
  if (opts.docType === 'patient') fq.push('active_ind:Y');

  if (opts.filters) {
    for (const [key, value] of Object.entries(opts.filters)) {
      if (value) fq.push(`${key}:${value}`);
    }
  }

  const fl =
    opts.fields ??
    (opts.docType === 'patient'
      ? PATIENT_FIELDS
      : opts.docType === 'care_gap'
        ? CARE_GAP_FIELDS
        : ALL_FIELDS);

  return {
    q: opts.searchTerm,
    fq: fq.length > 0 ? fq : undefined,
    fl,
    sort: buildSort(opts.docType, opts.sortBy, opts.sortOrder),
    start: opts.offset,
    rows: opts.limit,
  };
}
