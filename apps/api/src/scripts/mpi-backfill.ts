// =============================================================================
// MPI population backfill — feed existing phm_edw.person rows into SanteMPI.
//
// One-time (resumable) load so the MPI index covers the pre-existing population,
// not just new ingests. For each person without an MPI master identifier yet:
//   feed(demographics) -> self-$match -> store the MDM master id as a
//   patient_identifier(system = MPI master system). Resumable (skips persons
//   that already carry a master id) and idempotent.
//
// HEAVY: each person costs a FHIR create + MDM match; measured ~21/s at conc=8,
// degrading as the index grows. For ~1M persons budget a deliberate, monitored
// off-hours window. Tune --concurrency to taste; watch SanteDB + santedb-db load.
//
//   npm run mpi:backfill -- --dry-run
//   npm run mpi:backfill -- --limit 1000 --concurrency 8
//   npm run mpi:backfill
//
// Env: DATABASE_URL (host: swap host.docker.internal->localhost), and the same
// MPI_* vars the app uses (MPI_BASE_URL, MPI_TOKEN_URL, MPI_CLIENT_ID,
// MPI_CLIENT_SECRET, MPI_MASTER_ID_SYSTEM).
// =============================================================================

import { sql } from '@medgnosis/db';
import { FhirMpiClient } from '../services/ehr/identity/mpiClient.js';

const DEFAULT_MASTER_ID_SYSTEM = 'urn:oid:2.16.840.1.113883.3.999.mpi';
const BATCH_SIZE = 2000;

interface PersonRow {
  person_id: number;
  first_name: string;
  last_name: string;
  dob: string;
  sex: string | null;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? (process.argv[idx + 1] ?? '') : undefined;
}

function buildClient(masterIdSystem: string): FhirMpiClient {
  const baseUrl = process.env['MPI_BASE_URL'] ?? 'http://localhost:8099/fhir';
  return new FhirMpiClient({
    baseUrl,
    masterIdSystem,
    accessToken: process.env['MPI_ACCESS_TOKEN'] || undefined,
    tokenUrl: process.env['MPI_TOKEN_URL'] || undefined,
    clientId: process.env['MPI_CLIENT_ID'] || undefined,
    clientSecret: process.env['MPI_CLIENT_SECRET'] || undefined,
  });
}

async function fetchBatch(masterSystem: string, afterId: number, limit: number): Promise<PersonRow[]> {
  return sql<PersonRow[]>`
    SELECT p.person_id, p.first_name, p.last_name,
           to_char(p.date_of_birth, 'YYYY-MM-DD') AS dob, p.sex
    FROM phm_edw.person p
    WHERE p.person_id > ${afterId}
      AND p.status <> 'merged'
      AND NOT EXISTS (
        SELECT 1 FROM phm_edw.patient_identifier pi
        WHERE pi.person_id = p.person_id AND pi.system = ${masterSystem}
      )
    ORDER BY p.person_id
    LIMIT ${limit}
  `;
}

async function feedPerson(client: FhirMpiClient, row: PersonRow): Promise<'stored' | 'conflict' | 'no-master'> {
  const demo = { firstName: row.first_name, lastName: row.last_name, dateOfBirth: row.dob, sex: row.sex };
  await client.feed(demo);
  const candidates = await client.match(demo);
  const master = candidates[0]?.masterIdentifier;
  if (!master) return 'no-master';
  const inserted = await sql<{ id: number }[]>`
    INSERT INTO phm_edw.patient_identifier (person_id, system, value, source_system)
    VALUES (${row.person_id}, ${master.system}, ${master.value}, 'mpi-backfill')
    ON CONFLICT ON CONSTRAINT uq_patient_identifier_system_value DO NOTHING
    RETURNING id
  `;
  // A conflict means the master id already maps to another person — a duplicate
  // signal a steward should reconcile; the load skips it.
  return inserted.length > 0 ? 'stored' : 'conflict';
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++] as T;
        await worker(item);
      }
    }),
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const masterSystem = process.env['MPI_MASTER_ID_SYSTEM'] ?? DEFAULT_MASTER_ID_SYSTEM;
  const limit = Number(arg('limit') ?? '0') || Number.POSITIVE_INFINITY;
  const concurrency = Math.max(1, Number(arg('concurrency') ?? '8'));
  console.info(`[mpi-backfill] start (${dryRun ? 'dry-run' : 'apply'}) master=${masterSystem} limit=${limit} conc=${concurrency}`);

  if (dryRun) {
    const [{ remaining }] = await sql<{ remaining: number }[]>`
      SELECT count(*)::int AS remaining FROM phm_edw.person p
      WHERE p.status <> 'merged' AND NOT EXISTS (
        SELECT 1 FROM phm_edw.patient_identifier pi WHERE pi.person_id = p.person_id AND pi.system = ${masterSystem})
    `;
    console.info(`[mpi-backfill] dry-run: ${remaining} person(s) need MPI registration.`);
    await sql.end();
    return;
  }

  const client = buildClient(masterSystem);
  const t0 = Date.now();
  let afterId = 0;
  let stored = 0, conflict = 0, noMaster = 0, failed = 0;

  while (stored + conflict + noMaster + failed < limit) {
    const take = Math.min(BATCH_SIZE, limit - (stored + conflict + noMaster + failed));
    const batch = await fetchBatch(masterSystem, afterId, take);
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1]!.person_id;

    await runPool(batch, concurrency, async (row) => {
      try {
        const outcome = await feedPerson(client, row);
        if (outcome === 'stored') stored += 1;
        else if (outcome === 'conflict') conflict += 1;
        else noMaster += 1;
      } catch {
        failed += 1;
      }
    });

    const elapsed = (Date.now() - t0) / 1000;
    const total = stored + conflict + noMaster + failed;
    console.info(`[mpi-backfill] ${total} processed (stored=${stored} conflict=${conflict} noMaster=${noMaster} failed=${failed}) ${(total / elapsed).toFixed(1)}/s through person_id ${afterId}`);
  }

  console.info(`[mpi-backfill] done. stored=${stored} conflict=${conflict} noMaster=${noMaster} failed=${failed}`);
  await sql.end();
}

main().catch((err) => {
  console.error('[mpi-backfill] failed:', err);
  process.exit(1);
});
