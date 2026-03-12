// =============================================================================
// Medication Indexer — cursor-paginated reindex into Solr 'clinical' core
// =============================================================================

import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';
import type { ProgressCallback } from './patients.js';

interface MedicationRow {
  medication_order_id: number;
  patient_id: number;
  medication_name: string | null;
  prescription_status: string | null;
}

function mapToSolrDoc(row: MedicationRow): Record<string, unknown> {
  return {
    id: `medication_${row.medication_order_id}`,
    doc_type: 'medication',
    medication_order_id: row.medication_order_id,
    patient_id: row.patient_id,
    medication_name: row.medication_name,
    prescription_status: row.prescription_status,
  };
}

export async function reindexMedications(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: ProgressCallback,
): Promise<number> {
  let cursor = 0;
  let totalIndexed = 0;

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM phm_edw.medication_order
  `;

  while (true) {
    const rows = await sql<MedicationRow[]>`
      SELECT
        mo.medication_order_id,
        mo.patient_id,
        m.medication_name,
        mo.prescription_status
      FROM phm_edw.medication_order mo
      JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
      WHERE mo.medication_order_id > ${cursor}
      ORDER BY mo.medication_order_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map(mapToSolrDoc);
    await solr.update('clinical', docs);

    totalIndexed += rows.length;
    cursor = rows[rows.length - 1].medication_order_id;

    if (onProgress) {
      onProgress(totalIndexed, count);
    }
  }

  return totalIndexed;
}
