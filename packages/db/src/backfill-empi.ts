// =============================================================================
// Medgnosis DB — EMPI Phase 0 backfill
//
// Creates one phm_edw.person per existing phm_edw.patient that has no
// patient_link yet, links them, and seeds the demographic_match_key so the
// pre-EMPI population participates in the demographic match tier (a later
// re-ingest of one of these patients is flagged for review instead of silently
// duplicated).
//
// Idempotent (skips already-linked patients) and batched. Additive only — it
// never modifies or deletes existing phm_edw.patient rows.
//
//   npm run db:backfill-empi -- --dry-run   # report counts, change nothing
//   npm run db:backfill-empi                # apply
//
// NOTE: the demographic key MUST stay byte-identical to
// apps/api/.../identity/identityKeys.ts:demographicMatchKey
// (last, first, dob, sex joined with an empty separator, lowercased/trimmed). Keep the two in sync.
// =============================================================================

import { sql } from './client.js';

const BATCH_SIZE = 500;
const KEY_SEPARATOR = '';

interface LegacyPatientRow {
  patient_id: number;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  gender: string | null;
  mrn: string | null;
}

function clean(value: string | null): string {
  return (value ?? '').trim();
}

/** Mirror of identityKeys.demographicMatchKey — keep in sync. */
function demographicMatchKey(row: LegacyPatientRow): string | null {
  const last = clean(row.last_name).toLowerCase();
  const first = clean(row.first_name).toLowerCase();
  const dob = clean(row.date_of_birth).toLowerCase();
  if (!last || !first || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const sex = clean(row.gender).toLowerCase();
  return [last, first, dob, sex].join(KEY_SEPARATOR);
}

async function fetchUnlinkedBatch(afterPatientId = 0): Promise<LegacyPatientRow[]> {
  return sql<LegacyPatientRow[]>`
    SELECT p.patient_id,
           p.first_name,
           p.last_name,
           to_char(p.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
           p.gender,
           p.mrn
    FROM phm_edw.patient p
    WHERE NOT EXISTS (
      SELECT 1 FROM phm_edw.patient_link pl WHERE pl.patient_id = p.patient_id
    )
      AND p.patient_id > ${afterPatientId}
    ORDER BY p.patient_id
    LIMIT ${BATCH_SIZE}
  `;
}

async function backfillPatient(row: LegacyPatientRow): Promise<'linked' | 'skipped'> {
  const key = demographicMatchKey(row);
  if (key === null) return 'skipped'; // insufficient demographics for an identity

  // postgres's TransactionSql type omits the tagged-template call signature, so
  // statements inside the transaction use tx.unsafe(query, params).
  return sql.begin(async (tx) => {
    const existingLink = await tx.unsafe<{ patient_id: number }[]>(
      `
      SELECT patient_id
      FROM phm_edw.patient_link
      WHERE patient_id = $1
      LIMIT 1
      `,
      [row.patient_id],
    );
    if (existingLink[0]) return 'skipped' as const;

    const personRows = await tx.unsafe<{ person_id: number }[]>(
      `
      INSERT INTO phm_edw.person
        (first_name, last_name, date_of_birth, sex, demographic_match_key, source_system, status)
      VALUES ($1, $2, $3::date, $4, $5, 'backfill', 'active')
      RETURNING person_id
      `,
      [clean(row.first_name), clean(row.last_name), row.date_of_birth, row.gender, key],
    );
    const personId = personRows[0]!.person_id;
    await tx.unsafe(
      `
      INSERT INTO phm_edw.patient_link (patient_id, person_id)
      VALUES ($1, $2)
      ON CONFLICT (patient_id) DO NOTHING
      `,
      [row.patient_id, personId],
    );
    await tx.unsafe(
      `
      INSERT INTO phm_edw.patient_merge_log (action, target_person_id, reason, performed_by, details)
      VALUES ('provisional_created', $1, 'empi_backfill', 'system', $2::jsonb)
      `,
      [personId, JSON.stringify({ patientId: row.patient_id })],
    );
    return 'linked' as const;
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  console.info(`[backfill-empi] Starting (${dryRun ? 'dry-run' : 'apply'})...`);

  let linked = 0;
  let skipped = 0;

  if (dryRun) {
    let afterPatientId = 0;
    for (;;) {
      const batch = await fetchUnlinkedBatch(afterPatientId);
      if (batch.length === 0) break;
      afterPatientId = batch[batch.length - 1]!.patient_id;
      for (const row of batch) {
        if (demographicMatchKey(row) === null) skipped += 1;
        else linked += 1;
      }
    }
    const total = linked + skipped;
    console.info(`[backfill-empi] dry-run: ${total} unlinked patient(s); would link ${linked}, skip ${skipped}.`);
    await sql.end();
    return;
  }

  let afterPatientId = 0;
  for (;;) {
    const batch = await fetchUnlinkedBatch(afterPatientId);
    if (batch.length === 0) break;
    afterPatientId = batch[batch.length - 1]!.patient_id;
    for (const row of batch) {
      const outcome = await backfillPatient(row);
      if (outcome === 'linked') linked += 1;
      else skipped += 1;
    }
    console.info(`[backfill-empi] progress: linked=${linked} skipped=${skipped}`);
  }

  console.info(`[backfill-empi] Done. linked=${linked} skipped=${skipped}`);
  await sql.end();
}

main().catch((err) => {
  console.error('[backfill-empi] Failed:', err);
  process.exit(1);
});
