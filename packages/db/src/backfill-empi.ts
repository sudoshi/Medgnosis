// =============================================================================
// Medgnosis DB — EMPI Phase 0 backfill (set-based)
//
// Creates one phm_edw.person per existing phm_edw.patient that has no
// patient_link yet, links them 1:1, and seeds the demographic_match_key so the
// pre-EMPI population participates in the demographic match tier (a later
// re-ingest of one of these patients is flagged for review instead of silently
// duplicated).
//
// Strictly additive: INSERT-only into phm_edw.person / patient_link /
// patient_merge_log. It never UPDATEs, DELETEs, or overwrites phm_edw.patient
// or any clinical row. Fully reversible (truncate the three EMPI tables).
//
// Set-based and keyset-paginated: each batch is ONE auto-committed statement
// that inserts N persons and N links (no per-row round-trips), so a ~1M-row
// population is ~1M/BATCH_SIZE statements, not ~1M transactions. Idempotent
// (NOT EXISTS + ON CONFLICT DO NOTHING) — safe to re-run / resume.
//
//   npm run db:backfill-empi -- --dry-run   # count only, change nothing
//   npm run db:backfill-empi                # apply
//
// The demographic key is built in SQL and MUST stay byte-identical to
// apps/api/.../identity/identityKeys.ts:demographicMatchKey — currently
// last+first+dob+sex, each lowercased/trimmed, joined with an EMPTY separator.
// =============================================================================

import { sql } from './client.js';

const BATCH_SIZE = 5000;

// SQL expression for the demographic match key. Mirrors identityKeys.ts:
// lower(trim(last)) || lower(trim(first)) || 'YYYY-MM-DD' || lower(trim(sex||'')).
const DEMOGRAPHIC_KEY_SQL = `
  lower(btrim(p.last_name))
  || lower(btrim(p.first_name))
  || to_char(p.date_of_birth, 'YYYY-MM-DD')
  || lower(btrim(coalesce(p.gender, '')))
`;

interface BatchResultRow {
  scanned: number | string;
  linked: number | string;
  max_patient_id: number | string | null;
}

function toInt(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value ?? 0;
  return Number.isFinite(parsed as number) ? (parsed as number) : 0;
}

async function countUnlinked(): Promise<number> {
  const rows = await sql<{ total: number | string }[]>`
    SELECT count(*)::bigint AS total
    FROM phm_edw.patient p
    WHERE NOT EXISTS (SELECT 1 FROM phm_edw.patient_link pl WHERE pl.patient_id = p.patient_id)
  `;
  return toInt(rows[0]?.total);
}

// One auto-committed batch: insert persons for the next window of unlinked
// patients (ordered by patient_id), then link each patient to its new person.
// person_id is assigned from a sequence in insertion order, which follows the
// ORDER BY patient_id, so ranking inserted persons by person_id re-aligns them
// 1:1 with patients ranked by patient_id.
async function runBatch(afterPatientId: number): Promise<BatchResultRow> {
  const rows = await sql.unsafe<BatchResultRow[]>(
    `
    WITH batch AS (
      SELECT p.patient_id,
             p.first_name, p.last_name, p.date_of_birth, p.gender,
             (${DEMOGRAPHIC_KEY_SQL}) AS dkey,
             row_number() OVER (ORDER BY p.patient_id) AS rn
      FROM phm_edw.patient p
      WHERE p.patient_id > $1
        AND NOT EXISTS (SELECT 1 FROM phm_edw.patient_link pl WHERE pl.patient_id = p.patient_id)
      ORDER BY p.patient_id
      LIMIT $2
    ),
    ins AS (
      INSERT INTO phm_edw.person
        (first_name, last_name, date_of_birth, sex, demographic_match_key, source_system, status)
      SELECT first_name, last_name, date_of_birth, gender, dkey, 'backfill', 'active'
      FROM batch
      ORDER BY patient_id
      RETURNING person_id
    ),
    ins_ranked AS (
      SELECT person_id, row_number() OVER (ORDER BY person_id) AS rn FROM ins
    ),
    linked AS (
      INSERT INTO phm_edw.patient_link (patient_id, person_id)
      SELECT b.patient_id, i.person_id
      FROM batch b JOIN ins_ranked i ON i.rn = b.rn
      ON CONFLICT (patient_id) DO NOTHING
      RETURNING patient_id
    )
    SELECT (SELECT count(*) FROM batch)            AS scanned,
           (SELECT count(*) FROM linked)           AS linked,
           (SELECT max(patient_id) FROM batch)     AS max_patient_id
    `,
    [afterPatientId, BATCH_SIZE],
  );
  return rows[0] ?? { scanned: 0, linked: 0, max_patient_id: null };
}

async function writeSummary(linked: number): Promise<void> {
  await sql`
    INSERT INTO phm_edw.patient_merge_log (action, target_person_id, reason, performed_by, details)
    VALUES ('provisional_created', NULL, 'empi_backfill', 'system',
            ${sql.json({ backfill: true, linked })})
  `;
}

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  console.info(`[backfill-empi] Starting (${dryRun ? 'dry-run' : 'apply'})...`);

  if (dryRun) {
    const total = await countUnlinked();
    console.info(`[backfill-empi] dry-run: ${total} unlinked patient(s) would be linked.`);
    await sql.end();
    return;
  }

  let linked = 0;
  let afterPatientId = 0;
  let batchNo = 0;

  for (;;) {
    const result = await runBatch(afterPatientId);
    const scanned = toInt(result.scanned);
    if (scanned === 0) break;
    linked += toInt(result.linked);
    afterPatientId = toInt(result.max_patient_id);
    batchNo += 1;
    console.info(`[backfill-empi] batch ${batchNo}: scanned=${scanned} linkedTotal=${linked} (through patient_id ${afterPatientId})`);
  }

  await writeSummary(linked);
  console.info(`[backfill-empi] Done. linked=${linked}`);
  await sql.end();
}

main().catch((err) => {
  console.error('[backfill-empi] Failed:', err);
  process.exit(1);
});
