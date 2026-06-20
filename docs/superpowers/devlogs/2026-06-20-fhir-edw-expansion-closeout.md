# FHIR→EDW Ingestion Expansion — Closeout

- **Date:** 2026-06-20
- **Branch:** `feature/fhir-edw-ingestion-expansion` (8 commits, not yet merged)
- **Plan:** `docs/superpowers/plans/2026-06-20-fhir-edw-ingestion-expansion.md`
- **Status:** Phases A, B, C, D, E1, F, and G's clean parts (scopes + CapabilityStatement) COMPLETE and verified. E2, G1, and the Epic re-onboard are precisely-specified follow-ups (below).

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

## Follow-ups (deferred — specified, not started)

1. **G1 — standalone reference-dimension dispatch** (`edwHydration.ts`). Today provider/org FKs on encounters only resolve when the Practitioner/Organization is a *contained* resource. Epic `$export` delivers them as *top-level* resources, so to populate `encounter.provider_id`/`org_id` from real bulk data we must: add `Practitioner`/`Organization`/`Location` to `SUPPORTED_RESOURCE_TYPES`; give them ORDER-BY ordinals **before** Encounter (renumber the ladder: Patient=0, Practitioner=1, Organization=2, Location=3, Encounter=4, …); add a non-patient dispatch branch in `hydrateStagedResource`; and widen `upsertResourceCrosswalk(patientId)` to `number | null` (bind null for dimensions). Intricate (signature change + ordinal renumber) — do as its own reviewed task. Plan task G1 has the exact code.
2. **E2 — Bulk `deleted` manifest** (`bulkData.ts`, ~2000 lines). Parse the `$export` output's `deleted` entries (deletion Bundles), resolve each `ResourceType/id` against `ehr_resource_crosswalk`, and call the exported `softDeleteLocalRow` + crosswalk stamp. Add `softDeleteByCrosswalk` and wire it into the import-completion path (~`bulkData.ts:904`). Plan task E2 has the code.
3. **Epic re-onboard + portal scopes** (operational, prod). Re-run `ehr:onboard` for tenant id=2 (command in `2026-06-20-epic-app-registration-prep.md`) to push the expanded backend/SMART scopes into the registry. Epic only grants scopes that are ALSO checked in the app portal — the human must select the new `system/*.rs` scopes for App A on `fhir.epic.com`. Gate this behind the token-exchange propagation already pending in the Epic registration work.
4. **QI-Core builders for new QDM datatypes** (`qdmToQiCore.ts`). The four new datatypes currently map to `null` (default) on the CQL/QI-Core path; the authoritative SQL measure path uses `qdm_event` directly and is fully covered. Add builders only if/when the CQL engine path needs them.

## Honest scope notes (carried from the plan)

- Problem-list-category Conditions still route to `condition_diagnosis` (not `problem_list`).
- FamilyMemberHistory / RelatedPerson unmapped.
- DiagnosticReport→result-Observation linkage not persisted (the component Observations hydrate independently).
- `care_team_member` is replaced wholesale on each CareTeam re-ingest (soft-delete prior, re-insert current).

## Merge

Branch is green and self-contained; nothing is half-done. Migrations 089/090 are already applied to `medgnosis`. Merge to `main` when ready (no schema drift risk — DDL is live; code is additive).
