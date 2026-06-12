# Phase 1: Versioned Clinical Rules Engine + Diagnosis Ontology

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clinical logic becomes data — versioned, effective-dated, time-travelable, and explainable — plus the diagnosis ontology (dx → disease process → organ system → generate_plan) that Phases 2 and 6 build on. Delivers D1 + D2 of the master plan (`2026-06-12-geisinger-cds-parity.md`).

**Architecture:** Two new `phm_edw` tables (`clinical_rule` EAV with effective/expiration dating; `dx_ontology` allowing one code → many disease processes), a thin evaluation service (`rulesEngine.ts`) used by workers with constant fallbacks, and read-only transparency endpoints (`GET /rules/...`) implementing the compendium's "transparency → trust" doctrine. Appointments (D3) confirmed already present in live DB — dropped from this phase.

**Tech Stack:** PostgreSQL 17 (migrations via `packages/db/migrations/*.sql`, `npm run db:migrate -w @medgnosis/db`), Fastify, vitest (mocked `@medgnosis/db`).

**Branch:** `feature/cds-phase1-rules-engine`

---

### Task 1: Migration 031 — DDL

**Files:**
- Create: `packages/db/migrations/031_clinical_rules_engine.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- 031: Clinical rules engine + diagnosis ontology (CDS parity Phase 1: D1+D2)
-- Logic as data: EAV rows with effective/expiration dating → one update
-- propagates to every consumer; any past result reproducible via as-of query.
-- =============================================================================

CREATE TABLE phm_edw.clinical_rule (
  rule_id         SERIAL PRIMARY KEY,
  entity          VARCHAR(100) NOT NULL,
  attribute       VARCHAR(100) NOT NULL,
  value_text      TEXT,
  value_numeric   NUMERIC,
  value_jsonb     JSONB,
  unit            VARCHAR(50),
  display_order   INT NOT NULL DEFAULT 0,
  effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE,
  source          VARCHAR(255),
  notes           TEXT,
  created_by      VARCHAR(100) NOT NULL DEFAULT 'system',
  active_ind      CHAR(1) NOT NULL DEFAULT 'Y',
  created_date    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date    TIMESTAMP,
  CONSTRAINT chk_clinical_rule_dates
    CHECK (expiration_date IS NULL OR expiration_date > effective_date),
  CONSTRAINT chk_clinical_rule_value
    CHECK (value_text IS NOT NULL OR value_numeric IS NOT NULL OR value_jsonb IS NOT NULL)
);

CREATE INDEX idx_clinical_rule_lookup
  ON phm_edw.clinical_rule (entity, attribute, effective_date);
CREATE INDEX idx_clinical_rule_current
  ON phm_edw.clinical_rule (entity, attribute)
  WHERE expiration_date IS NULL AND active_ind = 'Y';

COMMENT ON TABLE phm_edw.clinical_rule IS
  'Versioned clinical logic as data (Geisinger EAV pattern). Query with as-of date for time travel.';

CREATE TABLE phm_edw.dx_ontology (
  ontology_id     SERIAL PRIMARY KEY,
  icd10_code      VARCHAR(20),
  snomed_code     VARCHAR(20),
  dx_name         VARCHAR(255) NOT NULL,
  disease_process VARCHAR(100) NOT NULL,
  organ_system    VARCHAR(100) NOT NULL,
  generate_plan   BOOLEAN NOT NULL DEFAULT TRUE,
  stage_label     VARCHAR(50),
  stage_criteria  JSONB,
  specialty_lists TEXT[] NOT NULL DEFAULT '{}',
  display_order   INT NOT NULL DEFAULT 0,
  active_ind      CHAR(1) NOT NULL DEFAULT 'Y',
  created_date    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date    TIMESTAMP
);
-- NB: no unique constraint on icd10_code — one code maps to MULTIPLE disease
-- processes by design ("DM type 2 causing CKD stage 3" → Nephrology + Endocrine).
CREATE INDEX idx_dx_ontology_icd10   ON phm_edw.dx_ontology (icd10_code);
CREATE INDEX idx_dx_ontology_process ON phm_edw.dx_ontology (disease_process);

COMMENT ON TABLE phm_edw.dx_ontology IS
  'Diagnosis ontology: code → disease process → organ system → generate_plan. One code may map to multiple processes.';
```

- [ ] **Step 2: Apply and verify**

Run: `npm run db:migrate -w @medgnosis/db`
Expected: `[migrate] Applying: 031_clinical_rules_engine.sql` then success.
Verify: `psql -U claude_dev -h localhost -d medgnosis -c "\d phm_edw.clinical_rule"` shows both tables.

- [ ] **Step 3: Commit** — `feat: add clinical_rule (versioned EAV) and dx_ontology tables`

### Task 2: Migration 032 — Seed content

**Files:**
- Create: `packages/db/migrations/032_seed_clinical_rules.sql`

- [ ] **Step 1: Seed `clinical_rule`** with four entities (multi-row INSERTs, `source` cites provenance):
  1. `ALERT_THRESHOLDS` — the 11 values currently hardcoded in `packages/shared/src/constants/index.ts` (`CARE_GAP_WARNING_DAYS` 14, `CARE_GAP_CRITICAL_DAYS` 30, `RISK_HIGH_THRESHOLD` 70, `RISK_CRITICAL_THRESHOLD` 85, `MEASURE_COMPLIANCE_WARNING` 0.7, `MEASURE_COMPLIANCE_CRITICAL` 0.5, `LAB_CRITICAL_CHECK_HOURS` 24, `MED_ADHERENCE_WARNING_DAYS` 3, `MED_ADHERENCE_CRITICAL_DAYS` 7, `FOLLOWUP_OVERDUE_DAYS` 7, `POPULATION_DRIFT_THRESHOLD` 0.05) as `value_numeric`.
  2. `CKD_STAGING` — KDIGO GFR bands as `value_jsonb`: G1 ≥90 (requires kidney damage), G2 60–89, G3a 45–59, G3b 30–44, G4 15–29, G5 <15.
  3. `GLUCOMETRICS` — `HIGH_RISK_SINGLE_MGDL` 300, `HIGH_RISK_AVG_24H_MGDL` 180, `LOOKBACK_HOURS` 24 (compendium ch. 03).
  4. `MEWS` — `SCORING_BAND` rows (`value_jsonb` = `{parameter, min, max, points}`) per compendium ch. 04 matrix: temp °C (<35.1→2, 35.1–38.4→0, >38.4→2); HR (<40→2, 40–50→1, 51–100→0, 101–110→1, 111–129→2, ≥130→3); SBP (<71→3, 71–80→2, 81–100→1, 101–199→0, ≥200→2); RR (<9→2, 9→1, 10–18→0, 19–20→1, 21–29→2, ≥30→3); GCS (15→0, 13–14→1, 10–12→2, 6–9→3, ≤5→4). Plus `ACTION_LADDER` rows: 0–2 routine monitoring (Bedside RN), 3 increased surveillance (Bedside RN), 4 increased surveillance + notify provider (RN→Provider), ≥5 RRT + notify provider stat (RRT).
  5. `NEWS2` — `SCORING_BAND` + `TRIGGER` rows per RCP NEWS2 (2017): RR (≤8→3, 9–11→1, 12–20→0, 21–24→2, ≥25→3); SpO₂ scale 1 (≤91→3, 92–93→2, 94–95→1, ≥96→0); on supplemental O₂→2; SBP (≤90→3, 91–100→2, 101–110→1, 111–219→0, ≥220→3); pulse (≤40→3, 41–50→1, 51–90→0, 91–110→1, 111–130→2, ≥131→3); consciousness (alert→0, CVPU→3); temp (≤35.0→3, 35.1–36.0→1, 36.1–38.0→0, 38.1–39.0→1, ≥39.1→2). Triggers: 0–4 low / single-param 3 low-medium / 5–6 medium urgent / ≥7 high emergency.

- [ ] **Step 2: Seed `dx_ontology`** (~40 rows):
  - CKD staged (Nephrology): N18.1–N18.6 + N18.9 "CKD, stage to be determined" (honest placeholder), `stage_criteria` carrying GFR bands, specialty_lists `{pcp,nephrology}`.
  - Heart failure 18-dx taxonomy (Cardiac), function × etiology per compendium ch. 08, ICD-10-CM mapped (I50.2x systolic, I50.3x diastolic, I50.4x combined, I11.0 hypertensive, I50.81x right-sided, I27.81 cor pulmonale, I42.x cardiomyopathies, I50.9 "etiology to be determined"), specialty_lists partitioned pcp(6)/hospitalist(9)/cardiology(all).
  - Obesity BMI-banded (Endocrine/Metabolic): E66.3 overweight, E66.9 Class I/II via `stage_criteria` BMI bands, E66.01 Class III, E66.2 with hypoventilation, plus "Obesity, BMI to be determined".
  - Dual-mapping exemplars: E11.22 "DM Type 2 causing CKD Stage 3" → TWO rows (CKD/Nephrology + Chronic Diabetes/Endocrine, both generate_plan); J45.909 "Asthma, severity to be determined".

- [ ] **Step 3: Apply** (`npm run db:migrate -w @medgnosis/db`), spot-check: `SELECT entity, count(*) FROM phm_edw.clinical_rule GROUP BY 1;` and `SELECT disease_process, count(*) FROM phm_edw.dx_ontology GROUP BY 1;`

- [ ] **Step 4: Commit** — `feat: seed clinical rules (thresholds, CKD, MEWS, NEWS2, glucometrics) and dx ontology`

### Task 3: Rules engine service (TDD)

**Files:**
- Test: `apps/api/src/services/__tests__/rulesEngine.test.ts`
- Create: `apps/api/src/services/rulesEngine.ts`

- [ ] **Step 1: Write failing tests** (mock `@medgnosis/db` exactly like `riskScoring.test.ts`): `evaluate` returns rows; `getNumericThreshold` parses pg-numeric strings and falls back on empty result AND on query error; `getValueSet` maps `value_text`; `explain` returns `{entity, attribute, as_of, rules}` shape.
- [ ] **Step 2: Run** `npx vitest run src/services/__tests__/rulesEngine.test.ts` in `apps/api` — expect FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
// =============================================================================
// Medgnosis API — Clinical Rules Engine
// Logic as data: versioned, effective-dated EAV (phm_edw.clinical_rule).
// evaluate(entity, attribute, asOf?) — time-travel to any prior logic.
// =============================================================================
import { sql } from '@medgnosis/db';

export interface ClinicalRuleRow {
  rule_id: number;
  entity: string;
  attribute: string;
  value_text: string | null;
  value_numeric: string | null;
  value_jsonb: unknown;
  unit: string | null;
  display_order: number;
  effective_date: string;
  expiration_date: string | null;
  source: string | null;
  notes: string | null;
}

export async function evaluate(
  entity: string, attribute: string, asOf?: string,
): Promise<ClinicalRuleRow[]> {
  return sql<ClinicalRuleRow[]>`
    SELECT rule_id, entity, attribute, value_text, value_numeric, value_jsonb,
           unit, display_order, effective_date, expiration_date, source, notes
    FROM phm_edw.clinical_rule
    WHERE entity = ${entity} AND attribute = ${attribute} AND active_ind = 'Y'
      AND effective_date <= COALESCE(${asOf ?? null}::date, CURRENT_DATE)
      AND (expiration_date IS NULL
           OR expiration_date > COALESCE(${asOf ?? null}::date, CURRENT_DATE))
    ORDER BY display_order, rule_id`;
}

export async function getNumericThreshold(
  entity: string, attribute: string, fallback: number, asOf?: string,
): Promise<number> {
  try {
    const rows = await evaluate(entity, attribute, asOf);
    const v = rows[0]?.value_numeric;
    return v != null ? Number(v) : fallback;
  } catch {
    return fallback; // rules table unreachable → never break the consumer
  }
}

export async function getValueSet(
  entity: string, attribute: string, asOf?: string,
): Promise<string[]> {
  const rows = await evaluate(entity, attribute, asOf);
  return rows.map((r) => r.value_text).filter((v): v is string => v != null);
}

export interface RuleExplanation {
  entity: string;
  attribute: string;
  as_of: string;
  rules: ClinicalRuleRow[];
}

export async function explain(
  entity: string, attribute: string, asOf?: string,
): Promise<RuleExplanation> {
  const rows = await evaluate(entity, attribute, asOf);
  return { entity, attribute, as_of: asOf ?? 'current', rules: rows };
}

export async function listEntities(): Promise<
  { entity: string; attribute: string; rule_count: number; current_count: number }[]
> {
  return sql`
    SELECT entity, attribute,
           COUNT(*)::int AS rule_count,
           COUNT(*) FILTER (WHERE effective_date <= CURRENT_DATE
             AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
             AND active_ind = 'Y')::int AS current_count
    FROM phm_edw.clinical_rule
    GROUP BY entity, attribute
    ORDER BY entity, attribute`;
}
```

- [ ] **Step 4: Run tests** — expect PASS.
- [ ] **Step 5: Commit** — `feat: rules engine evaluation service with time-travel and fallbacks`

### Task 4: Transparency endpoints

**Files:**
- Create: `apps/api/src/routes/rules/index.ts`
- Modify: `apps/api/src/routes/index.ts` (import + register under `/rules`)

- [ ] **Step 1: Implement route** (auth via `fastify.addHook('preHandler', fastify.authenticate)`, matching alerts route):
  - `GET /rules` → `listEntities()`
  - `GET /rules/:entity/:attribute?as_of=YYYY-MM-DD` → `explain()` (validate `as_of` with regex `/^\d{4}-\d{2}-\d{2}$/`, 400 otherwise)
  - Response envelope `{ success: true, data }` matching existing routes.
- [ ] **Step 2: Register** in `routes/index.ts`: `await api.register(rulesRoutes, { prefix: '/rules' });`
- [ ] **Step 3: Verify live** — `curl -s localhost:<port>/api/v1/rules -H "Authorization: Bearer <token>"` (use admin creds from memory) → entity list including MEWS, NEWS2, CKD_STAGING.
- [ ] **Step 4: Commit** — `feat: rules transparency endpoints (show the criteria behind any computation)`

### Task 5: Worker refactor — thresholds from the engine

**Files:**
- Modify: `apps/api/src/workers/rules-engine.ts`

- [ ] **Step 1:** At top of each evaluation function (or once per job), resolve thresholds via `getNumericThreshold('ALERT_THRESHOLDS', '<KEY>', ALERT_THRESHOLDS.<KEY>)` — DB value wins, constant is the fallback. No behavior change with seeded values (they're identical).
- [ ] **Step 2:** `npx tsc --noEmit` (api workspace) + full `vitest run` — PASS.
- [ ] **Step 3: Commit** — `refactor: alert worker reads thresholds from clinical_rule with constant fallbacks`

### Task 6: Verification & merge

- [ ] `npx tsc --noEmit` at repo root (all workspaces) + `npm run test -w @medgnosis/api`
- [ ] Live smoke: rules endpoints return seeded content; nightly worker processes a job without error.
- [ ] Update master plan checklist (D1, D2 done; D3 marked pre-existing).
- [ ] Merge `feature/cds-phase1-rules-engine` → `main`, push.

## Self-review notes
- Spec coverage: D1 (Tasks 1–5), D2 (Tasks 1–2). D3 dropped — verified pre-existing in live DB (migration 010/018).
- Type consistency: `value_numeric` is `string | null` from postgres.js NUMERIC — `getNumericThreshold` converts; tests assert this.
- Seed band tables in Task 2 are the complete content (transcribed from compendium ch. 03/04/08 + KDIGO + RCP NEWS2) — the migration transcribes them into SQL, no invention required.
