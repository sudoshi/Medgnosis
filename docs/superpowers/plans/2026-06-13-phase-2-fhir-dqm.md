# Phase 2 — FHIR dQM End-to-End + DEQM Care Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Medgnosis a true digital-quality-measure *producer*: operationalize the CQL engine on real Medgnosis data, emit FHIR `MeasureReport` via `$evaluate-measure` (persisted + wired into the nightly batch), generate QRDA Cat I patient-level files, and re-express the 45-bundle care-gap engine as payer-exchangeable **Da Vinci DEQM Gaps-in-Care** with prospective detection.

**Architecture:** Phase 1 proved the HAPI clinical-reasoning sidecar computes real eCQMs (CMS122 matched its MADiE test deck). Phase 2 closes the loop on **live Medgnosis data**: a QI-Core **data-export → engine-load** pipeline pushes a sample cohort (mapped by the Phase 0 `fhir/mappers.ts`) into the sidecar's JPA store (Mode B), the `cql` evaluator runs `$evaluate-measure`, results are reconciled against SQL and persisted as FHIR `MeasureReport` + `fact_measure_result`. Medgnosis then exposes its own `$evaluate-measure` + `$care-gaps` operations. SQL stays the default `MEASURE_EVALUATOR`; CQL is promoted per-measure only after reconciliation agrees.

**Tech Stack:** TypeScript 5.7 / Fastify 5 · `@medgnosis/db` (postgres.js) · HAPI FHIR `hapi-fhir-storage-cr` sidecar (Phase 1) · QI-Core 7.0.2 / US Core 7.0.0 · Da Vinci DEQM 5.0.0 (STU5) · QRDA Cat I (eCQI IG per year) · BullMQ (nightly batch) · Vitest.

---

## Prerequisites (Phase 1 — DONE, on `main` @ e66acd6)

- ✅ HAPI CR sidecar (`docker/cql-engine/`, compose `cql` profile); `$evaluate-measure` proven on CMS122 (test-deck match).
- ✅ `cqlEngineClient.ts` (`evaluateMeasure`/`populationsFromReport`), `cqlMeasureEvaluator.ts` (the live `cql` seam), `measureReconciliation.ts` (CQL↔SQL).
- ✅ `qrda/qrdaCat3.ts` + `qrda/qppJson.ts`; `measureDossier.ts` + `GET /measures/:code/dossier`; migration `056` (`measure_artifact`).
- ✅ Phase 0: QI-Core-profiled FHIR mappers, VSAC terminology service, EDW→QI-Core projection map.

## Scope & Decisions

- **Epic A first (operationalize on real data)** — the Phase-1 implementation is unit-tested but not yet run against live Medgnosis patients. Epic A builds the QI-Core export→engine pipeline + seeds the `measure_artifact` binding + reconciles a real measure end-to-end. This is the highest-value, highest-uncertainty work; **checkpoint after Epic A**.
- **Reference measure = CMS122** (Diabetes HbA1c >9%). Medgnosis EDW is SNOMED/LOINC/RxNorm-coded (matches CMS122's QI-Core value sets). Epic A validates Medgnosis diabetes patients evaluate; if the cohort is too sparse, fall back to a synthetic-augmented cohort and log it.
- **Phase 2 dossier is mostly done** (Phase 1 Task 8). Epic B extends it with the persisted `MeasureReport`.
- **DEQM conformance** (`$care-gaps` Gaps-In-Care Bundle) has genuine spec detail; Epic C ships a structurally-conformant emission validated with `validator_cli.jar` against DEQM 5.0.0, with full IG conformance as the closing gate.
- **Auth guardrail:** no changes to the protected app-user flow (`.claude/rules/auth-system.md`). New FHIR operations reuse `app.authenticate`.
- **DB safety:** sample-cohort export uses `LIMIT`/bounded queries; never `count(*)` `phm_edw.observation`. Migrations additive, applied via `claude_dev`.
- **Concurrency hygiene:** the shared working tree may carry other sessions' edits — stage only this plan's files by path; surgically stage any comingled config (`git apply --cached`).

## File Structure

**Create:**
- `apps/api/src/services/fhir/qicoreExport.ts` — export a sample cohort of Medgnosis patients as a QI-Core transaction Bundle (reuse `fhir/mappers.ts`).
- `apps/api/src/services/fhir/qicoreExport.test.ts`.
- `apps/api/src/services/cqlEngineLoader.ts` — load a measure bundle + a cohort bundle into the sidecar (POST transactions); idempotent.
- `apps/api/src/services/cqlEngineLoader.test.ts`.
- `apps/api/src/services/measureReportStore.ts` — persist/read FHIR `MeasureReport` (new table) + map population counts to `fact_measure_result`.
- `apps/api/src/services/measureReportStore.test.ts`.
- `apps/api/src/services/qrda/qrdaCat1.ts` — QRDA Category I patient-level writer.
- `apps/api/src/services/qrda/qrdaCat1.test.ts`.
- `apps/api/src/services/deqm/careGaps.ts` — DEQM `$care-gaps` Gaps-In-Care Bundle builder (Composition + MeasureReports + DetectedIssue, prospective).
- `apps/api/src/services/deqm/careGaps.test.ts`.
- `apps/api/src/routes/fhir/measureOps.ts` — `Measure/:id/$evaluate-measure` + `$care-gaps` Medgnosis-facing endpoints.
- `packages/db/migrations/057_measure_report.sql` — `phm_edw.measure_report` (FHIR MeasureReport JSONB + run metadata) + seed `measure_artifact` for CMS122.
- `scripts/cql-live-reconcile.sh` — export cohort → load → evaluate → reconcile (Epic A smoke).

**Modify:**
- `apps/api/src/workers/measure-calculator.ts` — when `MEASURE_EVALUATOR=cql`, run export→load→evaluate→persist→reconcile.
- `apps/api/src/routes/fhir/index.ts` — mount `measureOps`.
- `apps/api/src/services/measureDossier.ts` — surface the latest persisted `MeasureReport`.

---

## EPIC A — Operationalize the engine on real Medgnosis data

### Task A1: QI-Core cohort export

**Files:** `apps/api/src/services/fhir/qicoreExport.ts`, `.test.ts`.

- [ ] **Step 1: Write the failing test** — `buildCohortBundle(rows)` returns a FHIR transaction Bundle of QI-Core resources (Patient + Condition + Observation + MedicationRequest) with `PUT` requests, reusing the Phase 0 mappers:

```typescript
import { describe, it, expect } from 'vitest';
import { buildCohortBundle } from './qicoreExport.js';

describe('buildCohortBundle', () => {
  it('emits a transaction Bundle of QI-Core resources with PUT requests', () => {
    const b = buildCohortBundle({
      patients: [{ patient_id: 1, first_name: 'A', last_name: 'B', gender: 'female', date_of_birth: '1970-01-01' }],
      conditions: [{ condition_diagnosis_id: 9, patient_id: 1, condition_code: '44054006', condition_name: 'DM2', diagnosis_status: 'active' }],
      observations: [{ observation_id: 7, patient_id: 1, observation_code: '4548-4', observation_desc: 'HbA1c', value_numeric: 9.5, units: '%', observation_datetime: '2026-03-01T00:00:00Z' }],
      medications: [],
    });
    expect(b.type).toBe('transaction');
    const types = b.entry.map((e) => e.resource.resourceType).sort();
    expect(types).toEqual(['Condition', 'Observation', 'Patient']);
    expect(b.entry.every((e) => e.request.method === 'PUT')).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** `buildCohortBundle` using `mapPatientToFHIR`/`mapConditionToFHIR`/`mapObservationToFHIR`/`mapMedicationToFHIR` from `fhir/mappers.js`; wrap each in a `PUT` entry keyed by `resourceType/id`. **Step 4: Run → PASS.** **Step 5: Commit** `feat(dqm): QI-Core cohort export bundle`.

### Task A2: Engine loader

**Files:** `apps/api/src/services/cqlEngineLoader.ts`, `.test.ts`.

- [ ] **Step 1: Write the failing test** — `loadBundle(engineUrl, bundle)` POSTs the transaction and throws on a non-2xx, returning the per-entry status counts (mock `fetch`).
- [ ] **Step 2: FAIL. Step 3: Implement** (POST `engineUrl`, `application/fhir+json`; parse transaction-response; throw on `OperationOutcome`). **Step 4: PASS. Step 5: Commit** `feat(dqm): clinical-reasoning engine bundle loader`.

### Task A3: Seed the measure binding + migration 057

**Files:** `packages/db/migrations/057_measure_report.sql`.

- [ ] **Step 1: Write the migration** — create `phm_edw.measure_report` (id, measure_code, period, report JSONB, report_type, computed_at) and `INSERT` a `measure_artifact` row binding a Medgnosis `measure_code` → CMS122 (`ecqm_id`, `fhir_measure_url`, period 2026, VSAC pins).
- [ ] **Step 2: Apply via `claude_dev`** (additive; record in `_migrations`); verify table + seed row.
- [ ] **Step 3: Commit** `feat(dqm): measure_report table + CMS122 artifact binding (migration 057)`.

### Task A4: Live reconcile smoke (Epic A gate)

**Files:** `scripts/cql-live-reconcile.sh`.

- [ ] **Step 1:** Script: start the sidecar (`docker compose --profile cql up -d cql-engine`); export a bounded Medgnosis diabetes cohort as QI-Core (via a small node entrypoint using `buildCohortBundle`); load it + the CMS122 measure bundle; run `$evaluate-measure population`; print SQL-vs-CQL `reconcile()`.
- [ ] **Step 2: Run it.** Gate: a `MeasureReport` returns for the real cohort and `reconcile()` prints both sides. (Exact agreement is NOT required yet — Medgnosis gap-status semantics differ from CQL; the goal is a real end-to-end run + a quantified delta to drive convergence.)
- [ ] **Step 3:** Record findings (cohort size, deltas, gotchas) as an "Epic A Notes" section here. **Commit** the script.

> **CHECKPOINT after Epic A** — review the real-data deltas before building MeasureReport persistence on top.

### Epic A Notes (run 2026-06-14)

**Result: the export → load → evaluate → reconcile loop is proven on real Medgnosis data.** A bounded cohort of 100 diabetes patients exported to 354 QI-Core resources (100 Patient + 254 diabetes Condition; 0 in-period HbA1c) loaded into the HAPI CR sidecar with **0 failures**, `$evaluate-measure population` returned a `MeasureReport`, and `reconcile()` printed both sides:

```
CQL population: ip=0 denom=0 num=0 excl=0 (score undefined)
SQL : { denominator: 0, numerator: 0, exclusion: 0 }
CQL : { denominator: 0, numerator: 0, exclusion: 0 }
deltas: 0/0/0 | agree: true (trivially — both sides zero)
```

**Why all-zero (the convergence backlog).** A focused data probe (2026-06-14) showed this is a **data-mapping** problem, not an engine problem — so it is deferred to a scoped EDW→QI-Core data-quality follow-up rather than blocking Epics B/C:
1. **Data-year mismatch (cheap to fix).** The cohort's observations span 1979→**2025-03-15** — there is **no 2026 data**, so the 2026 reporting period is empty (CMS122's MADiE deck matched in Phase 1 only because its test patients carry 2026 data). 20/30 sampled patients DO have HbA1c in some year. Fix: retarget the period to the latest full data year (2024) — make `PERIOD_START/END` env-overridable in the reconcile entrypoint.
2. **Encounter coding crosswalk (the real blocker).** CMS122's IP/denominator require a *qualifying visit* — and CMS122v12's visit value sets ARE loaded (Office Visit, Annual Wellness Visit, Preventive Care, Telephone Visits — CPT/SNOMED-coded). But `phm_edw.encounter.encounter_type` is free-text/local (and the table is large — a `GROUP BY encounter_type` hit the 25s `statement_timeout`). So an Encounter export alone is insufficient; it needs an **`encounter_type` → qualifying-visit value-set crosswalk**. This is EDW→QI-Core projection work (Phase 0 territory), with its own uncertainty — not a quick increment.
3. **Empty SQL baseline.** `phm_star.fact_measure_result` has no `CMS122v12` rows — `measureCalculatorV2` doesn't compute this measure into the star schema, so the SQL side is 0. Reconciliation needs either the SQL evaluator to run CMS122v12 or a mapping of the existing `care_gap.gap_status` into the comparison.

**Decision (2026-06-14): proceed with Epics B + C.** They do not depend on a non-zero CMS122: Epic B's MeasureReport store / `$evaluate-measure` route / QRDA Cat I are structural (validatable against the Phase-1 MADiE deck, ip=52/denom=52/num=32), and Epic C's `$care-gaps` rides the already-populated `care_gap` engine (real non-zero gaps). The three items above become a scoped data-quality follow-up.

**Two infrastructure findings — surfaced live and FIXED in the export path:**
- **Billion-row `phm_edw.observation` seq-scan hazard.** The naive `WHERE patient_id = ANY(ids) AND observation_code = ANY(...)` query triggered a 5-worker parallel sequential scan over ~1.0B rows that ran 58 min in `IO/DataFileRead` (saturating the shared NVMe, threatening Parthenon prod) before being killed. Root cause: `idx_observation_patient_datetime` is a **partial** index (`WHERE active_ind='Y'`) and the query omitted that predicate. **Fix:** per-patient `LATERAL` join + `active_ind='Y'` + **measurement-period datetime bound** (rides the partial index as a tight range seek: 335 ms for 100 patients) + a hard `statement_timeout=30s` on a reserved connection. **Architectural rule for all engine-export queries: bounded, indexed, period-scoped, timeout-guarded — never table-wide `ANY()`.**
- **HAPI rejects purely-numeric client-assigned ids** (`HAPI-0960`). EDW integer PKs (`Patient/3`) were refused on PUT. **Fix:** `qicoreExport` now namespaces ids (`mgp-`/`mgc-`/`mgo-`/`mgm-`) and rewrites subject references — also makes the export portable to payer DEQM endpoints (Epic C).

**Engine note:** the compose `cql-engine` service is internal-only (no published port); the smoke runs an ephemeral port-published mirror (`medgnosis-cql-engine-smoke`, `docker run -p 18080:8080`) and loads the CMS122 **executable artifacts only** (Measure + Libraries + ValueSets; MADiE test patients stripped) so the population evaluation reflects only the exported Medgnosis cohort.

---

## EPIC B — FHIR MeasureReport + QRDA Cat I + nightly batch

### Task B1: MeasureReport store

**Files:** `apps/api/src/services/measureReportStore.ts`, `.test.ts`.

- [ ] **Step 1: Failing test** — `persistMeasureReport(measureCode, period, report)` writes to `phm_edw.measure_report`; `latestMeasureReport(measureCode)` reads it back (mock `sql`).
- [ ] **Step 2: FAIL. Step 3: Implement** (`INSERT ... ON CONFLICT` upsert by measure_code+period; `SELECT ... ORDER BY computed_at DESC LIMIT 1`). **Step 4: PASS. Step 5: Commit** `feat(dqm): persist + read FHIR MeasureReport`.

### Task B2: Wire CQL evaluation into the nightly batch + persist

**Files:** modify `apps/api/src/workers/measure-calculator.ts`, `cqlMeasureEvaluator.ts`.

- [ ] **Step 1: Failing test** — extend `cqlMeasureEvaluator` so each evaluated measure's `MeasureReport` is persisted via `persistMeasureReport` (mock store + client). **Step 2: FAIL. Step 3: Implement** (call `evaluateMeasure` → `persistMeasureReport` → also map population counts into `fact_measure_result` aggregate). **Step 4: PASS.**
- [ ] **Step 5:** In `workers/measure-calculator.ts`, when `MEASURE_EVALUATOR=cql`, run the export→load (Epic A) before evaluating. **Commit** `feat(dqm): nightly CQL evaluation persists MeasureReports`.

### Task B3: Medgnosis-facing `$evaluate-measure` + QRDA Cat I

**Files:** `apps/api/src/routes/fhir/measureOps.ts`, `apps/api/src/services/qrda/qrdaCat1.ts`, `.test.ts`, modify `routes/fhir/index.ts`, `measureDossier.ts`.

- [ ] **Step 1: Failing tests** — (a) `GET /fhir/Measure/:id/$evaluate-measure` returns the latest persisted `MeasureReport` (or proxies the engine); (b) `buildQrdaCat1(patient, measureResults)` emits a CDA patient-level QRDA with the QRDA Cat I templateIds + measure/population entries.
- [ ] **Step 2: FAIL. Step 3: Implement** the route (reads `measureReportStore`) + `qrdaCat1.ts` (CDA writer — patient header + Measure section + Patient Data section). Surface the persisted report in `measureDossier.ts`. **Step 4: PASS.**
- [ ] **Step 5:** Mount `measureOps` in `routes/fhir/index.ts`. **Commit** `feat(dqm): /fhir/$evaluate-measure (MeasureReport) + QRDA Cat I writer`.

> Cypress CVU+ validates QRDA Cat I/III in CI (extend the `cql` job); full conformance is the closing gate.

---

## EPIC C — Da Vinci DEQM Gaps-in-Care (prospective)

### Task C1: Gaps-In-Care Bundle builder

**Files:** `apps/api/src/services/deqm/careGaps.ts`, `.test.ts`.

- [ ] **Step 1: Failing test** — `buildGapsInCareBundle(patientId, gaps)` returns a DEQM Gaps-In-Care `Bundle` (`Composition` + per-measure `MeasureReport` (`measure-report-type=individual`, `improvementNotation`) + `DetectedIssue` with `code=care-gap` and a Gap Status, including a **prospective** ("gaps through period") gap):

```typescript
import { describe, it, expect } from 'vitest';
import { buildGapsInCareBundle } from './careGaps.js';

it('emits a DEQM Gaps-In-Care Bundle with a DetectedIssue per open gap', () => {
  const b = buildGapsInCareBundle('Patient/1', [
    { measureCode: 'CMS122v13', gapStatus: 'open', prospective: false },
    { measureCode: 'CMS165v12', gapStatus: 'prospective', prospective: true },
  ]);
  const types = b.entry.map((e) => e.resource.resourceType);
  expect(types).toContain('Composition');
  expect(types.filter((t) => t === 'DetectedIssue')).toHaveLength(2);
  expect(types.filter((t) => t === 'MeasureReport')).toHaveLength(2);
});
```

- [ ] **Step 2: FAIL. Step 3: Implement** `buildGapsInCareBundle` (Composition `document`/`gaps-doc`, gap-status valueset codes open/closed/prospective, DetectedIssue per gap, individual MeasureReport per measure). **Step 4: PASS. Step 5: Commit** `feat(deqm): Gaps-In-Care Bundle builder (prospective)`.

### Task C2: `$care-gaps` operation over the existing care-gap engine

**Files:** modify `apps/api/src/routes/fhir/measureOps.ts`, read from `routes/care-gaps` / `bundles` services.

- [ ] **Step 1: Failing test** — `GET /fhir/Measure/$care-gaps?subject=Patient/:id&status=open&...` returns a Gaps-In-Care Bundle built from the patient's existing `care_gap` rows (mock the gap query). **Step 2: FAIL. Step 3: Implement** (query the patient's open/prospective gaps from the 45-bundle engine, map to `buildGapsInCareBundle`). **Step 4: PASS.**
- [ ] **Step 5:** Validate a sample bundle with `validator_cli.jar -ig hl7.fhir.us.davinci-deqm#5.0.0` in CI. **Commit** `feat(deqm): $care-gaps over the care-gap engine`.

### Task C3: Conformance + WebSocket parity

- [ ] **Step 1:** Confirm the live WebSocket care-gap UX is unchanged (DEQM is an additional emission, not a replacement). Add a CI step validating one `$care-gaps` + one `$evaluate-measure` MeasureReport against DEQM 5.0.0. **Commit** `test(deqm): DEQM 5.0.0 conformance validation in CI`.

---

## Self-Review

**1. Spec coverage (roadmap Phase 2 epics):** Epic 2.1 `$evaluate-measure`→MeasureReport + nightly batch + QRDA Cat I → Epics A, B. Epic 2.2 DEQM Gaps-in-Care prospective → Epic C. Epic 2.3 dossier transparency artifact → done in Phase 1 Task 8; Epic B3 extends it with the persisted MeasureReport. Success criteria (valid DEQM MeasureReports; `$care-gaps` with ≥1 prospective gap; QRDA Cat I passes Cypress; dossier complete) → A4, B3, C1–C3.

**2. Placeholder scan:** Epic A is real-data integration with a concrete gate (a MeasureReport + a quantified reconcile delta) rather than required exact agreement — honest, because Medgnosis gap-status semantics differ from CQL and convergence is iterative. No "TBD"/"add error handling".

**3. Type consistency:** `buildCohortBundle`, `loadBundle`, `persistMeasureReport`/`latestMeasureReport`, `buildQrdaCat1`, `buildGapsInCareBundle` — names used consistently; reuses Phase 0/1 `mapPatientToFHIR` etc., `evaluateMeasure`/`populationsFromReport`, `reconcile`, `MeasurePopulationCounts`.

---

## Execution Handoff

**Plan saved to `docs/superpowers/plans/2026-06-13-phase-2-fhir-dqm.md`.** Recommended order: **Epic A first and gated** (real-data reconcile is the make-or-break step), then Epics B and C. Two execution options: **(1) Inline with checkpoints** (checkpoint after Epic A and after each DB-touching task), or **(2) subagent-driven**. The Epic A live-reconcile delta is the key signal — review it before building persistence/DEQM on top.
