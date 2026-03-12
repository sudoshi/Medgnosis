// =============================================================================
// Patient Indexer — cursor-paginated reindex into Solr 'search' core
// =============================================================================

import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';

export type ProgressCallback = (indexed: number, total: number) => void;

interface PatientRow {
  patient_id: number;
  mrn: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  primary_phone: string | null;
  email: string | null;
  pcp_provider_id: number | null;
  risk_tier: string | null;
  risk_score: number | null;
}

function mapToSolrDoc(row: PatientRow): Record<string, unknown> {
  return {
    id: `patient_${row.patient_id}`,
    doc_type: 'patient',
    patient_id: row.patient_id,
    mrn: row.mrn,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    date_of_birth: row.date_of_birth ? new Date(row.date_of_birth).toISOString() : null,
    gender: row.gender,
    primary_phone: row.primary_phone,
    email: row.email,
    provider_id: row.pcp_provider_id,
    risk_tier: row.risk_tier,
    risk_score: row.risk_score,
    active_ind: 'Y',
  };
}

export async function reindexPatients(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: ProgressCallback,
): Promise<number> {
  let cursor = 0;
  let totalIndexed = 0;

  // Get total count for progress reporting
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM phm_edw.patient
  `;

  while (true) {
    const rows = await sql<PatientRow[]>`
      SELECT
        p.patient_id,
        p.mrn,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        p.gender,
        p.primary_phone,
        p.email,
        p.pcp_provider_id,
        rh.band AS risk_tier,
        rh.score AS risk_score
      FROM phm_edw.patient p
      LEFT JOIN LATERAL (
        SELECT band, score
        FROM public.patient_risk_history prh
        WHERE prh.patient_id = p.patient_id
        ORDER BY prh.computed_at DESC
        LIMIT 1
      ) rh ON true
      WHERE p.patient_id > ${cursor}
      ORDER BY p.patient_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map(mapToSolrDoc);
    await solr.update('search', docs);

    totalIndexed += rows.length;
    cursor = rows[rows.length - 1].patient_id;

    if (onProgress) {
      onProgress(totalIndexed, count);
    }
  }

  return totalIndexed;
}
