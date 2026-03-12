// =============================================================================
// Encounter Indexer — cursor-paginated reindex into Solr 'clinical' core
// =============================================================================

import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';
import type { ProgressCallback } from './patients.js';

interface EncounterRow {
  encounter_id: number;
  patient_id: number;
  encounter_type: string | null;
  encounter_datetime: string | null;
  facility_name: string | null;
  disposition: string | null;
  provider_id: number | null;
}

function toIso(d: string | null): string | null {
  if (!d) return null;
  try { return new Date(d).toISOString(); } catch { return null; }
}

function mapToSolrDoc(row: EncounterRow): Record<string, unknown> {
  return {
    id: `encounter_${row.encounter_id}`,
    doc_type: 'encounter',
    encounter_id: row.encounter_id,
    patient_id: row.patient_id,
    encounter_type: row.encounter_type,
    encounter_datetime: toIso(row.encounter_datetime),
    facility_name: row.facility_name,
    disposition: row.disposition,
    provider_id: row.provider_id,
  };
}

export async function reindexEncounters(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: ProgressCallback,
): Promise<number> {
  let cursor = 0;
  let totalIndexed = 0;

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM phm_edw.encounter
  `;

  while (true) {
    const rows = await sql<EncounterRow[]>`
      SELECT
        e.encounter_id,
        e.patient_id,
        e.encounter_type,
        e.encounter_datetime,
        o.organization_name AS facility_name,
        e.disposition,
        e.provider_id
      FROM phm_edw.encounter e
      LEFT JOIN phm_edw.organization o ON o.org_id = e.org_id
      WHERE e.encounter_id > ${cursor}
      ORDER BY e.encounter_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map(mapToSolrDoc);
    await solr.update('clinical', docs);

    totalIndexed += rows.length;
    cursor = rows[rows.length - 1].encounter_id;

    if (onProgress) {
      onProgress(totalIndexed, count);
    }
  }

  return totalIndexed;
}
