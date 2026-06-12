# Phase 3: Close the Loop & Population Risk Models

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two compendium programs that need only batch data already present. **Close the Loop** (D10): no abnormal result falls through — enumerate abnormal results, compute each one's follow-up obligation + clock, search for closure evidence, and drive every open loop to a documented disposition. **Population risk** (D11): a pluggable risk-model registry that runs validated scores population-wide and surfaces the gap nobody computed.

**Architecture:** Builds on Phase 1's rules engine (guideline matrices as data) and the existing `dim_risk_model` registry. Cohort-scoped, batch (BullMQ), no real-time. New `phm_edw` tables; closure-evidence + scoring run per-patient over small bounded sets (199 abnormal results; 15 AFib patients) — never value-scans of the ~1B `observation` table.

**Data reality (verified 2026-06-12 — design to this, not to the slide deck):**
- `phm_edw.order_result`: **199 abnormal (`abnormal_flag='H'`), ALL `reviewed_datetime IS NULL`** → genuine open loops. 2,301 normal. `critical_flag` exists (currently all false).
- **No cervical-cytology / Pap / HPV / mammo / colonoscopy orders exist** (`clinical_order.order_type` ∈ {lab, imaging, referral} only). So the ASCCP matrix is seeded as *ready content* in the rules engine but the engine runs against the abnormal lab/imaging results that actually exist — the generic "abnormal result → follow-up → verify closure" doctrine, which is the transferable core.
- `phm_edw.patient`: `gender`, `date_of_birth`, `race`, `ethnicity` present. Active problem_list coverage: HTN 512, DM 97, CHF 30, **AFib (I48) 15**, stroke/TIA 0.
- `phm_star.dim_risk_model` already a registry (HCC_V28, READMIT_30D, ED_RISK, ABIGAIL_COMP) — extend it.
- Closure-evidence signals available: `order_result.reviewed_datetime`/`reviewed_by`; a follow-up `clinical_order` placed after `result_datetime`; a documented disposition in the new loop table.

**Modernization note:** CHA₂DS₂-VASc (computable from existing conditions + demographics) is the flagship risk model on real data — same *pattern* as the compendium's BCRA (validated model run population-wide → prevention/treatment gap surfaced). Gail/BCRA is registered but returns `insufficient_data` until reproductive/family-history inputs are wired — honest, not faked.

**Tech Stack:** PostgreSQL 17 (migrations + `npm run db:migrate -w @medgnosis/db` with `DATABASE_URL` host→localhost override), Fastify, BullMQ, vitest (`vi.hoisted` mock pattern), React 19 + TanStack Query.

**Branch:** `feature/cds-phase3-close-the-loop`

---

### Task 1: Migration 035 — loop tracking + population risk tables

**Files:** Create `packages/db/migrations/035_close_the_loop_risk.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- 035: Close the Loop + Population Risk (CDS parity Phase 3: D10+D11)
-- =============================================================================

-- D10: one tracked loop per abnormal result needing follow-up
CREATE TABLE IF NOT EXISTS phm_edw.result_loop (
  loop_id         SERIAL PRIMARY KEY,
  result_id       INT NOT NULL REFERENCES phm_edw.order_result(result_id),
  patient_id      INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  obligation      VARCHAR(80) NOT NULL,      -- e.g. 'review_abnormal', 'repeat_test', 'colposcopy'
  severity        VARCHAR(20) NOT NULL,      -- critical | high | routine
  identified_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE NOT NULL,             -- identified_date + window
  loop_status     VARCHAR(20) NOT NULL DEFAULT 'open', -- open | closed
  closure_type    VARCHAR(40),               -- reviewed | followup_order | appropriate_care | refused | unable_to_reach
  closure_evidence JSONB,
  resolved_by     VARCHAR(100),
  resolved_at     TIMESTAMP,
  created_date    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_result_loop UNIQUE (result_id)
);
CREATE INDEX IF NOT EXISTS idx_result_loop_status ON phm_edw.result_loop (loop_status, due_date);
CREATE INDEX IF NOT EXISTS idx_result_loop_patient ON phm_edw.result_loop (patient_id);

COMMENT ON TABLE phm_edw.result_loop IS
  'Close the Loop: every abnormal result tracked to a documented disposition. closure_type mirrors the four terminal states (care/resolution/refusal/exhausted) plus reviewed/followup.';

-- D11: population risk scores (one current row per patient+model)
CREATE TABLE IF NOT EXISTS phm_edw.population_risk_score (
  score_id       SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  model_code     VARCHAR(40) NOT NULL,       -- CHA2DS2_VASC | GAIL_BCRA | ...
  score_numeric  NUMERIC,                    -- null when insufficient_data
  risk_category  VARCHAR(40) NOT NULL,       -- low | moderate | high | insufficient_data
  components     JSONB NOT NULL,             -- per-factor breakdown (transparency)
  care_gap       BOOLEAN NOT NULL DEFAULT FALSE, -- elevated risk + missing intervention
  computed_date  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_pop_risk UNIQUE (patient_id, model_code)
);
CREATE INDEX IF NOT EXISTS idx_pop_risk_model ON phm_edw.population_risk_score (model_code, care_gap);

-- Register the two new models in the existing star registry
INSERT INTO phm_star.dim_risk_model (model_code, model_name, model_version, model_type, description, is_active, effective_start, effective_end)
VALUES
  ('CHA2DS2_VASC', 'CHA2DS2-VASc Stroke Risk', '2010', 'Clinical Score',
   'Stroke risk in atrial fibrillation; guides anticoagulation. Inputs from problem list + demographics.', TRUE, CURRENT_DATE, '9999-12-31'),
  ('GAIL_BCRA', 'Gail Breast Cancer Risk (BCRA)', '2.0', 'Predictive',
   '5-year invasive breast cancer risk (7 factors). Requires reproductive + family history inputs.', TRUE, CURRENT_DATE, '9999-12-31')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Apply & verify** (`npm run db:migrate`); confirm `\dt phm_edw.result_loop`, `phm_edw.population_risk_score`, and 6 rows in `dim_risk_model`.
- [ ] **Step 3: Commit** — `feat: result_loop + population_risk_score tables; register CHA2DS2-VASc + Gail`

### Task 2: Migration 036 — seed guideline matrices into the rules engine

**Files:** Create `packages/db/migrations/036_seed_followup_guidelines.sql`

- [ ] **Step 1:** Seed `phm_edw.clinical_rule`:
  - Entity `RESULT_FOLLOWUP` (the generic abnormal-result obligation, used by the engine NOW): `value_jsonb` rows keyed by severity → `{severity, obligation, window_days}`: `critical` → review within 1 day; `high` → review within 14 days; `routine` → 30 days. (source: institutional close-the-loop policy.)
  - Entity `ASCCP_CYTOLOGY` (ready content, NOT yet wired — no cytology data): the 2019 ASCCP risk-based rows as `value_jsonb` `{age_min, age_max, result, hpv, action, window_days}` (e.g. HSIL → colposcopy 14d; ASC-US/HPV+ → colposcopy 14d; ASC-US/HPV− → repeat 12mo; NILM≥30/HPV+ → cotest 12mo). Mark `notes='ready: activate when cervical cytology results are ingested'`.
- [ ] **Step 2:** Apply; `SELECT entity, count(*) FROM phm_edw.clinical_rule WHERE entity IN ('RESULT_FOLLOWUP','ASCCP_CYTOLOGY') GROUP BY 1`.
- [ ] **Step 3: Commit** — `feat: seed abnormal-result follow-up guideline + ASCCP cytology matrix (ready)`

### Task 3: Close the Loop engine (TDD)

**Files:** Test `apps/api/src/services/__tests__/closeTheLoop.test.ts`; create `apps/api/src/services/closeTheLoop.ts`

- [ ] **Step 1: Failing tests** (mock `@medgnosis/db` via `vi.hoisted`):
  - `severityOf({ critical_flag, abnormal_flag })` → 'critical' when critical_flag; 'high' when abnormal_flag ∈ {'H','L','A','AA'}; 'routine' otherwise. (pure)
  - `windowDaysFor(severity, guideline)` → maps via injected guideline rows (critical→1, high→14, routine→30); falls back to 30 if absent. (pure)
  - `dueDate(identifiedISO, windowDays)` → identified + N days (pure; pass date in, no `Date.now()`).
  - `classifyClosure({ reviewed_datetime, followupOrder })` → 'reviewed' when reviewed_datetime; 'followup_order' when a follow-up order exists; null when neither (pure).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `closeTheLoop.ts`:
  - Pure helpers above (guideline rows loaded once via `rulesEngine.evaluate('RESULT_FOLLOWUP','*')` and passed in).
  - `runLoopScan()`: enumerate abnormal results — `SELECT result_id, patient_id, abnormal_flag, critical_flag, result_datetime, reviewed_datetime, order_id FROM phm_edw.order_result WHERE (abnormal_flag IS NOT NULL AND abnormal_flag <> '' OR critical_flag) AND active_ind='Y'` (199 rows — bounded, indexed-enough). For each: compute severity + window + due_date; detect closure (reviewed_datetime present, OR a `clinical_order` for the same patient with `order_datetime > result_datetime` of a follow-up type); UPSERT into `result_loop` (`ON CONFLICT (result_id)`), setting `loop_status='closed'`+`closure_type` when evidence exists, else `open`. Returns `{scanned, open, closed}`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: Close the Loop engine — abnormal-result obligation + closure-evidence scan`

### Task 4: Population risk model registry + CHA₂DS₂-VASc + Gail (TDD)

**Files:** Test `apps/api/src/services/__tests__/riskModels.test.ts`; create `apps/api/src/services/riskModels/registry.ts`, `cha2ds2vasc.ts`, `gail.ts`, `index.ts`

- [ ] **Step 1: Failing tests** (pure scorers — no DB):
  - `scoreCha2ds2Vasc(input)` where input = `{ age, gender, chf, htn, dm, stroke, vascular }`:
    - 74yo female with HTN+DM → C0 H1 A2(age65-74=1, female=1) D1 ... assert exact total and category. Concretely: age 65-74 = +1, ≥75 = +2; female = +1; CHF +1; HTN +1; DM +1; stroke/TIA +2; vascular +1. Test: `{age:76, gender:'female', chf:false, htn:true, dm:true, stroke:false, vascular:false}` → 2(age)+1(female)+1(htn)+1(dm) = 5, category 'high'.
    - `{age:50, gender:'male', htn:false,...all false}` → 0, category 'low'.
    - category: 0 low, 1 moderate (men) — use ≥2 men / ≥3 women = high (guideline-defined anticoagulation threshold); expose `anticoag_indicated` boolean.
  - `scoreGail(input)` with missing required fields → `{ category:'insufficient_data', score:null }`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**:
  - `registry.ts`: `interface RiskModel { code; eligible(patient): boolean; compute(ctx): {score, category, components, careGap} }` + `register`/`getModel`/`allModels`.
  - `cha2ds2vasc.ts`: pure `scoreCha2ds2Vasc` + a model object (eligible = has AFib; careGap = anticoag_indicated AND no active anticoagulant on med list).
  - `gail.ts`: pure `scoreGail` returning insufficient_data when reproductive/family inputs absent; model object eligible = female 35-85.
  - `index.ts`: registers both; exports `allModels`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: pluggable risk-model registry + CHA2DS2-VASc (computed) + Gail (graceful)`

### Task 5: Risk run service + BullMQ jobs + nightly wiring

**Files:** Create `apps/api/src/services/runRiskModels.ts`, `apps/api/src/workers/close-the-loop.ts`; modify `apps/api/src/workers/nightly-scheduler.ts`, `apps/api/src/worker.ts`

- [ ] **Step 1:** `runRiskModels.ts` → `runRiskModels()`: for each registered model, select its eligible cohort (CHA₂DS₂-VASc: the 15 AFib patients via problem_list I48; Gail: female 35-85 — but it returns insufficient_data), gather inputs per patient (conditions from problem_list, demographics from patient, anticoagulant from medication_order), compute, UPSERT `population_risk_score` with `care_gap`. Returns counts by model+category. Cohort-scoped, per-patient.
- [ ] **Step 2:** `close-the-loop.ts` worker (queue `medgnosis-loops`) calling `runLoopScan()`; a `medgnosis-risk` queue calling `runRiskModels()`. Mirror `population-finder.ts` worker structure.
- [ ] **Step 3:** Nightly scheduler enqueues both (single self-scoping jobs); register both workers in `worker.ts`.
- [ ] **Step 4:** `tsc --noEmit` (api) → 0.
- [ ] **Step 5: Commit** — `feat: nightly Close-the-Loop scan + population risk-model run`

### Task 6: API routes

**Files:** Create `apps/api/src/routes/close-the-loop/index.ts`, `apps/api/src/routes/risk-models/index.ts`; modify `apps/api/src/routes/index.ts`; add Zod `loopResolveSchema` to `packages/shared/src/schemas/index.ts` (+ re-export in `packages/shared/src/index.ts`)

- [ ] **Step 1:** `close-the-loop` (auth): `GET /close-the-loop?status=open` (loops + patient name + result detail, ordered by due_date), `POST /:id/resolve` (Zod `loopResolveSchema`: `closure_type` ∈ appropriate_care|refused|unable_to_reach|reviewed; sets closed + resolved_by + evidence; audited). Plus `GET /close-the-loop/stats` (denominator dashboard: total tracked, open, closed-by-type — "the denominator is the deliverable").
- [ ] **Step 2:** `risk-models` (auth): `GET /risk-models` (registry from `dim_risk_model`), `GET /risk-models/:code/scores?care_gap=true` (worklist of scored patients + names), `POST /risk-models/run` (admin-gated: enqueue/await `runRiskModels`).
- [ ] **Step 3:** Register routes; rebuild shared; `turbo typecheck` → 8/8; full `vitest run` → green.
- [ ] **Step 4: Commit** — `feat: Close-the-Loop + risk-model API routes`

### Task 7: Live run + verification

- [ ] **Step 1:** Throwaway tsx script in `apps/api/src/` (delete after; remember `/tmp` breaks relative imports, and `.ts` extension imports trip `tsc` — delete before any typecheck): run `runLoopScan()` then `runRiskModels()` with the `DATABASE_URL` override. Expect ~199 loops scanned (≈199 open, since all abnormal results are unreviewed) and CHA₂DS₂-VASc scored for ~15 AFib patients.
- [ ] **Step 2:** Spot-check via psql: pick one `result_loop` (open) — confirm the underlying `order_result` is abnormal + unreviewed. Pick one CHA₂DS₂-VASc score — recompute by hand from the patient's age/gender/conditions, confirm match + `care_gap` logic.
- [ ] **Step 3:** Exercise `POST /close-the-loop/:id/resolve` (boot API on test port 3099 with localhost+redis overrides — Redis/Solr degrade gracefully — curl with admin token, or call the service directly) → loop closes with disposition + audit.
- [ ] **Step 4:** Confirm no orphaned long-running queries in `pg_stat_activity`; cancel any.

### Task 8: Frontend — Close the Loop worklist + risk panel

**Files:** Create `apps/web/src/pages/CloseTheLoopPage.tsx`, `apps/web/src/hooks/useCloseTheLoop.ts`; modify `apps/web/src/App.tsx`, `apps/web/src/components/AppShell.tsx`

- [ ] **Step 1:** Read `AlertsPage`/`PopulationFinderPage` + their hooks for patterns (envelope, dark theme tokens, mutation+invalidate).
- [ ] **Step 2:** `useCloseTheLoop` (list open loops + resolve mutation + stats). `CloseTheLoopPage`: a "denominator is the deliverable" header strip (total tracked / open / closed-by-type from stats), then the open-loop worklist — patient, result, severity, days-overdue, due-date; resolve actions (Appropriate care / Clinical resolution(reviewed) / Refused / Unable to reach). Include a small CHA₂DS₂-VASc care-gap section sourced from `/risk-models/CHA2DS2_VASC/scores?care_gap=true` (or its own page — keep one page with two sections to stay scoped).
- [ ] **Step 3:** Route `/close-the-loop` + sidebar nav (e.g. `ShieldCheck` or `Workflow` icon). `npx tsc --noEmit` AND `npx vite build` → both clean.
- [ ] **Step 4: Commit** — `feat: Close the Loop worklist page + CHA2DS2-VASc care-gap panel`

### Task 9: Verify, update plan, merge

- [ ] `npx turbo run typecheck` (8/8), full `vitest run` (green), `npx vite build` (clean).
- [ ] Update master plan: mark D10, D11 ✅ (note ASCCP ready-content + Gail graceful-degradation deviations).
- [ ] Merge `feature/cds-phase3-close-the-loop` → `main`; confirm `git diff main...HEAD --diff-filter=D` empty; push.
- [ ] Update memory `project_medgnosis_cds_parity` (Phase 3 shipped + the no-cytology/CHA₂DS₂-VASc-over-Gail data adaptations).

## Self-review notes
- **Spec coverage:** D10 = Tasks 1,2,3,5,6,7,8; D11 = Tasks 1,4,5,6,7,8.
- **Data-honest:** engine runs on the 199 real abnormal results; ASCCP seeded as ready content (no cytology data); CHA₂DS₂-VASc computed on real conditions; Gail registered but returns insufficient_data (documented, not faked) — directly applying the Phase-2 lesson (verify data exists before building against it).
- **Scale:** bounded cohorts (199 results, 15 AFib patients), per-patient indexed access; no `observation` value scans.
- **Reuse:** rules engine for guideline matrices (Phase 1); `dim_risk_model` registry extended, not replaced; worker/route/page patterns copied from Phase 2; resolve path audited like `problem_list_audit`.
- **Type consistency:** `runLoopScan()→{scanned,open,closed}`; `scoreCha2ds2Vasc(input)→{score,category,components,anticoag_indicated}`; `result_loop.closure_type` values identical across engine, route Zod enum, and UI.
- **Doctrine:** verify-don't-trust (every abnormal result accounted for), declined/unable-to-reach as counted terminal states, the denominator as the deliverable, validated risk run population-wide to surface the uncomputed gap.
