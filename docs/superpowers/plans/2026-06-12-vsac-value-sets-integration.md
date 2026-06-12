# VSAC Value Sets Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Parthenon's VSAC value-set asset (1,545 value sets / 225,261 codes / 72 CMS measures) into Medgnosis, bridge it to `phm_edw.measure_definition`, harden the measure calculator (GROUPING SETS stratification + Wilson CIs + exclusion-semantics regression gate), and install the `MeasureEvaluator` interface seam for future CQL.

**Architecture:** Reference tables land in `phm_edw` (house precedent: Phase 1 put `clinical_rule` there; live DB has only `public`/`phm_edw`/`phm_star`). Data transfers DB-to-DB via `psql \copy` pipes (both databases live on the same host PG17 instance). A bridge table maps measure definitions to value-set OIDs by base CMS number. Calculator changes are additive: a new strata fact table populated in the same refresh transaction, CIs computed in TS.

**Tech Stack:** Fastify 5 / TypeScript / postgres.js (`@medgnosis/db`), PostgreSQL 17 (host, `claude_dev` via `~/.pgpass`), Vitest (mocked-DB house style), BullMQ.

**Spec:** `docs/superpowers/specs/2026-06-12-parthenon-ecqm-handoff.md` (Parthenon handoff). This plan implements handoff steps **1, 2, 3, 5**. Step 4 (run-versioning) is deferred to the Phase 2/7 plans that need reproducible snapshots; step 6 (FHIR Measure export) is deferred as interop polish.

---

## Verified Facts (2026-06-12 — re-verify anything marked ⚠ at execution time)

These were established by direct inspection of both live databases and the codebase. **The handoff's §6.1 domain-routing table is wrong for Medgnosis** — corrected here:

| Fact | Value |
|---|---|
| Source VSAC tables | `parthenon` DB (host 127.0.0.1:5432), schema `app`: `vsac_value_sets` (1,545), `vsac_value_set_codes` (225,261), `vsac_measures` (72), `vsac_measure_value_sets` (1,597) |
| `phm_edw.condition.condition_code` | **100% SNOMED CT** (324 rows, `code_system='SNOMED'`, e.g. `224295006`). **NOT ICD-10.** Join VSAC `code_system='SNOMEDCT'`. |
| `phm_edw.procedure.procedure_code` | SNOMED CT (e.g. `23183008`). **NOT CPT.** Join VSAC `SNOMEDCT` (CPT secondary). |
| `phm_edw.medication.medication_code` | RxNorm RXCUI (e.g. `141918`). Join VSAC `RXNORM`. |
| `phm_edw.observation.observation_code` | LOINC (e.g. `2160-0`). Join VSAC `LOINC`. |
| `phm_edw.measure_definition` | 753 rows; **45 with CMS codes** (`CMS22v12`, `CMS122v12`, …, v12/v13-era). Criteria columns are free-text prose — this is what the OID bridge upgrades. |
| VSAC measure versions | v14/v15-era (`CMS122v14`, `CMS2v15`). **44 of 45** Medgnosis CMS measures match on base number; only `CMS249` has no VSAC entry. Version drift must be recorded in the bridge. |
| `dim_measure` vs `measure_definition` | `dim_measure` (399 rows, codes like `AFIB-01`) keys the star schema; `measure_definition.measure_id ≠ measure_key` — join through `dim_measure.measure_id`. |
| Exclusion semantics | **Already correct** in `measureCalculatorV2.ts`: `denominator_flag = gap_status IN ('open','closed')`, `exclusion_flag = gap_status = 'excluded'` — excluded patients are NOT in the denominator. Handoff §5.3 becomes a regression gate, not a fix. |
| `gap_status` values in live data | `open`, `closed`, `excluded` (26,967 rows in `fact_patient_bundle_detail`) |
| `dim_patient` | Has `date_of_birth DATE`, `gender VARCHAR`, SCD2 — **must filter `is_current = TRUE`** in joins or rows multiply |
| Migration runner | `packages/db/src/migrate.ts`, `npm run db:migrate` (from `packages/db/`), tracks by filename in `_migrations`, runs each file via `tx.unsafe()` in a transaction |
| ⚠ Migration numbers | This plan claims **050** and **051** — deliberately ahead of the sequence. Concurrent sessions land phases same-day (039/040 were claimed by Phase 5 within minutes of this plan's first numbering); the live `_migrations` table is the authoritative claim registry: `psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c "SELECT name FROM _migrations ORDER BY name DESC LIMIT 5;"`. Gaps are harmless — the runner sorts lexicographically and tracks full filenames. |
| Tests | Vitest, mocked DB (`vi.mock('@medgnosis/db')` with `vi.hoisted` — see `apps/api/src/services/__tests__/rulesEngine.test.ts`). Run: `npm run test -- <path>` from `apps/api/`. |
| API DB connection | `DATABASE_URL` (postgres.js, `@medgnosis/db`); API runs in Docker pointing at `host.docker.internal:5432/medgnosis` — same instance as the host-side `127.0.0.1` psql access |

**Guardrails (from project memory — non-negotiable):**
- `git branch --show-current` before EVERY commit (concurrent sessions have switched branches mid-task before).
- Additive migrations only; never touch existing tables' data. The load script must refuse to overwrite non-empty VSAC tables without an explicit `--reload` flag.
- Any jsonb written from TS goes through `sql.json(obj)` — never `JSON.stringify` first. (This plan writes no jsonb from TS, but reviewers should check.)
- `npx tsc --noEmit` before every commit. No frontend changes in this plan, so no `vite build` needed.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/db/migrations/050_vsac_value_sets.sql` | Create | DDL: 4 VSAC reference tables + `measure_value_set` bridge + indexes |
| `packages/db/scripts/load-vsac.sh` | Create | One-shot data transfer parthenon→medgnosis via `\copy` pipes + bridge seed + verification |
| `packages/db/migrations/051_measure_strata.sql` | Create | DDL: `phm_star.fact_measure_strata` |
| `apps/api/src/services/wilsonCI.ts` | Create | Pure Wilson 95% CI function |
| `apps/api/src/services/__tests__/wilsonCI.test.ts` | Create | TDD tests for the above |
| `apps/api/src/services/vsacService.ts` | Create | Value-set queries: list, codes, measure bridge resolution |
| `apps/api/src/services/__tests__/vsacService.test.ts` | Create | Mocked-DB tests |
| `apps/api/src/routes/value-sets/index.ts` | Create | Transparency endpoints (mirrors `/rules` pattern) |
| `apps/api/src/routes/index.ts` | Modify | Register `value-sets` route |
| `apps/api/src/services/measureCalculatorV2.ts` | Modify | Strata insert in refresh transaction; Wilson CIs in summary |
| `apps/api/src/routes/measures/index.ts` | Modify | Add `GET /:id/strata` |
| `apps/api/src/services/measureEvaluator.ts` | Create | `MeasureEvaluator` interface + sql/cql implementations + factory |
| `apps/api/src/services/__tests__/measureEvaluator.test.ts` | Create | Seam tests |
| `apps/api/src/workers/measure-calculator.ts` | Modify | Worker refreshes through the evaluator seam |
| `apps/api/src/routes/admin/index.ts` | Modify | Admin refresh endpoints go through the seam |
| `.env.example` | Modify | Add `MEASURE_EVALUATOR=sql` |

---

### Task 0: Branch and Preflight

**Files:** none (git + verification only)

- [ ] **Step 1: Confirm you are in the isolated worktree**

Execution happens in a git worktree so concurrent sessions on the main checkout are never disturbed. A prepared worktree exists at `/home/smudoshi/Github/Medgnosis/.claude/worktrees/feature+cds-vsac-value-sets` on branch `feature/cds-vsac-value-sets` (based on origin/main `d32acf7`).

```bash
git branch --show-current      # MUST print: feature/cds-vsac-value-sets
git rev-parse --show-toplevel  # MUST print a path containing .claude/worktrees/
```

If the worktree is gone (fresh execution later), recreate it — do NOT check out branches in the main checkout:

```bash
cd /home/smudoshi/Github/Medgnosis && git fetch origin
git worktree add .claude/worktrees/feature+cds-vsac-value-sets -b feature/cds-vsac-value-sets origin/main
cd .claude/worktrees/feature+cds-vsac-value-sets
```

- [ ] **Step 2: Confirm migration numbering is free**

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c "SELECT name FROM _migrations WHERE name >= '050' ORDER BY name;"
git log --all --oneline -- 'packages/db/migrations/050*' 'packages/db/migrations/051*'
```

Expected: only this plan's own files (`050_vsac_value_sets.sql`, `051_measure_strata.sql`) or nothing. If another session claimed 050/051, renumber every reference throughout this plan AND `UPDATE _migrations SET name=...` for any already-applied file you rename.

- [ ] **Step 3: Confirm source data is reachable**

```bash
psql -h 127.0.0.1 -U claude_dev -d parthenon -At -c \
  "SELECT count(*) FROM app.vsac_value_set_codes;"
```

Expected: `225261`. (Collation-mismatch WARNINGs from the parthenon DB are known noise — ignore.)

---

### Task 1: Migration 050 — VSAC Reference Tables + Measure Bridge

**Files:**
- Create: `packages/db/migrations/050_vsac_value_sets.sql`

Naming follows Medgnosis house style (singular table names — `condition`, `measure_definition`), so Parthenon's `app.vsac_value_sets` becomes `phm_edw.vsac_value_set`, etc.

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- 050: VSAC value sets + measure bridge (Parthenon eCQM handoff, steps 1-2)
-- CMS-versioned value sets replace hand-typed code lists. One OID carries
-- thousands of codes across code systems; re-ingesting a new VSAC release
-- updates every measure at once.
-- Source: NLM VSAC via Parthenon ingest (app.vsac_* on this host's parthenon DB).
-- Data loaded by packages/db/scripts/load-vsac.sh — NOT by this migration.
-- =============================================================================

CREATE TABLE phm_edw.vsac_value_set (
  value_set_oid          VARCHAR(120) PRIMARY KEY,
  name                   VARCHAR(500) NOT NULL,
  definition_version     VARCHAR(50),
  expansion_version      VARCHAR(120),
  expansion_id           VARCHAR(50),
  qdm_category           VARCHAR(120),
  purpose_clinical_focus TEXT,
  purpose_data_scope     TEXT,
  purpose_inclusion      TEXT,
  purpose_exclusion      TEXT,
  source_files           JSONB NOT NULL DEFAULT '[]'::jsonb,
  ingested_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vsac_vs_name ON phm_edw.vsac_value_set (name);

COMMENT ON TABLE phm_edw.vsac_value_set IS
  'NLM VSAC value sets (one row per OID). CMS-versioned, authoritative code groupings.';

CREATE TABLE phm_edw.vsac_value_set_code (
  id                  BIGSERIAL PRIMARY KEY,
  value_set_oid       VARCHAR(120) NOT NULL
                      REFERENCES phm_edw.vsac_value_set (value_set_oid) ON DELETE CASCADE,
  code                VARCHAR(100) NOT NULL,
  description         TEXT,
  code_system         VARCHAR(80) NOT NULL,
  code_system_oid     VARCHAR(120),
  code_system_version VARCHAR(50),
  CONSTRAINT uq_vsac_vsc_oid_code_sys UNIQUE (value_set_oid, code, code_system)
);

CREATE INDEX idx_vsac_vsc_oid      ON phm_edw.vsac_value_set_code (value_set_oid);
CREATE INDEX idx_vsac_vsc_sys_code ON phm_edw.vsac_value_set_code (code_system, code);

COMMENT ON TABLE phm_edw.vsac_value_set_code IS
  'Flattened VSAC expansions. code_system values: SNOMEDCT, ICD10CM, ICD10PCS, LOINC, RXNORM, CPT, HCPCS Level II, CVX, CDT, ... EDW joins: condition/procedure->SNOMEDCT, medication->RXNORM, observation->LOINC.';

CREATE TABLE phm_edw.vsac_measure (
  cms_id            VARCHAR(50) PRIMARY KEY,
  cbe_number        VARCHAR(50),
  program_candidate VARCHAR(50),
  title             VARCHAR(500),
  expansion_version VARCHAR(120),
  ingested_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE phm_edw.vsac_measure IS
  'CMS eCQM registry rows from the VSAC measure workbooks (e.g. CMS122v14).';

CREATE TABLE phm_edw.vsac_measure_value_set (
  cms_id        VARCHAR(50)  NOT NULL
                REFERENCES phm_edw.vsac_measure (cms_id) ON DELETE CASCADE,
  value_set_oid VARCHAR(120) NOT NULL
                REFERENCES phm_edw.vsac_value_set (value_set_oid) ON DELETE CASCADE,
  PRIMARY KEY (cms_id, value_set_oid)
);

CREATE INDEX idx_vsac_mvs_oid ON phm_edw.vsac_measure_value_set (value_set_oid);

-- Bridge: local measure definitions -> VSAC value sets.
-- vsac_cms_id records WHICH VSAC measure version supplied the mapping
-- (local CMS122v12 vs VSAC CMS122v14 — version drift is explicit, not hidden).
CREATE TABLE phm_edw.measure_value_set (
  measure_id     INT          NOT NULL
                 REFERENCES phm_edw.measure_definition (measure_id),
  value_set_oid  VARCHAR(120) NOT NULL
                 REFERENCES phm_edw.vsac_value_set (value_set_oid),
  vsac_cms_id    VARCHAR(50)  NOT NULL,
  mapping_method VARCHAR(30)  NOT NULL DEFAULT 'cms_base_auto',
  created_date   TIMESTAMP    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (measure_id, value_set_oid)
);

CREATE INDEX idx_mvs_oid ON phm_edw.measure_value_set (value_set_oid);

COMMENT ON TABLE phm_edw.measure_value_set IS
  'Bridge: measure_definition -> VSAC value-set OIDs, auto-matched on base CMS number (CMS122v12 ~ CMS122v14). mapping_method: cms_base_auto | manual.';
```

- [ ] **Step 2: Run the migration**

```bash
cd "$(git rev-parse --show-toplevel)/packages/db" && npm run db:migrate
```

Expected output includes: `050_vsac_value_sets.sql` applied (and nothing else fails).

- [ ] **Step 3: Verify the tables exist and are empty**

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c \
  "SELECT table_name FROM information_schema.tables
   WHERE table_schema='phm_edw' AND table_name LIKE 'vsac%' OR (table_schema='phm_edw' AND table_name='measure_value_set')
   ORDER BY 1;"
```

Expected: `measure_value_set`, `vsac_measure`, `vsac_measure_value_set`, `vsac_value_set`, `vsac_value_set_code`.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # verify: feature/cds-vsac-value-sets
git add packages/db/migrations/050_vsac_value_sets.sql
git commit -m "feat: VSAC value set reference tables + measure bridge (migration 050)"
```

---

### Task 2: VSAC Data Load Script

**Files:**
- Create: `packages/db/scripts/load-vsac.sh`

`\copy ... TO STDOUT | \copy ... FROM STDIN` per table — no `pg_dump`+`sed` (schema-rename via sed risks corrupting data rows; explicit column lists can't). FK order: value sets → codes, measures → measure-value-sets. The `id` column of the codes table is regenerated by the destination BIGSERIAL (no setval dance).

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# =============================================================================
# load-vsac.sh — one-shot transfer of VSAC reference data
#   parthenon app.vsac_* (plural)  ->  medgnosis phm_edw.vsac_* (singular)
# then seeds the measure_value_set bridge by base-CMS-number match.
#
# Both DBs live on the same host PG17 instance; auth via ~/.pgpass.
# Refuses to touch non-empty destination tables unless --reload is given.
# =============================================================================
set -euo pipefail

SRC_HOST="${VSAC_SRC_HOST:-127.0.0.1}"
SRC_DB="${VSAC_SRC_DB:-parthenon}"
DST_HOST="${VSAC_DST_HOST:-127.0.0.1}"
DST_DB="${VSAC_DST_DB:-medgnosis}"
PGUSER="${PGUSER:-claude_dev}"

SRC=(psql -h "$SRC_HOST" -U "$PGUSER" -d "$SRC_DB" -v ON_ERROR_STOP=1 -qAt)
DST=(psql -h "$DST_HOST" -U "$PGUSER" -d "$DST_DB" -v ON_ERROR_STOP=1 -qAt)

existing=$("${DST[@]}" -c "SELECT count(*) FROM phm_edw.vsac_value_set;")
if [[ "$existing" != "0" ]]; then
  if [[ "${1:-}" == "--reload" ]]; then
    echo "Reloading: truncating phm_edw VSAC tables (bridge included)..."
    "${DST[@]}" -c "TRUNCATE phm_edw.measure_value_set, phm_edw.vsac_measure_value_set,
                    phm_edw.vsac_measure, phm_edw.vsac_value_set_code, phm_edw.vsac_value_set;"
  else
    echo "ERROR: phm_edw.vsac_value_set already has $existing rows. Re-run with --reload to replace." >&2
    exit 1
  fi
fi

copy_table() {  # $1 src table  $2 dst table  $3 column list
  echo "Copying $1 -> $2 ..."
  "${SRC[@]}" -c "\\copy (SELECT $3 FROM $1) TO STDOUT" \
    | "${DST[@]}" -c "\\copy $2 ($3) FROM STDIN"
}

copy_table app.vsac_value_sets phm_edw.vsac_value_set \
  "value_set_oid, name, definition_version, expansion_version, expansion_id, qdm_category, purpose_clinical_focus, purpose_data_scope, purpose_inclusion, purpose_exclusion, source_files, ingested_at"

copy_table app.vsac_value_set_codes phm_edw.vsac_value_set_code \
  "value_set_oid, code, description, code_system, code_system_oid, code_system_version"

copy_table app.vsac_measures phm_edw.vsac_measure \
  "cms_id, cbe_number, program_candidate, title, expansion_version, ingested_at"

copy_table app.vsac_measure_value_sets phm_edw.vsac_measure_value_set \
  "cms_id, value_set_oid"

echo "Seeding measure_value_set bridge (base CMS number match)..."
"${DST[@]}" <<'SQL'
INSERT INTO phm_edw.measure_value_set (measure_id, value_set_oid, vsac_cms_id, mapping_method)
SELECT md.measure_id, mvs.value_set_oid, vm.cms_id, 'cms_base_auto'
FROM phm_edw.measure_definition md
JOIN phm_edw.vsac_measure vm
  ON regexp_replace(md.measure_code, 'v[0-9]+$', '')
   = regexp_replace(vm.cms_id,       'v[0-9]+$', '')
JOIN phm_edw.vsac_measure_value_set mvs ON mvs.cms_id = vm.cms_id
WHERE md.measure_code ~ '^CMS' AND md.active_ind = 'Y'
ON CONFLICT (measure_id, value_set_oid) DO NOTHING;
SQL

echo "--- Verification ---"
"${DST[@]}" <<'SQL'
SELECT 'vsac_value_set        expect 1545  got ' || count(*) FROM phm_edw.vsac_value_set;
SELECT 'vsac_value_set_code   expect 225261 got ' || count(*) FROM phm_edw.vsac_value_set_code;
SELECT 'vsac_measure          expect 72    got ' || count(*) FROM phm_edw.vsac_measure;
SELECT 'vsac_measure_value_set expect 1597 got ' || count(*) FROM phm_edw.vsac_measure_value_set;
SELECT 'bridged measures      expect 44    got ' || count(DISTINCT measure_id) FROM phm_edw.measure_value_set;
SELECT 'unbridged CMS measures (expect CMS249v6 only): '
       || coalesce(string_agg(measure_code, ', '), '(none)')
FROM phm_edw.measure_definition md
WHERE md.measure_code ~ '^CMS' AND md.active_ind = 'Y'
  AND NOT EXISTS (SELECT 1 FROM phm_edw.measure_value_set b WHERE b.measure_id = md.measure_id);
SQL
echo "Done."
```

- [ ] **Step 2: Make it executable and run it**

```bash
cd "$(git rev-parse --show-toplevel)"
chmod +x packages/db/scripts/load-vsac.sh
./packages/db/scripts/load-vsac.sh
```

Expected verification block:
- `vsac_value_set` 1545, `vsac_value_set_code` 225261, `vsac_measure` 72, `vsac_measure_value_set` 1597
- `bridged measures` 44
- unbridged list: exactly `CMS249v6`

- [ ] **Step 3: EDW joinability spot checks (handoff §8: prove VSAC codes actually hit real EDW codes)**

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At <<'EOF'
SELECT 'conditions hit: ' || count(DISTINCT c.condition_code)
FROM phm_edw.condition c
JOIN phm_edw.vsac_value_set_code vc
  ON vc.code = c.condition_code AND vc.code_system = 'SNOMEDCT';
SELECT 'medications hit: ' || count(DISTINCT m.medication_code)
FROM phm_edw.medication m
JOIN phm_edw.vsac_value_set_code vc
  ON vc.code = m.medication_code AND vc.code_system = 'RXNORM';
SELECT 'observations hit: ' || count(DISTINCT o.observation_code)
FROM phm_edw.observation o
JOIN phm_edw.vsac_value_set_code vc
  ON vc.code = o.observation_code AND vc.code_system = 'LOINC';
EOF
```

Expected: every count > 0. Record the actual numbers in the commit message. If any is 0, STOP — the code-format assumption broke; investigate before continuing.

- [ ] **Step 4: Spot-check one OID against the VSAC website (handoff §8)**

Pick the Diabetes value set bridged to CMS122:

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c \
 "SELECT vs.value_set_oid, vs.name, count(*)
  FROM phm_edw.measure_value_set mv
  JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
  JOIN phm_edw.vsac_value_set vs ON vs.value_set_oid = mv.value_set_oid
  JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = vs.value_set_oid
  WHERE md.measure_code = 'CMS122v12' AND vs.name ILIKE '%diabetes%'
  GROUP BY 1,2 ORDER BY 3 DESC LIMIT 3;"
```

Manually confirm one OID + code count at https://vsac.nlm.nih.gov (requires UMLS login; if no login available, diff the counts against the parthenon source instead — they must be identical).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # verify: feature/cds-vsac-value-sets
git add packages/db/scripts/load-vsac.sh
git commit -m "feat: VSAC data load script (parthenon -> medgnosis, 225k codes + bridge seed)"
```

---

### Task 3: Wilson CI Utility (TDD)

**Files:**
- Create: `apps/api/src/services/wilsonCI.ts`
- Test: `apps/api/src/services/__tests__/wilsonCI.test.ts`

Pure math — real TDD, no mocks. Wilson score interval: panels here are small (hundreds, not Parthenon's 100k floor), so we always SHOW the CI rather than gating on population size.

- [ ] **Step 1: Write the failing test**

```typescript
// =============================================================================
// Unit tests — Wilson 95% confidence interval
// Reference values cross-checked against R: binom::binom.wilson()
// =============================================================================

import { describe, it, expect } from 'vitest';
import { wilsonCI } from '../wilsonCI.js';

describe('wilsonCI', () => {
  it('computes the textbook 50/100 interval', () => {
    const ci = wilsonCI(50, 100);
    expect(ci.lower).toBeCloseTo(0.4038, 3);
    expect(ci.upper).toBeCloseTo(0.5962, 3);
  });

  it('handles a perfect rate without exceeding 1', () => {
    const ci = wilsonCI(10, 10);
    expect(ci.lower).toBeCloseTo(0.7225, 3);
    expect(ci.upper).toBeLessThanOrEqual(1);
    expect(ci.upper).toBeCloseTo(1.0, 3);
  });

  it('handles a zero rate without going below 0', () => {
    const ci = wilsonCI(0, 10);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.lower).toBeCloseTo(0, 3);
    expect(ci.upper).toBeCloseTo(0.2775, 3);
  });

  it('returns a degenerate interval for an empty denominator', () => {
    expect(wilsonCI(0, 0)).toEqual({ lower: 0, upper: 0 });
  });

  it('narrows as n grows', () => {
    const small = wilsonCI(5, 10);
    const large = wilsonCI(500, 1000);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "$(git rev-parse --show-toplevel)/apps/api"
npm run test -- src/services/__tests__/wilsonCI.test.ts
```

Expected: FAIL — `Cannot find module '../wilsonCI.js'`.

- [ ] **Step 3: Write the implementation**

```typescript
// =============================================================================
// Wilson score interval for a binomial proportion (95% by default).
// Preferred over the normal approximation for the small panels Medgnosis
// serves — it never produces bounds outside [0, 1] and behaves at p near 0/1.
// =============================================================================

export interface WilsonInterval {
  lower: number;
  upper: number;
}

export function wilsonCI(numerator: number, denominator: number, z = 1.96): WilsonInterval {
  if (denominator <= 0) {
    return { lower: 0, upper: 0 };
  }
  const p = numerator / denominator;
  const z2 = z * z;
  const factor = 1 + z2 / denominator;
  const center = (p + z2 / (2 * denominator)) / factor;
  const half =
    (z * Math.sqrt((p * (1 - p)) / denominator + z2 / (4 * denominator * denominator))) / factor;
  return {
    lower: Math.max(0, center - half),
    upper: Math.min(1, center + half),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- src/services/__tests__/wilsonCI.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/api/src/services/wilsonCI.ts apps/api/src/services/__tests__/wilsonCI.test.ts
git commit -m "feat: Wilson 95% CI utility for measure rates"
```

---

### Task 4: VSAC Service (TDD, mocked DB)

**Files:**
- Create: `apps/api/src/services/vsacService.ts`
- Test: `apps/api/src/services/__tests__/vsacService.test.ts`

Mock style copied from `rulesEngine.test.ts` (`vi.hoisted` + `vi.mock('@medgnosis/db')`).

- [ ] **Step 1: Write the failing test**

```typescript
// =============================================================================
// Unit tests — VSAC value set service
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type SqlRow = Record<string, unknown>;

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>>();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, {
    unsafe: vi.fn().mockResolvedValue([]),
  }),
}));

import {
  listValueSets,
  getValueSetCodes,
  getMeasureValueSets,
  resolveMeasureCodes,
  EDW_CODE_SYSTEM,
} from '../vsacService.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

describe('EDW_CODE_SYSTEM', () => {
  it('routes EDW domains to the verified VSAC code systems', () => {
    // condition/procedure are SNOMED in phm_edw (verified 2026-06-12) — NOT ICD-10/CPT
    expect(EDW_CODE_SYSTEM.condition).toBe('SNOMEDCT');
    expect(EDW_CODE_SYSTEM.procedure).toBe('SNOMEDCT');
    expect(EDW_CODE_SYSTEM.medication).toBe('RXNORM');
    expect(EDW_CODE_SYSTEM.observation).toBe('LOINC');
  });
});

describe('listValueSets', () => {
  it('returns value set summaries', async () => {
    mockSql.mockResolvedValueOnce([
      { value_set_oid: '2.16.840.1.113883.3.464.1003.103.12.1001', name: 'Diabetes', qdm_category: 'Condition', code_count: 120 },
    ]);
    const result = await listValueSets();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Diabetes');
  });
});

describe('getValueSetCodes', () => {
  // NOTE: call WITHOUT codeSystem here. With it, the nested sql`` fragment
  // fires an extra mock call that consumes mockResolvedValueOnce before the
  // outer query runs — the mock can't distinguish fragments from queries.
  it('returns the codes for an OID', async () => {
    mockSql.mockResolvedValueOnce([
      { code: '44054006', description: 'Diabetes mellitus type 2', code_system: 'SNOMEDCT' },
    ]);
    const codes = await getValueSetCodes('2.16.840.1.113883.3.464.1003.103.12.1001');
    expect(codes).toEqual([
      { code: '44054006', description: 'Diabetes mellitus type 2', code_system: 'SNOMEDCT' },
    ]);
    const values = mockSql.mock.calls[0]?.slice(1) ?? [];
    expect(values).toContain('2.16.840.1.113883.3.464.1003.103.12.1001');
  });

  it('does not throw when a code-system filter is supplied', async () => {
    await expect(
      getValueSetCodes('2.16.840.1.113883.3.464.1003.103.12.1001', 'SNOMEDCT'),
    ).resolves.toEqual([]);
  });
});

describe('getMeasureValueSets', () => {
  it('returns bridged value sets for a measure code', async () => {
    mockSql.mockResolvedValueOnce([
      { value_set_oid: '2.16...', name: 'Diabetes', vsac_cms_id: 'CMS122v14', qdm_category: 'Condition', code_count: 120 },
    ]);
    const result = await getMeasureValueSets('CMS122v12');
    expect(result[0]?.vsac_cms_id).toBe('CMS122v14');
  });
});

describe('resolveMeasureCodes', () => {
  it('flattens code rows to a string array', async () => {
    mockSql.mockResolvedValueOnce([{ code: '44054006' }, { code: '73211009' }]);
    const codes = await resolveMeasureCodes('CMS122v12', 'SNOMEDCT');
    expect(codes).toEqual(['44054006', '73211009']);
  });

  it('returns an empty array for an unbridged measure', async () => {
    const codes = await resolveMeasureCodes('CMS249v6', 'SNOMEDCT');
    expect(codes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "$(git rev-parse --show-toplevel)/apps/api"
npm run test -- src/services/__tests__/vsacService.test.ts
```

Expected: FAIL — `Cannot find module '../vsacService.js'`.

- [ ] **Step 3: Write the implementation**

```typescript
// =============================================================================
// Medgnosis API — VSAC value set service
// Reads phm_edw.vsac_* reference tables and the measure_value_set bridge.
// resolveMeasureCodes() is the workhorse: every code of one code system across
// all value sets bridged to a measure — what evaluators and the population
// finder consume instead of hand-typed code lists.
// =============================================================================

import { sql } from '@medgnosis/db';

// phm_edw code-column reality (verified 2026-06-12): condition and procedure
// are SNOMED-coded — the Parthenon handoff's ICD-10/CPT routing does not apply.
export const EDW_CODE_SYSTEM = {
  condition: 'SNOMEDCT',
  procedure: 'SNOMEDCT',
  medication: 'RXNORM',
  observation: 'LOINC',
} as const;

export type EdwDomain = keyof typeof EDW_CODE_SYSTEM;

export interface ValueSetSummary {
  value_set_oid: string;
  name: string;
  qdm_category: string | null;
  code_count: number;
}

export interface ValueSetCode {
  code: string;
  description: string | null;
  code_system: string;
}

export interface MeasureValueSet {
  value_set_oid: string;
  name: string;
  vsac_cms_id: string;
  qdm_category: string | null;
  code_count: number;
}

export async function listValueSets(search?: string): Promise<ValueSetSummary[]> {
  return sql<ValueSetSummary[]>`
    SELECT
      vs.value_set_oid,
      vs.name,
      vs.qdm_category,
      COUNT(vc.id)::int AS code_count
    FROM phm_edw.vsac_value_set vs
    LEFT JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = vs.value_set_oid
    ${search ? sql`WHERE vs.name ILIKE ${'%' + search + '%'}` : sql``}
    GROUP BY vs.value_set_oid, vs.name, vs.qdm_category
    ORDER BY vs.name
  `;
}

export async function getValueSetCodes(
  oid: string,
  codeSystem?: string,
): Promise<ValueSetCode[]> {
  return sql<ValueSetCode[]>`
    SELECT vc.code, vc.description, vc.code_system
    FROM phm_edw.vsac_value_set_code vc
    WHERE vc.value_set_oid = ${oid}
    ${codeSystem ? sql`AND vc.code_system = ${codeSystem}` : sql``}
    ORDER BY vc.code_system, vc.code
  `;
}

export async function getMeasureValueSets(measureCode: string): Promise<MeasureValueSet[]> {
  return sql<MeasureValueSet[]>`
    SELECT
      vs.value_set_oid,
      vs.name,
      mv.vsac_cms_id,
      vs.qdm_category,
      COUNT(vc.id)::int AS code_count
    FROM phm_edw.measure_value_set mv
    JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
    JOIN phm_edw.vsac_value_set vs ON vs.value_set_oid = mv.value_set_oid
    LEFT JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = vs.value_set_oid
    WHERE md.measure_code = ${measureCode}
    GROUP BY vs.value_set_oid, vs.name, mv.vsac_cms_id, vs.qdm_category
    ORDER BY vs.name
  `;
}

export async function resolveMeasureCodes(
  measureCode: string,
  codeSystem: string,
): Promise<string[]> {
  const rows = await sql<{ code: string }[]>`
    SELECT DISTINCT vc.code
    FROM phm_edw.measure_value_set mv
    JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
    JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = mv.value_set_oid
    WHERE md.measure_code = ${measureCode}
      AND vc.code_system = ${codeSystem}
    ORDER BY vc.code
  `;
  return rows.map((r) => r.code);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- src/services/__tests__/vsacService.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add apps/api/src/services/vsacService.ts apps/api/src/services/__tests__/vsacService.test.ts
git commit -m "feat: VSAC service — value set queries + measure code resolution"
```

---

### Task 5: Value Sets Transparency Routes

**Files:**
- Create: `apps/api/src/routes/value-sets/index.ts`
- Modify: `apps/api/src/routes/index.ts`

Mirrors the `/rules` transparency pattern ("transparency → trust").

- [ ] **Step 1: Write the route file**

```typescript
// =============================================================================
// Medgnosis API — VSAC value set transparency routes
// Show the authoritative CMS code lists behind any measure. Read-only.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import {
  listValueSets,
  getValueSetCodes,
  getMeasureValueSets,
} from '../../services/vsacService.js';

export default async function valueSetRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /value-sets?search= — catalog with code counts
  fastify.get<{ Querystring: { search?: string } }>('/', async (request, reply) => {
    const valueSets = await listValueSets(request.query.search);
    return reply.send({ success: true, data: valueSets });
  });

  // GET /value-sets/measure/:measureCode — value sets bridged to a measure
  // (registered before /:oid so "measure" is not swallowed as an OID)
  fastify.get<{ Params: { measureCode: string } }>(
    '/measure/:measureCode',
    async (request, reply) => {
      const valueSets = await getMeasureValueSets(request.params.measureCode);
      if (valueSets.length === 0) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `No value sets bridged to measure ${request.params.measureCode}`,
          },
        });
      }
      return reply.send({ success: true, data: valueSets });
    },
  );

  // GET /value-sets/:oid/codes?code_system= — the flattened expansion
  fastify.get<{
    Params: { oid: string };
    Querystring: { code_system?: string };
  }>('/:oid/codes', async (request, reply) => {
    const codes = await getValueSetCodes(request.params.oid, request.query.code_system);
    if (codes.length === 0) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `No codes for value set ${request.params.oid}${
            request.query.code_system ? ` in ${request.query.code_system}` : ''
          }`,
        },
      });
    }
    return reply.send({ success: true, data: codes });
  });
}
```

- [ ] **Step 2: Register the route**

In `apps/api/src/routes/index.ts`, add the import after line 22 (`import rulesRoutes ...`):

```typescript
import valueSetRoutes from './value-sets/index.js';
```

and inside the versioned-API register block, after the `rulesRoutes` line:

```typescript
      await api.register(valueSetRoutes, { prefix: '/value-sets' });
```

- [ ] **Step 3: Typecheck and smoke-test**

```bash
cd "$(git rev-parse --show-toplevel)/apps/api" && npx tsc --noEmit
```

Expected: clean. Then verify against the running API (adjust port to the running instance; auth uses the superuser test account — see project memory `reference_admin_credentials`):

```bash
# from repo root — token shape is data.tokens (snake_case)
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acumenus.net","password":"<from memory>"}' \
  | jq -r '.data.tokens.access_token')
curl -s "http://localhost:3001/api/v1/value-sets?search=diabetes" -H "Authorization: Bearer $TOKEN" | jq '.data | length'
curl -s "http://localhost:3001/api/v1/value-sets/measure/CMS122v12" -H "Authorization: Bearer $TOKEN" | jq '.data | length'
```

Expected: both > 0.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add apps/api/src/routes/value-sets/index.ts apps/api/src/routes/index.ts
git commit -m "feat: value-sets transparency endpoints (/value-sets, /measure/:code, /:oid/codes)"
```

---

### Task 6: Measure Strata — Migration 051 + GROUPING SETS + Wilson CIs

**Files:**
- Create: `packages/db/migrations/051_measure_strata.sql`
- Modify: `apps/api/src/services/measureCalculatorV2.ts`

Single-pass GROUPING SETS (handoff §5.1): classify each (patient, measure) row once, produce headline + age + sex strata in one scan, inside the SAME refresh transaction so facts and strata can never diverge.

- [ ] **Step 1: Write migration 051**

```sql
-- =============================================================================
-- 051: Measure stratification facts (CDS parity — calculator hardening)
-- Populated by measureCalculatorV2 in the same transaction as
-- fact_measure_result, via single-pass GROUPING SETS (one scan -> headline
-- 'all' row + age_band strata + gender strata per measure).
-- =============================================================================

CREATE TABLE phm_star.fact_measure_strata (
  strata_key      SERIAL PRIMARY KEY,
  measure_key     INT NOT NULL
                  REFERENCES phm_star.dim_measure (measure_key) ON DELETE RESTRICT,
  date_key_period INT,
  dimension       VARCHAR(20) NOT NULL,  -- 'all' | 'age_band' | 'gender'
  stratum         VARCHAR(50) NOT NULL,  -- 'all' | '<18' | '18-39' | '40-64' | '65+' | gender values
  denominator     INT NOT NULL DEFAULT 0,
  numerator       INT NOT NULL DEFAULT 0,
  excluded        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fms_measure ON phm_star.fact_measure_strata (measure_key, dimension);

COMMENT ON TABLE phm_star.fact_measure_strata IS
  'Per-measure strata (eCQM accounting: excluded removed from denominator AND numerator). Rebuilt with fact_measure_result each refresh.';
```

- [ ] **Step 2: Run the migration**

```bash
cd "$(git rev-parse --show-toplevel)/packages/db" && npm run db:migrate
```

Expected: `051_measure_strata.sql` applied.

- [ ] **Step 3: Extend the refresh transaction and add CIs to the summary**

Replace the full contents of `apps/api/src/services/measureCalculatorV2.ts` with:

```typescript
// =============================================================================
// Medgnosis API — Measure Calculator v2
// Aggregates fact_patient_bundle_detail → fact_measure_result + strata.
// Replaces the old measureEngine.ts (45 broken SQL files).
//
// eCQM accounting (CMS semantics — regression-gated, do not weaken):
//   denominator = gap_status IN ('open','closed')   — excluded NOT in denom
//   numerator   = gap_status = 'closed'             — subset of denominator
//   excluded    = gap_status = 'excluded'           — in NEITHER denom NOR numer
// =============================================================================

import { sql } from '@medgnosis/db';
import { wilsonCI } from './wilsonCI.js';

export interface RefreshResult {
  rowCount: number;
  durationMs: number;
}

export interface MeasureSummaryRow {
  measure_key: number;
  measure_code: string;
  measure_name: string;
  eligible: number;
  met: number;
  excluded: number;
  performance_rate: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
}

/**
 * Refresh fact_measure_result AND fact_measure_strata in one transaction —
 * a failed INSERT rolls back both TRUNCATEs; facts and strata never diverge.
 * SET LOCAL scopes the statement timeout to the transaction — no pool leak.
 */
export async function refreshMeasureResults(): Promise<RefreshResult> {
  const t0 = performance.now();

  const result = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL statement_timeout = '60s'");
    await tx.unsafe('TRUNCATE phm_star.fact_measure_result');
    const inserted = await tx.unsafe(`
      INSERT INTO phm_star.fact_measure_result
        (patient_key, measure_key, date_key_period,
         denominator_flag, numerator_flag, exclusion_flag,
         measure_value, count_measure)
      SELECT
        d.patient_key,
        d.measure_key,
        (SELECT date_key FROM phm_star.dim_date WHERE full_date = CURRENT_DATE),
        LOWER(d.gap_status) IN ('open', 'closed'),
        LOWER(d.gap_status) = 'closed',
        LOWER(d.gap_status) = 'excluded',
        NULL,
        1
      FROM phm_star.fact_patient_bundle_detail d
    `);

    // Single-pass stratification: GROUPING(a, b) sets a bit per UN-grouped
    // column, so () -> 3 = headline, (age_band) -> 1, (gender) -> 2.
    await tx.unsafe('TRUNCATE phm_star.fact_measure_strata');
    await tx.unsafe(`
      INSERT INTO phm_star.fact_measure_strata
        (measure_key, date_key_period, dimension, stratum,
         denominator, numerator, excluded)
      SELECT
        c.measure_key,
        c.date_key_period,
        CASE GROUPING(c.age_band, c.gender)
          WHEN 3 THEN 'all'
          WHEN 1 THEN 'age_band'
          WHEN 2 THEN 'gender'
        END,
        CASE GROUPING(c.age_band, c.gender)
          WHEN 3 THEN 'all'
          WHEN 1 THEN c.age_band
          WHEN 2 THEN c.gender
        END,
        COUNT(*) FILTER (WHERE c.denominator_flag)::int,
        COUNT(*) FILTER (WHERE c.numerator_flag)::int,
        COUNT(*) FILTER (WHERE c.exclusion_flag)::int
      FROM (
        SELECT
          fmr.measure_key,
          fmr.date_key_period,
          CASE
            WHEN dp.date_of_birth IS NULL THEN 'unknown'
            WHEN dp.date_of_birth > CURRENT_DATE - INTERVAL '18 years' THEN '<18'
            WHEN dp.date_of_birth > CURRENT_DATE - INTERVAL '40 years' THEN '18-39'
            WHEN dp.date_of_birth > CURRENT_DATE - INTERVAL '65 years' THEN '40-64'
            ELSE '65+'
          END AS age_band,
          COALESCE(NULLIF(TRIM(dp.gender), ''), 'unknown') AS gender,
          fmr.denominator_flag,
          fmr.numerator_flag,
          fmr.exclusion_flag
        FROM phm_star.fact_measure_result fmr
        JOIN phm_star.dim_patient dp
          ON dp.patient_key = fmr.patient_key AND dp.is_current
      ) c
      GROUP BY GROUPING SETS (
        (c.measure_key, c.date_key_period),
        (c.measure_key, c.date_key_period, c.age_band),
        (c.measure_key, c.date_key_period, c.gender)
      )
    `);

    return inserted;
  });

  const durationMs = Math.round(performance.now() - t0);
  const rowCount = result.count ?? 0;

  console.info(`[measure-calc-v2] Refreshed fact_measure_result: ${rowCount} rows in ${durationMs}ms`);
  return { rowCount, durationMs };
}

/**
 * Per-measure performance summary with Wilson 95% CIs (percent, 1 decimal).
 * Small panels always show the interval — never gate on population size.
 */
export async function getMeasureSummary(): Promise<MeasureSummaryRow[]> {
  const rows = await sql<Omit<MeasureSummaryRow, 'ci_lower' | 'ci_upper'>[]>`
    SELECT
      dm.measure_key,
      dm.measure_code,
      dm.measure_name,
      COUNT(*) FILTER (WHERE fmr.denominator_flag)::int AS eligible,
      COUNT(*) FILTER (WHERE fmr.numerator_flag)::int AS met,
      COUNT(*) FILTER (WHERE fmr.exclusion_flag)::int AS excluded,
      ROUND(
        COUNT(*) FILTER (WHERE fmr.numerator_flag)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE fmr.denominator_flag), 0) * 100, 1
      ) AS performance_rate
    FROM phm_star.fact_measure_result fmr
    JOIN phm_star.dim_measure dm ON dm.measure_key = fmr.measure_key
    GROUP BY dm.measure_key, dm.measure_code, dm.measure_name
    ORDER BY dm.measure_code
  `;

  return rows.map((row) => {
    if (row.eligible <= 0) {
      return { ...row, ci_lower: null, ci_upper: null };
    }
    const ci = wilsonCI(row.met, row.eligible);
    return {
      ...row,
      ci_lower: Math.round(ci.lower * 1000) / 10,
      ci_upper: Math.round(ci.upper * 1000) / 10,
    };
  });
}
```

- [ ] **Step 4: Typecheck**

```bash
cd "$(git rev-parse --show-toplevel)/apps/api" && npx tsc --noEmit
```

Expected: clean. (House note: changing `MeasureSummaryRow` requires updating any test asserting the old shape — as of writing there are none; verify with `grep -rn getMeasureSummary apps/api/src --include='*.test.ts'`.)

- [ ] **Step 5: Run the refresh against the live DB and verify**

```bash
cd "$(git rev-parse --show-toplevel)/apps/api"
# postgres.js does NOT read ~/.pgpass — extract the password into PGPASSWORD
# (pgpass line format: host:port:db:user:password; claude_dev uses a wildcard entry)
PGPASSWORD="$(awk -F: '$4=="claude_dev" {print $5; exit}' ~/.pgpass)" \
DATABASE_URL="postgres://claude_dev@127.0.0.1:5432/medgnosis" npx tsx -e "
import('./src/services/measureCalculatorV2.ts').then(async (m) => {
  console.log(await m.refreshMeasureResults());
  process.exit(0);
});"
```

(Never paste the password itself into any committed file or shell history; the `awk` extraction keeps it out of both.)

Then verify strata + eCQM accounting (handoff §8 exclusion test):

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At <<'EOF'
-- 1. Strata exist for all three dimensions
SELECT 'dimensions: ' || string_agg(DISTINCT dimension, ', ' ORDER BY dimension) FROM phm_star.fact_measure_strata;
-- 2. REGRESSION GATE: no row is simultaneously excluded and in denom/numer
SELECT 'violations (expect 0): ' || count(*) FROM phm_star.fact_measure_result
WHERE exclusion_flag AND (denominator_flag OR numerator_flag);
-- 3. Headline strata reconcile with the fact table for every measure
SELECT 'mismatches (expect 0): ' || count(*) FROM (
  SELECT s.measure_key
  FROM phm_star.fact_measure_strata s
  JOIN (
    SELECT measure_key,
           COUNT(*) FILTER (WHERE denominator_flag)::int AS denom,
           COUNT(*) FILTER (WHERE numerator_flag)::int  AS numer,
           COUNT(*) FILTER (WHERE exclusion_flag)::int  AS excl
    FROM phm_star.fact_measure_result GROUP BY measure_key
  ) f ON f.measure_key = s.measure_key
  WHERE s.dimension = 'all'
    AND (s.denominator <> f.denom OR s.numerator <> f.numer OR s.excluded <> f.excl)
) x;
EOF
```

Expected: `dimensions: age_band, all, gender`, `violations (expect 0): 0`, `mismatches (expect 0): 0`. Also note the refresh `durationMs` against pre-change runs — GROUPING SETS adds one scan of the just-built fact table; nightly runtime must not regress materially (handoff §8).

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/db/migrations/051_measure_strata.sql apps/api/src/services/measureCalculatorV2.ts
git commit -m "feat: single-pass GROUPING SETS measure strata + Wilson CIs (migration 051)"
```

---

### Task 7: Strata API Endpoint

**Files:**
- Modify: `apps/api/src/routes/measures/index.ts`

- [ ] **Step 1: Add the endpoint**

In `apps/api/src/routes/measures/index.ts`, add to the imports (top of file):

```typescript
import { wilsonCI } from '../../services/wilsonCI.js';
```

and add this route inside `measureRoutes` after the existing `GET /:id` handler:

```typescript
  // GET /measures/:id/strata — age/sex strata with Wilson 95% CIs.
  // measure_id != measure_key: resolve through dim_measure (see GET /:id).
  fastify.get<{ Params: { id: string } }>('/:id/strata', async (request, reply) => {
    const { id } = request.params;

    const rows = await sql<
      { dimension: string; stratum: string; denominator: number; numerator: number; excluded: number }[]
    >`
      SELECT fms.dimension, fms.stratum,
             fms.denominator::int, fms.numerator::int, fms.excluded::int
      FROM phm_star.fact_measure_strata fms
      JOIN phm_star.dim_measure dm ON dm.measure_key = fms.measure_key
      WHERE dm.measure_id = ${id}::int
      ORDER BY fms.dimension, fms.stratum
    `;

    if (rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No strata for this measure (run a measure refresh first)' },
      });
    }

    const data = rows.map((row) => {
      if (row.denominator <= 0) {
        return { ...row, rate: null, ci_lower: null, ci_upper: null };
      }
      const ci = wilsonCI(row.numerator, row.denominator);
      return {
        ...row,
        rate: Math.round((row.numerator / row.denominator) * 1000) / 10,
        ci_lower: Math.round(ci.lower * 1000) / 10,
        ci_upper: Math.round(ci.upper * 1000) / 10,
      };
    });

    return reply.send({ success: true, data });
  });
```

- [ ] **Step 2: Typecheck and smoke-test**

```bash
cd "$(git rev-parse --show-toplevel)/apps/api" && npx tsc --noEmit
```

Then (reusing `$TOKEN` from Task 5, with a known measure_definition id, e.g. 91 = CMS22v12):

```bash
curl -s "http://localhost:3001/api/v1/measures/91/strata" -H "Authorization: Bearer $TOKEN" | jq '.data[] | select(.dimension=="all")'
```

Expected: one `all` row with `rate`, `ci_lower`, `ci_upper` populated. (404 here means that measure has no rows in `dim_measure`/`fact_measure_result` — try another id from `GET /measures`.)

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add apps/api/src/routes/measures/index.ts
git commit -m "feat: GET /measures/:id/strata — stratified rates with Wilson CIs"
```

---

### Task 8: MeasureEvaluator Interface Seam (TDD)

**Files:**
- Create: `apps/api/src/services/measureEvaluator.ts`
- Test: `apps/api/src/services/__tests__/measureEvaluator.test.ts`
- Modify: `apps/api/src/workers/measure-calculator.ts`
- Modify: `apps/api/src/routes/admin/index.ts`
- Modify: `.env.example`

Handoff §6.3: identical signature for SQL today and CQL later, no schema change. The CQL placeholder throws an actionable error at evaluation time, not at boot.

- [ ] **Step 1: Write the failing test**

```typescript
// =============================================================================
// Unit tests — MeasureEvaluator seam
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn(async () => ({ rowCount: 42, durationMs: 5 })),
}));

vi.mock('../measureCalculatorV2.js', () => ({
  refreshMeasureResults: mockRefresh,
}));

import { getMeasureEvaluator, sqlMeasureEvaluator, cqlMeasureEvaluator } from '../measureEvaluator.js';

const ORIGINAL_ENV = process.env['MEASURE_EVALUATOR'];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['MEASURE_EVALUATOR'];
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env['MEASURE_EVALUATOR'];
  } else {
    process.env['MEASURE_EVALUATOR'] = ORIGINAL_ENV;
  }
});

describe('sqlMeasureEvaluator', () => {
  it('delegates to refreshMeasureResults', async () => {
    const result = await sqlMeasureEvaluator.refresh();
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(result).toEqual({ rowCount: 42, durationMs: 5 });
  });
});

describe('cqlMeasureEvaluator', () => {
  it('throws an actionable not-implemented error at refresh time', async () => {
    await expect(cqlMeasureEvaluator.refresh()).rejects.toThrow(/CQL evaluator not implemented/);
  });
});

describe('getMeasureEvaluator', () => {
  it('defaults to sql', () => {
    expect(getMeasureEvaluator().kind).toBe('sql');
  });

  it('selects cql when MEASURE_EVALUATOR=cql', () => {
    process.env['MEASURE_EVALUATOR'] = 'cql';
    expect(getMeasureEvaluator().kind).toBe('cql');
  });

  it('rejects unknown evaluator kinds loudly', () => {
    process.env['MEASURE_EVALUATOR'] = 'quantum';
    expect(() => getMeasureEvaluator()).toThrow(/Unknown MEASURE_EVALUATOR/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "$(git rev-parse --show-toplevel)/apps/api"
npm run test -- src/services/__tests__/measureEvaluator.test.ts
```

Expected: FAIL — `Cannot find module '../measureEvaluator.js'`.

- [ ] **Step 3: Write the implementation**

```typescript
// =============================================================================
// Medgnosis API — MeasureEvaluator seam
// One signature, swappable engines: SQL aggregation today, a CQL/cqf-ruler
// bridge later — no schema change, no caller change (Parthenon pattern, see
// docs/superpowers/specs/2026-06-12-parthenon-ecqm-handoff.md §6.3).
// Selected via MEASURE_EVALUATOR env var; defaults to 'sql'.
// =============================================================================

import { refreshMeasureResults, type RefreshResult } from './measureCalculatorV2.js';

export type MeasureEvaluatorKind = 'sql' | 'cql';

export interface MeasureEvaluator {
  readonly kind: MeasureEvaluatorKind;
  refresh(): Promise<RefreshResult>;
}

export const sqlMeasureEvaluator: MeasureEvaluator = {
  kind: 'sql',
  refresh: refreshMeasureResults,
};

export const cqlMeasureEvaluator: MeasureEvaluator = {
  kind: 'cql',
  refresh: async () => {
    // Intentional placeholder: fails at evaluation time with a pointer, not at boot.
    throw new Error(
      'CQL evaluator not implemented. Set MEASURE_EVALUATOR=sql, or implement the ' +
        'cqf-ruler bridge per docs/superpowers/specs/2026-06-12-parthenon-ecqm-handoff.md §6.3.',
    );
  },
};

export function getMeasureEvaluator(): MeasureEvaluator {
  const kind = process.env['MEASURE_EVALUATOR'] ?? 'sql';
  switch (kind) {
    case 'sql':
      return sqlMeasureEvaluator;
    case 'cql':
      return cqlMeasureEvaluator;
    default:
      throw new Error(`Unknown MEASURE_EVALUATOR "${kind}" — expected "sql" or "cql"`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- src/services/__tests__/measureEvaluator.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Switch the call sites to the seam**

In `apps/api/src/workers/measure-calculator.ts`, replace

```typescript
import { refreshMeasureResults } from '../services/measureCalculatorV2.js';
```

with

```typescript
import { getMeasureEvaluator } from '../services/measureEvaluator.js';
```

and in `processMeasureJob`, replace

```typescript
  const result = await refreshMeasureResults();
```

with

```typescript
  const evaluator = getMeasureEvaluator();
  console.info(`[measure-calc] evaluator: ${evaluator.kind}`);
  const result = await evaluator.refresh();
```

In `apps/api/src/routes/admin/index.ts`, replace the import (line 19)

```typescript
import { refreshMeasureResults } from '../../services/measureCalculatorV2.js';
```

with

```typescript
import { getMeasureEvaluator } from '../../services/measureEvaluator.js';
```

and BOTH call sites (`await refreshMeasureResults();` near line 383, and `const result = await refreshMeasureResults();` near line 399) with `await getMeasureEvaluator().refresh();` / `const result = await getMeasureEvaluator().refresh();` respectively.

- [ ] **Step 6: Add the env var to `.env.example`**

Append to `.env.example` at the repo root (of the worktree):

```
# Measure evaluation engine: sql (star-schema aggregation) | cql (future cqf-ruler bridge)
MEASURE_EVALUATOR=sql
```

- [ ] **Step 7: Full check + commit**

```bash
cd "$(git rev-parse --show-toplevel)/apps/api"
npx tsc --noEmit && npm run test
```

Expected: typecheck clean, full suite green.

```bash
git branch --show-current
git add apps/api/src/services/measureEvaluator.ts \
        apps/api/src/services/__tests__/measureEvaluator.test.ts \
        apps/api/src/workers/measure-calculator.ts \
        apps/api/src/routes/admin/index.ts \
        .env.example
git commit -m "feat: MeasureEvaluator seam — swappable sql/cql engines behind one interface"
```

---

### Task 9: Final Verification (handoff §8 checklist)

**Files:** none — verification only. Evidence before assertions: run every command and record output before claiming done.

- [ ] **Step 1: Row counts match source**

```bash
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c \
 "SELECT (SELECT count(*) FROM phm_edw.vsac_value_set) || '/' ||
         (SELECT count(*) FROM phm_edw.vsac_value_set_code) || '/' ||
         (SELECT count(*) FROM phm_edw.vsac_measure) || '/' ||
         (SELECT count(*) FROM phm_edw.vsac_measure_value_set);"
```

Expected: `1545/225261/72/1597`.

- [ ] **Step 2: Exclusion semantics regression gate** — re-run verification query 2 from Task 6 Step 5; expect 0 violations.

- [ ] **Step 3: Full test suite + typecheck**

```bash
cd "$(git rev-parse --show-toplevel)/apps/api" && npx tsc --noEmit && npm run test
```

- [ ] **Step 4: Nightly job runtime not regressed** — compare the `durationMs` logged in Task 6 Step 5 against a pre-change baseline (re-run the refresh twice; second run is the steady-state number). Strata adds one scan of the freshly built fact table (~27k rows) — expect single-digit ms impact.

- [ ] **Step 5: Worker still functions end-to-end** — trigger a manual refresh through the admin endpoint and confirm the audit log row:

```bash
curl -s -X POST "http://localhost:3001/api/v1/admin/refresh-measures" -H "Authorization: Bearer $TOKEN" | jq
psql -h 127.0.0.1 -U claude_dev -d medgnosis -At -c \
 "SELECT action, details FROM public.audit_log WHERE action='measure_refresh' ORDER BY 1 DESC LIMIT 1;"
```

- [ ] **Step 6: Push and hand off**

```bash
git branch --show-current   # verify: feature/cds-vsac-value-sets
git push -u origin feature/cds-vsac-value-sets
```

Then follow superpowers:finishing-a-development-branch (merge/PR decision). Note for the PR body: migrations 050/051 are additive (numbered ahead of sequence to avoid same-day concurrent-session collisions — gaps are harmless to the runner); the VSAC data load is a one-time script run, required once per environment (`packages/db/scripts/load-vsac.sh`); prod deploys need a reachable source DB or a portable dump (`pg_dump --data-only` of the four `phm_edw.vsac_*` tables from a loaded environment).

---

## Deferred (do NOT build in this plan)

| Handoff item | Why deferred | Where it lands |
|---|---|---|
| §4.2 run-versioning (`measure_run`, `measure_person_status`) | Needs design alignment with Phase 2's two-pass population finder and Phase 7's Cohort Manager — both want the same snapshot layer | Phase 2 / Phase 7 plans |
| §7 step 6 FHIR `Measure` export | Interop polish; no consumer yet | Future interop plan |
| `clinical_rule` CSV→OID migration of bundle inclusion criteria | The 45 condition bundles' eligibility lives in ETL/demo data today, not in `clinical_rule` value sets — there is no live CSV-code execution path to migrate yet. The bridge + `resolveMeasureCodes()` make OID-resolution available the moment Phase 2's population finder needs it | Phase 2 plan (population finder consumes `resolveMeasureCodes`) |
| §5.2 temp-table person-set materialization | Applies to evaluators that scan clinical tables per measure. The current calculator aggregates a pre-built 27k-row fact table — nothing to materialize. Adopt when the population finder or a real SQL evaluator computes person-sets from `phm_edw` clinical tables (remember Parthenon's lesson: explicit `DROP TABLE IF EXISTS` between measures, don't trust `ON COMMIT DROP` mid-transaction) | Phase 2 population finder / future evaluator |
| OMOP `concept_ancestor` descendant expansion | Medgnosis has no OMOP vocab; VSAC expansions are pre-flattened | Never (by design) |
| Parthenon's `MAX(date_column)` reporting anchor | Medgnosis is live-operational; anchor to `CURRENT_DATE`/explicit periods | Never (by design) |
