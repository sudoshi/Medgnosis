// =============================================================================
// EMPI operational metrics — aggregate health of the identity-resolution system
// for the admin dashboard: person status mix, review-queue depth by reason,
// merge/un-merge activity, MPI index coverage, and a duplicate signal.
// =============================================================================

import { sql } from '@medgnosis/db';

export interface EmpiMetrics {
  persons: { total: number; active: number; provisional: number; merged: number };
  patientLinks: number;
  reviewQueue: { open: number; byReason: Record<string, number>; oldestOpenAt: string | null };
  merges: { merged: number; unmerged: number };
  mpiCoverage: { personsWithMaster: number };
  potentialDuplicates: number;
}

function toInt(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value ?? 0;
  return Number.isFinite(parsed as number) ? (parsed as number) : 0;
}

export async function getEmpiMetrics(): Promise<EmpiMetrics> {
  const [
    personRows,
    linkRows,
    reviewRows,
    oldestRows,
    mergeRows,
    coverageRows,
    dupRows,
  ] = await Promise.all([
    sql<{ status: string; c: number | string }[]>`
      SELECT status, count(*)::int AS c FROM phm_edw.person GROUP BY status`,
    sql<{ c: number | string }[]>`
      SELECT count(*)::int AS c FROM phm_edw.patient_link`,
    sql<{ reason: string; c: number | string }[]>`
      SELECT reason, count(*)::int AS c FROM phm_edw.identity_review_queue
      WHERE status = 'open' GROUP BY reason`,
    sql<{ oldest: string | null }[]>`
      SELECT min(created_at)::text AS oldest FROM phm_edw.identity_review_queue WHERE status = 'open'`,
    sql<{ action: string; c: number | string }[]>`
      SELECT action, count(*)::int AS c FROM phm_edw.patient_merge_log
      WHERE action IN ('merge', 'unmerge') GROUP BY action`,
    sql<{ c: number | string }[]>`
      SELECT count(DISTINCT person_id)::int AS c FROM phm_edw.patient_identifier
      WHERE source_system IN ('mpi-backfill', 'mpi-feed')`,
    sql<{ c: number | string }[]>`
      SELECT count(*)::int AS c FROM (
        SELECT 1 FROM phm_edw.person
        WHERE status = 'active' AND demographic_match_key IS NOT NULL
        GROUP BY demographic_match_key HAVING count(*) > 1
      ) dups`,
  ]);

  const personByStatus = new Map(personRows.map((r) => [r.status, toInt(r.c)]));
  const active = personByStatus.get('active') ?? 0;
  const provisional = personByStatus.get('provisional') ?? 0;
  const merged = personByStatus.get('merged') ?? 0;

  const byReason: Record<string, number> = {};
  let open = 0;
  for (const row of reviewRows) {
    byReason[row.reason] = toInt(row.c);
    open += toInt(row.c);
  }

  const mergeByAction = new Map(mergeRows.map((r) => [r.action, toInt(r.c)]));

  return {
    persons: { total: active + provisional + merged, active, provisional, merged },
    patientLinks: toInt(linkRows[0]?.c),
    reviewQueue: { open, byReason, oldestOpenAt: oldestRows[0]?.oldest ?? null },
    merges: { merged: mergeByAction.get('merge') ?? 0, unmerged: mergeByAction.get('unmerge') ?? 0 },
    mpiCoverage: { personsWithMaster: toInt(coverageRows[0]?.c) },
    potentialDuplicates: toInt(dupRows[0]?.c),
  };
}
