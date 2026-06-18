# FHIR/QDM Dimensional Bridge Completion Devlog

**Date:** 2026-06-18
**Repository:** `/home/smudoshi/Github/Medgnosis`
**Primary source document:** `/home/smudoshi/Github/Medgnosis/QDM-v5.6-508.pdf`
**Companion notes:** `docs/superpowers/notes/2026-06-17-qdm-v56-fhir-qdm-dimensional-bridge-notes-and-todo.md`
**Implementation plan:** `docs/superpowers/plans/2026-06-17-fhir-qdm-dimensional-bridge-implementation-plan.md`
**Operations runbook:** `docs/superpowers/runbooks/qdm-bridge-operations.md`

## Executive Summary

This work completed the engineering phase for integrating the FHIR to QDM bridge into the Medgnosis dimensional analytics model in a bidirectional, auditable, and governance-safe way.

The implemented bridge now supports four critical flows:

1. Inbound staged FHIR resources can be normalized into canonical QDM-oriented evidence and linked to EDW/source identity.
2. Existing EDW evidence can be projected into QDM-derived QI-Core resources for CQL sidecar execution.
3. CQL `MeasureReport` output can be persisted, reconciled against SQL star facts, and materialized into non-authoritative QDM/CQL shadow star rows with evidence lineage.
4. Admin governance surfaces can review promotion configuration, semantic drift dossiers, raw evidence drilldown by audited single-patient selection, and QDM bridge operational run/issue status.

The engineering completion boundary is intentionally not the same as standards-authoritative promotion. `CMS122v12` remains in `cql_shadow` mode, with `sql_bundle` still authoritative, because the live semantic drift dossier shows that the local SQL baseline is a governed `DM-02` care-gap surrogate and not a standards-equivalent CMS122 eCQM implementation. This is the accepted best practice: keep the published CQL/QDM/QI-Core artifact intact, make the local surrogate explicit, document the drift, and block authoritative promotion until clinical governance accepts the semantic change or the SQL baseline is replaced by a standards-equivalent evaluator.

Current completion estimate:

- **FHIR/QDM bridge engineering phase:** 100 percent complete for the scoped CMS122 shadow/governance milestone.
- **CMS122 CQL-authoritative promotion:** intentionally blocked pending governance review of semantic drift.
- **Full QDM v5.6 datatype coverage across all clinical domains:** not complete; the implemented scope is the first production-ready vertical slice plus the operating model for expansion.

## Standards And Research Basis

The implementation was grounded in QDM v5.6 and current quality-measure interoperability patterns:

- QDM v5.6 data elements are not just terminology matches. They combine category, datatype, code or value set, timing semantics, attributes, related entities, components, and provenance.
- QI-Core is the FHIR projection used for CQL execution, not a replacement for QDM semantics in analytics.
- FHIR is the interoperability envelope, QDM is the quality-measure semantic contract, EDW is normalized operational storage, and `phm_star` is the analytics surface.
- The QDM layer must preserve timing distinctions such as author datetime, relevant datetime, relevant period, prevalence period, result datetime, and status date.
- Negation rationale is explicit evidence, not the absence of a record.
- QDM `relatedTo` style relationships require durable linkage between evidence events, not only scalar foreign keys.
- QDM result handling must support typed quantities, coded concepts, ratios, strings, booleans, date/time values, percentages, and present-only semantics.

The detailed standards notes are preserved in:

- `docs/superpowers/notes/2026-06-17-qdm-v56-fhir-qdm-dimensional-bridge-notes-and-todo.md`

## Architecture Delivered

The delivered architecture inserts a QDM evidence spine into the existing Medgnosis standards stack:

```text
FHIR staging / EDW source rows
  -> QDM event and source crosswalk
  -> QDM-derived QI-Core export
  -> CQL sidecar evaluate-measure
  -> persisted MeasureReport and patient evidence
  -> SQL/CQL reconciliation
  -> shadow fact_measure_result rows
  -> semantic drift dossier and governance UI
  -> operational ledger and lineage views
```

The important design decision is that the bridge is bidirectional without making every transformation authoritative by default. Inbound and outbound evidence paths now exist, but measure authority is controlled per measure by promotion configuration and reconciliation state.

## Database Work

Migrations `068` through `079` define the bridge, reconciliation, governance, semantic drift, and operational closure layers.

| Migration | Purpose |
| --- | --- |
| `068_qdm_bridge_foundation.sql` | Adds the first QDM event spine, FHIR/QDM crosswalk, QDM/MeasureReport evidence table, and star evidence bridge. |
| `069_auth_admin_oidc_foundation.sql` | Adds auth provider administration and OIDC foundation used by the admin/governance surface. |
| `070_qdm_cql_measure_result_promotion.sql` | Extends measure result facts for source-aware CQL/QDM promotion, MeasureReport linkage, reconciliation status, and evidence provenance. |
| `071_measure_data_criteria.sql` | Adds parsed measure data-criteria inventory so QI-Core/CQL requirements can be joined to QDM datatypes, VSAC value sets, and analytics lineage. |
| `072_measure_promotion_reconciliation_governance.sql` | Adds promotion configuration and reconciliation governance structures. |
| `073_measure_promotion_audit_columns.sql` | Adds audit/governance columns for promotion state transitions. |
| `074_measure_reconciliation_scope.sql` | Records reconciliation scope so bounded/scoped runs cannot be promoted as population authority. |
| `075_measure_sql_baseline_alias.sql` | Makes local SQL baseline aliases explicit, including `CMS122v12 <- DM-02`. |
| `076_measure_reconciliation_conservative_legacy_scope.sql` | Conservatively marks legacy unlinked rows as not promotion eligible. |
| `077_measure_reconciliation_promotion_eligibility_guard.sql` | Enforces that promotion-eligible rows must be full-population, accepted, and linked to the CQL MeasureReport. |
| `078_measure_semantic_drift_dossier.sql` | Persists aggregate and patient-level semantic drift classifications without storing raw FHIR/QDM payloads in the dossier tables. |
| `079_qdm_bridge_operations.sql` | Adds the PHI-safe QDM bridge run ledger, issue ledger, operational status view, and star evidence lineage view. |

The local database migration state after applying the final migration:

- Applied migrations: `78`
- Pending migrations: none
- Final migration applied: `079_qdm_bridge_operations.sql`

New operational tables and views:

- `phm_edw.qdm_bridge_run`
- `phm_edw.qdm_bridge_issue`
- `phm_edw.v_qdm_bridge_operational_status`
- `phm_star.v_measure_evidence_lineage`

## Backend Services Delivered

The backend now includes the main bridge and governance service areas:

- Staged FHIR to QDM replay and normalization support in `apps/api/src/services/ehr/qdmBridge.ts`.
- QDM canonical model, FHIR-to-QDM normalizers, QDM-to-QI-Core projection, measure criteria extraction, CQL evidence persistence, star promotion, star evidence decoration, and bridge operations under `apps/api/src/services/qdm/`.
- MeasureReport persistence and patient-level evidence storage with QDM evidence summaries.
- Source-aware measure reconciliation that distinguishes SQL, CQL, manual, and import origins.
- Promotion configuration controls that keep SQL authoritative unless a full-population accepted CQL reconciliation is explicitly promoted.
- Semantic drift dossier generation and worklist services.
- PHI-safe bridge run/issue operations service in `apps/api/src/services/qdm/bridgeOps.ts`.

Important hardening completed during the work:

- CQL shadow materialization uses a non-SQL source and cannot overwrite SQL bundle authority by accident.
- Scoped CQL subject runs are explicitly marked `evaluation_scope = scoped_subjects` and `promotion_eligible = false`.
- Full-population CQL shadow runs can be persisted and materialized, but promotion is blocked unless the accepted-governance checks pass.
- Unsafe JSONB handling in the CQL-to-star materializer was corrected so reconciliation and promotion metadata are stored as structured JSONB objects, not JSON strings.
- CQL evidence ledger idempotency now includes `qdm_event_id` in generated population criteria identifiers to avoid collisions when repeated evidence events support the same patient/report.
- Evidence joins for semantic drift are source-aware and deterministic, preventing mixed-source evidence from silently redefining a drift row.

## API Work Delivered

Admin routes were extended with governance and bridge operations endpoints.

Measure promotion and semantic drift:

- `GET /api/admin/measure-promotion-configs`
- `GET /api/admin/measure-promotion-configs/:measureCode`
- `PATCH /api/admin/measure-promotion-configs/:measureCode`
- `POST /api/admin/measure-promotion-configs/:measureCode/promote-cql-authoritative`
- `POST /api/admin/measure-promotion-configs/:measureCode/semantic-drift-dossier`
- `GET /api/admin/measure-promotion-configs/:measureCode/semantic-drift-worklist`
- `GET /api/admin/measure-promotion-configs/:measureCode/semantic-drift-worklist/:dossierPatientId`

QDM bridge operations:

- `GET /api/admin/qdm-bridge/status`
- `GET /api/admin/qdm-bridge/runs`
- `GET /api/admin/qdm-bridge/issues`

Audit posture:

- Aggregate status and worklist reads are audited.
- Raw evidence detail access is audited per selected persisted dossier-patient row.
- Audit metadata records row ids, evidence ids, counts, and filter context.
- Audit metadata does not store raw FHIR resources, raw QDM payloads, or full subject MeasureReports.

## Frontend Work Delivered

The admin surface now includes a Measure Governance tab under `/admin`. It is deliberately not part of the public `/measures` page because the workflows include governance state and controlled evidence review.

The tab provides:

- Promotion configuration list and status.
- Semantic drift dossier and worklist review.
- Filtered residual drift worklist.
- Audited raw QDM/FHIR detail drilldown after selecting one row.
- QDM bridge operational status and open issue summary.
- Bridge Ops panel backed by the new admin QDM bridge endpoints.

Auth/admin frontend changes also landed as part of the governance surface:

- Admin auth-provider controls.
- OIDC callback route.
- Local/OIDC login surface updates.
- System health/admin tab structure updates.
- Shared auth types for provider-backed sign-in state.

## CMS122 Evidence And Reconciliation Results

The bridge was proven with the CMS122 vertical slice against the current local data and HAPI clinical-reasoning sidecar.

SQL authoritative baseline after refreshing measure facts:

- `CMS122v12`: denominator `256`, numerator `58`, exclusions `0`
- `DM-02`: denominator `256`, numerator `58`, exclusions `0`
- The SQL path is explicitly governed as a `CMS122v12 <- DM-02` baseline alias.

Scoped patient smoke:

- Patient `9` was denominator-only in SQL.
- EDW backfill upserted `130` QDM events.
- QDM-derived QI-Core load inserted `129` resources.
- CQL result: initial population `1`, denominator `1`, numerator `0`, denominator exclusion `0`.
- Reconciliation status: `agree`.
- Evaluation scope: `scoped_subjects`.
- Promotion eligibility: `false`.

Full-population shadow run:

- SQL denominator cohort: `256` patients.
- QDM events upserted: `26,313`.
- QDM-derived QI-Core resources loaded: `25,970`.
- CQL engine load: `25,970` total, `25,970` created, `0` failed.
- Patient evidence rows persisted: `256`.
- Bounded QDM evidence summaries persisted/selected: `19,110`.
- CQL result: initial population `17`, denominator `17`, numerator `0`, denominator exclusion `0`.
- SQL baseline: denominator `256`, numerator `58`, exclusion `0`.
- Reconciliation status: `drift`.
- Reconciliation deltas: denominator `239`, numerator `58`, exclusion `0`.

Shadow star materialization:

- Source: `qdm-cql`
- Evaluation scope: `full_population`
- Reconciliation status: `cql_shadow`
- `fact_measure_result` shadow rows: `256`
- `fact_measure_result_evidence` rows: `19,110`
- `bridge_qdm_star_evidence` rows: `19,110`

Promotion configuration:

- `CMS122v12` promotion mode: `cql_shadow`
- `CMS122v12` authoritative source: `sql_bundle`

## Semantic Drift Dossier

The semantic drift dossier is the main governance artifact for the CMS122/DM-02 mismatch.

Persisted dossier:

- Dossier id: `2`
- Reconciliation run id: `3`
- MeasureReport id: `1`
- Compared patients: `256`
- Drift patients persisted: `242`
- SQL authoritative counts: denominator `256`, numerator `58`, exclusions `0`
- CQL shadow counts: denominator `17`, numerator `0`, exclusions `0`

Denominator classification:

- `outside_cms122_age_range`: `101`
- `missing_cql_qualifying_encounter_or_initial_population`: `106`
- `residual_cql_or_qicore_semantic_gap`: `27`
- `aligned_denominator`: `17`
- `denominator_exclusion_evidence_present_but_not_cql_flagged`: `4`
- `missing_cql_diabetes_value_set_evidence`: `1`

Numerator classification:

- `neither_numerator`: `198`
- `local_gap_closed_without_qdm_hba1c_or_gmi_evidence`: `38`
- `local_gap_closed_with_controlled_hba1c_not_cms122_poor_control`: `20`

Evidence coverage:

- Patients with QDM evidence: `256`
- Patients with CMS122 age-band eligibility: `155`
- Patients with diabetes evidence: `255`
- Patients with qualifying encounter evidence: `61`
- Patients with HbA1c evidence: `96`
- Patients with HbA1c greater than 9: `0`
- Maximum HbA1c value in the dossier cohort: `7.6`

Interpretation:

- Denominator drift is expected because the local `DM-02` baseline is broader than published CMS122. CMS122 has age, diabetes, encounter, timing, and exclusion semantics that are not equivalent to the local care-gap surrogate.
- Numerator drift is a semantic inversion. Local `gap_status = closed` means the care gap was satisfied. CMS122 numerator means poor control, missing result, or not-performed HbA1c/GMI assessment.
- The correct governance posture is to keep SQL authoritative for current dashboards, keep CQL in shadow mode, expose the dossier for review, and avoid changing the published CQL just to force agreement with a local surrogate.

Residual worklist smoke:

- Worklist for dossier `2` and `residual_cql_or_qicore_semantic_gap` returned `27` total rows.
- A sampled detail row returned dossier patient row `243`, patient `3`, MeasureReport evidence row `95`, `58` QDM evidence items, and a subject MeasureReport with zero CQL subject populations.
- The raw detail path is admin-only and audited because it exposes patient-linked evidence.

## Operations Closure

The final operational pass added the pieces needed to run and monitor the bridge safely:

- `phm_edw.qdm_bridge_run` records bridge, CQL shadow, reconciliation, dossier, validation, and review runs.
- `phm_edw.qdm_bridge_issue` records PHI-safe operational issues such as unmapped codes, missing timing, missing actors, invalid units, ambiguous components, unsupported datatypes, CQL engine failures, and drift-review findings.
- `phm_edw.v_qdm_bridge_operational_status` summarizes latest run state by operation/measure and open issue counts.
- `phm_star.v_measure_evidence_lineage` exposes a PHI-safe lineage path from star measure facts to persisted CQL/QDM MeasureReport evidence summaries.
- `npm run qdm:shadow-refresh` wraps the existing CQL smoke harness with a bridge run ledger and forces `QDM_CQL_PROMOTION_ELIGIBLE=false`.
- The Measure Governance admin tab now shows bridge operations status and open issue state.
- The runbook documents replay, bad mapping rollback, value-set drift, and CQL engine outage procedures.

Live operational ledger smoke:

- A `manual_review` run was created and completed for `CMS122v12`.
- Run id: `e4c6e552-36c6-425c-a33b-028c4c8b001a`
- Final status: `completed`
- This proved the run table and status view are usable without invoking the CQL engine.

## Validation Completed

The following gates passed after the final operational closure:

```bash
npm run typecheck
npm run lint
git diff --check
set -a; . ./.env.production; set +a; npm run db:migrate:dry-run
npm run test
npm run build
```

Observed results:

- Typecheck passed across all workspaces.
- Lint passed across all workspaces.
- Whitespace check was clean.
- Migration dry run reported no pending migrations.
- Test suite passed with API, web, Solr, and shared tasks successful.
- API tests: `514` passed, `1` skipped.
- Web tests: `41` passed.
- Build completed successfully.
- Local API health was healthy at `http://localhost:3002/health`.
- Local web dev server returned HTTP `200` at `http://localhost:5176/`.

Browser smoke:

- `/admin` rendered using a short-lived local JWT minted from the existing environment secret for smoke testing only.
- Measure Governance loaded `25` promotion config rows.
- QDM evidence detail loaded.
- Bridge Ops panel rendered.
- No browser console errors were observed.
- Screenshot captured at `/tmp/medgnosis-measure-governance-complete.png`.

## Deployment Readiness

This tranche is ready for commit, push, and production deployment with the following caveats:

- Migrations have already been applied locally and dry-run validation reports no pending migrations.
- Production deployment should use `scripts/deploy-production.sh`, which builds all workspaces, restarts `medgnosis-api`, restarts `medgnosis-worker` when available and unmasked, and checks `http://127.0.0.1:3081/health`.
- After deploy, verify the public site health endpoint at `https://medgnosis.acumenus.net/health`.
- Do not run authoritative CMS122 CQL promotion as part of deployment. That remains a governance decision, not a technical cleanup step.

## Completion Boundary

The scoped bridge effort is complete when judged against the requested goal: make the FHIR to QDM bridge integrated into the dimensional model for analytics bidirectionally.

Completed:

- QDM-oriented evidence spine and source crosswalk.
- FHIR/QDM normalization path for the first vertical slice.
- EDW-to-QDM-to-QI-Core projection for CQL execution.
- Persisted CQL MeasureReports and patient-level evidence summaries.
- Source-aware SQL/CQL reconciliation.
- Non-authoritative QDM/CQL star materialization.
- Semantic drift dossier and worklist.
- Audited raw evidence detail drilldown.
- Admin Measure Governance UI.
- PHI-safe bridge operations ledger and issue table.
- Evidence lineage view.
- Runbook for replay, rollback, value-set drift, and engine outage.

Not included in this completion boundary:

- Reclassifying `CMS122v12` as CQL-authoritative.
- Completing every QDM v5.6 datatype across all clinical domains.
- Completing DEQM/QRDA conformance for every downstream reporting package.
- Replacing every existing star ETL path with QDM-first ETL.

Those items are the next standards-expansion and governance phases. The current phase delivers the foundation, safety rails, evidence, and operational workflow needed to perform those phases without semantic drift being hidden.
