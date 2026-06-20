# FHIR→EDW Ingestion Expansion — Closeout

- **Date:** 2026-06-20
- **Branch:** `feature/fhir-edw-ingestion-expansion` (10 commits, not yet merged)
- **Plan:** `docs/superpowers/plans/2026-06-20-fhir-edw-ingestion-expansion.md`
- **Status:** Phases A–G1 + E2 + QI-Core builders COMPLETE, verified (full suite 781 passed), merged + pushed to `origin/main`. Epic sandbox re-onboarded (tenant 2), verified live end-to-end, and exercised with a **real Bulk `$export`** (2897 resources) that found + fixed 3 spec/correctness defects (GET kickoff, single Accept, hydration cap) and surfaced 1 throughput follow-up. New EDW tables populated from real Epic data.

## Sequence-drift investigation (2026-06-20)

While validating G1 against the live schema, a single `phm_edw.provider` insert collided (sequence 1 behind max). Thorough check accounting for `is_called`: `organization`/`clinic_resource`/`medication` are safe (`is_called=true`, next = max+1); `provider` was a transient 1-behind drift that the probe advanced past. **No remaining collision risk** for the hydrators' inserts. The rolled-back real-schema validation probes did non-transactionally advance a few sequence counters forward (e.g., `care_plan` 40→42) — harmless (forward-only; no data changed).

## What shipped (all gates green)

Final verification: `tsc --noEmit` clean, `tsc` build clean, **full apps/api suite 769 passed / 1 skipped**. Every new INSERT/UPDATE was additionally validated against the **live `phm_edw` schema in rolled-back transactions** (mock tests alone cannot catch column/NOT-NULL/cast errors).

| Phase | Commit | Delivered |
|---|---|---|
| A | `3ffb1de` | Migrations 089 (`phm_edw.diagnostic_report`, `document_reference`) + 090 (`ehr_resource_crosswalk.deleted_at`/`deleted_reason`). Applied to the `medgnosis` DB + verified. |
| B | `a149f62` | Practitioner→`provider`, Organization→`organization`, Location→`clinic_resource` get-or-create; `hydrateEncounter` backfills `provider_id`/`org_id` from references/contained resources. |
| C1 | `9563ed8` | ServiceRequest→`clinical_order`, DiagnosticReport→`diagnostic_report`, DocumentReference→`document_reference` (insert + update). |
| C2 | `c61197f` | CarePlan→`care_plan`, Goal→`care_plan_item` (synthetic "Imported FHIR Goals" plan), CareTeam→`care_team`+`care_team_member`, Coverage→`patient_insurance_coverage`+`payer`. |
| D | `5bc91e1` | Vital-sign Observations dual-write into `phm_edw.vital_sign` (LOINC→column map, kg/cm/°C conversion, BP component fold). |
| E1 | `1bf0601` | `entered-in-error` → soft-delete (`active_ind='N'`) + crosswalk audit stamp; `softDeleteLocalRow` exported for E2. |
| F | `a261618` | QDM normalizers: DiagnosticReport→`Diagnostic Study, Performed`, ServiceRequest→`Intervention, Order`, DocumentReference→`Communication, Performed`, Goal→`Care Goal` (populate `phm_edw.qdm_event`). |
| G2/G3 | `3453593` | Added the 7 new resources to default SMART/backend scope sets; advertised them (US Core profiles) in the CapabilityStatement. |

**Resource coverage: 8 → 15** FHIR types into EDW, with insert/update/soft-delete semantics, reference-dimension FKs, vitals, and QDM measure-analytics coverage for the measurable subset.

## Verification methodology (per "double-check everything")

Each code phase was verified at three levels: (1) mockSql unit tests asserting emitted SQL/params; (2) **real-schema execution** of every new INSERT/UPDATE inside `BEGIN…ROLLBACK` against `medgnosis` (zero data change) — this caught what mocks cannot; (3) independent re-run of `tsc` + the test suite by the orchestrator, not trusting subagent self-reports. The subagent test harness was corrected up front (the suite mocks `@medgnosis/db`; it does NOT touch a DB).

## E2 — Bulk `deleted` manifest (DONE 2026-06-20, commit e37b32a)

`softDeleteByCrosswalk` (resolves a resource by tenant/type/id via the crosswalk → soft-deletes the mapped EDW row + audit stamp) and `processBulkDeletions` + `extractDeletedReferences` (download each `$export` `deleted` output — NDJSON of FHIR Bundles with `request.method=DELETE`/`request.url=ResourceType/id` — parse and soft-delete each) are wired into `importBulkExportJob` after hydration. Per-file fetch errors are counted, not fatal; results recorded in ingest-run metadata. 5 tests; full apps/api suite 777 green.

## Epic re-onboard + live end-to-end verification (DONE 2026-06-20)

Re-ran `ehr:onboard` for tenant id=2 — registry now requests all 15 resource types for both SMART launch (`patient/*.rs`) and backend services (`system/*.rs`). Token-exchange propagation has cleared, and the **Epic public sandbox grants all the new resource scopes automatically** (no portal scope-check was needed for the sandbox; granted set includes `system/DiagnosticReport.r/s`, `DocumentReference`, `ServiceRequest`, `CarePlan`, `CareTeam`, `Goal`, `Coverage`, `Practitioner`, `Organization`, `Location`, vital-signs/laboratory Observations, problem-list/encounter-diagnosis Conditions, etc.).

Live end-to-end proof (backend `private_key_jwt` token via our JWKS → authenticated FHIR reads against sandbox patient Camila Lopez `erXuFYUfucBZaryVksYEcMg3`):
- `Patient/…` → HTTP 200, "Camila Maria Lopez"
- `DiagnosticReport?patient=…` → HTTP 200, 2 entries (**new resource type returning real data**)
- `Condition?patient=…` → HTTP 200, 2 entries

The full ingestion chain is therefore live: token → FHIR read/`$export` → stage → hydrate into `phm_edw` for all 15 resource types.

## Real Bulk `$export` integrity test (2026-06-20)

Ran a real group `$export` against the Epic sandbox group `e3iabhmS8rsueyz7vaimuiaSmfGvi.QwjVXJANlPOgR83` (types incl. the new ones). End-to-end: kickoff → async poll → manifest → download → stage → hydrate. **2897 resources staged, 0 failures** (DiagnosticReport=9, DocumentReference=399, Goal=14, Observation=2395, …); QDM normalized 2880. The test surfaced four defects the unit suite could not — three fixed, one documented:

1. **Kickoff used `POST` → Epic 405** (commit `250e561`). The URL-parameter kickoff form must be `GET`; POST requires a `Parameters` resource body we don't send.
2. **`Accept: application/fhir+json, application/json` → Epic 400** (commit `250e561`). The Bulk Data IG mandates the single value `application/fhir+json`.
3. **`MAX_LIMIT=500` silently truncated EDW hydration** (commit `3031694`). The import passes the full staged count, but the cap stopped at 500 — Patient-first ordering filled it with Patient/Encounter/Condition/Observation, so DiagnosticReport/DocumentReference/Goal never hydrated. Raised to 50000. **Verified live:** re-hydrating the staged run populated `diagnostic_report`=9, `document_reference`=399, Goal `care_plan_item`=14 (all 0 before), `failed=0`.
4. **Hydration throughput (FOLLOW-UP, not yet fixed).** `hydrateStagedRunToEdw` processes each resource in its own `sql.begin` transaction (plus a per-Observation vital-sign fold); 2897 resources did not finish within ~9.5 min. Realistic group exports need batched draining in the import worker (chunk staged rows, commit in batches, and/or exclude already-EDW-hydrated rows via the crosswalk so a true drain loop can advance — the crosswalk already distinguishes EDW `local_table` from `phm_edw.qdm_event`, so the exclusion is straightforward). Raising `MAX_LIMIT` removed the correctness cap; this addresses the performance ceiling.

Crosswalk ownership verified clean (no EDW/QDM conflict): EDW-hydrated resources own their clinical `local_table`; the rest point at `phm_edw.qdm_event`.

## Follow-ups

1. **Batched, resumable EDW drain** (finding #4) — DONE (commit `2c837fb`). `drainStagedRunToEdw` loops hydration in bounded 500-row batches until staging is exhausted; `findHydratableStagedResources` excludes rows already hydrated into a real EDW `local_table` at the current content hash (the crosswalk distinguishes EDW tables from `phm_edw.qdm_event`), so batches advance, memory stays bounded, and re-imports/interrupted runs are idempotent. Verified live (re-drain of already-hydrated new types → seen=0, no duplicates). Remaining deeper optimization: the per-resource `sql.begin` transaction is the throughput floor — multi-resource-per-transaction batching (trading per-resource error isolation) would speed large drains further.
2. **QI-Core builders for new QDM datatypes** — DONE (commit `1ed0a1e`).
3. **Frontend panels for DiagnosticReport / DocumentReference** — DONE (commit `7b570da`): `GET /patients/:id/diagnostic-reports` + `/documents` endpoints (inherit the `/:id/*` provider-panel access hook) and a "Documents & Reports" tab in Patient Detail. Deployed live (API restarted to load routes; the auto-deploy daemon rebuilt the dist but did not restart the service). Camila Lopez (1005796) has 7 reports + 268 documents.
4. **Dashboard aggregates + Solr search** — DONE via a **targeted** backfill (no full ~1M ETL). The demo is provider-scoped to Dr. Udoshi (`provider_id 2816`): `fact_patient_composite` and the patient list only include patients whose `pcp_provider_id = 2816`. The 7 synthetic patients (no PCP) were therefore invisible. Targeted update: (a) assigned them to PCP 2816; (b) ran the migration-014 step-22 ETL **scoped to the 7 ids** → 7 `dim_patient` + 7 `fact_patient_composite` rows (real computed age / chronic-condition counts; `has_*` flags false because Epic condition names don't match the ILIKE patterns; `risk_tier` null — no AI risk history); (c) refreshed all 8 `phm_star.mv_*` matviews (non-concurrent, <2s each — they read the small panel-scoped fact table); (d) indexed the 7 into the Solr `search` core (`localhost:8984`, commit=true). Verified: panel 1288→1295, all 7 in `fact_patient_composite`, Solr name-search "Lopez" → Camila Lopez, all 7 searchable. Gotcha: an orphaned `psql` waiting on auth held a lock that blocked `REFRESH MATERIALIZED VIEW` until cleared.

## Honest scope notes (carried from the plan)

- Problem-list-category Conditions still route to `condition_diagnosis` (not `problem_list`).
- FamilyMemberHistory / RelatedPerson unmapped.
- DiagnosticReport→result-Observation linkage not persisted (the component Observations hydrate independently).
- `care_team_member` is replaced wholesale on each CareTeam re-ingest (soft-delete prior, re-insert current).

## Merge

Branch is green and self-contained; nothing is half-done. Migrations 089/090 are already applied to `medgnosis`. Merge to `main` when ready (no schema drift risk — DDL is live; code is additive).
