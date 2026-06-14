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

// phm_edw.observation is ~1B rows. NEVER COUNT(*) it (saturates the shared
// NVMe for an hour+); use the planner's reltuples estimate for progress.
async function estimateObservationRows(): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT GREATEST(reltuples, 0)::bigint AS count
    FROM pg_class WHERE oid = 'phm_edw.observation'::regclass
  `;
  return row?.count ?? 0;
}

export async function reindexObservations(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: ProgressCallback,
): Promise<number> {
  let cursor = 0;
  let totalIndexed = 0;

  // Approximate (reltuples) — see estimateObservationRows. Full-corpus reindex of
  // a billion-row table is a heavy operation; prefer reindexEcqmObservations to
  // index only the measure-relevant labs.
  const count = await estimateObservationRows();

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

// =============================================================================
// eCQM-scoped observation reindex — index ONLY measure-relevant labs (e.g. the
// HbA1c LOINCs behind CMS122) into the clinical core, so cohort/denominator/
// value-range queries (see buildObservationCohortQuery) are served by Solr
// instead of scanning the ~1B-row phm_edw.observation. This is the scale lever:
// it bounds the indexed set to the codes measures actually use.
//
// EFFICIENCY DEPENDENCY: filtering by observation_code rides a composite index
//   CREATE INDEX CONCURRENTLY idx_observation_code_patient
//     ON phm_edw.observation (observation_code, observation_id)
//     WHERE active_ind = 'Y';
// Without it this degrades to a sequential scan — run it in a low-traffic window
// (the table is huge). active_ind='Y' keeps the partial-index predicates usable.
// =============================================================================
export async function reindexEcqmObservations(
  solr: SolrClient,
  codes: string[],
  batchSize = 5000,
  onProgress?: ProgressCallback,
): Promise<number> {
  if (codes.length === 0) return 0;
  let cursor = 0;
  let totalIndexed = 0;

  while (true) {
    const rows = await sql<ObservationRow[]>`
      SELECT
        ob.observation_id, ob.patient_id, ob.encounter_id,
        ob.observation_code, ob.observation_desc,
        ob.value_numeric, ob.value_text, ob.units, ob.observation_datetime
      FROM phm_edw.observation ob
      WHERE ob.observation_id > ${cursor}
        AND ob.active_ind = 'Y'
        AND ob.observation_code = ANY(${codes})
      ORDER BY ob.observation_id ASC
      LIMIT ${batchSize}
    `;
    if (rows.length === 0) break;

    await solr.update('clinical', rows.map(mapToSolrDoc));
    totalIndexed += rows.length;
    cursor = rows[rows.length - 1]!.observation_id;
    if (onProgress) onProgress(totalIndexed, totalIndexed);
  }

  await solr.commit('clinical');
  return totalIndexed;
}
