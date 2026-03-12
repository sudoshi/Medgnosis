// =============================================================================
// Condition Indexer — cursor-paginated reindex into Solr 'clinical' core
// =============================================================================

import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';
import type { ProgressCallback } from './patients.js';

interface ConditionRow {
  condition_diagnosis_id: number;
  patient_id: number;
  encounter_id: number | null;
  condition_id: number | null;
  condition_name: string | null;
  icd10_code: string | null;
  diagnosis_status: string | null;
  onset_date: string | null;
}

function toIso(d: string | null): string | null {
  if (!d) return null;
  try { return new Date(d).toISOString(); } catch { return null; }
}

function mapToSolrDoc(row: ConditionRow): Record<string, unknown> {
  return {
    id: `condition_${row.condition_diagnosis_id}`,
    doc_type: 'condition',
    patient_id: row.patient_id,
    condition_id: row.condition_id,
    condition_name: row.condition_name,
    icd10_code: row.icd10_code,
    diagnosis_status: row.diagnosis_status,
    onset_date: toIso(row.onset_date),
  };
}

export async function reindexConditions(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: ProgressCallback,
): Promise<number> {
  let cursor = 0;
  let totalIndexed = 0;

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM phm_edw.condition_diagnosis
  `;

  while (true) {
    const rows = await sql<ConditionRow[]>`
      SELECT
        cd.condition_diagnosis_id,
        cd.patient_id,
        cd.encounter_id,
        cd.condition_id,
        c.condition_name,
        c.condition_code AS icd10_code,
        cd.diagnosis_status,
        cd.onset_date
      FROM phm_edw.condition_diagnosis cd
      JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
      WHERE cd.condition_diagnosis_id > ${cursor}
      ORDER BY cd.condition_diagnosis_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map(mapToSolrDoc);
    await solr.update('clinical', docs);

    totalIndexed += rows.length;
    cursor = rows[rows.length - 1].condition_diagnosis_id;

    if (onProgress) {
      onProgress(totalIndexed, count);
    }
  }

  return totalIndexed;
}
