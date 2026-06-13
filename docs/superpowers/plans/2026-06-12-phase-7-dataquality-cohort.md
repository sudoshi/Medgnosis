# Phase 7: Data Quality Discovery & Cohort Manager

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Disciplined doubt and specialist population tools. **Data Quality** (D17): hunt anomalies (impossible values, identity collisions, rate-of-change), surface them in a "rogues' gallery," and turn every confirmed anomaly into a standing regression check; track the five tests (accurate/timely/complete/understood/trusted) per feed. **Cohort Manager** (D18): a criteria-based cohort builder with continuously-computed high-risk flags and structured closed-loop messaging from specialist back to PCP.

**Architecture:** Detectors and flags run over **small/bounded tables only** — `vital_sign` (4.4k), `provider`, `problem_list` (12k), `order_result` (2.5k), and the problem-list cohort with code-filtered `fact_observation` lookups (the Phase-2 lesson). **Never** scan `observation` (~1B) or `patient` (1M) — see memory `project_medgnosis_observation_table_io`. Reuses the rules engine, the worker/route/page patterns, and the closed-loop-disposition doctrine from Phases 3–6.

**Data reality (verified 2026-06-12):**
- `patient` has **no death/deceased column** → the compendium "zombie" detector is dropped (can't fabricate a death field); the other anomalies cover the doctrine.
- `vital_sign` is **naturally clean** (height 62–74 in, temp 97.8–98.9 °F, weight 130–231 lbs) → seed deliberate anomalies (impossible height/temp, weight jump) so detectors have specimens (the AMP/census synthetic pattern).
- `provider`: `first_name/last_name/middle_name/display_name/npi_number` → trailing-space / duplicate-name detectors.
- Flag inputs exist: K `6298-4`, eGFR `33914-3` (`fact_observation`), BMP via `order_result`/`clinical_order`, ACE/ARB via `medication` name match.

**Tech Stack:** PostgreSQL 17 (`npm run db:migrate` host→localhost override; migrations deterministic), Fastify, BullMQ, vitest (`vi.hoisted`), React 19 + TanStack Query. Admin admin@acumenus.net/superuser; API boot 3099 + localhost overrides.

**Branch:** `feature/cds-phase7-dq-cohort`

---

### Task 1: Migration 042 — DQ + Cohort schema

**Files:** Create `packages/db/migrations/042_dq_cohort.sql`

- [ ] **Step 1: Write DDL** (additive):

```sql
-- ─── D17: Data Quality ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phm_edw.dq_finding (
  finding_id    SERIAL PRIMARY KEY,
  detector      VARCHAR(60) NOT NULL,        -- impossible_height | impossible_temp | weight_jump | provider_trailing_space | ...
  entity_table  VARCHAR(60) NOT NULL,
  entity_id     INT,
  patient_id    INT,
  field         VARCHAR(60),
  observed      TEXT,                          -- the offending value
  severity      VARCHAR(20) NOT NULL DEFAULT 'warning', -- info | warning | critical
  detail        JSONB,
  status        VARCHAR(20) NOT NULL DEFAULT 'open',     -- open | confirmed | dismissed
  is_regression BOOLEAN NOT NULL DEFAULT FALSE,          -- confirmed anomaly → standing check
  resolved_by   VARCHAR(100),
  resolved_at   TIMESTAMP,
  created_date  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dq_finding UNIQUE (detector, entity_table, entity_id, field)
);
CREATE INDEX IF NOT EXISTS idx_dq_status ON phm_edw.dq_finding (status, detector);

-- The five tests per feed (accurate/timely/complete/understood/trusted) + freshness
CREATE TABLE IF NOT EXISTS phm_edw.dq_feed (
  feed_id        SERIAL PRIMARY KEY,
  feed_name      VARCHAR(80) NOT NULL UNIQUE,
  source         VARCHAR(120),
  accurate       BOOLEAN,
  timely         BOOLEAN,
  complete       BOOLEAN,
  understood     BOOLEAN,
  trusted        BOOLEAN,
  latency        VARCHAR(40),                  -- 'real-time' | 'nightly' | ...
  last_refreshed TIMESTAMP,
  notes          TEXT
);

-- ─── D18: Cohort Manager ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phm_edw.cohort_definition (
  cohort_id     SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  description   TEXT,
  criteria      JSONB NOT NULL,                -- {conditions:[icd10 prefixes], flags:[...], gfr_max, ...}
  created_by    VARCHAR(100),
  active_ind    CHAR(1) NOT NULL DEFAULT 'Y',
  created_date  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Continuously-computed high-risk flags per patient
CREATE TABLE IF NOT EXISTS phm_edw.patient_flag (
  flag_id       SERIAL PRIMARY KEY,
  patient_id    INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  flag_key      VARCHAR(60) NOT NULL,          -- HYPERKALEMIA | GFR_LOW | NEW_ACEARB_NO_BMP | ...
  value_text    VARCHAR(120),
  computed_date TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_patient_flag UNIQUE (patient_id, flag_key)
);
CREATE INDEX IF NOT EXISTS idx_patient_flag_key ON phm_edw.patient_flag (flag_key);

-- Structured closed-loop messaging specialist → PCP
CREATE TABLE IF NOT EXISTS phm_edw.cohort_message (
  message_id    SERIAL PRIMARY KEY,
  patient_id    INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  from_user     VARCHAR(100) NOT NULL,
  to_provider_id INT REFERENCES phm_edw.provider(provider_id),
  subject       VARCHAR(200) NOT NULL,
  body          TEXT,
  required_disposition VARCHAR(80),            -- what the PCP must do
  status        VARCHAR(20) NOT NULL DEFAULT 'sent', -- sent | acknowledged | resolved
  disposition   TEXT,
  resolved_by   VARCHAR(100),
  resolved_at   TIMESTAMP,
  created_date  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cohort_msg_status ON phm_edw.cohort_message (status, created_date DESC);
```

- [ ] **Step 2: Apply & verify** the 5 tables.
- [ ] **Step 3: Commit** — `feat: DQ (dq_finding, dq_feed) + Cohort Manager (cohort_definition, patient_flag, cohort_message) schema`

### Task 2: Migration 043 — seed anomalies, feeds, sample cohort

**Files:** Create `packages/db/migrations/043_seed_dq_cohort.sql`

- [ ] **Step 1:** Seed (deterministic):
  1. **Deliberate anomalies** into `vital_sign` for a few cohort patients — one impossible height (`height_in = 985.32`), one impossible temp (`temperature_f = 9834` — misplaced decimal), one impossible weight + a +150 lb jump vs the patient's prior reading. (Reference real patients; these become the gallery specimens.)
  2. A **trailing-space provider** display_name (`UPDATE … SET display_name = display_name || ' '` for one provider) + note.
  3. `dq_feed` rows for ~5 feeds: Vitals (real-time, all-pass), Labs (nightly), Problem List (nightly, complete=false — the recognition gap), Glucose stream (real-time), Provider directory (with a trusted=false). With `last_refreshed` and `latency`.
  4. A sample `cohort_definition` "CKD Stage 3–4, no recent nephrology" with `criteria` jsonb.
- [ ] **Step 2:** Apply; verify the seeded anomalies exist (impossible height/temp present) + dq_feed ≥ 5.
- [ ] **Step 3: Commit** — `feat: seed DQ anomalies + feed five-tests + sample cohort`

### Task 3: DQ detectors service (TDD)

**Files:** Test `apps/api/src/services/__tests__/dqDetectors.test.ts`; create `apps/api/src/services/dqDetectors.ts`

- [ ] **Step 1: Failing tests** (pure): `isImpossibleHeight(in)` (outside 20–96 → true), `isImpossibleTemp(f)` (outside 86–113 → true), `isImpossibleWeight(lbs)` (outside 1–1000 → true), `isImplausibleJump(prev, curr, maxDelta)` (|Δ| > max → true), `hasEdgeWhitespace(s)` (leading/trailing space → true).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `dqDetectors.ts`: pure helpers + `runDqScan()`: scan `vital_sign` (impossible height/temp/weight + per-patient consecutive weight jump via window fn), `provider` (edge whitespace / duplicate display_name); UPSERT `dq_finding` (`ON CONFLICT … DO NOTHING` so confirmed/dismissed states survive re-scan). Returns counts by detector. **Small tables only.**
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: data-quality anomaly detectors (impossible values, jumps, identity)`

### Task 4: Cohort flags service (TDD)

**Files:** Test `apps/api/src/services/__tests__/cohortFlags.test.ts`; create `apps/api/src/services/cohortFlags.ts`

- [ ] **Step 1: Failing tests** (pure): `flagHyperkalemia(k)` (≥5.5 → true), `flagGfrLow(gfr)` (<30 → true), `flagNewAceArbNoBmp({onAceArb, hasRecentBmp})` (onAceArb && !hasRecentBmp → true), and `matchesCohort(patient, criteria)` (icd10-prefix + flag membership).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `cohortFlags.ts`: pure helpers + `runCohortFlags()`: over the problem-list cohort, gather latest K/eGFR (`fact_observation` code-filtered) + ACE/ARB + recent-BMP signals, compute flags, UPSERT `patient_flag`. `previewCohort(criteria)`: returns matching patients (bounded). Returns flag counts.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: cohort high-risk flags (hyperkalemia, low-GFR, new ACE/ARB no BMP) + cohort match`

### Task 5: Workers + nightly wiring

**Files:** Create `apps/api/src/workers/data-quality.ts`; modify `nightly-scheduler.ts`, `worker.ts`

- [ ] **Step 1:** Queues `medgnosis-dq` (→ `runDqScan`) + `medgnosis-cohort-flags` (→ `runCohortFlags`); mirror existing worker shape.
- [ ] **Step 2:** Nightly enqueues both; register in `worker.ts`. `tsc --noEmit` → 0.
- [ ] **Step 3: Commit** — `feat: nightly DQ scan + cohort-flag computation workers`

### Task 6: API routes

**Files:** Create `apps/api/src/routes/data-quality/index.ts`, `apps/api/src/routes/cohorts/index.ts`; modify `routes/index.ts`; add `cohortMessageSchema` + `cohortCreateSchema` to shared.

- [ ] **Step 1:** `data-quality` (auth): `GET /data-quality/findings?status=open` (rogues gallery), `GET /data-quality/feeds` (five-tests + freshness), `POST /data-quality/findings/:id/confirm` (→ confirmed + `is_regression=true`), `POST /data-quality/findings/:id/dismiss`.
- [ ] **Step 2:** `cohorts` (auth): `GET /cohorts` (definitions), `POST /cohorts` (create from criteria), `GET /cohorts/:id/patients` (preview/members + their flags), `GET /cohorts/flags?flag_key=` (flagged-patient worklist), `POST /cohorts/message` (closed-loop specialist→PCP), `POST /cohorts/message/:id/resolve` (PCP documents disposition).
- [ ] **Step 3:** Register; rebuild shared; `turbo typecheck` 8/8; full `vitest run` green.
- [ ] **Step 4: Commit** — `feat: data-quality + cohort-manager API routes`

### Task 7: Live run + verification

- [ ] **Step 1:** Throwaway tsx (delete before any tsc): `runDqScan()` → confirm it finds the seeded impossible height/temp/jump + the trailing-space provider; `runCohortFlags()` → flags computed (counts by key).
- [ ] **Step 2:** Spot-check psql: a `dq_finding` references the seeded 985-inch height; a `patient_flag` HYPERKALEMIA patient genuinely has K≥5.5 (or note if none — seed one if needed); `previewCohort` on the sample definition returns members.
- [ ] **Step 3:** Boot API 3099, mint token: gallery findings, confirm one (→ regression), feeds five-tests; create a cohort, list members+flags, send a closed-loop message, resolve it (disposition + audit).
- [ ] **Step 4:** Cancel any orphaned `pg_stat_activity` queries.

### Task 8: Frontend — Rogues' Gallery + Cohort Manager

**Files:** Create `apps/web/src/pages/DataQualityPage.tsx`, `apps/web/src/pages/CohortManagerPage.tsx`, `apps/web/src/hooks/useDataQuality.ts`, `apps/web/src/hooks/useCohorts.ts`; modify `App.tsx`, `AppShell.tsx`.

- [ ] **Step 1:** Read existing page/hook patterns.
- [ ] **Step 2:** **DataQualityPage**: the five-tests feed strip (accurate/timely/complete/understood/trusted badges + freshness) + the rogues' gallery (each finding: detector, value, entity, severity; Confirm → regression / Dismiss). **CohortManagerPage**: a simple criteria builder (condition prefixes + flag checkboxes) → preview members with their flags; per-member "Message PCP" (subject + required disposition) closing the loop; a messages list with resolve.
- [ ] **Step 3:** Routes `/data-quality`, `/cohorts` + nav (`ShieldAlert`/`Microscope` + `UsersRound`). `tsc --noEmit` AND `vite build` clean.
- [ ] **Step 4: Commit** — `feat: Data Quality rogues' gallery + Cohort Manager pages`

### Task 9: Verify, update plan, merge

- [ ] `turbo typecheck` 8/8, full `vitest run` green, `vite build` clean.
- [ ] Update master plan: mark D17, D18 ✅ (note no-death-column → no zombie detector; seeded anomalies).
- [ ] Merge `feature/cds-phase7-dq-cohort` → `main`; `git diff main...HEAD --diff-filter=D` empty; push.
- [ ] Update memory `project_medgnosis_cds_parity` (Phase 7 shipped).

## Self-review notes
- **Spec coverage:** D17 = Tasks 1,2,3,5,6,7,8; D18 = Tasks 1,2,4,5,6,7,8.
- **Data-honest:** detectors over small tables (vital_sign/provider/problem_list); anomalies seeded (Synthea data is clean) — the specimens are deliberate, labeled; zombie detector dropped (no death column). Flags from real K/eGFR via code-filtered `fact_observation`.
- **Scale:** NO `observation`/`patient` full scans (memory rule); bounded cohort + per-patient indexed access; vital_sign/provider are dimension-scale.
- **Reuse:** worker/route/page patterns (Phases 2–6); closed-loop disposition doctrine (Phase 3); `fact_observation` code-filtered (Phase 2). `note_coded_diagnosis` untouched (feeds Phase 8).
- **Doctrine:** a data-quality problem is a process-control problem; confirmed anomaly → standing regression check; the five tests as a per-feed discipline with on-screen freshness; specialist → structured closed-loop → PCP disposition (not a curbside).
- **Type consistency:** `runDqScan()→{byDetector}`; `runCohortFlags()→{byFlag}`; `dq_finding.status`/`detector` and `patient_flag.flag_key` identical across service/route/UI; closed-loop `cohort_message.status` (sent/acknowledged/resolved) consistent.
