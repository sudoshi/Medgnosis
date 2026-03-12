// =============================================================================
// Care Gap Indexer — cursor-paginated reindex into Solr 'search' core
// =============================================================================

import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';
import type { ProgressCallback } from './patients.js';

interface CareGapRow {
  care_gap_id: number;
  patient_id: number;
  first_name: string | null;
  last_name: string | null;
  mrn: string | null;
  pcp_provider_id: number | null;
  measure_id: number | null;
  measure_name: string | null;
  measure_code: string | null;
  gap_status: string | null;
  gap_priority: string | null;
  due_date: string | null;
  identified_date: string | null;
  resolved_date: string | null;
}

function toIso(d: string | null): string | null {
  if (!d) return null;
  try { return new Date(d).toISOString(); } catch { return null; }
}

function mapToSolrDoc(row: CareGapRow): Record<string, unknown> {
  return {
    id: `care_gap_${row.care_gap_id}`,
    doc_type: 'care_gap',
    care_gap_id: row.care_gap_id,
    patient_id: row.patient_id,
    patient_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    mrn: row.mrn,
    provider_id: row.pcp_provider_id,
    measure_id: row.measure_id,
    measure_name: row.measure_name,
    measure_code: row.measure_code,
    gap_status: row.gap_status,
    gap_priority: row.gap_priority,
    due_date: toIso(row.due_date),
    identified_date: toIso(row.identified_date),
    resolved_date: toIso(row.resolved_date),
    active_ind: 'Y',
  };
}

export async function reindexCareGaps(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: ProgressCallback,
): Promise<number> {
  let cursor = 0;
  let totalIndexed = 0;

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM phm_edw.care_gap
  `;

  while (true) {
    const rows = await sql<CareGapRow[]>`
      SELECT
        cg.care_gap_id,
        cg.patient_id,
        p.first_name,
        p.last_name,
        p.mrn,
        p.pcp_provider_id,
        cg.measure_id,
        md.measure_name,
        md.measure_code,
        cg.gap_status,
        cg.gap_priority,
        cg.due_date,
        cg.identified_date,
        cg.resolved_date
      FROM phm_edw.care_gap cg
      JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
      LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      WHERE cg.care_gap_id > ${cursor}
      ORDER BY cg.care_gap_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map(mapToSolrDoc);
    await solr.update('search', docs);

    totalIndexed += rows.length;
    cursor = rows[rows.length - 1].care_gap_id;

    if (onProgress) {
      onProgress(totalIndexed, count);
    }
  }

  return totalIndexed;
}
