# Phase 6: SuperNote — the self-assembling, self-coding note

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** "The note that does the work." A progress note pre-assembled from the record — generated brief history, interval events, organ-system-grouped problem list, in-note care gaps, trended labs, and an Assessment & Plan scaffold where **writing the plan codes the diagnosis**. The convergence point of Phases 1–5.

**Architecture:** A deterministic **assembly** layer over what already exists — `problem_list` + `dx_ontology` (Phases 1–2), `care_gap`, `encounter`/`phm_rt.admission`/`referral` (interval events, Phases 4–5), `fact_observation` (trended labs, code-filtered per Phase-2 lesson). Reuses `phm_edw.clinical_note` (UUID, SOAP fields, `ai_generated` jsonb) for storage; a new `note_coded_diagnosis` table captures the diagnoses the A&P codes (and feeds Phase 8 HCC). Assembly is deterministic + testable (no LLM dependency in the core; the existing Abby/`llmClient` can polish narrative later).

**Data reality (verified 2026-06-12):**
- `phm_edw.clinical_note`: `note_id` UUID, `patient_id`, `author_user_id` UUID, `visit_type`, `status`, `chief_complaint`, `subjective/objective/assessment/plan_text`, `ai_generated` jsonb, `finalized_at`. Reuse it (`visit_type='supernote'`).
- `dx_ontology` maps `icd10_code → disease_process / organ_system / generate_plan`, **one code → multiple rows** (E11.22 → Renal + Endocrine) — drives organ grouping + dual-mapping. `problem_list.icd10_code` joins to it; `problem_list.ontology_id` set when re-staged (Phase 2).
- `encounter` (28.7M) has `encounter_datetime/type/reason/provider_id` + patient-leading index `idx_encounter_patient_datetime` → fast per-patient interval events. `phm_rt.admission` (Phase 5) + `referral` (Phase 4) add admits/specialist events.
- Lab result codes (fact_observation, code-filtered): A1c `4548-4`, LDL `18262-6`, eGFR `33914-3`, creatinine `38483-4`, K `6298-4`, Na `2947-0`, glucose `2339-0`, BUN `6299-2` — the 8-analyte review.
- Demo patient 9: 6 problems across 2 organ systems.
- No patient-entered (OurNotes) or structured-PRO data exists → assembled as an empty/optional section (documented), not faked.

**Tech Stack:** PostgreSQL 17 (`npm run db:migrate` w/ host→localhost override), Fastify, vitest (`vi.hoisted`), React 19 + TanStack Query. Admin login admin@acumenus.net/superuser; API boot 3099 + localhost overrides.

**Branch:** `feature/cds-phase6-supernote`

---

### Task 1: Migration 041 — note_coded_diagnosis

**Files:** Create `packages/db/migrations/041_supernote.sql`

- [ ] **Step 1: Write DDL** (additive):

```sql
-- D15: the diagnoses an A&P codes (typing the plan codes the diagnosis).
-- Feeds Phase 8 HCC capture analytics.
CREATE TABLE IF NOT EXISTS phm_edw.note_coded_diagnosis (
  coded_id        SERIAL PRIMARY KEY,
  note_id         UUID NOT NULL REFERENCES phm_edw.clinical_note(note_id),
  patient_id      INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  icd10_code      VARCHAR(20) NOT NULL,
  diagnosis_name  VARCHAR(255),
  ontology_id     INT REFERENCES phm_edw.dx_ontology(ontology_id),
  disease_process VARCHAR(100),
  hcc_relevant    BOOLEAN NOT NULL DEFAULT FALSE,
  source          VARCHAR(40) NOT NULL DEFAULT 'supernote',
  created_date    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coded_dx_note ON phm_edw.note_coded_diagnosis (note_id);
CREATE INDEX IF NOT EXISTS idx_coded_dx_patient ON phm_edw.note_coded_diagnosis (patient_id, created_date DESC);

COMMENT ON TABLE phm_edw.note_coded_diagnosis IS
  'Diagnoses coded as a side effect of writing the SuperNote A&P. One row per addressed problem; feeds HCC capture (Phase 8).';
```

- [ ] **Step 2: Apply & verify** the table exists.
- [ ] **Step 3: Commit** — `feat: note_coded_diagnosis table (A&P-driven coding for SuperNote)`

### Task 2: SuperNote assembly service (TDD)

**Files:** Test `apps/api/src/services/__tests__/superNote.test.ts`; create `apps/api/src/services/superNote.ts`

- [ ] **Step 1: Failing tests** (pure helpers):
  - `organSystemRank('Cardiovascular')` < `organSystemRank('Other')` (high-impact systems first; unknown → last).
  - `groupProblems(rows)`: given problems with `{icd10_code, dx_name, organ_system, disease_process}` incl. a dual-mapped code (E11.22 in Renal AND Endocrine) and a duplicate, returns systems ordered by rank, each with deduped problems; the dual-mapped code appears under both systems.
  - `whatsDue(problems, gaps)`: returns a string naming the open-gap measures ("due for: A1c, eye exam") or 'up to date' when none.
  - `briefHistory({firstName,lastName,age,gender}, problems, lastSeenISO, due)`: deterministic sentence — contains name, age, the top conditions, "last seen", and the due text.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `superNote.ts`:
  - Pure helpers above (`ORGAN_RANK` map: Cardiovascular, Renal, Endocrine, Pulmonary, … then Other).
  - `assembleSuperNote(patientId)`: gather (parallel where possible)
    - demographics (name/age/gender from `patient`),
    - `lastSeen` (max completed `appointment` / `encounter`),
    - problems: `problem_list` LEFT JOIN `dx_ontology` on `icd10_code` (dual rows preserved) → `groupProblems`,
    - `intervalEvents`: recent `encounter` (since lastSeen, per-patient indexed, LIMIT) + `phm_rt.admission` + `referral`,
    - `careGaps`: open gaps + measure + as-of `CURRENT_DATE`,
    - `labReview`: the 8 analytes, latest 3 each via `fact_observation` (dim_patient→patient_key, code-filtered),
    - `assessmentPlan`: one entry per active problem where ontology `generate_plan` (or no ontology match → still listed) — `{icd10, name, organ_system, ontology_id, previous_plan, current_plan:''}` (previous_plan from the patient's last finalized supernote's matching coded dx, else null),
    - `briefHistory` (deterministic), `whatsDue`.
    Returns the structured document. Cohort-bounded, per-patient indexed.
  - `finalizeSuperNote(patientId, authorUserId, ap[])`: insert a `clinical_note` (`visit_type='supernote'`, `assessment`=summary, `plan_text`=joined plans, `ai_generated`=assembled snapshot, `status='final'`, `finalized_at=NOW()`) → for each `ap` entry with an `icd10_code` and non-empty plan, insert `note_coded_diagnosis` (resolve `ontology_id`/`disease_process`/`hcc_relevant`). Returns `{note_id, coded}`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: SuperNote assembly service (organ-grouped problems, interval events, trended labs, A&P coding)`

### Task 3: API routes

**Files:** Create `apps/api/src/routes/supernote/index.ts`; modify `routes/index.ts`; add `superNoteFinalizeSchema` to shared + re-export.

- [ ] **Step 1:** `supernote` (auth): `GET /supernote/:patientId` (assemble — returns the full structured document), `POST /supernote/:patientId/finalize` (Zod `superNoteFinalizeSchema`: `{ chief_complaint?, ap: [{icd10_code, diagnosis_name, plan}] }`) → `finalizeSuperNote` (actor = `request.user`), audited; returns `{note_id, coded}`.
- [ ] **Step 2:** Register; rebuild shared; `turbo typecheck` 8/8; full `vitest run` green.
- [ ] **Step 3: Commit** — `feat: SuperNote API routes (assemble + finalize)`

### Task 4: Live run + verification

- [ ] **Step 1:** Throwaway tsx in `apps/api/src/` (delete before any tsc): `assembleSuperNote(9)` — confirm organ-grouped problems (2 systems), interval events, ≥1 trended analyte, an A&P scaffold; then `finalizeSuperNote(9, <uuid>, [{icd10,plan}])` → a `clinical_note` + `note_coded_diagnosis` rows appear.
- [ ] **Step 2:** Spot-check via psql: the finalized note exists (`visit_type='supernote'`), coded dx rows reference real ontology entries; the dual-mapped code (if present) grouped under both systems in the assembled snapshot.
- [ ] **Step 3:** Boot API on 3099, mint token, `GET /supernote/9` (sections populated), `POST /supernote/9/finalize` (note + coded dx persist + audit).
- [ ] **Step 4:** Cancel any orphaned `pg_stat_activity` queries.

### Task 5: Frontend — SuperNote page

**Files:** Create `apps/web/src/pages/SuperNotePage.tsx`, `apps/web/src/hooks/useSuperNote.ts`; modify `App.tsx`, `AppShell.tsx` (and a "SuperNote" action from the patient detail page if quick).

- [ ] **Step 1:** Read existing page + hook patterns.
- [ ] **Step 2:** Route `/supernote/:patientId`. Render the assembled note: brief history (leads with what's due, highlighted), interval events table, organ-system-grouped problem list (dual-mapped dx shown under each system), in-note care gaps with **include-toggle** + as-of stamp, 8-analyte trended lab table, and the **A&P scaffold** — one card per problem with the previous plan shown and a plan textarea; **Finalize** codes the diagnoses (POST finalize) → toast with coded count. Patient header (name/age/dx).
- [ ] **Step 3:** Reachable via nav and/or a "Generate SuperNote" button on `PatientDetailPage`. `tsc --noEmit` AND `vite build` clean.
- [ ] **Step 4: Commit** — `feat: SuperNote page (assembled note + A&P that codes diagnoses)`

### Task 6: Verify, update plan, merge

- [ ] `turbo typecheck` 8/8, full `vitest run` green, `vite build` clean.
- [ ] Update master plan: mark D15 ✅ (note deterministic-assembly + no-OurNotes-data deviations).
- [ ] Merge `feature/cds-phase6-supernote` → `main`; `git diff main...HEAD --diff-filter=D` empty; push.
- [ ] Update memory `project_medgnosis_cds_parity` (Phase 6 shipped).

## Self-review notes
- **Spec coverage:** D15 = Tasks 1,2,3,4,5.
- **Data-honest:** assembly is deterministic from real data; organ grouping + dual-mapping from `dx_ontology`; trended labs via the code-filtered `fact_observation` index (Phase-2 lesson); OurNotes/PRO sections empty (no patient-entered data) — structured but not faked. LLM narrative deferred (deterministic template instead) — testable, no flakiness.
- **Scale:** per-patient indexed access (problem_list, encounter patient index, fact_observation code-filtered); no full-table scans.
- **Reuse:** `clinical_note` storage; `dx_ontology` (Phases 1–2); care gaps; interval events from existing encounter/admission/referral; `note_coded_diagnosis` feeds Phase 8. Route/page patterns from Phases 2–5.
- **Doctrine:** the note assembles itself and leads with what's due; problems grouped by organ system (one diagnosis can carry two care plans); care gaps ride inside the note; typing the plan codes the diagnosis; previous plan shown beside today's.
- **Type consistency:** `assembleSuperNote(patientId)→{briefHistory,intervalEvents,problemsBySystem,careGaps,labReview,assessmentPlan,…}`; `finalizeSuperNote(...)→{note_id,coded}`; A&P entry `{icd10_code,diagnosis_name,plan}` identical across service, route Zod, UI.
