# Clinical Fidelity & Delivery Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the VSAC/measure layer clinically true — population-role-aware code resolution, real (not hash-seeded) exclusions, code-system and version-drift guards, value-set-driven medication safety flags — and restore the CI pipeline so every future safety fix ships through a green gate.

**Architecture:** Two parts. Part 1 fixes the three pre-existing CI failures (red since at least the Phase 6 merge — a permanently red pipeline means regressions ship invisibly, which is itself a patient-safety defect). Part 2 adds the clinical-fidelity layer on top of PR #1's VSAC asset: a `population_role` dimension on the bridge, an exclusion engine fed by the imported hospice/advanced-illness/frailty value sets, contract guards wired into Phase 7's existing DQ infrastructure, and an upgrade of Phase 7's regex-based ACE/ARB flag to RxNorm value sets with allergy/intolerance suppression.

**Tech Stack:** Fastify 5 / TypeScript / postgres.js, PostgreSQL 17 (host, `claude_dev` via `~/.pgpass`), Vitest mocked-DB style, BullMQ, GitHub Actions (`.github/workflows/ci.yml`, turbo).

**Provenance:** Adversarial clinical-safety review of PR #1 (2026-06-12) + CI failure analysis. The three review verdicts this plan answers: (1) `resolveMeasureCodes` unions denominator with exclusion codes — 2,704 SNOMEDCT codes for CMS122v12 of which only 493 are the Diabetes set, 2,211 (82%) are Advanced Illness/Frailty/Hospice/Palliative — a naive consumer would flag hospice patients with false care gaps; (2) `gap_status='excluded'` (2,689 rows) is fabricated by a deterministic hash in migration 017 line 92, never computed clinically; (3) `EDW_CODE_SYSTEM` values are VSAC labels while the EDW's `code_system` columns hold `'SNOMED'`/`'ICD-10'` under a CHECK constraint — a direct label join silently returns zero rows, and `phm_edw.condition.code_system` defaults to `'ICD-10'`.

---

## Verified Facts (2026-06-12, post-Phase-8 main — re-verify ⚠ items at execution)

| Fact | Value |
|---|---|
| Roadmap state | ALL 8 CDS phases merged on origin/main (Phase 8 merged 2026-06-12 23:52 UTC). Phase 7 shipped `dq_finding`/`dq_feed` tables, `apps/api/src/workers/data-quality.ts` (`startDqWorker`, `runDqScan`), `apps/api/src/services/cohortFlags.ts` (flags HYPERKALEMIA, GFR_LOW, NEW_ACEARB_NO_BMP — ACE/ARB detection is a **name regex** `ACEARB_RE = 'lisinopril\|enalapril\|...'`), routes `/data-quality/*` and `/cohorts/*`. |
| CI failures (all pre-existing, identical on main) | **Unit Tests:** migration `003_etl_synthea_to_edw.sql` calls `phm_edw.dblink(...)`; CI's fresh `postgres:15-alpine` has no dblink extension in that schema. **Lint:** `apps/web` lint script exits 127 (`eslint` binary not found in that workspace). **Type Check:** `packages/solr` typecheck runs before `@medgnosis/db` is built (turbo task has no `dependsOn: ["^build"]`) + one real error `src/sync/cdc-listener.ts:608 TS7006` (implicit-any `payload`). Build/E2E/Security jobs SKIP because upstream jobs fail. |
| VSAC bridge (PR #1) | `phm_edw.measure_value_set`: 1,015 rows / 44 measures, all v12-local↔v14-VSAC (`vsac_cms_id` recorded, `mapping_method='cms_base_auto'`), **no role column** |
| Exclusion-family value sets loaded | 37 sets matching `hospice\|palliative\|advanced illness\|frailty` (e.g. Advanced Illness `2.16.840.1.113883.3.464.1003.110.12.1082`, Frailty Diagnosis, Hospice…) |
| ACE/ARB value sets loaded | `ACE Inhibitor or ARB or ARNI` (RXNORM, 302 codes), `ACE Inhibitor or ARB or ARNI Ingredient` (RXNORM, 38), `Allergy to ACE Inhibitor or ARB` (SNOMEDCT, 30), `Intolerance to ACE Inhibitor or ARB` (SNOMEDCT, 46), `Patient Reason for ACE Inhibitor or ARB Decline` (SNOMEDCT, 4) |
| `phm_edw.care_gap.gap_status` live | closed=6,697 / open=17,581 / excluded=2,689 (the excluded all hash-seeded by migration 017) |
| `phm_edw.condition_diagnosis` | patient_id, condition_id (FK→condition), diagnosis_status, onset_date, resolution_date, active_ind — sufficient for exclusion detection |
| EDW exclusion-code overlap (demo data) | 8 distinct condition codes in `phm_edw.condition` hit exclusion-family SNOMEDCT sets — small (demo-scale) but real; the machinery is the deliverable |
| `phm_edw.condition.code_system` | CHECK allows only `'ICD-10','SNOMED','ICD-9','OTHER'`; live distribution 100% `'SNOMED'`; **column default `'ICD-10'`** |
| Strata small cells | 386 of 1,132 strata rows (34%) have denominator 1–10; endpoint serves rate+CI for all, no small-cell metadata |
| `fact_patient_bundle_detail` | gap_status copied from `phm_edw.care_gap`; star keys via `dim_patient.patient_key` (filter `is_current`) and `dim_measure.measure_key` (`dim_measure.measure_id` = `measure_definition.measure_id`) |
| Worker pattern | `apps/api/src/worker.ts` starts all workers; nightly enqueue in `apps/api/src/workers/nightly-scheduler.ts` (`await xQueue.add('nightly-x', { triggeredBy: 'nightly_batch' })`); BullMQ `connection` exported from `workers/rules-engine.js` |
| ⚠ Migration numbers | This plan claims **052** (roles) and **053** (cohort-flag rules seed). Check the registry first: `psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c "SELECT name FROM _migrations WHERE name >= '044' ORDER BY name;"` — Phase 8 may have claimed 044+; 052/053 stay in PR #1's deliberate band. Renumber + `UPDATE _migrations` if taken. |
| ⚠ Base branch | PR #1 (`feature/cds-vsac-value-sets`) must be merged first — this plan consumes its tables/services. If unmerged at execution, branch FROM `feature/cds-vsac-value-sets` and retarget after. |

**Guardrails (unchanged from PR #1's plan):** worktree execution; `git branch --show-current` before every commit; additive migrations only; never stage tsbuildinfo/package-lock artifacts; `npx tsc --noEmit` + full vitest before every commit; `sql.json()` for any jsonb from TS; never print credentials.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/db/migrations/003_etl_synthea_to_edw.sql` | Modify | `CREATE EXTENSION IF NOT EXISTS dblink` so fresh environments (CI) can run it |
| `apps/web/package.json` (+ eslint config if missing) | Modify | Make `lint` executable (exit 127 fix) |
| `turbo.json` | Modify | `typecheck` depends on `^build` |
| `packages/solr/src/sync/cdc-listener.ts` | Modify | Fix TS7006 implicit-any |
| `packages/db/migrations/052_measure_value_set_roles.sql` | Create | `population_role` + `role_method` on the bridge + heuristic seed |
| `apps/api/src/services/vsacService.ts` | Modify | Role-aware `resolveMeasureCodes`, `getMeasureBridgeStatus`, EDW→VSAC label map |
| `apps/api/src/services/__tests__/vsacService.test.ts` | Modify | Updated + new tests |
| `apps/api/src/services/exclusionEngine.ts` | Create | Compute clinical exclusions from exclusion-role value sets; retire hash-seeded rows |
| `apps/api/src/services/__tests__/exclusionEngine.test.ts` | Create | Mocked tests |
| `apps/api/src/workers/nightly-scheduler.ts` | Modify | Run exclusion recompute before the measure refresh |
| `packages/db/migrations/053_seed_cohort_flag_value_sets.sql` | Create | `clinical_rule` rows binding flag definitions to value-set OIDs |
| `apps/api/src/services/cohortFlags.ts` | Modify | ACE/ARB flag: regex → RxNorm value set + allergy/intolerance suppression |
| `apps/api/src/workers/data-quality.ts` | Modify | New detector: code-system contract assertion |
| `apps/api/src/routes/measures/index.ts` | Modify | `small_cell` metadata on strata |
| `apps/api/src/routes/value-sets/index.ts` | Modify | `version_drift` surfaced; LIMIT on codes endpoint |

---

### Task 0: Preflight

- [ ] **Step 1: Worktree + branch.** Execute in a fresh worktree (EnterWorktree or `git worktree add`), branch `feature/clinical-fidelity-hardening` from origin/main **after PR #1 merges** (see ⚠ Base branch above). `git branch --show-current` must confirm.
- [ ] **Step 2: Migration registry check** (⚠ row above). Claim 052/053 or renumber.
- [ ] **Step 3: Worktree build prep** (known gotcha): `rm -f packages/*/tsconfig.tsbuildinfo && (cd packages/shared && npm run build) && (cd packages/db && npm run build)` after `npm install --legacy-peer-deps`, then `cd apps/api && npm run test` — expect full suite green before starting.

---

## Part 1 — CI Restoration (the delivery-safety gate)

### Task 1: Unit Tests job — dblink extension

**Files:** Modify `packages/db/migrations/003_etl_synthea_to_edw.sql`

- [ ] **Step 1:** Inspect the usage: `grep -n "dblink" packages/db/migrations/003_etl_synthea_to_edw.sql | head`. CI error was `function phm_edw.dblink(text, text) does not exist` — the calls are schema-qualified to `phm_edw`, so the extension must be installed INTO that schema.
- [ ] **Step 2:** Add immediately after the migration's header comment (before any dblink call):

```sql
-- dblink is required by the Synthea ETL below; fresh environments (CI) need it
-- installed into phm_edw because the calls are schema-qualified.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA phm_edw;
```

If `grep` shows the calls are NOT schema-qualified (plain `dblink(`), use `CREATE EXTENSION IF NOT EXISTS dblink;` instead and report which form you found.

- [ ] **Step 3:** Editing an applied migration is safe here: every existing environment already ran 003 (`IF NOT EXISTS` no-ops there); only fresh CI databases see the new line. Verify locally that the statement is idempotent: `psql -h 127.0.0.1 -U claude_dev -d medgnosis -c "CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA phm_edw;"` (expect `NOTICE: extension "dblink" already exists` or clean CREATE — report which).
- [ ] **Step 4:** Commit: `git add packages/db/migrations/003_etl_synthea_to_edw.sql && git commit -m "fix(ci): install dblink extension in migration 003 for fresh environments"`

### Task 2: Lint job — apps/web exit 127

**Files:** Modify `apps/web/package.json` (possibly add eslint config)

- [ ] **Step 1:** Diagnose: `cd apps/web && npm run lint` locally. Exit 127 = `eslint` binary not resolvable in this workspace. Compare against `apps/api/package.json` (`grep -A5 devDependencies apps/api/package.json | grep -i eslint` and check `apps/api`'s lint script).
- [ ] **Step 2:** Fix by adding the same eslint devDependencies (+ config file if `apps/web` has none — copy `apps/api`'s eslint config and adjust for React/TSX). Install with `npm install --legacy-peer-deps` at repo root.
- [ ] **Step 3:** `cd apps/web && npm run lint` must exit 0. If it now surfaces real lint errors in web code, fix ONLY mechanical ones (unused imports, etc.); if substantive errors appear, report DONE_WITH_CONCERNS listing them rather than mass-disabling rules.
- [ ] **Step 4:** Commit: `git add apps/web/package.json package-lock.json <config files> && git commit -m "fix(ci): make apps/web lint runnable (eslint was missing — exit 127)"` (package-lock.json IS staged here — it's the actual dependency fix.)

### Task 3: Type Check job — turbo ordering + solr implicit-any

**Files:** Modify `turbo.json`, `packages/solr/src/sync/cdc-listener.ts`

- [ ] **Step 1:** In `turbo.json`, find the `typecheck` task definition and add the build dependency so workspace `dist/` exists before dependents typecheck:

```json
"typecheck": {
  "dependsOn": ["^build"]
}
```

(Merge with any existing keys in that task block — don't drop them.)

- [ ] **Step 2:** Fix `packages/solr/src/sync/cdc-listener.ts:608` (`Parameter 'payload' implicitly has an 'any' type`). Read the surrounding function — it is a Postgres LISTEN/NOTIFY callback, so the payload is a string: type it `(payload: string)` (adjust if the actual callback signature differs; never use `any`).
- [ ] **Step 3:** Verify the whole monorepo: `npx turbo run typecheck` from repo root — expect every workspace green.
- [ ] **Step 4:** Commit: `git add turbo.json packages/solr/src/sync/cdc-listener.ts && git commit -m "fix(ci): typecheck depends on ^build; type solr CDC payload param"`

### Task 4: CI green verification

- [ ] **Step 1:** Push the branch, open a draft PR (`gh pr create --draft ...`), wait for checks: `gh pr view --json statusCheckRollup --jq '.statusCheckRollup[] | {name, conclusion}'` (per project memory: `gh pr checks --json` errors silently — use `pr view`).
- [ ] **Step 2:** Expected: Type Check ✓, Lint ✓, Unit Tests ✓, and the previously SKIPPED Build/E2E/Security jobs now run — chase any newly-unskipped failures the same way (diagnose, fix, commit) until the rollup is green. This gate blocks Part 2's merge, not its development.

---

## Part 2 — Clinical Fidelity

### Task 5: Migration 052 — population roles on the bridge

**Files:** Create `packages/db/migrations/052_measure_value_set_roles.sql`

The VSAC workbooks don't carry population roles, so v1 is a conservative name heuristic: classify only what is unambiguous, leave the rest `'unclassified'`, and record the method so manual curation (from the eCQM specs) can override row-by-row later. **`resolveMeasureCodes` will refuse to serve unclassified-as-denominator** (Task 6), so a wrong heuristic fails loudly, not silently.

- [ ] **Step 1:** Write the migration:

```sql
-- =============================================================================
-- 052: Population roles on the measure↔value-set bridge.
-- The 2026-06-12 adversarial review showed resolveMeasureCodes unioned
-- denominator with exclusion codes (82% contamination for CMS122) — a naive
-- consumer would flag hospice patients with false care gaps. Roles make the
-- bridge safe to consume. Heuristic-classified by value-set NAME (conservative:
-- anything ambiguous stays 'unclassified'); role_method records provenance so
-- manual curation from the eCQM specs can override.
-- =============================================================================

ALTER TABLE phm_edw.measure_value_set
  ADD COLUMN population_role VARCHAR(30) NOT NULL DEFAULT 'unclassified',
  ADD COLUMN role_method     VARCHAR(20) NOT NULL DEFAULT 'unclassified';

ALTER TABLE phm_edw.measure_value_set
  ADD CONSTRAINT chk_mvs_population_role CHECK (population_role IN
    ('initial_population','denominator','denominator_exclusion','numerator','supplemental','unclassified')),
  ADD CONSTRAINT chk_mvs_role_method CHECK (role_method IN
    ('name_heuristic','manual','unclassified'));

CREATE INDEX idx_mvs_role ON phm_edw.measure_value_set (population_role);

-- Exclusion family: the canonical eCQM denominator-exclusion value sets.
UPDATE phm_edw.measure_value_set mv SET population_role = 'denominator_exclusion', role_method = 'name_heuristic'
FROM phm_edw.vsac_value_set vs
WHERE vs.value_set_oid = mv.value_set_oid
  AND vs.name ~* '(hospice|palliative|advanced illness|frailty|long.term care|nursing facility|dementia medications)';

-- Supplemental data elements (exact names per eCQM convention).
UPDATE phm_edw.measure_value_set mv SET population_role = 'supplemental', role_method = 'name_heuristic'
FROM phm_edw.vsac_value_set vs
WHERE vs.value_set_oid = mv.value_set_oid
  AND vs.name ~* '^(race|ethnicity|payer( type)?|onc administrative sex|sex)$';

-- Qualifying-encounter sets → initial population.
UPDATE phm_edw.measure_value_set mv SET population_role = 'initial_population', role_method = 'name_heuristic'
FROM phm_edw.vsac_value_set vs
WHERE vs.value_set_oid = mv.value_set_oid
  AND mv.population_role = 'unclassified'
  AND vs.name ~* '(office visit|outpatient consultation|encounter|wellness visit|telephone visit|virtual|home healthcare services|preventive care services|annual wellness)';

COMMENT ON COLUMN phm_edw.measure_value_set.population_role IS
  'eCQM population role. name_heuristic rows are conservative auto-classification; authoritative roles come from the measure''s CQL data criteria (manual). unclassified is NEVER served as a denominator.';
```

- [ ] **Step 2:** Run the migration (`cd packages/db && DATABASE_URL=... npm run db:migrate` — extract password from pgpass as in PR #1's plan; never print it).
- [ ] **Step 3:** Verify and EYEBALL the classification (this is a clinical-safety review point, not a formality):

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c \
 "SELECT population_role, count(*) FROM phm_edw.measure_value_set GROUP BY 1 ORDER BY 2 DESC;"
psql -h 127.0.0.1 -U claude_dev -d medgnosis -c \
 "SELECT DISTINCT vs.name, mv.population_role FROM phm_edw.measure_value_set mv
  JOIN phm_edw.vsac_value_set vs USING (value_set_oid)
  WHERE mv.population_role <> 'unclassified' ORDER BY 2, 1;"
```

Read every classified name. If ANY looks wrong for its role (e.g. a clinical denominator set caught by the encounter regex), fix the heuristic in the migration before committing, re-run against a corrected UPDATE (the migration is on a fresh branch — repair via `UPDATE ... SET population_role='unclassified'` + adjust the file so fresh environments get it right). Report the final counts.

- [ ] **Step 4:** Commit: `git add packages/db/migrations/052_measure_value_set_roles.sql && git commit -m "feat: population roles on measure-value-set bridge (migration 052)"`

### Task 6: Role-aware VSAC service (TDD)

**Files:** Modify `apps/api/src/services/vsacService.ts`, `apps/api/src/services/__tests__/vsacService.test.ts`

- [ ] **Step 1:** Add failing tests to the existing test file (same mock pattern):

```typescript
describe('resolveMeasureCodes (role-aware)', () => {
  it('passes the role into the query', async () => {
    mockSql.mockResolvedValueOnce([{ code: '44054006' }]);
    const codes = await resolveMeasureCodes('CMS122v12', 'SNOMEDCT', 'denominator_exclusion');
    expect(codes).toEqual(['44054006']);
    const values = mockSql.mock.calls[0]?.slice(1) ?? [];
    expect(values).toContain('denominator_exclusion');
  });
});

describe('getMeasureBridgeStatus', () => {
  it('reports version drift and role coverage', async () => {
    mockSql.mockResolvedValueOnce([
      { vsac_cms_id: 'CMS122v14', population_role: 'denominator_exclusion', n: 9 },
      { vsac_cms_id: 'CMS122v14', population_role: 'unclassified', n: 12 },
    ]);
    const status = await getMeasureBridgeStatus('CMS122v12');
    expect(status).toEqual({
      measure_code: 'CMS122v12',
      vsac_cms_id: 'CMS122v14',
      version_drift: true,
      roles: { denominator_exclusion: 9, unclassified: 12 },
      unclassified_count: 12,
    });
  });

  it('returns null for an unbridged measure', async () => {
    expect(await getMeasureBridgeStatus('CMS249v6')).toBeNull();
  });
});
```

Add `getMeasureBridgeStatus` and `type PopulationRole` to the import list. Run — expect FAIL (new export missing / signature mismatch).

- [ ] **Step 2:** Implement in `vsacService.ts`:

```typescript
export type PopulationRole =
  | 'initial_population'
  | 'denominator'
  | 'denominator_exclusion'
  | 'numerator'
  | 'supplemental'
  | 'unclassified';

export interface MeasureBridgeStatus {
  measure_code: string;
  vsac_cms_id: string;
  version_drift: boolean;
  roles: Record<string, number>;
  unclassified_count: number;
}
```

Change `resolveMeasureCodes` to require the role (third positional param, no default — callers must choose consciously) and add `AND mv.population_role = ${role}` to its WHERE clause. Replace the SAFETY header warning with: role-aware now; `'unclassified'` may be requested explicitly for audit, but is never a denominator.

```typescript
export async function getMeasureBridgeStatus(
  measureCode: string,
): Promise<MeasureBridgeStatus | null> {
  const rows = await sql<{ vsac_cms_id: string; population_role: string; n: number }[]>`
    SELECT mv.vsac_cms_id, mv.population_role, count(*)::int AS n
    FROM phm_edw.measure_value_set mv
    JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
    WHERE md.measure_code = ${measureCode}
    GROUP BY mv.vsac_cms_id, mv.population_role
  `;
  if (rows.length === 0) return null;
  const first = rows[0];
  if (!first) return null;
  const roles: Record<string, number> = {};
  let unclassified = 0;
  for (const r of rows) {
    roles[r.population_role] = (roles[r.population_role] ?? 0) + r.n;
    if (r.population_role === 'unclassified') unclassified += r.n;
  }
  return {
    measure_code: measureCode,
    vsac_cms_id: first.vsac_cms_id,
    version_drift: measureCode !== first.vsac_cms_id,
    roles,
    unclassified_count: unclassified,
  };
}
```

- [ ] **Step 3:** Fix the two pre-existing `resolveMeasureCodes` tests (they now need the role argument — use `'denominator_exclusion'` and keep assertions). Run the file: all green. `npx tsc --noEmit`: the signature change must surface every caller — as of PR #1 there are none outside tests; if tsc reveals new callers added by Phases 5–8, STOP and report NEEDS_CONTEXT listing them.
- [ ] **Step 4:** Live sanity: role-filtered resolution must now separate the populations —

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c \
 "SELECT mv.population_role, count(DISTINCT vc.code)
  FROM phm_edw.measure_value_set mv
  JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
  JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = mv.value_set_oid
  WHERE md.measure_code = 'CMS122v12' AND vc.code_system = 'SNOMEDCT'
  GROUP BY 1;"
```

Expect `denominator_exclusion` ≈ 2,200 (the contamination, now labeled) clearly separated from the rest. Record actual numbers.

- [ ] **Step 5:** Commit both files: `git commit -m "feat: role-aware resolveMeasureCodes + getMeasureBridgeStatus"`

### Task 7: Exclusion engine — retire the hash-seeded exclusions (TDD)

**Files:** Create `apps/api/src/services/exclusionEngine.ts` + `__tests__/exclusionEngine.test.ts`; Modify `apps/api/src/workers/nightly-scheduler.ts`

Semantics (conservative, surface-don't-hide): a patient is **clinically excluded** from a measure when they have an active diagnosis whose code is in one of that measure's `denominator_exclusion` value sets. Hash-seeded `excluded` rows with NO clinical justification revert to `'open'` — an unverified gap must be visible, not hidden. Both `phm_edw.care_gap` and `phm_star.fact_patient_bundle_detail` are updated in one transaction so the next measure refresh (which reads bundle_detail) propagates immediately.

- [ ] **Step 1:** Failing test (mock pattern as elsewhere; mock `sql.begin` to invoke its callback with a `tx` whose `unsafe` is a vi.fn returning `{ count: N }`):

```typescript
// =============================================================================
// Unit tests — clinical exclusion engine
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUnsafe, mockBegin } = vi.hoisted(() => {
  const mockUnsafe = vi.fn(async () => ({ count: 0 }));
  const mockBegin = vi.fn(async (cb: (tx: { unsafe: typeof mockUnsafe }) => Promise<unknown>) =>
    cb({ unsafe: mockUnsafe }),
  );
  return { mockUnsafe, mockBegin };
});

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(vi.fn(), { begin: mockBegin, unsafe: mockUnsafe }),
}));

import { recomputeClinicalExclusions } from '../exclusionEngine.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockUnsafe.mockResolvedValue({ count: 0 });
});

describe('recomputeClinicalExclusions', () => {
  it('runs exclude + revert + star-sync statements in ONE transaction', async () => {
    mockUnsafe
      .mockResolvedValueOnce({ count: 12 }) // newly excluded (care_gap)
      .mockResolvedValueOnce({ count: 2677 }) // reverted to open (care_gap)
      .mockResolvedValueOnce({ count: 9999 }); // bundle_detail sync
    const result = await recomputeClinicalExclusions();
    expect(mockBegin).toHaveBeenCalledOnce();
    expect(mockUnsafe.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.newlyExcluded).toBe(12);
    expect(result.revertedToOpen).toBe(2677);
  });
});
```

Run — FAIL (module missing).

- [ ] **Step 2:** Implement `apps/api/src/services/exclusionEngine.ts`:

```typescript
// =============================================================================
// Medgnosis API — Clinical exclusion engine
// Replaces hash-seeded gap_status='excluded' (migration 017's deterministic
// hash — mechanically valid, clinically meaningless) with exclusions computed
// from the measure's denominator_exclusion value sets (hospice, palliative,
// advanced illness, frailty — imported from VSAC).
// Conservative semantics: an exclusion needs clinical evidence; an excluded
// row WITHOUT evidence reverts to 'open' (surface, never hide, unverified gaps).
// care_gap and fact_patient_bundle_detail update in one transaction so the
// next measure refresh propagates consistently.
// =============================================================================

import { sql } from '@medgnosis/db';

export interface ExclusionRecomputeResult {
  newlyExcluded: number;
  revertedToOpen: number;
  durationMs: number;
}

const CLINICAL_EXCLUSION_EVIDENCE = `
  SELECT 1
  FROM phm_edw.condition_diagnosis cd
  JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
  JOIN phm_edw.vsac_value_set_code vc
    ON vc.code = c.condition_code AND vc.code_system = 'SNOMEDCT'
  JOIN phm_edw.measure_value_set mv
    ON mv.value_set_oid = vc.value_set_oid
   AND mv.population_role = 'denominator_exclusion'
  WHERE cd.patient_id = cg.patient_id
    AND mv.measure_id = cg.measure_id
    AND cd.active_ind = 'Y'
    AND (cd.resolution_date IS NULL OR cd.resolution_date > CURRENT_DATE)
`;

export async function recomputeClinicalExclusions(): Promise<ExclusionRecomputeResult> {
  const t0 = performance.now();

  const { newlyExcluded, revertedToOpen } = await sql.begin(async (tx) => {
    const excluded = await tx.unsafe(`
      UPDATE phm_edw.care_gap cg
      SET gap_status = 'excluded',
          comments = COALESCE(comments || ' | ', '') || 'excluded: clinical (VSAC denominator_exclusion)',
          updated_at = NOW()
      WHERE LOWER(cg.gap_status) <> 'excluded'
        AND EXISTS (${CLINICAL_EXCLUSION_EVIDENCE})
    `);

    const reverted = await tx.unsafe(`
      UPDATE phm_edw.care_gap cg
      SET gap_status = 'open',
          comments = COALESCE(comments || ' | ', '') || 'reverted: hash-seeded exclusion without clinical evidence',
          updated_at = NOW()
      WHERE LOWER(cg.gap_status) = 'excluded'
        AND NOT EXISTS (${CLINICAL_EXCLUSION_EVIDENCE})
    `);

    await tx.unsafe(`
      UPDATE phm_star.fact_patient_bundle_detail d
      SET gap_status = cg.gap_status
      FROM phm_edw.care_gap cg
      JOIN phm_star.dim_patient dp ON dp.patient_id = cg.patient_id AND dp.is_current
      JOIN phm_star.dim_measure dm ON dm.measure_id = cg.measure_id
      WHERE d.patient_key = dp.patient_key
        AND d.measure_key = dm.measure_key
        AND LOWER(d.gap_status) <> LOWER(cg.gap_status)
    `);

    return { newlyExcluded: excluded.count ?? 0, revertedToOpen: reverted.count ?? 0 };
  });

  const durationMs = Math.round(performance.now() - t0);
  console.info(
    `[exclusions] recomputed: +${newlyExcluded} clinical, ${revertedToOpen} hash-seeded reverted to open (${durationMs}ms)`,
  );
  return { newlyExcluded, revertedToOpen, durationMs };
}
```

NOTE before coding: verify the column names used above against the live DB (`care_gap.comments`/`updated_at` exist — confirmed 2026-06-12; `fact_patient_bundle_detail` join keys patient_key/measure_key/gap_status — confirmed; `dim_measure.measure_id` — confirmed). If `tx.unsafe` is typed without `.count`, mirror how `measureCalculatorV2.ts` reads `result.count`.

- [ ] **Step 3:** Tests green; `npx tsc --noEmit` clean.
- [ ] **Step 4:** Wire into the nightly pipeline in `nightly-scheduler.ts` — exclusions must land BEFORE the measure refresh job is enqueued. Locate where `measureQueue.add(...)` happens in `processNightlyJob` and insert immediately before it:

```typescript
  const exclusions = await recomputeClinicalExclusions();
  console.info(
    `[nightly] exclusions recomputed: +${exclusions.newlyExcluded} / reverted ${exclusions.revertedToOpen}`,
  );
```

with the import at top: `import { recomputeClinicalExclusions } from '../services/exclusionEngine.js';`

- [ ] **Step 5:** One-time live run + verification (the backfill IS the nightly function — run it once now):

```bash
cd apps/api
PGPASSWORD="$(awk -F: '$4=="claude_dev" {print $5; exit}' ~/.pgpass)" \
DATABASE_URL="postgres://claude_dev@127.0.0.1:5432/medgnosis" npx tsx -e "
import('./src/services/exclusionEngine.ts').then(async (m) => {
  console.log(await m.recomputeClinicalExclusions());
  process.exit(0);
});"
```

Then verify clinical truth end-to-end:

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At <<'EOF'
-- hash-seeded exclusions retired: every remaining excluded row has clinical evidence
SELECT 'excluded w/o evidence (expect 0): ' || count(*) FROM phm_edw.care_gap cg
WHERE LOWER(cg.gap_status)='excluded' AND NOT EXISTS (
  SELECT 1 FROM phm_edw.condition_diagnosis cd
  JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
  JOIN phm_edw.vsac_value_set_code vc ON vc.code = c.condition_code AND vc.code_system='SNOMEDCT'
  JOIN phm_edw.measure_value_set mv ON mv.value_set_oid = vc.value_set_oid AND mv.population_role='denominator_exclusion'
  WHERE cd.patient_id = cg.patient_id AND mv.measure_id = cg.measure_id AND cd.active_ind='Y'
    AND (cd.resolution_date IS NULL OR cd.resolution_date > CURRENT_DATE));
SELECT 'care_gap status now: ' || string_agg(gap_status || '=' || n, ', ') FROM (SELECT gap_status, count(*) n FROM phm_edw.care_gap GROUP BY 1) x;
SELECT 'bundle_detail synced (expect 0 mismatches): ' || count(*) FROM phm_star.fact_patient_bundle_detail d
JOIN phm_star.dim_patient dp ON dp.patient_key=d.patient_key AND dp.is_current
JOIN phm_star.dim_measure dm ON dm.measure_key=d.measure_key
JOIN phm_edw.care_gap cg ON cg.patient_id=dp.patient_id AND cg.measure_id=dm.measure_id
WHERE LOWER(d.gap_status) <> LOWER(cg.gap_status);
EOF
```

Then re-run the measure refresh (Task 6 Step 5 command from the PR #1 plan) and confirm `fact_measure_result`/strata reflect the new exclusion counts (expect excluded to drop from ~2,689 toward the clinically-evidenced count; open rises correspondingly — rates will DROP; that is correct and honest, note it in the report).

- [ ] **Step 6:** Commit: `git add apps/api/src/services/exclusionEngine.ts apps/api/src/services/__tests__/exclusionEngine.test.ts apps/api/src/workers/nightly-scheduler.ts && git commit -m "feat: clinical exclusion engine — VSAC-evidenced exclusions replace hash-seeded demo rows"`

### Task 8: Migration 053 + value-set-driven ACE/ARB safety flag

**Files:** Create `packages/db/migrations/053_seed_cohort_flag_value_sets.sql`; Modify `apps/api/src/services/cohortFlags.ts`

- [ ] **Step 1:** Migration — bind the flag to value sets as DATA (rules-as-data doctrine; the transparency endpoint `/rules/COHORT_FLAGS/...` then explains the flag's criteria for free):

```sql
-- =============================================================================
-- 053: Cohort safety flags bind to VSAC value sets (logic as data).
-- Replaces the hardcoded ACE/ARB name regex with the authoritative RxNorm
-- value set, and adds allergy/intolerance suppression sets the regex could
-- never express. OIDs resolved by exact value-set name at seed time.
-- =============================================================================

INSERT INTO phm_edw.clinical_rule (entity, attribute, value_text, source, notes)
SELECT 'COHORT_FLAGS', 'ACEARB_RXNORM_VALUE_SET_OID', vs.value_set_oid,
       'VSAC', 'ACE Inhibitor or ARB or ARNI — drives NEW_ACEARB_NO_BMP medication match'
FROM phm_edw.vsac_value_set vs WHERE vs.name = 'ACE Inhibitor or ARB or ARNI';

INSERT INTO phm_edw.clinical_rule (entity, attribute, value_text, source, notes)
SELECT 'COHORT_FLAGS', 'ACEARB_SUPPRESS_VALUE_SET_OID', vs.value_set_oid,
       'VSAC', vs.name || ' — suppresses NEW_ACEARB_NO_BMP when patient has documented allergy/intolerance'
FROM phm_edw.vsac_value_set vs
WHERE vs.name IN ('Allergy to ACE Inhibitor or ARB', 'Intolerance to ACE Inhibitor or ARB');

-- Sanity: all three rows must exist (the SELECTs insert nothing if names drift)
DO $$
BEGIN
  IF (SELECT count(*) FROM phm_edw.clinical_rule
      WHERE entity='COHORT_FLAGS' AND attribute LIKE 'ACEARB%' AND active_ind='Y') < 3 THEN
    RAISE EXCEPTION 'COHORT_FLAGS seed incomplete — VSAC value-set names not found';
  END IF;
END $$;
```

Run it; verify `SELECT attribute, value_text FROM phm_edw.clinical_rule WHERE entity='COHORT_FLAGS';` returns 3 rows.

- [ ] **Step 2:** Locate the regex in the flag service: `grep -n "ACEARB_RE\|ACEARB" apps/api/src/services/cohortFlags.ts`. Read the surrounding flag-computation function (it matches `medication.medication_name ~* ACEARB_RE` or similar against active orders).
- [ ] **Step 3:** Replace the name-regex medication match with a code match against the value set, and add suppression. The shape (adapt identifiers to the actual function — keep its result contract identical so the worker/routes are untouched):

```typescript
// Codes come from clinical_rule → VSAC, not a hardcoded regex: one VSAC
// re-ingest updates the flag; allergy/intolerance suppression is impossible
// to express as a name regex.
const acearbOidRows = await sql<{ value_text: string }[]>`
  SELECT value_text FROM phm_edw.clinical_rule
  WHERE entity = 'COHORT_FLAGS' AND attribute = 'ACEARB_RXNORM_VALUE_SET_OID'
    AND active_ind = 'Y' AND expiration_date IS NULL LIMIT 1
`;
const suppressOidRows = await sql<{ value_text: string }[]>`
  SELECT value_text FROM phm_edw.clinical_rule
  WHERE entity = 'COHORT_FLAGS' AND attribute = 'ACEARB_SUPPRESS_VALUE_SET_OID'
    AND active_ind = 'Y' AND expiration_date IS NULL
`;
const acearbOid = acearbOidRows[0]?.value_text;
if (!acearbOid) {
  // Fail loudly: a safety flag silently matching nothing is worse than crashing.
  throw new Error('COHORT_FLAGS/ACEARB_RXNORM_VALUE_SET_OID missing — run migration 053');
}
const suppressOids = suppressOidRows.map((r) => r.value_text);
```

…and in the patient-matching SQL replace the `medication_name ~* regex` predicate with:

```sql
JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
JOIN phm_edw.vsac_value_set_code vc
  ON vc.code = m.medication_code AND vc.code_system = 'RXNORM'
 AND vc.value_set_oid = ${acearbOid}
```

plus the suppression anti-join (only when `suppressOids.length > 0`):

```sql
AND NOT EXISTS (
  SELECT 1 FROM phm_edw.condition_diagnosis cd
  JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
  JOIN phm_edw.vsac_value_set_code svc
    ON svc.code = c.condition_code AND svc.code_system = 'SNOMEDCT'
   AND svc.value_set_oid = ANY(${suppressOids})
  WHERE cd.patient_id = <the patient id column in scope> AND cd.active_ind = 'Y'
)
```

(`= ANY(${array})` is native postgres.js array binding.) Keep the old regex constant in place but unused for ONE release? No — delete it; the rule row is the new source of truth, and `git log` preserves the regex.

- [ ] **Step 4:** Run the cohort-flags worker path once live (find how Phase 7 triggers it — `grep -n cohortFlags apps/api/src/workers/data-quality.ts` shows the entry point) and compare flag counts before/after:

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c \
 "SELECT flag_key, count(*) FROM <patient_flag table — confirm name via \dt *flag*> GROUP BY 1;"
```

Expect NEW_ACEARB_NO_BMP count in the same order of magnitude as before (regex matched 12 ingredient names; the value set covers 302 RxNorm codes including combinations — count may legitimately RISE; investigate only if it collapses to 0 or explodes implausibly). Report both numbers.

- [ ] **Step 5:** Tests: update/extend any existing cohortFlags tests (mock the two rule lookups). Full suite + tsc green. Commit migration + service: `git commit -m "feat: ACE/ARB safety flag driven by VSAC RxNorm value set + allergy suppression (migration 053)"`

### Task 9: Code-system contract detector (Phase 7 DQ integration)

**Files:** Modify `apps/api/src/services/vsacService.ts` (map export), `apps/api/src/workers/data-quality.ts` (new detector)

- [ ] **Step 1:** Export the translation map from `vsacService.ts`:

```typescript
// EDW code_system column labels → VSAC code_system labels. The EDW CHECK
// constraints allow 'ICD-10','SNOMED','ICD-9','OTHER'; VSAC uses different
// labels. NEVER join the columns directly — translate through this map.
export const EDW_TO_VSAC_CODE_SYSTEM: Record<string, string | null> = {
  SNOMED: 'SNOMEDCT',
  'ICD-10': 'ICD10CM',
  'ICD-9': null, // VSAC eCQM extracts carry no ICD-9 — unmapped by design
  OTHER: null,
};
```

- [ ] **Step 2:** Read `apps/api/src/workers/data-quality.ts` — find how existing detectors (impossible vitals, weight jump, identity) are structured inside `runDqScan` and how they write `dq_finding` rows. Add a detector following the SAME structure, with this logic:

For each of (`phm_edw.condition`, `phm_edw.procedure`): select `code_system, count(*)` grouped; for each distinct value, if `EDW_TO_VSAC_CODE_SYSTEM[value]` is `undefined` (not in the map at all) OR (maps to a VSAC label but a sampled join yields zero overlap while the EDW has >100 rows of it), write a `dq_finding` (severity `warning`, detector key `code_system_contract`, entity reference the table name, description naming the unmapped/zero-overlap system and row count). Also: one informational finding if `phm_edw.condition` contains rows with the column DEFAULT `'ICD-10'` but codes that match `^[0-9]+$` (SNOMED-shaped — the default-mislabel hazard).

- [ ] **Step 3:** Run the DQ scan once live (same trigger path Phase 7 uses), then: `psql ... -c "SELECT detector, severity, left(description,80) FROM phm_edw.dq_finding WHERE detector='code_system_contract' ORDER BY 1;"` (confirm table/column names from the Phase 7 migration 042 first — adjust query). On today's data expect ZERO warning findings (everything is 'SNOMED'→SNOMEDCT with overlap) — the detector's value is catching tomorrow's ingest drift; verify it fires by temporarily testing the query with a fabricated unmapped label in a transaction you ROLL BACK, and state in the report that you did so.
- [ ] **Step 4:** Tests (mocked) for the detector function; suite + tsc green; commit: `git commit -m "feat: code-system contract DQ detector — EDW↔VSAC label drift surfaces as dq_finding"`

### Task 10: Surfacing — version drift, small cells, response bound

**Files:** Modify `apps/api/src/routes/value-sets/index.ts`, `apps/api/src/routes/measures/index.ts`, `apps/api/src/services/vsacService.ts` (if needed for drift in list response)

- [ ] **Step 1:** `/value-sets/measure/:measureCode` response: include the bridge status — call `getMeasureBridgeStatus(measureCode)` and return `{ success: true, data: { status, value_sets } }`-shaped payload (adjust the existing 404 branch to key off `status === null`). Consumers now SEE `version_drift: true` and `unclassified_count` on every bridged measure. (This is a response-shape change to a PR-#1 endpoint with no consumers yet — safe; update any tests.)
- [ ] **Step 2:** `/value-sets/:oid/codes`: add `LIMIT 2000` to `getValueSetCodes` (review follow-up; largest loaded expansion is well under it — verify with `SELECT max(c) FROM (SELECT count(*) c FROM phm_edw.vsac_value_set_code GROUP BY value_set_oid) x;` and report the max; if any set exceeds 2000, raise the limit above it and note pagination as future work).
- [ ] **Step 3:** Strata endpoint (`/measures/:id/strata`): add `small_cell: row.denominator > 0 && row.denominator < 11` to each mapped row — display guidance (wide-CI/small-n warning), NOT suppression; this is an internal clinical tool and raw n stays visible.
- [ ] **Step 4:** tsc + suite green; smoke the three endpoints against a local boot (Task 5 pattern from the PR #1 plan: 401-vs-404 proves registration; with a minted token show one response body each). Commit: `git commit -m "feat: surface version drift, small-cell flags, and bound value-set responses"`

### Task 11: Final Verification

- [ ] **Step 1: Clinical truth gates** (all must hold):

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At <<'EOF'
-- a. exclusion accounting still mechanically correct
SELECT 'a (expect 0): ' || count(*) FROM phm_star.fact_measure_result WHERE exclusion_flag AND (denominator_flag OR numerator_flag);
-- b. every excluded care gap has clinical evidence (Task 7 query)
-- c. no unclassified value set is served as denominator: role-aware resolver only
SELECT 'c roles: ' || string_agg(population_role || '=' || n, ', ') FROM (SELECT population_role, count(*) n FROM phm_edw.measure_value_set GROUP BY 1) x;
EOF
```

- [ ] **Step 2:** Full suite + tsc + `npx turbo run typecheck lint` from root — all green locally.
- [ ] **Step 3:** Push, PR, and confirm the FULL CI rollup green (Part 1's deliverable proven on this PR — the first green pipeline since Phase 6).
- [ ] **Step 4:** PR body must state the clinically-visible effect: measure rates and exclusion counts CHANGE with this merge (hash-seeded exclusions retired → excluded drops to evidence-backed count, open gaps rise, rates drop honestly). Reviewers must read that as the point, not a regression.

---

## Deferred (do NOT build in this plan)

| Item | Why deferred | Where it lands |
|---|---|---|
| Manual role curation from eCQM CQL data criteria (the authoritative role source) | Needs the measure-spec corpus (CQL/HQMF parsing or clinician review per measure); heuristic + loud-failure default is the safe v1 | Future content task; `role_method='manual'` override path is ready |
| v14-aligned `measure_definition` upgrade (retire v12 prose) | Content work across 45 measures; drift is now machine-visible per measure | Measure-content refresh iteration |
| Encounter-domain routing (`EDW_CODE_SYSTEM` has no encounter entry; 41 bridged value sets are CPT/HCPCS-only) | Needs an EDW encounter-coding survey first | With the population-finder consumer |
| Exclusion evidence beyond conditions (hospice encounters, orders) | Conditions are the dominant evidence source in this EDW today | Exclusion engine v2 |
| 400-vs-500 on non-numeric `:id` (codebase-wide pattern) | Touches ~a dozen pre-existing routes | Dedicated chore |
| Hash-seed removal from migration 017 itself | 017 is applied demo history; the engine now corrects its output nightly | Never (engine supersedes it) |
