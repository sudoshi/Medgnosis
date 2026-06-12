# Phase 2: Problem List Analytics & Population Identification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The CKD playbook — *name → find → act*. Curate the problem list with provenance + a bulk-load utility (D4), run a two-pass population finder that re-stages generic diagnoses and surfaces lab/vitals-evident conditions missing from the list (D5), and deliver respectful recommendation cards a clinician can accept or dismiss (D6). Builds directly on Phase 1's `dx_ontology`.

**Architecture:** All work is **cohort-scoped and per-patient** — never global value scans. `phm_edw.observation` is ~1B rows and `phm_edw.patient` ~1M; the finder operates over the **1,277-patient problem-list cohort** using patient-leading indexes (`idx_observation_patient_datetime`). New tables live in `phm_edw` (no `app` schema in this DB). Candidates land in a review table; clinician acceptance routes through the same bulk-load utility used everywhere, so every problem-list mutation is audited identically.

**Scale rules (non-negotiable):**
- Finder cohort = `DISTINCT patient_id FROM phm_edw.problem_list WHERE active_ind='Y'` (1,277 rows). Iterate per-patient.
- Latest eGFR per patient: `... WHERE patient_id=$1 AND observation_code='48642-3' AND active_ind='Y' ORDER BY observation_datetime DESC LIMIT 1` (uses `idx_observation_patient_datetime`). EXPLAIN during testing; if a patient's obs count makes this slow, fall back to `phm_star.fact_observation` (`idx_fo_patient_code`).
- BMI from `phm_edw.vital_sign` (small). Never `count(*)`/`GROUP BY` raw `observation`.

**Codes:** eGFR LOINC `48642-3` (`value_numeric` = GFR mL/min/1.73m²). CKD bands and dx names come from Phase 1 `phm_edw.dx_ontology` (`disease_process='CKD'`, `stage_criteria` GFR bounds) and `clinical_rule` (`CKD_STAGING`). Generic/placeholder ICD-10 to re-stage: `N18.9` (CKD unspecified), `E66.9` (obesity unspecified).

**Tech Stack:** PostgreSQL 17 (migrations + `npm run db:migrate -w @medgnosis/db` with `DATABASE_URL` host→localhost override per `project_medgnosis_migrations`), Fastify, BullMQ, vitest (`vi.hoisted` mock pattern), React 19 + TanStack Query + Zustand.

**Branch:** `feature/cds-phase2-problem-list`

---

### Task 1: Migration 033 — curation + finder + dismissal tables

**Files:**
- Create: `packages/db/migrations/033_problem_list_analytics.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- 033: Problem List Analytics & Population Identification (CDS parity Phase 2)
-- =============================================================================

-- D4: provenance on the existing problem_list (additive; table is ~12k rows)
ALTER TABLE phm_edw.problem_list
  ADD COLUMN IF NOT EXISTS provenance VARCHAR(40) NOT NULL DEFAULT 'clinician';
-- values: clinician | auto_load | recommendation_accepted | import
ALTER TABLE phm_edw.problem_list
  ADD COLUMN IF NOT EXISTS ontology_id INT REFERENCES phm_edw.dx_ontology(ontology_id);

-- D4: per-chart audit of every problem-list mutation (bulk-load utility writes here)
CREATE TABLE phm_edw.problem_list_audit (
  audit_id      SERIAL PRIMARY KEY,
  problem_id    INT,                       -- null allowed: the row may be created by this action
  patient_id    INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  action        VARCHAR(40) NOT NULL,      -- add | resolve | move_to_history | restage
  icd10_code    VARCHAR(20),
  problem_name  VARCHAR(255),
  old_status    VARCHAR(30),
  new_status    VARCHAR(30),
  source        VARCHAR(60) NOT NULL,      -- bulk_load | finder_accept | manual | api
  actor         VARCHAR(100) NOT NULL,     -- user id/email or 'system'
  detail        JSONB,
  created_date  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pl_audit_patient ON phm_edw.problem_list_audit (patient_id, created_date DESC);

-- D5: population-finder candidates (clinician review queue)
CREATE TABLE phm_edw.population_finder_candidate (
  candidate_id    SERIAL PRIMARY KEY,
  patient_id      INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  pass            SMALLINT NOT NULL,            -- 1 = restage generic, 2 = find unlabeled
  finding_type    VARCHAR(60) NOT NULL,         -- e.g. 'ckd_restage', 'ckd_unlabeled', 'obesity_unlabeled'
  current_problem_id INT,                        -- pass 1: the generic entry being re-staged
  current_icd10   VARCHAR(20),
  suggested_icd10 VARCHAR(20) NOT NULL,
  suggested_name  VARCHAR(255) NOT NULL,
  ontology_id     INT REFERENCES phm_edw.dx_ontology(ontology_id),
  evidence        JSONB NOT NULL,               -- {egfr, observed_at, bmi, ...}
  confidence      VARCHAR(20) NOT NULL DEFAULT 'high',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | rejected | superseded
  resolved_by     VARCHAR(100),
  resolved_at     TIMESTAMP,
  created_date    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_finder_candidate UNIQUE (patient_id, finding_type, suggested_icd10)
);
CREATE INDEX idx_finder_status ON phm_edw.population_finder_candidate (status, created_date DESC);
CREATE INDEX idx_finder_patient ON phm_edw.population_finder_candidate (patient_id);

-- D6: recommendation dismissals ("does not have X" + 12-month snooze)
CREATE TABLE phm_edw.recommendation_dismissal (
  dismissal_id   SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  finding_key    VARCHAR(120) NOT NULL,      -- "{finding_type}:{suggested_icd10}"
  reason         VARCHAR(40) NOT NULL,       -- does_not_have | snooze
  dismissed_until DATE,                       -- null = permanent ("does not have")
  dismissed_by   VARCHAR(100) NOT NULL,
  created_date   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dismissal_lookup ON phm_edw.recommendation_dismissal (patient_id, finding_key);

COMMENT ON TABLE phm_edw.population_finder_candidate IS
  'Two-pass population finder output; clinician review queue. Accepted rows route through the bulk-load utility.';
```

- [ ] **Step 2: Apply & verify**

```bash
set -a && source .env && set +a && export DATABASE_URL="${DATABASE_URL/host.docker.internal/localhost}"
npm run db:migrate -w @medgnosis/db
```
Verify: `psql -U claude_dev -h localhost -d medgnosis -c "\dt phm_edw.population_finder_candidate"` and `\d phm_edw.problem_list_audit`. Confirm `problem_list.provenance` exists.

- [ ] **Step 3: Commit** — `feat: problem-list provenance/audit + population-finder + dismissal tables`

### Task 2: Problem-list curation service (TDD)

**Files:**
- Test: `apps/api/src/services/__tests__/problemListService.test.ts`
- Create: `apps/api/src/services/problemListService.ts`

Bulk-load actions mirror the compendium's utility: **add**, **resolve**, **add-resolve-move-to-history** (restage = add new + resolve old in one unit). Every action writes a `problem_list_audit` row. Supports **dry-run** (compute the plan, write nothing).

- [ ] **Step 1: Write failing tests** (mock `@medgnosis/db` via `vi.hoisted` — see `rulesEngine.test.ts`):
  - `applyBulk` with `dryRun:true` issues **no** INSERT/UPDATE (only SELECT validations) and returns a plan array with one entry per action.
  - `add` action returns a plan entry `{action:'add', icd10_code, status:'planned'}`.
  - `resolve` action sets `problem_status='Resolved'` + `resolved_date` (assert the UPDATE SQL contains `problem_status` and `resolved_date`).
  - `restage` produces TWO plan entries (resolve old + add new) for one input.
  - every non-dry-run action calls the audit INSERT (assert `problem_list_audit` appears in a call).
- [ ] **Step 2: Run** `npx vitest run src/services/__tests__/problemListService.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `problemListService.ts`:

```ts
import { sql } from '@medgnosis/db';

export type BulkAction =
  | { type: 'add'; patient_id: number; icd10_code: string; problem_name: string;
      ontology_id?: number; provenance?: string }
  | { type: 'resolve'; patient_id: number; problem_id: number }
  | { type: 'restage'; patient_id: number; old_problem_id: number;
      icd10_code: string; problem_name: string; ontology_id?: number };

export interface BulkOptions { dryRun: boolean; actor: string; source: string; }
export interface PlanEntry {
  action: string; patient_id: number; problem_id?: number;
  icd10_code?: string; status: 'planned' | 'applied' | 'skipped'; note?: string;
}

export async function applyBulk(actions: BulkAction[], opts: BulkOptions): Promise<PlanEntry[]> {
  const plan: PlanEntry[] = [];
  for (const action of actions) {
    // each action handled in its own transaction when not dry-run
    if (action.type === 'add') {
      plan.push(...(await applyAdd(action, opts)));
    } else if (action.type === 'resolve') {
      plan.push(...(await applyResolve(action, opts)));
    } else {
      // restage = resolve old + add new, atomically
      plan.push(...(await applyRestage(action, opts)));
    }
  }
  return plan;
}
// applyAdd / applyResolve / applyRestage: validate patient/problem exists (SELECT),
// then on !dryRun do the INSERT/UPDATE + an audit INSERT inside sql.begin(); on
// dryRun return {status:'planned'} without writing. restage wraps both ops in one tx.
```
  (Write the three helpers fully — INSERT into `phm_edw.problem_list (patient_id, problem_name, icd10_code, problem_status, provenance, ontology_id, provider_id)`, UPDATE for resolve, and `phm_edw.problem_list_audit` insert for each. Use `sql.begin` for restage. Guard: skip add if an active identical icd10 already exists for the patient → `status:'skipped'`.)
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `feat: problem-list bulk-load utility (add/resolve/restage) with audit + dry-run`

### Task 3: Population-finder engine (TDD)

**Files:**
- Test: `apps/api/src/services/__tests__/populationFinder.test.ts`
- Create: `apps/api/src/services/populationFinder.ts`

Two passes, cohort-scoped. Pure-logic functions are unit-tested; the DB sweep is a thin orchestrator.

- [ ] **Step 1: Write failing tests** for the pure staging logic (no DB):
  - `stageCkdFromGfr(gfr)` → returns `{icd10, name, stage_label}` per Phase 1 bands (e.g. 42 → N18.32 Stage 3b; 12 → N18.5 Stage 5; 95 → N18.1). Bands passed in (injected) so the test is deterministic.
  - `classifyObesityFromBmi(bmi)` → E66.3 (27), E66.9 Class I (32), E66.01 (41), null (<25).
  - `needsRestage(currentIcd10, evidenceStage)` → true when current is a generic (`N18.9`) and evidence yields a specific stage; false when already matches.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `populationFinder.ts`:
  - Pure functions above (bands loaded from `rulesEngine.evaluate('CKD_STAGING','GFR_BAND')` / `dx_ontology`, passed into the pure mappers).
  - `runFinder({cohortLimit?})`: cohort = `SELECT DISTINCT patient_id FROM phm_edw.problem_list WHERE active_ind='Y'`. For each patient: fetch latest eGFR (code `48642-3`) + latest `vital_sign.bmi` + their active problem_list codes. Pass 1: if an active `N18.9` exists AND eGFR yields a specific stage → candidate `ckd_restage`. Pass 2: if eGFR in a CKD band AND no active N18.x → `ckd_unlabeled`; if BMI ≥30 AND no active E66.x → `obesity_unlabeled`. UPSERT into `population_finder_candidate` (`ON CONFLICT (patient_id,finding_type,suggested_icd10) DO NOTHING`), skipping any with a matching active `recommendation_dismissal`.
- [ ] **Step 4: Run tests** → PASS. Then a **live run** (Task 6) validates real candidates.
- [ ] **Step 5: Commit** — `feat: two-pass population finder (CKD restage/unlabeled, obesity) cohort-scoped`

### Task 4: BullMQ finder job + nightly hook

**Files:**
- Create: `apps/api/src/workers/population-finder.ts`
- Modify: `apps/api/src/workers/nightly-scheduler.ts` (enqueue finder once per nightly run)

- [ ] **Step 1:** Queue `medgnosis-finder`, worker calls `runFinder()`. Follow `rules-engine.ts` worker structure (connection, Queue, Worker factory, completed/failed logs).
- [ ] **Step 2:** In `processNightlyJob`, after the existing enqueues, add a single finder job (it self-scopes to the cohort — not per-patient fan-out).
- [ ] **Step 3:** `npx tsc --noEmit` (api) → 0.
- [ ] **Step 4: Commit** — `feat: nightly population-finder job`

### Task 5: API routes — curation, finder worklist, dismissals

**Files:**
- Create: `apps/api/src/routes/problem-list/index.ts`
- Create: `apps/api/src/routes/population-finder/index.ts`
- Modify: `apps/api/src/routes/index.ts` (register both under `/problem-list`, `/population-finder`)
- Modify: `packages/shared/src/schemas/index.ts` (Zod: `bulkProblemActionSchema`, `finderResolveSchema`)

- [ ] **Step 1:** `problem-list` route (auth hook): `GET /problem-list?patient_id=` (list active problems for a patient, joins `dx_ontology`); `POST /problem-list/bulk` (validate with Zod, calls `applyBulk`, `?dry_run=true` supported, audits actor = `request.user`).
- [ ] **Step 2:** `population-finder` route (auth hook): `GET /population-finder?status=pending&page=` (list candidates + patient name, provider-scoped like care-gaps); `POST /population-finder/:id/accept` (loads candidate → `applyBulk([{type: add|restage…}], {source:'finder_accept'})` → mark `accepted`); `POST /population-finder/:id/reject` (mark `rejected`); `POST /population-finder/:id/dismiss` (writes `recommendation_dismissal`: `does_not_have` permanent or `snooze` +12 months, marks candidate `rejected`).
- [ ] **Step 3:** Register routes; `tsc --noEmit` (api + shared) → 0.
- [ ] **Step 4:** Run full `vitest run` (api) → all green.
- [ ] **Step 5: Commit** — `feat: problem-list + population-finder API routes with dismissals`

### Task 6: Live finder run + verification

- [ ] **Step 1:** Run the finder against the real cohort via a throwaway tsx script **inside `apps/api/src/`** (remember `/tmp` breaks relative imports — see Phase 1): import `runFinder`, execute, print candidate counts by `finding_type`, then `sql.end()`. Use the `DATABASE_URL` override. EXPLAIN the per-patient eGFR query if the run exceeds ~30s; switch to `fact_observation` if needed. Delete the script after.
- [ ] **Step 2:** Spot-check a candidate: pick one `ckd_unlabeled`, confirm via psql the patient truly has an eGFR in-band and no N18.x problem.
- [ ] **Step 3:** Exercise the accept path against ONE candidate (curl or inject with admin token), confirm a `problem_list` row + `problem_list_audit` row appear, candidate flips to `accepted`.
- [ ] **Step 4:** Confirm counts; ensure no orphaned long-running queries (`SELECT ... FROM pg_stat_activity`). Cancel any.

### Task 7: Frontend — Population Finder worklist page

**Files:**
- Create: `apps/web/src/pages/PopulationFinderPage.tsx`
- Create: `apps/web/src/hooks/usePopulationFinder.ts` (TanStack Query: list + accept/reject/dismiss mutations)
- Modify: routing + nav (follow how `CareListsPage`/`AlertsPage` are wired — locate the router file and side-nav component first).

- [ ] **Step 1:** Read an existing page + its query hook (e.g. `CareListsPage.tsx`, `AlertsPage.tsx`) and the API client (`apps/web/src/lib/api*` / existing hooks) to match patterns exactly (envelope `{success,data,meta}`, auth header, dark clinical theme #0E0E11/#9B1B30/#C9A227/#2DD4BF).
- [ ] **Step 2:** Worklist table: patient, finding type, current → suggested dx, evidence (e.g. "eGFR 42 on 2026-03-01"), confidence. Row actions: **Accept**, **Reject**, **Does not have** (permanent dismiss), **Snooze 12mo**. Optimistic invalidation on mutation.
- [ ] **Step 3:** Register route + nav entry. `npx tsc --noEmit` **and** `npx vite build` (vite is stricter) → both clean.
- [ ] **Step 4: Commit** — `feat: Population Finder review worklist page`

### Task 8: CDS Hooks recommendation cards (D6)

**Files:**
- Modify: `apps/api/src/routes/cds-hooks/index.ts`

- [ ] **Step 1:** Add a `patient-view` service `medgnosis-problem-list` to the discovery list. Handler: for `context.patientId`, fetch that patient's `pending` finder candidates (skip any with active dismissal). Return one `CdsCard` each: `indicator:'info'`, summary "Evidence suggests {suggested_name}", detail with the evidence + bundle rationale, and suggestions — **"Add {dx}"** (create action) and **"Does not have {dx}"** (records a permanent dismissal via an absolute-URL link or a documented client convention). Honor the compendium's respectful-CDS rule: dismissal is first-class.
- [ ] **Step 2:** Verify via `curl -s -X POST localhost:<port>/cds-services/medgnosis-problem-list -d '{"hook":"patient-view","hookInstance":"x","context":{"patientId":"<id>"}}'` returns cards for a known candidate patient. (No auth — CDS Hooks spec, matching existing service.)
- [ ] **Step 3: Commit** — `feat: problem-list recommendation cards via CDS Hooks (patient-view)`

### Task 9: Verify, update plan, merge

- [ ] `npx turbo run typecheck` (all workspaces) → 8/8. Full `vitest run` (api) → green. `npx vite build` (web) → clean.
- [ ] Update master plan: mark D4, D5, D6 ✅ with branch/migration refs.
- [ ] Merge `feature/cds-phase2-problem-list` → `main`, push. Confirm `git diff main...HEAD --diff-filter=D` is empty (no deletions).
- [ ] Update memory `project_medgnosis_cds_parity` (Phase 2 shipped).

## Self-review notes
- **Scale:** every finder query is cohort-scoped (1,277 pts) + per-patient indexed. No `count(*)`/`GROUP BY` on `observation`/`patient`. Plan flags the `fact_observation` fallback and an EXPLAIN gate.
- **Spec coverage:** D4 = Tasks 1,2,5; D5 = Tasks 1,3,4,5,6,7; D6 = Tasks 1,5,8.
- **Reuse:** accept path routes through `applyBulk` (one audit path). Auth/envelope/provider-scoping copied from `care-gaps`. CDS card shape reuses the existing `CdsCard` interface.
- **Type consistency:** `applyBulk(actions, opts) → PlanEntry[]`; `runFinder({cohortLimit?})`; dismissal `finding_key = "{finding_type}:{suggested_icd10}"` used identically in finder UPSERT skip-check and card handler.
- **Doctrine:** generic→staged re-mapping (uncomfortable generics), declined/"does not have" as counted terminal states, transparency (evidence shown on every card/row).
