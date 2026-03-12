// =============================================================================
// Observation Indexer — cursor-paginated reindex into Solr 'clinical' core
// =============================================================================

import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';
import type { ProgressCallback } from './patients.js';

interface ObservationRow {
  observation_id: number;
  patient_id: number;
  encounter_id: number | null;
  observation_code: string | null;
  observation_desc: string | null;
  value_numeric: number | null;
  value_text: string | null;
  units: string | null;
  observation_datetime: string | null;
}

function mapToSolrDoc(row: ObservationRow): Record<string, unknown> {
  return {
    id: `observation_${row.observation_id}`,
    doc_type: 'observation',
    observation_id: row.observation_id,
    patient_id: row.patient_id,
    encounter_id: row.encounter_id,
    observation_code: row.observation_code,
    observation_name: row.observation_desc,
    value_numeric: row.value_numeric,
    value_text: row.value_text,
    units: row.units,
    observation_datetime: row.observation_datetime,
  };
}

export async function reindexObservations(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: ProgressCallback,
): Promise<number> {
  let cursor = 0;
  let totalIndexed = 0;

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM phm_edw.observation
  `;

  while (true) {
    const rows = await sql<ObservationRow[]>`
      SELECT
        ob.observation_id,
        ob.patient_id,
        ob.encounter_id,
        ob.observation_code,
        ob.observation_desc,
        ob.value_numeric,
        ob.value_text,
        ob.units,
        ob.observation_datetime
      FROM phm_edw.observation ob
      WHERE ob.observation_id > ${cursor}
      ORDER BY ob.observation_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map(mapToSolrDoc);
    await solr.update('clinical', docs);

    totalIndexed += rows.length;
    cursor = rows[rows.length - 1].observation_id;

    if (onProgress) {
      onProgress(totalIndexed, count);
    }
  }

  return totalIndexed;
}
