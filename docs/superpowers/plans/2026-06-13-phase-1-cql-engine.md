# Phase 1 — CQL Engine Live + First Proven Measures + QRDA III Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Medgnosis from gap-status rollup to real, standardized measure computation by lighting up the existing `measureEvaluator` `'cql'` seam with an embedded `clinical-reasoning` (JVM) engine, prove the top eCQMs against test decks, and ship the lowest-effort CMS submission artifact (QRDA Cat III).

**Architecture:** A JVM **clinical-reasoning sidecar** (HAPI FHIR + `hapi-fhir-storage-cr`, the maintained successor to the now-retired standalone `cqf-ruler`) runs FHIR `Measure/$evaluate-measure`. Medgnosis's Node API drives it over HTTP through a new `cqlMeasureEvaluator` that replaces the throwing stub behind `MEASURE_EVALUATOR=cql`. The sidecar consumes: (1) FHIR `Library`+`Measure` artifacts (CQL→ELM, ingested from CMS `ecqm-content-qicore`), (2) value sets via the **Phase 0 terminology service**, (3) QI-Core patient data via the **Phase 0-profiled FHIR endpoints**. The existing SQL path stays the default and becomes the reconciliation oracle. QRDA Cat III is generated independently from the existing star-schema rollups.

**Tech Stack:** TypeScript 5.7 / Fastify 5 (API) · Java 17 + HAPI FHIR `hapi-fhir-storage-cr` (sidecar) · CQL 1.5.3 → ELM via `cql-translator` (pinned) · QI-Core 7.0.2 / US Core 7.0.0 · Docker Compose (sidecar service) · Vitest (unit, mock `fetch`/`sql`) · Cypress Validation Utility (CVU+) for QRDA · `ecqm-content-qicore-2025` measure bundles.

---

## Prerequisites (Phase 0 — DONE)

- ✅ FHIR layer profiled to US Core 7.0.0 / QI-Core 7.0.2 (`fhir/mappers.ts`), validator CI gate green.
- ✅ VSAC loaded (1,545 value sets / 225k codes); terminology service `ValueSet/$expand`+`$validate-code` (`fhir/terminology.ts`); expansion cache (migration `055`).
- ✅ `measureEvaluator.ts` seam: `MEASURE_EVALUATOR=sql|cql`; `cqlMeasureEvaluator.refresh()` throws a pointer (this plan implements it).
- ✅ EDW→QI-Core projection map (`docs/edw-to-qicore-projection.md`); negation + membership helpers (`fhir/edwToQiCore.ts`).

## Scope & Decisions

- **Engine = `clinical-reasoning` JVM sidecar** (decided 2026-06-13). Do **not** hand-build a TS CQL/ELM engine. Use HAPI FHIR's clinical reasoning module (`hapi-fhir-storage-cr`); standalone `cqf-ruler` is retired — Task 1 confirms the exact current artifact/version.
- **Spike-first for the engine.** Task 1 is a time-boxed spike that stands up the sidecar, evaluates ONE measure end-to-end, and **decides the data-feeding mode** (sidecar pulls per-subject from Medgnosis FHIR vs. bulk-loads QI-Core resources into its own JPA store). Downstream tasks (4–6) assume the standardized `$evaluate-measure` REST API, which is stable regardless of that decision; the data-feeding decision only changes sidecar config, not the Node client.
- **Day-one role of CQL = correctness + standardized artifacts, not replacing the population SQL batch.** Phase 1 evaluates a **sample cohort** via CQL and reconciles against SQL. Full-population CQL is a later phase. The SQL path stays `MEASURE_EVALUATOR`'s default.
- **In scope:** sidecar bring-up; CI CQL→ELM; ingest CMS measure content; the `cql` evaluator HTTP client; reconciliation harness; prove CMS122/CMS165 with test decks; QRDA Cat III + Cypress; per-measure dossier.
- **Out of scope (later phases):** QRDA Cat I + FHIR `MeasureReport` `$evaluate-measure` exposure on Medgnosis's own API (Phase 2); DEQM `$care-gaps` (Phase 2); full-population CQL; multi-program routing (Phase 6).
- **Auth guardrail:** no changes to `plugins/auth.ts` app-user flow (`.claude/rules/auth-system.md`). The sidecar is internal (Docker network), not publicly exposed.
- **DB safety:** reconciliation reads are read-only; never `count(*)` `phm_edw.observation` (use `reltuples`/bounded sample cohorts). Sidecar runs in Docker with bounded memory.

## File Structure

**Create:**
- `docker/cql-engine/Dockerfile` — HAPI clinical-reasoning sidecar image (pinned version).
- `docker/cql-engine/application.yaml` — HAPI config: enable CR, terminology source, data source mode (set by Task 1).
- `apps/api/src/services/fhir/cqlEngineClient.ts` — typed HTTP client for `Measure/$evaluate-measure` + artifact load.
- `apps/api/src/services/fhir/cqlEngineClient.test.ts` — unit tests (mock `fetch`).
- `apps/api/src/services/cqlMeasureEvaluator.ts` — the `'cql'` evaluator implementation (refresh over a sample cohort).
- `apps/api/src/services/cqlMeasureEvaluator.test.ts` — unit tests.
- `apps/api/src/services/measureReconciliation.ts` — CQL-vs-SQL per-measure/period comparison + drift report.
- `apps/api/src/services/measureReconciliation.test.ts`.
- `apps/api/src/services/qrda/qrdaCat3.ts` — QRDA Category III serializer.
- `apps/api/src/services/qrda/qrdaCat3.test.ts`.
- `apps/api/src/services/qrda/qppJson.ts` — QPP JSON export (MIPS/APP).
- `apps/api/src/routes/measures/dossier.ts` — `GET /measures/:code/dossier`.
- `measures/` — ingested CMS FHIR eCQM content (Library+Measure+ELM) + test decks (CI fixtures).
- `scripts/cql-compile.sh` — CQL→ELM compile with pinned translator (CI).
- `scripts/cql-engine-smoke.sh` — Task 1 spike harness.
- `packages/db/migrations/056_measure_artifacts.sql` — link `measure_definition` ↔ FHIR Library/Measure + reporting-period/version binding.

**Modify:**
- `apps/api/src/services/measureEvaluator.ts` — replace the throwing `cqlMeasureEvaluator` with the real one.
- `docker-compose.yml` — add the `cql-engine` service.
- `apps/api/src/config.ts` — add `cqlEngineUrl`, `cqlSampleCohortLimit` (additive; mind the prior comingling — verify the working tree is clean before editing).
- `.github/workflows/ci.yml` — add a `cql` job (compile ELM, run engine smoke against ingested test decks).
- `apps/api/src/routes/measures/index.ts` — mount the dossier route.

---

## Task 1 (SPIKE): Stand up the clinical-reasoning sidecar + one end-to-end `$evaluate-measure`

**Goal of spike:** confirm the current HAPI clinical-reasoning artifact/version, get ONE CMS measure evaluating against a tiny QI-Core dataset, and **decide the data-feeding mode**. Time-box: 2 days. This is investigation — deliverables and gates below, not TDD steps.

**Files:** `docker/cql-engine/Dockerfile`, `docker/cql-engine/application.yaml`, `scripts/cql-engine-smoke.sh`.

- [ ] **Step 1: Identify the engine artifact.** Confirm the maintained artifact (HAPI FHIR JPA server with `hapi-fhir-storage-cr` clinical reasoning enabled; or the `clinical-reasoning` library in a thin Spring Boot app). Record the exact version pin. Reference: `github.com/hapifhir/hapi-fhir`, `github.com/cqframework/clinical-reasoning`.

- [ ] **Step 2: Containerize.** Write `docker/cql-engine/Dockerfile` + `application.yaml` (R4, CR enabled, point terminology at Medgnosis `ValueSet/$expand` or a preloaded VSAC ValueSet bundle). Bring it up: `docker compose up -d cql-engine`. Gate: `GET http://localhost:<port>/fhir/metadata` lists the `$evaluate-measure` operation.

- [ ] **Step 3: Load one measure + its value sets + 3 synthetic QI-Core patients** (use a CMS122 bundle from `ecqm-content-qicore-2025`). Run `Measure/CMS122/$evaluate-measure?periodStart=2025-01-01&periodEnd=2025-12-31&reportType=summary`. Gate: a valid `MeasureReport` returns with sane numerator/denominator counts.

- [ ] **Step 4: DECIDE the data-feeding mode** and write it into this plan's Task 4/Task 6 (and `docs/edw-to-qicore-projection.md`):
  - **(A) Pull mode:** sidecar fetches each subject's data from Medgnosis FHIR (`Patient/$everything`) at evaluation time. Simpler; fine for sample cohorts / per-patient.
  - **(B) Push/bulk mode:** load QI-Core resources into the sidecar's JPA store first. Faster for repeated/population eval.
  - Default recommendation: **(A) for Phase 1** (sample cohort), with a note that (B) is the population path in a later phase.

- [ ] **Step 5: Record findings** in `scripts/cql-engine-smoke.sh` (a repeatable smoke that reproduces Step 3) and a short "Engine Notes" section appended to this plan: artifact, version, ports, data-feeding decision, terminology wiring, gotchas. **Commit** the Dockerfile + config + smoke script.

**Spike exit gate:** `scripts/cql-engine-smoke.sh` reproducibly returns a valid `MeasureReport` for one measure. If the gate cannot be met in the time-box, STOP and report — do not proceed to Task 2.

### Engine Notes (Task 1 spike — 2026-06-13, ✅ RESOLVED / GATE PASSED)

- **Artifact:** `hapiproject/hapi:latest` = **HAPI FHIR 8.10.0** JPA starter, R4. Enable CR with `-e hapi.fhir.cr.enabled=true`; `/fhir/metadata` then advertises `$evaluate-measure`. Standalone `cqf-ruler` is retired — HAPI's built-in CR is the path.
- **Resources:** `JAVA_OPTS=-Xmx1300m -Xms512m`, container `-m 1800m`. Boots in ~3–4 min, **no OOM** at this cap. Host had 45 GB free / load 1.8 on 32 cores — safe alongside Parthenon/Aurora prod.
- **Data-feeding decision = Mode B** (load QI-Core resources into HAPI's JPA store via FHIR transaction `PUT`, then `$evaluate-measure`). Confirmed: a transaction bundle (Patient + Library + Measure) loaded 3× `201`, and `$evaluate-measure` returned a valid `MeasureReport` (ip=1/denom=1/num=1).
- **Gotchas (now baked into Tasks 3–6):**
  1. `reportType` ∈ `subject|subject-list|population` — **`summary` is rejected**; use `population` for aggregates.
  2. `Measure.group.population` elements **require `id`**.
  3. **Ship pre-compiled ELM** (Task 3) — runtime translation of inline `text/cql` is fragile: the source provider resolves by name/version and throws `Could not load source for library X, version null` on mismatch. The spike only passed once versions were consistent. `Library` also needs `name`.
- **Reproduce:** `docker/cql-engine/README.md` (run cmd) + `docker/cql-engine/spike-bundle.json` + `scripts/cql-engine-smoke.sh` (exit 0 = valid MeasureReport).
- **Decision confirmed:** proceed to Task 2 (formalize the sidecar in `docker-compose.yml`).

---

## Task 2: Add the `cql-engine` service to docker-compose + config

**Files:** `docker-compose.yml`, `apps/api/src/config.ts`, `.env.example`.

- [ ] **Step 1: Verify the working tree is clean for `config.ts`** (the Phase 0 comingling is resolved): `git diff apps/api/src/config.ts` shows no unexpected hunks. If dirty, resolve before editing.

- [ ] **Step 2: Add the service** to `docker-compose.yml` (image from Task 1, internal network only, healthcheck on `/fhir/metadata`, bounded `mem_limit`). Do NOT expose the port publicly.

- [ ] **Step 3: Add config keys.** In `apps/api/src/config.ts` (after `fhirBaseUrl`):

```typescript
  // CQL clinical-reasoning sidecar (internal Docker network)
  cqlEngineUrl: optional('CQL_ENGINE_URL', 'http://cql-engine:8080/fhir'),
  cqlSampleCohortLimit: Number(optional('CQL_SAMPLE_COHORT_LIMIT', '2000')),
```

Add to `.env.example`:

```
# CQL clinical-reasoning sidecar
CQL_ENGINE_URL=http://localhost:8080/fhir
CQL_SAMPLE_COHORT_LIMIT=2000
```

- [ ] **Step 4: Typecheck + commit.** `npm run typecheck --workspace=apps/api`; commit `chore(cql): add clinical-reasoning sidecar service + config`.

---

## Task 3: CI CQL→ELM compilation + ingest CMS measure content

**Files:** `scripts/cql-compile.sh`, `measures/` (content), `.github/workflows/ci.yml`.

- [ ] **Step 1: Ingest CMS FHIR eCQM content.** Vendor the `ecqm-content-qicore-2025` Library+Measure+CQL for the target measures (CMS122 HbA1c, CMS165 BP control, CMS130 colorectal, CMS125 breast) into `measures/`. Record the source release tag in `measures/README.md`.

- [ ] **Step 2: Write `scripts/cql-compile.sh`** — compile every `measures/**/*.cql` to ELM with a **pinned** `cql-translator` version (Java), failing on translation errors. Output ELM next to the CQL; check ELM into the repo (reproducible artifact).

- [ ] **Step 3: Run it.** `bash scripts/cql-compile.sh` → expect `0 translation errors`; ELM files written.

- [ ] **Step 4: Add a `cql` CI job** in `ci.yml` (Java 17): runs `cql-compile.sh` and asserts the checked-in ELM matches freshly-compiled ELM (drift guard).

- [ ] **Step 5: Commit** `feat(cql): ingest CMS QI-Core eCQM content + pinned CQL→ELM compile in CI`.

---

## Task 4: Implement `cqlEngineClient` (typed `$evaluate-measure` HTTP client)

**Files:** `apps/api/src/services/fhir/cqlEngineClient.ts`, `.../cqlEngineClient.test.ts`.

The `$evaluate-measure` REST contract is standardized (FHIR Clinical Reasoning), so this is TDD-specifiable independent of the spike's data-feeding decision.

- [ ] **Step 1: Write the failing test** (mock `fetch`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateMeasure } from './cqlEngineClient.js';

beforeEach(() => { vi.restoreAllMocks(); });

describe('evaluateMeasure', () => {
  it('GETs Measure/<id>/$evaluate-measure with period + reportType and returns the MeasureReport', async () => {
    const report = { resourceType: 'MeasureReport', status: 'complete', measure: 'CMS122', group: [{ population: [
      { code: { coding: [{ code: 'initial-population' }] }, count: 100 },
      { code: { coding: [{ code: 'denominator' }] }, count: 80 },
      { code: { coding: [{ code: 'numerator' }] }, count: 55 },
    ] }] };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(report), { status: 200, headers: { 'content-type': 'application/fhir+json' } }),
    );
    const out = await evaluateMeasure('http://cql-engine/fhir', 'CMS122', {
      periodStart: '2025-01-01', periodEnd: '2025-12-31', reportType: 'summary',
    });
    expect(out.measure).toBe('CMS122');
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/Measure/CMS122/$evaluate-measure');
    expect(url).toContain('periodStart=2025-01-01');
    expect(url).toContain('reportType=summary');
  });

  it('throws on a non-2xx response with the OperationOutcome diagnostics', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', diagnostics: 'unknown Measure' }] }), { status: 404 }),
    );
    await expect(evaluateMeasure('http://cql-engine/fhir', 'NOPE', { periodStart: '2025-01-01', periodEnd: '2025-12-31', reportType: 'summary' }))
      .rejects.toThrow(/unknown Measure/);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/services/fhir/cqlEngineClient.test.ts`; module not found).

- [ ] **Step 3: Implement `cqlEngineClient.ts`:**

```typescript
// =============================================================================
// Medgnosis API — clinical-reasoning sidecar client (FHIR $evaluate-measure)
// =============================================================================

export interface MeasureReportPopulation {
  code: { coding: Array<{ code: string }> };
  count: number;
}
export interface FhirMeasureReport {
  resourceType: 'MeasureReport';
  status: string;
  measure: string;
  group?: Array<{ population?: MeasureReportPopulation[] }>;
  [k: string]: unknown;
}
export interface EvaluateMeasureParams {
  periodStart: string;
  periodEnd: string;
  reportType: 'summary' | 'subject-list' | 'individual';
  subject?: string;
}

export async function evaluateMeasure(
  engineBaseUrl: string,
  measureId: string,
  params: EvaluateMeasureParams,
): Promise<FhirMeasureReport> {
  const qs = new URLSearchParams({
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    reportType: params.reportType,
    ...(params.subject ? { subject: params.subject } : {}),
  });
  const url = `${engineBaseUrl}/Measure/${encodeURIComponent(measureId)}/$evaluate-measure?${qs.toString()}`;
  const res = await fetch(url, { headers: { accept: 'application/fhir+json' } });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const issues = (body as { issue?: Array<{ diagnostics?: string }> }).issue ?? [];
    const msg = issues.map((i) => i.diagnostics).filter(Boolean).join('; ') || `HTTP ${res.status}`;
    throw new Error(`$evaluate-measure failed for ${measureId}: ${msg}`);
  }
  return body as unknown as FhirMeasureReport;
}

/** Extract {ip,denom,num,excl} counts from a summary MeasureReport group[0]. */
export function populationsFromReport(report: FhirMeasureReport): {
  initialPopulation: number; denominator: number; numerator: number; denominatorExclusion: number;
} {
  const pops = report.group?.[0]?.population ?? [];
  const byCode = (code: string) =>
    pops.find((p) => p.code.coding.some((c) => c.code === code))?.count ?? 0;
  return {
    initialPopulation: byCode('initial-population'),
    denominator: byCode('denominator'),
    numerator: byCode('numerator'),
    denominatorExclusion: byCode('denominator-exclusion'),
  };
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(cql): typed $evaluate-measure HTTP client`.

---

## Task 5: Implement the `cql` MeasureEvaluator (sample-cohort refresh)

**Files:** `apps/api/src/services/cqlMeasureEvaluator.ts`, `.../cqlMeasureEvaluator.test.ts`, modify `apps/api/src/services/measureEvaluator.ts`.

- [ ] **Step 1: Write the failing test** — `refresh()` evaluates each active measure for the sample cohort via the engine client and returns a `RefreshResult`-shaped summary (mock `cqlEngineClient` + `sql`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql, mockEval } = vi.hoisted(() => ({ mockSql: vi.fn(), mockEval: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./fhir/cqlEngineClient.js', () => ({
  evaluateMeasure: mockEval,
  populationsFromReport: (r: { __pops: unknown }) => r.__pops,
}));

import { refreshCqlMeasureResults } from './cqlMeasureEvaluator.js';

beforeEach(() => vi.clearAllMocks());

it('evaluates each active measure and reports rowCount', async () => {
  mockSql.mockResolvedValueOnce([{ measure_code: 'CMS122v12' }, { measure_code: 'CMS165v12' }]); // active measures
  mockEval.mockResolvedValue({ __pops: { initialPopulation: 100, denominator: 80, numerator: 55, denominatorExclusion: 2 } });
  mockSql.mockResolvedValue([]); // persistence writes
  const result = await refreshCqlMeasureResults();
  expect(mockEval).toHaveBeenCalledTimes(2);
  expect(result.rowCount).toBe(2);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `cqlMeasureEvaluator.ts`** — load active measures (with their reporting period + engine Measure id), call `evaluateMeasure(...summary)` per measure, persist the population counts into `phm_star.fact_measure_result`/strata (mirroring `measureCalculatorV2` semantics), return `{ rowCount, durationMs }`. Use `config.cqlEngineUrl`; respect `cqlSampleCohortLimit` for the cohort scoping (the engine's `subject`/group config per the Task 1 data-feeding decision). Keep `RefreshResult` shape identical to the SQL path.

- [ ] **Step 4: Wire the seam.** In `measureEvaluator.ts`, replace the throwing `cqlMeasureEvaluator.refresh` body with `refreshCqlMeasureResults` (import it). Keep `MEASURE_EVALUATOR` default `'sql'`.

- [ ] **Step 5: Run → PASS; typecheck.** **Step 6: Commit** `feat(cql): implement cql MeasureEvaluator over the clinical-reasoning sidecar`.

---

## Task 6: Reconciliation harness (CQL vs SQL) + prove CMS122/CMS165

**Files:** `apps/api/src/services/measureReconciliation.ts`, `.../measureReconciliation.test.ts`, `measures/**/tests/` (test decks).

- [ ] **Step 1: Write the failing test** for `reconcile(measureCode, period)` returning `{ agree: boolean, sql, cql, deltas }` within a tolerance:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { mockSql, mockEval } = vi.hoisted(() => ({ mockSql: vi.fn(), mockEval: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./fhir/cqlEngineClient.js', () => ({ evaluateMeasure: mockEval, populationsFromReport: (r: { __p: unknown }) => r.__p }));
import { reconcile } from './measureReconciliation.js';
beforeEach(() => vi.clearAllMocks());

it('flags agreement when SQL and CQL populations match within tolerance', async () => {
  mockSql.mockResolvedValueOnce([{ denominator: 80, numerator: 55 }]); // SQL rollup
  mockEval.mockResolvedValue({ __p: { denominator: 80, numerator: 55, initialPopulation: 100, denominatorExclusion: 2 } });
  const r = await reconcile('CMS122v12', { start: '2025-01-01', end: '2025-12-31' });
  expect(r.agree).toBe(true);
});
it('flags disagreement and reports deltas', async () => {
  mockSql.mockResolvedValueOnce([{ denominator: 80, numerator: 55 }]);
  mockEval.mockResolvedValue({ __p: { denominator: 80, numerator: 40, initialPopulation: 100, denominatorExclusion: 2 } });
  const r = await reconcile('CMS122v12', { start: '2025-01-01', end: '2025-12-31' });
  expect(r.agree).toBe(false);
  expect(r.deltas.numerator).toBe(15);
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement `measureReconciliation.ts`** (read SQL rollup from the star schema; read CQL via `evaluateMeasure` summary; compare ip/denom/num/excl; tolerance configurable). **Step 4: Run → PASS.**

- [ ] **Step 5: Ingest test decks.** Add MADiE/Bonnie-style test cases for CMS122 and CMS165 under `measures/CMS122/tests/` and `measures/CMS165/tests/` as CI fixtures (synthetic QI-Core patients + expected populations).

- [ ] **Step 6: Engine integration check (CI `cql` job).** Load the measures + test-deck patients into the sidecar and assert `$evaluate-measure` returns the expected populations for each test case. Gate: CMS122 and CMS165 compute their decks' expected numerator/denominator/exclusion exactly.

- [ ] **Step 7: Commit** `test(cql): reconciliation harness + CMS122/CMS165 proven against test decks`.

---

## Task 7: QRDA Category III serializer (+ QPP JSON) — engine-independent

**Files:** `apps/api/src/services/qrda/qrdaCat3.ts`, `.../qrdaCat3.test.ts`, `apps/api/src/services/qrda/qppJson.ts`.

- [ ] **Step 1: Write the failing test** — `buildQrdaCat3(reportingYear, measures)` emits CDA with one `measureReference` organizer per measure carrying `aggregateCount` observations for ip/denom/num/excl + sex/race strata:

```typescript
import { describe, it, expect } from 'vitest';
import { buildQrdaCat3 } from './qrdaCat3.js';

it('emits a QRDA Cat III document with aggregateCount per population', () => {
  const xml = buildQrdaCat3({
    reportingYear: 2025,
    measures: [{ eCqmId: 'CMS122v12', initialPopulation: 100, denominator: 80, numerator: 55, denominatorExclusion: 2 }],
  });
  expect(xml).toContain('ClinicalDocument');
  expect(xml).toContain('CMS122v12');
  expect(xml).toMatch(/aggregateCount[^>]*value="80"/); // denominator
  expect(xml).toMatch(/aggregateCount[^>]*value="55"/); // numerator
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement `qrdaCat3.ts`** — a templated CDA writer (header with the QRDA Cat III templateIds for the configured reporting year, measure section, `measureReference` organizers, `aggregateCount` observations; supplemental-data strata from `fact_measure_strata`). Make the eCQI QRDA IG version configurable per reporting year. **Step 4: Run → PASS.**

- [ ] **Step 5: Add `qppJson.ts`** (MIPS/APP submission JSON from the same population inputs) + its test.

- [ ] **Step 6: Cypress CVU+ validation in CI.** Add a step that runs the generated QRDA Cat III through the Cypress Validation Utility; gate on 0 errors. (Cypress is the official ONC tool; pin its version per reporting year.)

- [ ] **Step 7: Commit** `feat(qrda): QRDA Category III + QPP JSON serializers, Cypress CVU+ gate`.

---

## Task 8: Per-measure dossier endpoint

**Files:** `apps/api/src/routes/measures/dossier.ts`, modify `apps/api/src/routes/measures/index.ts`, migration `packages/db/migrations/056_measure_artifacts.sql`.

- [ ] **Step 1: Migration 056** — add columns/table linking `measure_definition` ↔ FHIR `Library`/`Measure` artifact refs + `ecqm_version` + `reporting_period` + VSAC version pins. Apply as `claude_dev` (additive), record in `_migrations`.

- [ ] **Step 2: Write the failing route test** — `GET /measures/CMS122v12/dossier` returns `{ cql, elm, valueSets:[{oid,version}], testDeckCoverage, measureReport }`.

- [ ] **Step 3: Implement `dossier.ts`** assembling: CQL+ELM from `measures/`, VSAC OIDs+versions from `vsacService.getMeasureValueSets` + bridge status, test-deck coverage from the CI fixture results, and the latest `MeasureReport`. Mount in `routes/measures/index.ts`.

- [ ] **Step 4: Run → PASS; typecheck; lint.** **Step 5: Commit** `feat(measures): per-measure transparency dossier endpoint`.

---

## Self-Review

**1. Spec coverage (roadmap Phase 1 epics):** Epic 1.1 engine behind seam → Tasks 1,2,4,5. Epic 1.2 prove top eCQMs w/ test decks → Tasks 3,6. Epic 1.3 FHIR Library/Measure remodel → Tasks 3 (content) + 8 (migration 056 binding); full canonical-store migration completes in Phase 2 with `$evaluate-measure` exposure (boundary noted). Epic 1.4 QRDA Cat III → Task 7. Success criteria (10 eCQMs under CQL, CQL/SQL reconcile, QRDA passes Cypress, dossier per measure) → Tasks 6,7,8 (start with 2 proven measures CMS122/165, scale the catalog after the pipeline is green — noted, not silently capped).

**2. Placeholder scan:** Task 1 is an explicit spike (investigation), not TDD — its unknowns are real and its gates concrete; Tasks 4,7 (standardized APIs) are full TDD. No "TBD"/"add error handling". The data-feeding decision is deferred to Task 1 by design and only affects sidecar config, not the typed client (documented).

**3. Type consistency:** `evaluateMeasure(engineBaseUrl, measureId, params)` / `populationsFromReport` / `FhirMeasureReport` / `refreshCqlMeasureResults(): RefreshResult` (matches `measureEvaluator` seam) / `reconcile(measureCode, {start,end})` / `buildQrdaCat3({reportingYear, measures})` — names used consistently across tasks. `RefreshResult` reused from `measureCalculatorV2` (unchanged contract).

---

## Execution Handoff

**Plan saved to `docs/superpowers/plans/2026-06-13-phase-1-cql-engine.md`. Recommended order:** Task 1 (spike) **first and gated** — if its exit gate fails, stop and reassess the engine approach before any further work. Then Tasks 2–8.

Two execution options (same as Phase 0): **(1) Inline with checkpoints** (recommended — checkpoint after the Task 1 spike and after each DB-touching task), or **(2) subagent-driven**. The spike (Task 1) is the highest-uncertainty, highest-value step — review its Engine Notes before committing to Tasks 4–6.
