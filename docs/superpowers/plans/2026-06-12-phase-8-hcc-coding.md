# Phase 8: HCC & Coding Analytics (final phase)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Close the roadmap. A thin reporting layer over the coding the platform already produces: **HCC capture rate** per provider, **E&M visit-level distribution**, and a **missed-opportunity report** (conditions evident in the data but never coded — the recognition gap, quantified).

**Architecture:** Pure reporting over existing tables — `note_coded_diagnosis` (SuperNote, Phase 6), `problem_list` HCC conditions (the evident denominator), `billing_line_item`+`billing_claim` (real E&M codes), `population_finder_candidate` (lab-evident-not-coded, Phase 2). Attribution via `patient.pcp_provider_id`. Bounded/indexed; no `observation`/`patient` scans. `note_coded_diagnosis` is currently sparse (3 rows) → backfill synthetic historical coding (~60% capture) so the report is non-degenerate and shows a real gap (the compendium's 50→70% story).

**Data reality (verified 2026-06-12):**
- `note_coded_diagnosis`: 3 rows (Phase-6 tests) → backfill needed. `clinical_note` (UUID `note_id`, `author_user_id` UUID, `visit_type`).
- HCC-evident denominator: **915 HCC-relevant `problem_list` conditions across 304 patients** (E11/I50/N18/E66/I48 prefixes).
- E&M: `billing_line_item.cpt_code` has **99213 (157) / 99214 (156) / 99215 (145)**; `billing_claim` has `provider_id` + `service_date`.
- Missed-opportunity: `population_finder_candidate` 180 pending.
- `patient.pcp_provider_id` populated for the cohort.
- HCC-relevance heuristic (consistent with Phase 6): icd10 prefix ∈ {E11, I50, N18, E66, I48}. (Not full CMS-HCC V28 — documented.)

**Tech Stack:** PostgreSQL 17 (`npm run db:migrate` host→localhost; deterministic migrations), Fastify, vitest (`vi.hoisted`), React 19 + TanStack Query. Admin admin@acumenus.net/superuser; API boot 3099 + localhost overrides.

**Branch:** `feature/cds-phase8-hcc-coding`

---

### Task 1: Migration 044 — backfill historical HCC coding

**Files:** Create `packages/db/migrations/044_seed_hcc_coding.sql`

- [ ] **Step 1:** Deterministically simulate prior coding so capture ≈ 60%:
  1. One synthetic finalized `clinical_note` per HCC patient (304): `visit_type='supernote_historical'`, `status='final'`, `author_user_id` = the admin `app_users.id`, `note_id = gen_random_uuid()`, `assessment='Historical coding backfill'`.
  2. `note_coded_diagnosis` for ~60% of each patient's HCC-evident `problem_list` conditions — pick deterministically (`row_number() OVER (PARTITION BY patient_id ORDER BY problem_id)` keep where `rn % 5 < 3`), `source='historical'`, `hcc_relevant=TRUE`, `diagnosis_name` from problem_list, resolving `ontology_id` where available. Link each to that patient's synthetic note.
  (No new tables; reuse `clinical_note` + `note_coded_diagnosis`. INSERT…SELECT, deterministic — no `random()`.)
- [ ] **Step 2:** Apply; verify `note_coded_diagnosis` rows jumped (≈550) and capture is mid-range (coded HCC / 915 ≈ 0.5–0.65).
- [ ] **Step 3: Commit** — `feat: backfill historical HCC coding (~60% capture) for analytics`

### Task 2: HCC analytics service (TDD)

**Files:** Test `apps/api/src/services/__tests__/hccAnalytics.test.ts`; create `apps/api/src/services/hccAnalytics.ts`

- [ ] **Step 1: Failing tests** (pure): `captureRate(numerator, denominator)` → `coded/evident` rounded to a %, 0 when denominator 0; `emShift(dist)` → given `{99213,99214,99215}` counts, returns `{level3,level4,level5, pct_level4plus}`; `isHccRelevant(icd10)` → prefix ∈ {E11,I50,N18,E66,I48}.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `hccAnalytics.ts`: pure helpers + DB queries —
  - `hccCaptureByProvider()`: per `pcp_provider_id`, denominator = distinct HCC `problem_list` (patient,icd10); numerator = those also in `note_coded_diagnosis` (hcc_relevant) for the same patient+icd10; returns `[{provider_id, provider_name, evident, coded, capture_pct}]` + an overall row.
  - `emDistribution()`: `billing_line_item` 9921x joined `billing_claim` → per provider + overall counts/level via `emShift`.
  - `missedOpportunities()`: (a) `population_finder_candidate` pending (lab-evident, uncoded) grouped by finding_type; (b) HCC `problem_list` conditions with **no** `note_coded_diagnosis` for that patient+icd10 (the uncoded residue), grouped/counted. Bounded.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat: HCC capture / E&M distribution / missed-opportunity analytics`

### Task 3: API routes

**Files:** Create `apps/api/src/routes/coding/index.ts`; modify `routes/index.ts`

- [ ] **Step 1:** `coding` (auth): `GET /coding/hcc-capture` (per-provider + overall), `GET /coding/em-distribution` (per-provider + overall), `GET /coding/missed-opportunities` (finder-pending + uncoded-HCC).
- [ ] **Step 2:** Register; `turbo typecheck` 8/8; full `vitest run` green.
- [ ] **Step 3: Commit** — `feat: coding analytics API routes (HCC capture, E&M, missed opportunities)`

### Task 4: Live run + verification

- [ ] **Step 1:** Throwaway tsx (delete before any tsc): call the three service functions; confirm capture is mid-range (not 0/100), E&M distribution sums to the seeded counts, missed-opportunities returns finder-pending + uncoded HCC.
- [ ] **Step 2:** Spot-check psql: one provider's HCC capture = coded/evident matches a hand count; E&M counts match `billing_line_item`.
- [ ] **Step 3:** Boot API 3099, mint token: hit all three endpoints, confirm shapes.
- [ ] **Step 4:** Cancel any orphaned `pg_stat_activity` queries.

### Task 5: Frontend — Coding & HCC dashboard

**Files:** Create `apps/web/src/pages/CodingPage.tsx`, `apps/web/src/hooks/useCoding.ts`; modify `App.tsx`, `AppShell.tsx`.

- [ ] **Step 1:** Read existing page/hook patterns.
- [ ] **Step 2:** **CodingPage**: HCC capture by provider (bar/row with capture % + evident/coded counts, overall headline); E&M distribution (level 3/4/5 split + % level-4-plus); missed-opportunity panel (lab-evident-uncoded from the finder + uncoded HCC conditions, linking to the Population Finder). Dark clinical theme.
- [ ] **Step 3:** Route `/coding` + nav (`Receipt`/`BadgeDollarSign`). `tsc --noEmit` AND `vite build` clean.
- [ ] **Step 4: Commit** — `feat: Coding & HCC capture dashboard`

### Task 6: Verify, update plan, merge — ROADMAP COMPLETE

- [ ] `turbo typecheck` 8/8, full `vitest run` green, `vite build` clean.
- [ ] Update master plan: mark **D16 ✅** and add a "ALL 18 DELTAS COMPLETE / 8 PHASES SHIPPED" banner at the top.
- [ ] Merge `feature/cds-phase8-hcc-coding` → `main`; `git diff main...HEAD --diff-filter=D` empty; push.
- [ ] Update memory `project_medgnosis_cds_parity` (Phase 8 shipped — initiative complete).

## Self-review notes
- **Spec coverage:** D16 = Tasks 1,2,3,4,5.
- **Data-honest:** real E&M codes + real finder candidates + real HCC problem_list denominator; historical coding backfilled (note_coded_diagnosis was sparse) so capture is realistic and the gap is visible. HCC-relevance is a documented prefix heuristic, not full CMS-HCC V28.
- **Scale:** problem_list (12k) / billing (bounded) / note_coded_diagnosis — all small; pcp attribution; no observation/patient scans.
- **Reuse:** `note_coded_diagnosis` (Phase 6), `population_finder_candidate` (Phase 2), `billing_*`, `problem_list`. Route/page patterns from Phases 2–7.
- **Doctrine:** honest severity documentation → honest risk scores; the recognition gap quantified; coding follows the medicine (capture % per provider, missed-opportunity worklist), not upcoding.
- **Type consistency:** `captureRate(num,den)→pct`; `emShift(dist)→{level3,4,5,pct_level4plus}`; `isHccRelevant(icd10)`; route shapes `{provider_id, evident, coded, capture_pct}` consistent service↔route↔UI.
