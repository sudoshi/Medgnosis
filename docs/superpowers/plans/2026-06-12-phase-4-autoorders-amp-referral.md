# Phase 4: Auto-Orders, AMP & Auto-Referral

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Care that happens before the visit. **Auto-Orders** (D7): protocol-driven order generation with physician-held keys (co-sign once, dis-enroll anytime). **AMP** (D8): work every care gap two weeks before the appointment, plus reach the population drifting away from care; a disposition ledger where *declined* is a counted outcome; a capture-rate ROI model. **Auto-Referral MTM** (D9): persistently uncontrolled diabetes/HTN/hyperlipidemia → pharmacist referral → repatriation at goal.

**Architecture:** Builds on Phase 1 rules engine (thresholds/config as data), the existing `appointment` / `clinical_order` / `order_set_item` / `referral` / `care_gap` tables, and the Phase 2/3 worker+route+page patterns. Cohort-scoped batch (BullMQ); no real-time, no `observation` value scans (uncontrolled detection uses the code-filtered `fact_observation` index per the Phase-2 lesson).

**Data reality (verified 2026-06-12 — design to this):**
- `appointment` (4,276 rows): **all in the past** (latest 2026-03-18). 4,181 Completed. → AMP-2/3 ("not seen in 1/2 yrs") compute from real last-seen; **AMP-1 (pre-visit) needs synthetic future appointments — seed them** (the D3 generator the roadmap deferred).
- Last-seen cohort (1,277 problem-list patients): **391 not-seen-1yr, 68 not-seen-2yr**, 886 with no completed appt.
- Result codes (in `observation`/`fact_observation`): A1c `4548-4`, **LDL `18262-6`**, HDL `2085-9`; BP in `vital_sign.bp_systolic/bp_diastolic`. (Order codes differ — use these *result* codes.)
- `order_set_item`: has `measure_id`, `frequency`, `loinc_code`/`cpt_code`, `item_type` → drives what auto-orders generate and at what cadence.
- `clinical_order`: `order_source` (mark `'protocol'`), `due_date` (future-dating), `order_status`.
- `referral` (65 rows): rich (`referral_status`, `specialty`, `urgency`, `scheduled_date`, `completed_date`) → D9 state machine.
- `measure_definition`: **no revenue column** → add `net_revenue` (additive) + seed for AMP ROI.

**Tech Stack:** PostgreSQL 17 (`npm run db:migrate -w @medgnosis/db` with `DATABASE_URL` host→localhost override), Fastify, BullMQ, vitest (`vi.hoisted`), React 19 + TanStack Query. Admin login admin@acumenus.net / superuser. API test boot: API_PORT=3099 + localhost DATABASE_URL/REDIS_URL (Redis/Solr degrade gracefully).

**Branch:** `feature/cds-phase4-autoorders-amp`

---

### Task 1: Migration 037 — DDL

**Files:** Create `packages/db/migrations/037_autoorders_amp_referral.sql`

- [ ] **Step 1: Write the migration** (all additive; `IF NOT EXISTS`):

```sql
-- D7: Auto-Orders — a protocol bundles recurring orderable items; enrollment is
-- physician-co-signed and standing until dis-enrolled.
CREATE TABLE IF NOT EXISTS phm_edw.order_protocol (
  protocol_id   SERIAL PRIMARY KEY,
  protocol_code VARCHAR(60) NOT NULL UNIQUE,
  protocol_name VARCHAR(200) NOT NULL,
  description   TEXT,
  active_ind    CHAR(1) NOT NULL DEFAULT 'Y',
  created_date  TIMESTAMP NOT NULL DEFAULT NOW()
);
-- which order_set_items a protocol auto-generates (cadence from order_set_item.frequency)
CREATE TABLE IF NOT EXISTS phm_edw.order_protocol_item (
  protocol_item_id SERIAL PRIMARY KEY,
  protocol_id   INT NOT NULL REFERENCES phm_edw.order_protocol(protocol_id),
  item_id       INT NOT NULL REFERENCES phm_edw.order_set_item(item_id),
  interval_days INT NOT NULL,            -- generation cadence
  active_ind    CHAR(1) NOT NULL DEFAULT 'Y',
  CONSTRAINT uq_protocol_item UNIQUE (protocol_id, item_id)
);
CREATE TABLE IF NOT EXISTS phm_edw.protocol_enrollment (
  enrollment_id SERIAL PRIMARY KEY,
  patient_id    INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  protocol_id   INT NOT NULL REFERENCES phm_edw.order_protocol(protocol_id),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | active | denied | disenrolled
  enrolled_by   VARCHAR(100),            -- co-signing provider (actor)
  enrolled_at   TIMESTAMP,
  expires_at    DATE,                    -- 5-year standing
  created_date  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_enrollment UNIQUE (patient_id, protocol_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollment_status ON phm_edw.protocol_enrollment (status);

-- D8: AMP outreach disposition ledger (declined is a COUNTED outcome)
CREATE TABLE IF NOT EXISTS phm_edw.amp_outreach (
  outreach_id   SERIAL PRIMARY KEY,
  patient_id    INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  care_gap_id   INT REFERENCES phm_edw.care_gap(care_gap_id),
  amp_tier      SMALLINT NOT NULL,       -- 1=pre-visit 2=not-seen-1yr 3=not-seen-2yr 4=point-of-care
  appointment_id INT REFERENCES phm_edw.appointment(appointment_id),
  disposition   VARCHAR(40),             -- labs_completed | procedure | reminder | declined | education | referral | pending
  net_revenue   NUMERIC,                 -- captured at disposition time
  contacted_at  TIMESTAMP,
  outreach_by   VARCHAR(100),
  notes         TEXT,
  created_date  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_amp_tier ON phm_edw.amp_outreach (amp_tier, disposition);
CREATE INDEX IF NOT EXISTS idx_amp_patient ON phm_edw.amp_outreach (patient_id);

-- D8: per-gap net revenue for the ROI capture model
ALTER TABLE phm_edw.measure_definition ADD COLUMN IF NOT EXISTS net_revenue NUMERIC;

-- D9: MTM auto-referral state machine over the existing referral table
CREATE TABLE IF NOT EXISTS phm_edw.mtm_referral (
  mtm_id        SERIAL PRIMARY KEY,
  patient_id    INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  referral_id   INT REFERENCES phm_edw.referral(referral_id),
  condition     VARCHAR(40) NOT NULL,    -- diabetes | hypertension | hyperlipidemia
  trigger_value NUMERIC NOT NULL,        -- the uncontrolled measurement
  trigger_code  VARCHAR(20) NOT NULL,    -- LOINC / 'SBP'
  mtm_status    VARCHAR(20) NOT NULL DEFAULT 'referred', -- referred | managed | at_goal | repatriated
  referred_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  goal_at       DATE,
  repatriated_at DATE,
  active_ind    CHAR(1) NOT NULL DEFAULT 'Y',
  created_date  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mtm_open UNIQUE (patient_id, condition)
);
CREATE INDEX IF NOT EXISTS idx_mtm_status ON phm_edw.mtm_referral (mtm_status);
```

- [ ] **Step 2: Apply & verify** the 5 new tables + `measure_definition.net_revenue`.
- [ ] **Step 3: Commit** — `feat: auto-orders/AMP/MTM tables + measure net_revenue`

### Task 2: Migration 038 — seeds (future appts, net_revenue, thresholds, protocol)

**Files:** Create `packages/db/migrations/038_seed_phase4.sql`

- [ ] **Step 1:** Seed:
  1. **Synthetic future appointments** for ~250 cohort patients: `INSERT INTO phm_edw.appointment (patient_id, provider_id, org_id, appointment_date, start_time, end_time, appointment_type, status)` selecting from problem-list patients (use their pcp_provider_id; fall back to any provider), `appointment_date = CURRENT_DATE + (random-ish offset 1..21 days)` — use `generate_series`/`row_number` modulo (NOT `random()` — keep migration deterministic), status `'Scheduled'`. Cap 250. This enables AMP-1.
  2. **net_revenue** on common measures (compendium pricing): colonoscopy/screening ≈ $406, A1c ≈ $11, lipid ≈ $20, TDAP ≈ $251, mammogram ≈ $140, microalbumin ≈ $15, eye exam ≈ $75. `UPDATE measure_definition SET net_revenue = ... WHERE measure_code/name ~* ...`; default modest value for the rest.
  3. **clinical_rule** entity `UNCONTROLLED_THRESHOLD`: `{condition, code, op, value}` rows — diabetes A1c ≥ 9.0 (`4548-4`), hypertension SBP ≥ 140 (`SBP`), hyperlipidemia LDL ≥ 100 (`18262-6`). (compendium "Hyperlipidemia, LDL<100" goal.)
  4. **order_protocol** "CHRONIC_MONITORING" + `order_protocol_item` rows linking a handful of recurring lab `order_set_item`s (A1c q180d, lipid q365d, microalbumin q365d, BMP q365d) — pick real `item_id`s via subquery on `order_set_item` where `loinc_code IN (...)`.
- [ ] **Step 2:** Apply; verify counts (future appts > 0, net_revenue populated, thresholds=3, protocol items > 0).
- [ ] **Step 3: Commit** — `feat: seed future appts, measure revenue, uncontrolled thresholds, chronic-monitoring protocol`

### Task 3: Auto-Orders service (TDD)

**Files:** Test `apps/api/src/services/__tests__/autoOrders.test.ts`; create `apps/api/src/services/autoOrders.ts`

- [ ] **Step 1: Failing tests** (pure helpers): `isExcluded(flags)` (hospice/palliative/inactive → true); `isItemDue(lastOrderedISO, intervalDays, todayISO)` (null last → due; within interval → not due; past interval → due); `expiryDate(enrolledISO)` → +5 years.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `autoOrders.ts`: pure helpers + `generateForEnrollments()`: for each `active` enrollment not expired, for each protocol item, if due (no `clinical_order` with that loinc since `interval_days`), INSERT a future-dated (`due_date = today + 180`) `clinical_order` with `order_source='protocol'`, `order_status='Future'`. Returns `{enrollments, generated}`. Cohort-bounded (only enrolled patients).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: Auto-Orders generation service (co-signed, standing, due-based)`

### Task 4: AMP engine (TDD)

**Files:** Test `apps/api/src/services/__tests__/ampEngine.test.ts`; create `apps/api/src/services/ampEngine.ts`

- [ ] **Step 1: Failing tests** (pure): `ampTier({hasUpcomingAppt, daysSinceLastSeen})` → 1 if upcoming; else 2 if >365; 3 if >730; null otherwise. `captureRevenue(gaps, rate)` → Σ(net_revenue) × rate (the ROI model; rate ∈ 0..1).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `ampEngine.ts`: pure helpers + `runAmpSweep()`: cohort = problem-list patients with last-seen (from Completed appts) + any future appt. Assign tier; for AMP-1, the gaps due within T-14 of the upcoming appt; UPSERT `amp_outreach` rows (`disposition='pending'`, `net_revenue` from the gap's measure). Returns `{byTier, totalGaps, opportunity}`. `ampRoi()`: sum net_revenue of pending outreach grouped by tier (powers the slider).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: AMP pre-visit engine (tiering, gap worklist, ROI opportunity)`

### Task 5: Auto-Referral MTM detector (TDD)

**Files:** Test `apps/api/src/services/__tests__/mtmReferral.test.ts`; create `apps/api/src/services/mtmReferral.ts`

- [ ] **Step 1: Failing tests** (pure): `isUncontrolled(condition, value, thresholds)` (A1c 9.5 vs ≥9 → true; SBP 130 vs ≥140 → false; LDL 110 vs ≥100 → true); `nextMtmStatus(current, atGoal)` state machine (referred+atGoal→at_goal; at_goal→repatriated; managed+!atGoal→managed).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `mtmReferral.ts`: pure helpers + `runMtmScan()`: thresholds from rules engine; for the AFib-style bounded cohort (diabetic / hypertensive / hyperlipidemic problem-list patients), get latest A1c/LDL (via `fact_observation` code-filtered) + latest SBP (`vital_sign`); if uncontrolled and no open `mtm_referral`, create one (`referred`, with a `referral` row, specialty 'Clinical Pharmacy'); for existing open ones, advance state if now at goal. Returns counts by status. Cohort-scoped, per-patient indexed.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: Auto-Referral MTM detector (uncontrolled → pharmacist → repatriation)`

### Task 6: Workers + nightly/monthly wiring

**Files:** Create `apps/api/src/workers/anticipatory.ts`; modify `nightly-scheduler.ts`, `worker.ts`

- [ ] **Step 1:** Queues `medgnosis-autoorders`, `medgnosis-amp`, `medgnosis-mtm` → the three run functions (mirror `close-the-loop.ts` worker shape).
- [ ] **Step 2:** Nightly enqueues AMP sweep + MTM scan; auto-orders generation enqueued monthly (the scheduler already supports repeat patterns — add a `0 3 1 * *` monthly repeat, or enqueue from nightly guarded to first-of-month). Register all three workers in `worker.ts`.
- [ ] **Step 3:** `tsc --noEmit` (api) → 0.
- [ ] **Step 4: Commit** — `feat: anticipatory-care workers (auto-orders monthly, AMP + MTM nightly)`

### Task 7: API routes

**Files:** Create `apps/api/src/routes/auto-orders/index.ts`, `apps/api/src/routes/amp/index.ts`, `apps/api/src/routes/mtm/index.ts`; modify `routes/index.ts`; add Zod schemas (`protocolEnrollSchema`, `ampDispositionSchema`) to shared + re-export.

- [ ] **Step 1:** `auto-orders` (auth): `GET /auto-orders/protocols` (registry), `GET /auto-orders/enrollments?status=pending` (co-sign queue), `POST /auto-orders/enrollments` (enroll patient→pending), `POST /auto-orders/enrollments/:id/cosign` (provider co-sign → active + expiry), `POST /auto-orders/enrollments/:id/disenroll`.
- [ ] **Step 2:** `amp` (auth): `GET /amp?tier=1` (outreach worklist + patient + gap + revenue), `POST /amp/:id/disposition` (Zod: disposition enum, captures net_revenue), `GET /amp/roi` (opportunity by tier for the slider).
- [ ] **Step 3:** `mtm` (auth): `GET /mtm?status=referred` (referral worklist), `POST /mtm/:id/advance` (advance state machine).
- [ ] **Step 4:** Register; rebuild shared; `turbo typecheck` 8/8; full `vitest run` green.
- [ ] **Step 5: Commit** — `feat: auto-orders + AMP + MTM API routes`

### Task 8: Live run + verification

- [ ] **Step 1:** Throwaway tsx in `apps/api/src/` (delete before any tsc — `.ts` imports trip TS5097): seed one enrollment, run `generateForEnrollments`, `runAmpSweep`, `runMtmScan`. Expect: future appts present → AMP-1 gaps; AMP-2 ≈391 / AMP-3 ≈68; some MTM referrals (uncontrolled A1c/LDL/SBP); auto-orders generated for the enrollment.
- [ ] **Step 2:** Spot-check via psql: one AMP-2 patient genuinely last-seen >1yr; one MTM referral's trigger value genuinely uncontrolled; one generated order is future-dated with `order_source='protocol'`.
- [ ] **Step 3:** Boot API on 3099 (localhost overrides), mint admin token, exercise: co-sign an enrollment, AMP disposition (declined — confirm counted), `/amp/roi`, MTM advance. Confirm persistence + audit.
- [ ] **Step 4:** Cancel any orphaned `pg_stat_activity` queries.

### Task 9: Frontend — AMP worklist + ROI slider (+ enrollment/MTM panels)

**Files:** Create `apps/web/src/pages/AnticipatoryPage.tsx`, `apps/web/src/hooks/useAnticipatory.ts`; modify `App.tsx`, `AppShell.tsx`

- [ ] **Step 1:** Read `CloseTheLoopPage`/`PopulationFinderPage` + hooks for patterns.
- [ ] **Step 2:** AMP worklist (tier tabs 1/2/3, patient + gap + revenue, disposition actions incl. **Declined**), the signature **capture-rate ROI slider** (10/20/30/100% → $ opportunity from `/amp/roi`), an Auto-Orders co-sign queue section, and an MTM referral section. One page, sectioned (AMP headline).
- [ ] **Step 3:** Route `/anticipatory` + nav (`CalendarClock` icon). `tsc --noEmit` AND `vite build` clean.
- [ ] **Step 4: Commit** — `feat: Anticipatory care page (AMP worklist + ROI slider + enrollment + MTM)`

### Task 10: Verify, update plan, merge

- [ ] `turbo typecheck` 8/8, full `vitest run` green, `vite build` clean.
- [ ] Update master plan: mark D7, D8, D9 ✅ (note synthetic-future-appointments + AMP-1-needs-seeded-appts deviations).
- [ ] Merge `feature/cds-phase4-autoorders-amp` → `main`; `git diff main...HEAD --diff-filter=D` empty; push.
- [ ] Update memory `project_medgnosis_cds_parity` (Phase 4 shipped + data notes).

## Self-review notes
- **Spec coverage:** D7 = Tasks 1,2,3,6,7,8,9; D8 = Tasks 1,2,4,6,7,8,9; D9 = Tasks 1,2,5,6,7,8,9.
- **Data-honest:** AMP-1 needs future appts → seeded (the D3 generator); AMP-2/3 from real last-seen (391/68); MTM from real A1c/LDL/SBP (codes 4548-4 / 18262-6 / vital_sign). net_revenue added + seeded for the ROI model. Uncontrolled thresholds + protocol config in the rules engine.
- **Scale:** all cohort-scoped to problem-list patients; uncontrolled labs via `fact_observation` code-filtered index (Phase-2 lesson); no `observation` value scans; bounded per-patient access.
- **Reuse:** order generation reuses `clinical_order`/`order_set_item`; MTM reuses `referral`; rules engine for all thresholds/config; worker/route/page patterns from Phases 2–3; dispositions audited.
- **Doctrine:** physician holds both keys (co-sign + dis-enroll); anticipation not memory; declined is a counted outcome; ROI shown as the honest ladder (10/20/30/100%), not the headline; delegation (pharmacy owns MTM).
- **Type consistency:** `generateForEnrollments()→{enrollments,generated}`; `ampTier(...)→1|2|3|null`; `nextMtmStatus(current,atGoal)`; `amp_outreach.disposition` enum identical across engine, route Zod, UI.
