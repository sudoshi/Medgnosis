# Phase 5: Real-Time Lane — MEWS/NEWS2 & Glucometrics

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Catch deterioration before the code. A low-latency surveillance lane (D12) carrying a **generic early-warning scoring engine** — MEWS (compendium parity) + NEWS2 (current standard) (D13) — and **inpatient Glucometrics** (D14): score continuously, surface the unit census, escalate by policy.

**Architecture:** The compendium's lane is HL7 → hot partition → unioned with the warehouse. **No live HL7 feed exists** and `encounter` (28.7M rows) has no unit/bed — so, like Phase 4's synthetic appointments, the lane is instantiated as a **synthetic streamer over a `phm_rt` hot-partition schema** referencing real patients. The schema and ingest are structured so a real MLLP/HL7v2 source could write to the same hot tables (documented). The scoring engine is **band-driven and generic**, consuming the MEWS/NEWS2/GLUCOMETRICS rules **already seeded in Phase 1** (`clinical_rule`). Scores push over the existing WebSocket (`publishAlert`).

**Data reality (verified 2026-06-12):**
- `vital_sign`: `temperature_f` (**Fahrenheit** — engine converts to °C), `bp_systolic`, `heart_rate`, `respiratory_rate`, `spo2_percent`, `o2_delivery` (default 'Room Air'). **No GCS / consciousness** → the synthetic stream generates ACVPU + GCS (defaults to alert/15).
- Phase-1 seeded rules (drive the engine, no new content needed): `MEWS SCORING_BAND` (25) + `ACTION_LADDER` (4); `NEWS2 SCORING_BAND` (29, incl. discrete `on_oxygen`/`consciousness` bands) + `TRIGGER` (4); `GLUCOMETRICS` (≥300 single / ≥180 24h-avg / 24h lookback).
- `encounter` 28.7M, no unit/bed, no live feed → **synthetic census** (no encounter scan).
- Insulin products exist (Humalog/Humulin/regular) for the glucometrics ledger.
- `publishAlert(patientId, orgId, event)` — WebSocket push (Phase-1 infra).

**Band semantics:** `SCORING_BAND` jsonb is either `{parameter,min,max,points}` (numeric: match `min<=v` and `v<=max`, null = unbounded) or `{parameter,value,points}` (discrete: `on_oxygen` bool, `consciousness` 'A'/'CVPU'). The engine handles both.

**Tech Stack:** PostgreSQL 17 (`npm run db:migrate` w/ host→localhost override), Fastify, BullMQ (repeatable streamer job), vitest (`vi.hoisted`), React 19 + TanStack Query. App/worker code may use `Math.random`/`Date` (only Workflow *scripts* can't); **migrations stay deterministic** (no `random()`). Admin login admin@acumenus.net/superuser; API boot port 3099 + localhost overrides.

**Branch:** `feature/cds-phase5-realtime-surveillance`

---

### Task 1: Migration 039 — `phm_rt` hot-partition schema

**Files:** Create `packages/db/migrations/039_realtime_lane.sql`

- [ ] **Step 1: Write DDL** (new `phm_rt` schema):

```sql
CREATE SCHEMA IF NOT EXISTS phm_rt;

-- Synthetic inpatient census (real patients, simulated admission/unit/bed)
CREATE TABLE IF NOT EXISTS phm_rt.admission (
  admission_id   SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  unit           VARCHAR(20) NOT NULL,
  bed            VARCHAR(10) NOT NULL,
  admit_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
  admitting_dx   VARCHAR(200),
  status         VARCHAR(20) NOT NULL DEFAULT 'admitted', -- admitted | discharged
  created_date   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_admission_status ON phm_rt.admission (status, unit);

-- Hot partition: streamed vitals (HL7 ORU equivalent)
CREATE TABLE IF NOT EXISTS phm_rt.vital_stream (
  reading_id     SERIAL PRIMARY KEY,
  admission_id   INT NOT NULL REFERENCES phm_rt.admission(admission_id),
  patient_id     INT NOT NULL,
  recorded_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
  temp_c         NUMERIC,
  heart_rate     SMALLINT,
  systolic_bp    SMALLINT,
  resp_rate      SMALLINT,
  spo2           SMALLINT,
  on_oxygen      BOOLEAN NOT NULL DEFAULT FALSE,
  consciousness  VARCHAR(4) NOT NULL DEFAULT 'A',  -- ACVPU: A | C | V | P | U
  gcs            SMALLINT NOT NULL DEFAULT 15
);
CREATE INDEX IF NOT EXISTS idx_rt_vital_adm ON phm_rt.vital_stream (admission_id, recorded_datetime DESC);

-- Hot partition: streamed glucose + insulin ledger
CREATE TABLE IF NOT EXISTS phm_rt.glucose_stream (
  reading_id     SERIAL PRIMARY KEY,
  admission_id   INT NOT NULL REFERENCES phm_rt.admission(admission_id),
  patient_id     INT NOT NULL,
  reading_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
  glucose_mgdl   SMALLINT NOT NULL,
  source         VARCHAR(20) NOT NULL DEFAULT 'fingerstick'
);
CREATE INDEX IF NOT EXISTS idx_rt_glucose_adm ON phm_rt.glucose_stream (admission_id, reading_datetime DESC);

CREATE TABLE IF NOT EXISTS phm_rt.insulin_admin (
  admin_id       SERIAL PRIMARY KEY,
  admission_id   INT NOT NULL REFERENCES phm_rt.admission(admission_id),
  patient_id     INT NOT NULL,
  admin_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
  dose_units     SMALLINT NOT NULL,
  product        VARCHAR(120) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rt_insulin_adm ON phm_rt.insulin_admin (admission_id, admin_datetime DESC);

-- Computed early-warning scores (one row per scoring event)
CREATE TABLE IF NOT EXISTS phm_rt.ews_score (
  score_id       SERIAL PRIMARY KEY,
  admission_id   INT NOT NULL REFERENCES phm_rt.admission(admission_id),
  patient_id     INT NOT NULL,
  score_type     VARCHAR(10) NOT NULL,  -- MEWS | NEWS2
  score          SMALLINT NOT NULL,
  band           VARCHAR(40) NOT NULL,  -- action/trigger label
  action         VARCHAR(200),
  components      JSONB NOT NULL,
  reading_id     INT,
  computed_datetime TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_ews_adm ON phm_rt.ews_score (admission_id, score_type, computed_datetime DESC);

COMMENT ON SCHEMA phm_rt IS
  'Real-time surveillance hot partition. Synthetic streamer today; a real MLLP/HL7v2 source would write vital_stream/glucose_stream directly.';
```

- [ ] **Step 2: Apply & verify** the schema + 5 tables.
- [ ] **Step 3: Commit** — `feat: phm_rt real-time hot-partition schema (admission, vital/glucose/insulin streams, ews_score)`

### Task 2: Migration 040 — seed initial synthetic census

**Files:** Create `packages/db/migrations/040_seed_census.sql`

- [ ] **Step 1:** Deterministically seed ~30 admissions for real diabetic/cardiac patients across units (HFAM8, SCU5, MED3), with beds, an admitting dx, and **one initial vital reading + one glucose + one insulin** each so the census isn't empty. Use `row_number()`/modulo for unit/bed assignment and vitals variation (NOT `random()` — the streamer adds live variation at runtime). Pick patients via problem-list cohort (e.g. those with DM/HF). Include a few intentionally deteriorating vitals (one SBP 95 / HR 115 / RR 22 → MEWS-positive; one glucose 320 → glucometrics-positive) so the census shows action.
- [ ] **Step 2:** Apply; verify admissions ≥ 20, vital_stream/glucose_stream rows > 0.
- [ ] **Step 3: Commit** — `feat: seed synthetic inpatient census + initial vitals/glucose/insulin`

### Task 3: EWS scoring engine (TDD)

**Files:** Test `apps/api/src/services/__tests__/ewsEngine.test.ts`; create `apps/api/src/services/ewsEngine.ts`

- [ ] **Step 1: Failing tests** (pure, bands passed in from the seeded shapes):
  - `fToC(98.6)` ≈ 37.0.
  - `scoreVitals(params, bands)` numeric: MEWS bands + `{heart_rate:118, resp_rate:22, systolic_bp:100, temp_c:36.0, gcs:15}` → total 5 (compendium worked example), with `components`.
  - discrete bands: NEWS2 `{on_oxygen:true}` → 2; `{consciousness:'CVPU'}` → 3.
  - `mewsAction(5, ladder)` → RRT-tier (`{action contains 'Rapid-response', owner:'RRT'}`); `mewsAction(2, ladder)` → routine.
  - `news2Band(total, maxSingleParam, triggers)`: total 7 → 'high'; total 3 → 'low'; total 2 with a single param=3 → 'low-medium' (the single-param-3 rule).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `ewsEngine.ts`:
  - `fToC(f)` = `(f-32)*5/9`.
  - `interface Band { parameter; min?; max?; value?; points }`.
  - `scoreVitals(params, bands)`: per parameter present, find the matching band — numeric (`(min==null||v>=min)&&(max==null||v<=max)`) or discrete (`band.value===v`), sum points; return `{total, components:{param:points}}`, and track `maxSingleParam`.
  - `mewsAction(score, ladder)`: ladder rows `{score_min,score_max,action,owner}` → first matching.
  - `news2Band(total, maxSingleParam, triggers)`: aggregate match (`aggregate_min/max`) but if any single param = 3, return the `single_param_score:3` trigger when its urgency exceeds the aggregate's (low → low-medium).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: generic band-driven EWS engine (MEWS + NEWS2, F->C)`

### Task 4: Glucometrics engine (TDD)

**Files:** Test `apps/api/src/services/__tests__/glucometrics.test.ts`; create `apps/api/src/services/glucometrics.ts`

- [ ] **Step 1: Failing tests** (pure): `glucoseRisk(readings, {single:300, avg24h:180})` — any reading ≥300 → high (reason 'severe excursion'); 24h-avg ≥180 → high (reason 'persistent'); else low. `avg24h(readings, nowISO)` filters to last 24h and averages.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `glucometrics.ts`: pure helpers + `runGlucometrics()`: for each admitted patient, pull last-24h glucose from `glucose_stream`, apply the two rules (thresholds from `clinical_rule GLUCOMETRICS`), and write a per-admission risk summary (reuse `ews_score` with `score_type='GLUCO'`? No — keep a lightweight in-memory census; the route computes on read). Returns `{census, highRisk}`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: Glucometrics two-rule triage engine`

### Task 5: Streamer worker (continuous surveillance)

**Files:** Create `apps/api/src/services/surveillance.ts` (scoreAdmission/streamTick) + `apps/api/src/workers/surveillance.ts`; modify `worker.ts`

- [ ] **Step 1:** `surveillance.ts`:
  - `scoreAdmission(admissionId)`: latest `vital_stream` row → load MEWS+NEWS2 bands/ladders from rules engine → `scoreVitals` → write two `ews_score` rows (MEWS, NEWS2) → `publishAlert` when MEWS≥5 / NEWS2≥7 (RRT/emergency).
  - `streamTick()`: for each admitted patient, append a new `vital_stream` reading (random walk from the last, `Math.random` OK here) + occasional `glucose_stream`/`insulin_admin`, then `scoreAdmission`. Returns counts.
- [ ] **Step 2:** Worker `medgnosis-surveillance` with a **repeatable** job (`every: 5 min`) calling `streamTick()`; register in `worker.ts`. (Mirrors the scheduler's repeat pattern.)
- [ ] **Step 3:** `tsc --noEmit` → 0.
- [ ] **Step 4: Commit** — `feat: surveillance streamer worker (continuous scoring + WebSocket escalation)`

### Task 6: API routes

**Files:** Create `apps/api/src/routes/surveillance/index.ts`, `apps/api/src/routes/glucometrics/index.ts`; modify `routes/index.ts`

- [ ] **Step 1:** `surveillance` (auth): `GET /surveillance/census?score=MEWS|NEWS2` (one row per admission: patient, unit/bed, latest score + band + action, highlighted), `GET /surveillance/:admissionId` (vitals trend + latest score + components + action ladder + per-element timestamps/freshness), `POST /surveillance/tick` (admin: manual `streamTick` for demo).
- [ ] **Step 2:** `glucometrics` (auth): `GET /glucometrics/census` (unit census triaged by the two rules: 24h-avg, last reading, flag), `GET /glucometrics/:admissionId` (glucose trend + insulin ledger + context flags: DM on problem list / on insulin, with per-element freshness labels).
- [ ] **Step 3:** Register; `turbo typecheck` 8/8; full `vitest run` green.
- [ ] **Step 4: Commit** — `feat: surveillance + glucometrics API routes`

### Task 7: Live run + verification

- [ ] **Step 1:** Throwaway tsx in `apps/api/src/` (delete before any tsc): run `streamTick()` once; confirm `ews_score` rows for MEWS+NEWS2, the seeded deteriorating patient scores high (MEWS≥4), glucometrics flags the 320 reading.
- [ ] **Step 2:** Spot-check via psql: a high MEWS admission's components sum correctly; a glucometrics high-risk admission genuinely has a ≥300 or avg≥180.
- [ ] **Step 3:** Boot API on 3099, mint token, exercise `/surveillance/census` (scores present), `/surveillance/:id` (trend + action), `/glucometrics/census`, `POST /surveillance/tick`.
- [ ] **Step 4:** Cancel any orphaned `pg_stat_activity` queries.

### Task 8: Frontend — Surveillance page (census + drill-down + glucometrics)

**Files:** Create `apps/web/src/pages/SurveillancePage.tsx`, `apps/web/src/hooks/useSurveillance.ts`; modify `App.tsx`, `AppShell.tsx`

- [ ] **Step 1:** Read existing page + hook patterns.
- [ ] **Step 2:** Unit census table with a **live MEWS/NEWS2 score column** (color-coded by band: green/amber/crimson), score-type toggle, highlighted elevated rows; click → drill-down (vitals trend, component breakdown, the action-ladder advisory, freshness labels). A **Glucometrics** tab: census triaged (24h-avg, last, flag) → drill-down (glucose trend + insulin ledger + context flags). Subscribe to the WebSocket alert channel for live score updates (reuse `useAlertSocket` pattern). A manual "tick" button (demo) calling `POST /surveillance/tick`.
- [ ] **Step 3:** Route `/surveillance` + nav (`Activity` / `HeartPulse` icon). `tsc --noEmit` AND `vite build` clean.
- [ ] **Step 4: Commit** — `feat: Surveillance page (live MEWS/NEWS2 census + glucometrics + drill-down)`

### Task 9: Verify, update plan, merge

- [ ] `turbo typecheck` 8/8, full `vitest run` green, `vite build` clean.
- [ ] Update master plan: mark D12, D13, D14 ✅ (note synthetic-streamer deviation — the lane is real, the feed is simulated).
- [ ] Merge `feature/cds-phase5-realtime-surveillance` → `main`; `git diff main...HEAD --diff-filter=D` empty; push.
- [ ] Update memory `project_medgnosis_cds_parity` (Phase 5 shipped + streamer/temp-F/hot-partition notes).

## Self-review notes
- **Spec coverage:** D12 = Tasks 1,2,5; D13 = Tasks 3,5,6,8; D14 = Tasks 4,5,6,8.
- **Data-honest:** no live HL7 feed / no unit-bed → synthetic streamer over `phm_rt` (real patients, simulated stream), structured for a real MLLP source to write the same tables. Temp converted F→C. Consciousness/GCS synthesized (absent in source). Engine consumes Phase-1 seeded bands — no re-invented content.
- **Scale:** synthetic census (~30 admissions) — no `encounter` (28.7M) or `observation` (1B) scans. Per-admission indexed access.
- **Reuse:** rules engine bands (Phase 1); `publishAlert` WebSocket (Phase 1); worker/route/page patterns (Phases 2–4). Generic engine scores both MEWS and NEWS2 from data.
- **Doctrine:** stream → stratify → delegate; transparent bedside-verifiable scoring; action ladder ends at RRT; per-element freshness labels (honest about what's live vs nightly); "the latency was the disease."
- **Type consistency:** `scoreVitals(params,bands)→{total,components,maxSingleParam}`; `mewsAction`/`news2Band`; `ews_score.score_type` ∈ MEWS|NEWS2 identical across engine/route/UI.
