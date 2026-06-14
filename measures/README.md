# Medgnosis measures — CMS eCQM content

Phase 1 computes standardized eCQMs in CQL via the clinical-reasoning sidecar
(`docker/cql-engine/`). For CMS-published measures we **ingest the official
QI-Core content** rather than re-authoring — these bundles already ship
**pre-compiled ELM**, so no standalone CQL→ELM translator is on the critical path
(the translator is only needed for *net-new* Medgnosis-authored measures, a later
phase).

## Source

Official CMS FHIR/QI-Core measure content, per reporting year:

- `cqframework/ecqm-content-qicore-2025` (AU2025 testing) — and prior years 2020–2024.

Each measure ships a self-contained bundle under
`bundles/measure/<MeasureName>/<MeasureName>-bundle.json` containing the `Measure`,
all dependency `Library` resources (with `text/cql` **and** `application/elm+json`),
the `ValueSet`s, and the MADiE **test patients + expected `MeasureReport`s**.

## Proven (2026-06-13)

`CMS122FHIRDiabetesAssessGreaterThan9Percent` (Diabetes: HbA1c Poor Control >9%):

- Loaded into the HAPI CR sidecar (312 resources: 1 Measure, 9 Libraries, 26 ValueSets,
  56 test patients + clinical data).
- `Measure/$evaluate-measure`:
  - **subject** (test-deck patient `090ad2fc…`): `ip=1, denom=1, denom-exclusion=0, num=1`
    — **exact match** to the published MADiE expected `MeasureReport`.
  - **population** (cohort): `ip=52, denom=52, denom-exclusion=19, num=32`, score `0.97`.
- Reproduce: `scripts/cql-realmeasure-smoke.sh` (exit 0 = computed matches the test deck).

## Engine config note

CMS measure/test bundles reference example resources (e.g. `Practitioner/example`)
that aren't in the bundle, so the sidecar runs with referential-integrity tolerance
(`hapi.fhir.enforce_referential_integrity_on_write=false`,
`hapi.fhir.allow_external_references=true` — set in `docker-compose.yml`).

## Evaluation parameters (HAPI CR R4 gotchas)

- `reportType` ∈ `subject | subject-list | population` (not `summary`).
- `subject=Patient/<id>` for an individual report; omit for `population`.
- `periodStart`/`periodEnd` must match the measure's `effectivePeriod`
  (CMS122 2025 content uses `2026-01-01 .. 2026-12-31`).

## Adding a measure

1. Find the bundle path in the content repo
   (`bundles/measure/<Name>/<Name>-bundle.json`).
2. Add it to `scripts/cql-realmeasure-smoke.sh` (or a per-measure smoke) with a
   known test-deck `subject` + expected populations.
3. The `cql` MeasureEvaluator (Phase 1 Task 5) loads + evaluates against a sample
   cohort and reconciles vs the SQL path.
