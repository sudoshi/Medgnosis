// =============================================================================
// Medgnosis API — Problem List bulk-load utility
// The Geisinger Problem List utility, modernised: large-scale, controlled
// changes (add / resolve / restage = add-resolve-move-to-history) applied
// "exactly as a careful clinician would have made them, chart by chart",
// every mutation written to phm_edw.problem_list_audit. Supports dry-run.
// =============================================================================

import { sql } from '@medgnosis/db';

export type BulkAction =
  | {
      type: 'add';
      patient_id: number;
      icd10_code: string;
      problem_name: string;
      ontology_id?: number;
      provenance?: string;
      provider_id?: number;
    }
  | { type: 'resolve'; patient_id: number; problem_id: number }
  | {
      type: 'restage';
      patient_id: number;
      old_problem_id: number;
      icd10_code: string;
      problem_name: string;
      ontology_id?: number;
      provider_id?: number;
    };

export interface BulkOptions {
  dryRun: boolean;
  actor: string;
  source: string; // bulk_load | finder_accept | manual | api
}

export interface PlanEntry {
  action: 'add' | 'resolve';
  patient_id: number;
  problem_id?: number;
  icd10_code?: string;
  status: 'planned' | 'applied' | 'skipped';
  note?: string;
}

// The postgres.js client; a transaction `tx` (TransactionSql) is assignable to it.
type Db = typeof sql;

// ─── Action handlers ─────────────────────────────────────────────────────────

async function applyAdd(
  action: Extract<BulkAction, { type: 'add' }>,
  opts: BulkOptions,
  db: Db = sql,
): Promise<PlanEntry[]> {
  // Skip if an active identical diagnosis already exists for this patient.
  const existing = await db<{ problem_id: number }[]>`
    SELECT problem_id FROM phm_edw.problem_list
    WHERE patient_id = ${action.patient_id}
      AND icd10_code = ${action.icd10_code}
      AND problem_status = 'Active'
      AND active_ind = 'Y'
    LIMIT 1
  `;
  if (existing.length > 0) {
    return [{
      action: 'add',
      patient_id: action.patient_id,
      icd10_code: action.icd10_code,
      problem_id: existing[0]!.problem_id,
      status: 'skipped',
      note: 'active diagnosis already present',
    }];
  }

  if (opts.dryRun) {
    return [{ action: 'add', patient_id: action.patient_id, icd10_code: action.icd10_code, status: 'planned' }];
  }

  const [row] = await db<{ problem_id: number }[]>`
    INSERT INTO phm_edw.problem_list
      (patient_id, problem_name, icd10_code, problem_status, problem_type,
       provider_id, provenance, ontology_id)
    VALUES (
      ${action.patient_id}, ${action.problem_name}, ${action.icd10_code},
      'Active', 'Chronic', ${action.provider_id ?? null},
      ${action.provenance ?? 'auto_load'}, ${action.ontology_id ?? null}
    )
    RETURNING problem_id
  `;

  await db`
    INSERT INTO phm_edw.problem_list_audit
      (problem_id, patient_id, action, icd10_code, problem_name,
       old_status, new_status, source, actor, detail)
    VALUES (
      ${row!.problem_id}, ${action.patient_id}, 'add', ${action.icd10_code},
      ${action.problem_name}, NULL, 'Active', ${opts.source}, ${opts.actor},
      ${sql.json({ ontology_id: action.ontology_id ?? null, provenance: action.provenance ?? 'auto_load' })}
    )
  `;

  return [{
    action: 'add',
    patient_id: action.patient_id,
    icd10_code: action.icd10_code,
    problem_id: row!.problem_id,
    status: 'applied',
  }];
}

async function applyResolve(
  action: Extract<BulkAction, { type: 'resolve' }>,
  opts: BulkOptions,
  db: Db = sql,
): Promise<PlanEntry[]> {
  const [current] = await db<{ problem_id: number; problem_status: string; icd10_code: string | null }[]>`
    SELECT problem_id, problem_status, icd10_code FROM phm_edw.problem_list
    WHERE problem_id = ${action.problem_id} AND patient_id = ${action.patient_id}
    LIMIT 1
  `;
  if (!current) {
    return [{ action: 'resolve', patient_id: action.patient_id, problem_id: action.problem_id, status: 'skipped', note: 'problem not found' }];
  }

  if (opts.dryRun) {
    return [{ action: 'resolve', patient_id: action.patient_id, problem_id: action.problem_id, status: 'planned' }];
  }

  await db`
    UPDATE phm_edw.problem_list
    SET problem_status = 'Resolved', resolved_date = CURRENT_DATE, updated_date = NOW()
    WHERE problem_id = ${action.problem_id} AND patient_id = ${action.patient_id}
  `;

  await db`
    INSERT INTO phm_edw.problem_list_audit
      (problem_id, patient_id, action, icd10_code, old_status, new_status, source, actor)
    VALUES (
      ${action.problem_id}, ${action.patient_id}, 'resolve', ${current.icd10_code},
      ${current.problem_status}, 'Resolved', ${opts.source}, ${opts.actor}
    )
  `;

  return [{ action: 'resolve', patient_id: action.patient_id, problem_id: action.problem_id, status: 'applied' }];
}

async function applyRestage(
  action: Extract<BulkAction, { type: 'restage' }>,
  opts: BulkOptions,
): Promise<PlanEntry[]> {
  if (opts.dryRun) {
    // Plan only: resolve old + add new, no writes.
    return [
      { action: 'resolve', patient_id: action.patient_id, problem_id: action.old_problem_id, status: 'planned' },
      { action: 'add', patient_id: action.patient_id, icd10_code: action.icd10_code, status: 'planned' },
    ];
  }

  // Atomic: resolve the generic entry and add the staged one together.
  return sql.begin(async (tx) => {
    const db = tx as unknown as Db;
    const resolved = await applyResolve(
      { type: 'resolve', patient_id: action.patient_id, problem_id: action.old_problem_id },
      opts,
      db,
    );
    const added = await applyAdd(
      {
        type: 'add',
        patient_id: action.patient_id,
        icd10_code: action.icd10_code,
        problem_name: action.problem_name,
        ontology_id: action.ontology_id,
        provider_id: action.provider_id,
        provenance: 'recommendation_accepted',
      },
      opts,
      db,
    );
    return [...resolved, ...added];
  }) as Promise<PlanEntry[]>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function applyBulk(actions: BulkAction[], opts: BulkOptions): Promise<PlanEntry[]> {
  const plan: PlanEntry[] = [];
  for (const action of actions) {
    if (action.type === 'add') {
      plan.push(...(await applyAdd(action, opts)));
    } else if (action.type === 'resolve') {
      plan.push(...(await applyResolve(action, opts)));
    } else {
      plan.push(...(await applyRestage(action, opts)));
    }
  }
  return plan;
}
