# QDM v5.6 FHIR/QDM/Dimensional Bridge Notes and TODO

Date: 2026-06-17

Local source: `/home/smudoshi/Github/Medgnosis/QDM-v5.6-508.pdf`

Purpose: working notes from the QDM v5.6 PDF, current Medgnosis implementation, official standards references, and the concrete TODO backlog needed to make the FHIR to QDM bridge bidirectionally integrated with the dimensional analytics model.

## Source References

- Local PDF: `QDM-v5.6-508.pdf`, 101 pages, title `QDM v5.6`, January 2021.
- Official QDM version page: https://ecqi.healthit.gov/qdm/versions
- Official QDM overview: https://ecqi.healthit.gov/qdm/about
- Official QDM v5.6 PDF: https://ecqi.healthit.gov/sites/default/files/QDM-v5.6-508.pdf
- QI-Core overview: https://ecqi.healthit.gov/qi-core/about
- QDM v5.6 to QI-Core mapping, HL7 continuous build: https://build.fhir.org/ig/HL7/fhir-qi-core/qdm-to-qicore.html
- DEQM overview: https://ecqi.healthit.gov/tool/deqm-ig

Important source caveat: the HL7 `build.fhir.org` QI-Core and DEQM pages are continuous builds, so they are useful for current mapping direction but should be pinned to published package versions in implementation and CI.

## High-Signal Conclusion

Medgnosis already has major one-way pieces:

- FHIR R4/US Core read mappers for Patient, Condition, Observation, MedicationRequest, Encounter.
- QI-Core export bundles for the HAPI clinical-reasoning sidecar.
- VSAC terminology storage and FHIR `ValueSet/$expand` / `$validate-code`.
- CQL engine client, CQL evaluator seam, measure reconciliation, persisted FHIR `MeasureReport`, DEQM Gaps-in-Care, QRDA Cat I/III support.
- Raw inbound FHIR staging and source resource crosswalk scaffolding.
- A Kimball `phm_star` model with patient, provider, measure, care-gap, observation, diagnosis, encounter, medication-order, and measure-result facts.

The missing bridge is a canonical QDM semantic spine. Today, the path mostly jumps:

`FHIR/EDW rows -> QI-Core resources -> CQL engine -> MeasureReport/care-gap facts`

What is needed:

`FHIR raw resources <-> QDM data elements <-> normalized EDW <-> dimensional facts <-> QI-Core/FHIR/DEQM/QRDA outputs`

That middle layer must preserve QDM datatype, code/value set, timing semantics, actors/entities, components, negation rationale, relatedTo, and source provenance. Without it, analytics cannot reliably answer which QDM data criteria and source evidence caused a patient to enter a denominator, numerator, exclusion, or care gap.

## QDM v5.6 Implementation Notes

### QDM Data Element Anatomy

QDM data elements are composed from:

- Category: broad clinical concept, such as Encounter, Laboratory Test, Medication, Diagnosis.
- Datatype: the context of use for that category, such as `Encounter, Performed`, `Laboratory Test, Performed`, `Medication, Order`.
- Code/value set/direct reference code: the code filter that defines the clinical concept.
- Attributes: datatype-specific metadata, such as result, relevantPeriod, author dateTime, performer, reason, relatedTo.
- Entities: actors such as Patient, Care Partner, Practitioner, Organization, and Location.

Implementation consequence: do not model QDM as only a terminology/value-set table. QDM must be an event/semantic model with typed attributes and relationships.

### QDM Categories

The PDF lists 22 categories:

- Adverse Event
- Allergy/Intolerance
- Assessment
- Care Experience
- Care Goal
- Communication
- Condition/Diagnosis/Problem
- Device
- Diagnostic Study
- Encounter
- Family History
- Immunization
- Individual Characteristics
- Intervention
- Laboratory Test
- Medication
- Participation
- Physical Exam
- Procedure
- Related Person
- Substance
- Symptom

Current Medgnosis coverage is strongest for Patient demographics, Condition/Diagnosis, Encounter, Laboratory/Observation, Medication Order, Procedure, Immunization, Allergy, Payer/Coverage, Measure, and Care Gap. Weak or absent coverage: Assessment, Care Goal, Communication, Intervention, Diagnostic Study, Device, Family History, Related Person, Substance, Symptom, and full performer/entity detail.

### Datatypes That Matter First

For the current analytics and eCQM pipeline, prioritize these QDM datatypes:

- `Patient Characteristic, Birthdate`
- `Patient Characteristic, Sex`
- `Patient Characteristic, Race`
- `Patient Characteristic, Ethnicity`
- `Patient Characteristic, Payer`
- `Diagnosis`
- `Encounter, Performed`
- `Laboratory Test, Performed`
- `Medication, Active`
- `Medication, Order`
- `Medication, Dispensed`
- `Medication, Administered`
- `Procedure, Performed`
- `Procedure, Order`
- `Immunization, Administered`
- `Assessment, Performed`
- `Intervention, Performed`
- `Care Goal`
- `Communication, Performed`
- `Allergy/Intolerance`
- `Symptom`

### Timing Semantics

QDM timing is not interchangeable across datatypes.

- `author dateTime`: when documentation was recorded.
- `relevant dateTime`: point-in-time clinical activity occurrence.
- `relevantPeriod`: interval for activities with start/stop semantics.
- `prevalencePeriod`: onset to abatement for Diagnosis, Allergy/Intolerance, Symptom.
- `participationPeriod`: coverage/program participation.
- `locationPeriod`: encounter facility-location arrival/departure interval.
- `result dateTime`: when a result report is available, separate from specimen/procedure timing.
- `statusDate`: when a care goal status took effect.

Implementation consequence: every QDM element row needs normalized start/end/point/author/result/status columns plus an explicit `timing_source` or `timing_kind`. If a source cannot supply the preferred timing, the bridge must record the fallback and confidence instead of silently substituting.

### Actors and Entities

QDM v5.5 introduced entities and QDM v5.6 keeps actor references central. Important actor attributes:

- `performer`
- `participant`
- `requester`
- `recorder`
- `sender`
- `recipient`
- `prescriber`
- `dispenser`

QDM v5.6 changes actor-related cardinality from 0..1 to 0..* for performer-type attributes. Implementation consequence: a single `provider_id` column is insufficient for canonical QDM. We need entity and element-actor bridge rows, not only scalar provider foreign keys.

### QDM 5.6 Changes With Direct Engineering Impact

- New `interpretation` attribute for `Laboratory Test, Performed`, `Diagnostic Study, Performed`, and `Assessment, Performed`.
- Existing `relatedTo` added to `Procedure, Performed`, `Medication, Order`, `Medication, Dispensed`, `Encounter, Performed`, `Intervention, Performed`, `Laboratory Test, Performed`, `Diagnostic Study, Performed`, and `Physical Exam, Performed`.
- `Device, Applied` retired.
- `Encounter, Performed` negation rationale retired.
- `Encounter, Performed` gets a `class` attribute.
- `Medication, Active` relevantPeriod end-time definition updated.
- `Medication, Dispensed`, `Medication, Order`, and `Substance, Order` relevantPeriod and cumulative medication duration text updated.
- `Participation` recorder retired.
- `Procedure, Performed` priority retired.
- `Location` entity added.
- Organization entity `type` renamed to `organizationType`; Location has `locationType`.
- Performer-type attributes are 0..*.

### Components

QDM components are required for:

- `Assessment, Performed`
- `Diagnostic Study, Performed`
- `Encounter, Performed` diagnoses
- `Laboratory Test, Performed`
- `Physical Exam, Performed`
- `Procedure, Performed`

Implementation consequence: use child rows or JSONB plus indexed projections for components. Do not flatten everything into one result field.

For labs and assessments, components can have:

- code
- result
- reference range low/high

For `Encounter, Performed`, diagnoses have:

- diagnosis code
- presentOnAdmissionIndicator code
- rank

The PDF explicitly says QDM 5.5/5.6 require the encounter diagnosis expression to request `D.code`, and rank=1 is how principal diagnosis is represented.

### Results and Interpretation

QDM result can be:

- present without value constraints
- numeric value
- ratio
- coded concept from a result value set
- dateTime
- percentage

Implementation consequence: one `value_numeric` and one `value_text` field cannot fully support QDM. The bridge should normalize result as a typed result:

- `result_type`: quantity, codeable_concept, ratio, string, boolean, date_time, percentage, present_only
- `result_quantity_value`, `result_quantity_unit`, `result_quantity_system`
- `result_code_system`, `result_code`, `result_display`
- `interpretation_code`
- `reference_range_low/high`
- `source_result_json`

### Value Sets and DRCs

QDM categories and datatypes are defined with value sets or direct reference codes. Code matching must be explicit. In current Medgnosis, VSAC support exists:

- `phm_edw.vsac_value_set`
- `phm_edw.vsac_value_set_code`
- `phm_edw.vsac_measure`
- `phm_edw.vsac_measure_value_set`
- `phm_edw.measure_value_set`
- `population_role` on `measure_value_set`

Live metadata observed on 2026-06-17:

- `phm_edw.vsac_value_set`: about 1,545 rows.
- `phm_edw.vsac_value_set_code`: about 225,261 rows.
- `phm_edw.measure_value_set`: about 1,015 rows.
- `phm_edw.measure_artifact`: 1 row.
- `phm_edw.measure_report`: initially 0 rows before QDM-backed CQL smoke persistence.
- `phm_edw.fhir_ingest_staging`: 1 row.
- `phm_edw.ehr_resource_crosswalk`: 0 rows.
- No `qdm_*` tables exist.

Implementation consequence: seed QDM catalog tables from QDM v5.6, then bind local measures/value sets to QDM datatypes and roles. Do not infer every population role by value-set name long-term; parse executable CQL/ELM data criteria where possible.

### Negation Rationale

QDM negation rationale is not "no record found." It is explicit evidence that a normally expected action did not happen for a valid reason. It always uses author dateTime for timing and must not use relevantPeriod.

Current Medgnosis has `negationToFhir(resourceType, reason)` for QI-Core shape, but the canonical EDW/QDM model does not have durable negation rows. A QDM element should support:

- `negated = true`
- `negation_reason_code/system/display`
- `expected_code_or_value_set`
- `author_datetime`
- source evidence/provenance

### relatedTo

`relatedTo` links one fully-defined QDM data element instance to another. It cannot point to just an attribute. In FHIR transition terms, it often aligns with `basedOn`.

Implementation consequence: use a relationship table:

- source QDM element id
- target QDM element id
- relationship type (`relatedTo`, `basedOn`, `partOf`, `derivedFrom`, `fulfills`, `replaces`)
- source FHIR reference, when present

This is critical for order-to-result, referral-to-consult, care-goal-to-diagnosis, and care-gap closure provenance.

### Cumulative Medication Duration

CMD differs for medication datatypes:

- `Medication, Order`: use daysSupplied * (1 + refills); derive daysSupplied from supply / dosage / frequency when missing.
- `Medication, Dispensed`: sum each dispensing event from relevant dateTime plus daysSupplied.
- `Medication, Administered`: a single administration can be point-in-time or interval; multiple administrations over a course are handled by CQL logic.

Implementation consequence: medication bridge needs days supplied, refills, supply, dosage, frequency, route, authored time, handed-over time, administration time, and confidence/data-quality markers. Current `phm_edw.medication_order` has dosage, frequency, route, start/end, status, refill_count but no explicit supply or daysSupplied. Add fields or a medication QDM attribute table.

## Current Medgnosis Implementation Notes

### Implemented FHIR/QI-Core Pieces

- `apps/api/src/services/fhir/profiles.ts`
  - US Core profile URLs.
  - QI-Core profile URLs.
  - Encounter class system and race/ethnicity maps.

- `apps/api/src/services/fhir/mappers.ts`
  - Patient, Condition, Observation, MedicationRequest, Encounter mappers.
  - US Core profiles.
  - Condition maps null status to active.
  - Observation maps laboratory category.
  - Encounter maps local `encounter_type` through `encounterCrosswalk`.

- `apps/api/src/services/fhir/qicoreExport.ts`
  - Adds QI-Core profiles.
  - Namespaces numeric EDW ids.
  - Emits transaction Bundle for HAPI sidecar.

- `apps/api/src/services/fhir/edwToQiCore.ts`
  - QI-Core negation helper.
  - VSAC membership helper.

- `apps/api/src/services/cqlMeasureEvaluator.ts`
  - Evaluates bound measures with the clinical-reasoning sidecar.
  - Persists MeasureReports through `measureReportStore`.
  - Does not auto-feed the engine because full observation export can be dangerous if unbounded.

- `apps/api/src/services/measureReportStore.ts`
  - Persists FHIR MeasureReport JSONB and aggregate counts.

- `apps/api/src/services/measureCalculatorV2.ts`
  - Current SQL/default evaluator aggregates `fact_patient_bundle_detail -> fact_measure_result + fact_measure_strata`.

- `apps/api/src/services/measureReconciliation.ts`
  - Compares SQL star-schema counts against CQL engine counts.

- `apps/api/src/routes/fhir/measureOps.ts`
  - Exposes persisted/live `$evaluate-measure`.
  - Exposes DEQM `$care-gaps` from `care_gap`.

- `apps/api/src/services/ehr/resourceStaging.ts`
  - Stages raw FHIR resources with content hashes, run IDs, resource type/id, source version, and patient reference.

### Current Dimensional Analytics Pieces

Core star facts and dimensions:

- `dim_patient`, `dim_provider`, `dim_organization`, `dim_measure`, `dim_condition`, `dim_procedure`, `dim_medication`, `dim_date`
- `fact_encounter`
- `fact_diagnosis`
- `fact_procedure`
- `fact_medication_order`
- `fact_observation`
- `fact_care_gap`
- `fact_measure_result`
- `fact_measure_strata`
- `fact_patient_bundle`
- `fact_patient_bundle_detail`
- `fact_patient_composite`
- `fact_provider_quality`
- `fact_population_snapshot`
- `fact_immunization`
- `fact_patient_insurance`
- `fact_sdoh`

Current issue: these facts do not record QDM datatype/attribute provenance. `fact_measure_result` has denominator/numerator/exclusion flags but no link to:

- QDM data criteria.
- source FHIR resources.
- staged source version/hash.
- local EDW row that satisfied the criterion.
- value-set expansion version used by the engine.
- CQL/ELM expression id.
- QI-Core resource id loaded into the engine.

### Current Live Metadata Cautions

On 2026-06-17, `pg_stat_user_tables` showed:

- `phm_star.fact_measure_result` has rows, but `dim_measure` stats appeared as 0. This may be stale stats or an artifact of the current local state. Any implementation should verify with targeted, indexed joins before assuming production cardinality.
- `phm_edw.measure_report` and `phm_edw.measure_report_evidence` were structurally present but initially empty before the QDM-backed CQL persistence smoke. After the bounded patient `9` persistence run, both had one CMS122 row.
- `phm_edw.ehr_resource_crosswalk` has no rows, so FHIR staging is not yet reconciled to local normalized rows.

Do not run broad table scans on `phm_edw.observation`; prior repo notes documented billion-row hazards. All exports and backfills must be bounded by patient list, resource type, date range, `active_ind = 'Y'`, partial-index predicates, and `statement_timeout`.

## Implementation Progress on 2026-06-17

Completed vertical slice:

- Added migration `068_qdm_bridge_foundation.sql` with:
  - `phm_edw.qdm_event`
  - `phm_edw.fhir_qdm_crosswalk`
  - `phm_edw.measure_report_evidence`
  - `phm_star.bridge_qdm_star_evidence`
  - `phm_star.fact_measure_result_evidence`
- Added canonical QDM TypeScript model and FHIR -> QDM normalizers for the first supported resource set:
  - Patient
  - Encounter
  - Condition / Diagnosis
  - Observation-derived Laboratory Test / Physical Exam / Assessment
  - MedicationRequest
  - MedicationAdministration
  - Procedure
  - Device
- Integrated staged FHIR replay into the QDM spine:
  - `POST /api/ehr/admin/tenants/:id/ingest-runs/:runId/qdm-normalization`
  - writes `qdm_event`
  - writes `fhir_qdm_crosswalk`
  - updates `ehr_resource_crosswalk`
  - marks staging rows normalized/skipped/failed
- Added QDM -> QI-Core projection for supported QDM datatypes with stable deterministic FHIR ids and QDM identifiers.
- Added QDM-backed CQL engine loading:
  - bounded `qdm_event` selection
  - optional matching Patient QDM inclusion scoped by tenant/org rather than primary ingest run, so unchanged Patient context can satisfy newly loaded event evidence
  - QI-Core transaction Bundle projection
  - dedupe by `ResourceType/id`
  - explicit engine POST through existing `loadBundle`
  - protected admin operation `POST /api/ehr/admin/tenants/:id/qdm/cql-load`
- Added bounded EDW -> QDM backfill:
  - explicit patient cohort input only
  - patient-first condition lookup
  - per-patient lateral encounter lookup over `idx_encounter_patient_datetime`
  - per-patient lateral observation lookup over `idx_observation_patient_datetime`
  - reuse existing EDW -> FHIR mappers before FHIR -> QDM normalization
  - writes idempotent `qdm_event` rows with `source_table/source_id`
- Added QDM/star evidence decoration for excluded patient bundle details through `bridge_qdm_star_evidence`.
- Added CQL MeasureReport evidence persistence into `measure_report_evidence`.
  - `apps/api/src/services/qdm/cqlEvidencePersistence.ts` evaluates population plus bounded individual subjects.
  - Persists aggregate FHIR `MeasureReport` rows through `measureReportStore`.
  - Persists patient-level CQL flags and compact QDM event summaries into `phm_edw.measure_report_evidence`.
- Added the CQL-to-star promotion contract:
  - `070_qdm_cql_measure_result_promotion.sql` adds `source`, `evaluation_scope`, `measure_report_id`, `measure_report_evidence_id`, `qdm_run_id`, reconciliation fields, and a partial non-SQL natural key to `fact_measure_result`.
  - `apps/api/src/services/qdm/measureReportToStar.ts` promotes persisted `measure_report_evidence` into scoped CQL shadow rows and populates `bridge_qdm_star_evidence` plus `fact_measure_result_evidence`.
  - Default reconciliation remains SQL-baseline authoritative by filtering `source='sql_bundle'`, `evaluation_scope='full_population'`, and `reconciliation_status='authoritative'`.
- Adjusted SQL measure refresh so SQL-source facts are replaced without deleting future CQL/QDM shadow rows.
- Added executable measure criteria extraction:
  - `071_measure_data_criteria.sql` creates `phm_edw.measure_data_criteria` as artifact-scoped definition metadata tied to `measure_artifact`, optional legacy `measure_definition`, VSAC value sets, QI-Core profiles, QDM category/datatype, and ELM/CQL paths.
  - `apps/api/src/services/qdm/measureCriteria.ts` parses packaged FHIR Measure/Library bundles.
  - The parser records FHIR `Library.dataRequirement` rows as `population_role='unclassified'` inventory because those rows do not prove denominator/numerator/exclusion membership by themselves.
  - The parser also decodes `application/elm+json` and traverses local ELM `ExpressionRef`, `FunctionRef`, `Retrieve`, `ValueSetRef`, and `CodeRef` nodes to create population-scoped criteria rows where the executable logic is local to the primary library.
  - The parser now builds a bundle-wide ELM library registry, resolves included-library aliases, and traverses external `ExpressionRef`/`FunctionRef` calls when the referenced Library is present in the artifact bundle.
  - `scripts/cql-qdm-smoke.sh` now exports the artifact-only bundle path, and `QDM_CQL_PERSIST_CRITERIA=true` can opt into criteria persistence from the same artifact bundle loaded into HAPI.
- Added reconciliation governance:
  - fixed the historical `_migrations` duplicate by removing the obsolete `029_solr_cdc_triggers` ledger row after confirming `029_solr_cdc_triggers.sql` existed with the on-disk checksum.
  - `072_measure_promotion_reconciliation_governance.sql` creates `phm_edw.measure_promotion_config` and `phm_edw.measure_reconciliation_run`.
  - `measure_promotion_config` defaults measures to `sql_only`, preserving SQL-authoritative dashboard behavior until explicit promotion.
  - `apps/api/src/services/measureReconciliation.ts` now resolves promotion config and can persist SQL/CQL counts, deltas, tolerance, status, promotion mode, and the FHIR MeasureReport.
  - `scripts/cql-qdm-smoke.sh` persists reconciliation runs when `QDM_CQL_RECONCILE=true` unless `QDM_CQL_PERSIST_RECONCILIATION=false`.
- Added guarded CQL-authoritative promotion controls:
  - `073_measure_promotion_audit_columns.sql` adds `measure_report_id`, `promoted_at`, `promoted_by`, and `promotion_metadata` to `phm_edw.measure_reconciliation_run`.
  - `apps/api/src/services/measureReconciliation.ts` now exposes admin-safe promotion config updates plus `promoteMeasureToCqlAuthoritative`.
  - Promotion is blocked unless the measure is already in `cql_shadow`/`cql_authoritative`, the latest configured artifact matches, the selected reconciliation run is `agree=true/status='agree'` within tolerance, the selected persisted population `MeasureReport` matches measure and period, and all patient-level evidence rows resolve star patient/measure/date dimensions.
  - The promotion path materializes full-population `qdm-cql` star rows in the same governance transaction, then marks those rows `reconciliation_status='authoritative'`, updates `measure_promotion_config.authoritative_source='qdm-cql'`, and stamps the accepted reconciliation run with promotion audit metadata.
  - `GET/PATCH /api/v1/admin/measure-promotion-configs` and `POST /api/v1/admin/measure-promotion-configs/:measureCode/promote-cql-authoritative` expose the controls behind the existing admin role gate.
  - Measure detail, measure summary, patient measure-cohort filters, and admin analytics overview now read from `measure_promotion_config.authoritative_source`, so promoted measures can switch analytics reads from SQL bundle rows to full-population `qdm-cql` rows without deleting SQL fallback rows.

Live validation notes:

- Applied migrations 068 through 071 locally after explicit approval to apply all pending migrations.
- Replayed one staged Patient resource into `qdm_event` successfully.
- Verified persisted JSONB columns are object/array JSON, not JSON strings:
  - `qdm_event.attributes`
  - `qdm_event.source_payload`
  - `fhir_qdm_crosswalk.metadata`
  - `ehr_resource_crosswalk.ehr_identifier`
- Built a QDM-derived QI-Core transaction Bundle from the persisted local `qdm_event`.
- Added and ran `scripts/cql-qdm-smoke.sh`:
  - started/reused HAPI clinical-reasoning at `http://localhost:18080/fhir`
  - loaded CMS122 executable artifacts only
  - loaded 1 QDM-derived QI-Core Patient resource from `phm_edw.qdm_event`
  - evaluated CMS122
  - reconciled SQL/CQL as denominator 0, numerator 0, exclusion 0
- The first CMS122 result was a path smoke only, not clinical parity: at that moment the local QDM spine contained a Patient event but not the condition, encounter, and HbA1c evidence required for a non-zero CMS122 result.
- Added EDW backfill to the QDM/CQL smoke and ran patient `9`:
  - backfilled 130 persisted QDM events:
    - 1 Patient
    - 105 Diagnosis
    - 16 Encounter, Performed
    - 8 Laboratory Test, Performed
  - loaded 129 QDM-derived QI-Core resources into HAPI with `ok=129`, `failed=0`
  - evaluated CMS122 as initial population 1, denominator 1, numerator 0, denominator exclusion 0
  - persisted the population MeasureReport and one patient-level `measure_report_evidence` row with 100 bounded QDM evidence summaries
  - verified local persistence counts: `measure_report=1`, `measure_report_evidence=1`, latest `qdm_evidence` array length `100`
  - SQL/CQL reconciliation intentionally showed drift: SQL denominator 0 vs CQL denominator 1. This proves the QDM-backed CQL path can find evidence that the current SQL/star measure-result table has not yet been populated with.
- Parsed and persisted the cached CMS122 artifact-only bundle with the new criteria parser:
  - measure id: `CMS122FHIRDiabetesAssessGreaterThan9Percent`
  - primary library id: `CMS122FHIRDiabetesAssessGreaterThan9Percent`
  - extracted 4 population expressions: initial population, denominator, denominator exclusion, numerator
  - produced 77 criteria rows:
    - 17 `fhir_library_data_requirement` rows
    - 60 `elm_retrieve_traversal` rows
  - role counts:
    - 17 `unclassified`
    - 15 `initial_population`
    - 15 `denominator`
    - 27 `denominator_exclusion`
    - 3 `numerator`
  - denominator-exclusion rows now include external-library criteria from `Hospice`, `AdvancedIllnessandFrailty`, and `PalliativeCare` when those libraries are present in the executable artifact bundle.
  - persistence verified live through `phm_edw.measure_data_criteria` with `measure_artifact_id=1`.
- Ran a live persisted reconciliation smoke for CMS122 and patient `9`:
  - loaded 129 QDM-derived QI-Core resources into HAPI
  - CQL result: initial population 1, denominator 1, numerator 0, denominator exclusion 0
  - SQL result: denominator 0, numerator 0, exclusion 0
  - persisted `phm_edw.measure_reconciliation_run.id = 1`
  - status `drift`, tolerance `0`, promotion mode `sql_only`, denominator delta `1`
  - stopped the temporary HAPI container after verification.
- Applied migration `073_measure_promotion_audit_columns.sql` locally and verified:
  - migration runner reports `Applied migrations: 72`, pending none
  - `measure_reconciliation_run` includes `measure_report_id`, `promoted_at`, `promoted_by`, and `promotion_metadata`
  - current CMS122 live promotion remains intentionally blocked because the latest persisted reconciliation run is still `status='drift'`.

## Implementation Progress on 2026-06-18

Completed reconciliation hardening and the CMS122/DM-02 SQL baseline name mismatch fix:

- Added `074_measure_reconciliation_scope.sql`:
  - `phm_edw.measure_reconciliation_run.evaluation_scope`
  - `scope_patient_ids`
  - `scope_patient_refs`
  - `promotion_eligible`
  - `cql_measure_report_id`
  - check constraint that prevents `scoped_subjects` runs from being promotion eligible.
- Added `075_measure_sql_baseline_alias.sql`:
  - creates `phm_edw.measure_sql_baseline_alias`
  - seeds `CMS122v12 <- DM-02` as `local_care_gap_surrogate`
  - documents that the alias is a SQL baseline projection only, not a complete CMS122 SQL evaluator.
- Updated `measureCalculatorV2.refreshMeasureResults()` so active SQL baseline aliases project source bundle-detail rows into the target measure's `fact_measure_result` rows.
- Added `076_measure_reconciliation_conservative_legacy_scope.sql` after discovering legacy reconciliation rows inherited `promotion_eligible=true` from the 074 default:
  - changes the database default for `promotion_eligible` to `false`
  - marks legacy rows without linked `cql_measure_report_id` and without `promoted_at` as not promotion eligible
  - records `metadata.promotionEligibilityReset = legacy_unlinked_measure_report`.
- Applied migrations 074, 075, and 076 locally and verified the migration dry run reports no pending migrations.
- Refreshed SQL measure facts through `measureCalculatorV2`:
  - rebuilt 27,223 `sql_bundle` rows
  - `CMS122v12`: 256 rows, denominator 256, numerator 58, exclusions 0
  - `DM-02`: 256 rows, denominator 256, numerator 58, exclusions 0
  - patient `9` is denominator-only for both CMS122v12 and DM-02.
- Ran a fresh scoped CMS122 smoke for patient `9` against a reset HAPI sidecar:
  - EDW backfill upserted 130 QDM events
  - loaded 129 QDM-derived QI-Core resources
  - CQL result: initial population 1, denominator 1, numerator 0, denominator exclusion 0
  - persisted `measure_report.id = 1`
  - persisted `measure_reconciliation_run.id = 2`
  - reconciliation status `agree`, deltas 0/0/0
  - `evaluation_scope = scoped_subjects`
  - `promotion_eligible = false`.
- Raised the QDM CQL loader event cap from 5,000 to 50,000 after discovering the full CMS122 SQL-baseline cohort has 26,313 QDM events. This preserves explicit cohort/period bounding while preventing silent full-population truncation for the current measure scale.
- Ran a fresh full-population CMS122 smoke against a reset HAPI sidecar using the 256-patient SQL denominator cohort:
  - EDW backfill upserted 26,313 QDM events.
  - Loaded 25,970 QDM-derived QI-Core resources.
  - Engine load result: total 25,970, created 25,970, ok 25,970, failed 0.
  - Persisted population `measure_report.id = 1`.
  - Persisted 256 patient-level evidence rows with 19,110 bounded QDM evidence summaries.
  - CQL result: initial population 17, denominator 17, numerator 0, denominator exclusion 0.
  - SQL baseline result: denominator 256, numerator 58, exclusion 0.
  - Persisted `measure_reconciliation_run.id = 3`, `evaluation_scope = full_population`, `status = drift`, deltas 239/58/0.
- Added `077_measure_reconciliation_promotion_eligibility_guard.sql`:
  - resets non-accepted or unlinked rows to `promotion_eligible = false`
  - adds `ck_mrr_promotion_eligible_requires_accepted_report`
  - enforces that promotion-eligible rows must be full-population, accepted, and linked to the CQL `MeasureReport`.
- Fixed unsafe JSONB parameter handling in the CQL-to-star materializer and guarded authoritative promotion path so `reconciliation_delta`, promotion config metadata, and promotion audit metadata are sent as JSONB objects rather than JSON strings.
- Fixed CQL evidence-ledger idempotency by including `qdm_event_id` in generated `population_criteria_id`; otherwise repeated supporting QDM events for the same patient/report collided on the report-evidence uniqueness constraint.
- Materialized the full-population CQL result into star as non-authoritative shadow rows:
  - `source = qdm-cql`
  - `evaluation_scope = full_population`
  - `reconciliation_status = cql_shadow`
  - 256 `fact_measure_result` rows
  - 19,110 `fact_measure_result_evidence` rows
  - 19,110 `bridge_qdm_star_evidence` rows.
- Updated `CMS122v12` promotion config to `promotion_mode = cql_shadow` while preserving `authoritative_source = sql_bundle`.

Important implementation note: full-population CQL is now loaded, persisted, reconciled, and materialized as shadow analytics, but it is not authoritative. The full-population reconciliation drift is clinically meaningful: the explicit `CMS122v12 <- DM-02` SQL alias is a care-gap surrogate baseline, not a complete CMS122 SQL evaluator. Current live state keeps SQL authoritative while allowing side-by-side QDM/CQL analysis.

## Semantic Drift Dossier Progress on 2026-06-18

Implemented the accepted best-practice handling for the CMS122/DM-02 semantic drift: do not hide the drift, do not weaken the published CQL, and do not treat a local care-gap surrogate as a standards-equivalent eCQM implementation.

- Added `078_measure_semantic_drift_dossier.sql`:
  - `phm_edw.measure_semantic_drift_dossier`
  - `phm_edw.measure_semantic_drift_patient`
  - additional `measure_sql_baseline_alias.metadata` policy fields for `CMS122v12 <- DM-02`
- Added `apps/api/src/services/measureSemanticDriftDossier.ts`:
  - selects a full-population reconciliation run and matching population MeasureReport
  - compares SQL-authoritative and QDM/CQL rows by EDW/star patient identity, not by `date_key_period`
  - classifies denominator drift using artifact-derived `measure_data_criteria`, QDM evidence, age band, diabetes evidence, qualifying encounter evidence, and exclusion evidence
  - classifies numerator drift as the local DM-02 closed/met semantic versus CMS122 poor-control/missing-assessment semantic
  - persists aggregate dossier metadata and patient-level drift rows without changing `fact_measure_result`
- Added admin route:
  - `POST /api/admin/measure-promotion-configs/:measureCode/semantic-drift-dossier`
  - audits dossier generation without recording raw FHIR subject reports in the audit details
- Added focused tests:
  - `apps/api/src/services/measureSemanticDriftDossier.test.ts`
  - route coverage in `apps/api/src/routes/admin/index.test.ts`

Live CMS122 dossier generated after migration:

- current dossier id: `2`
- reconciliation run id: `3`
- measure report id: `1`
- compared patients: `256`
- drift patients persisted: `242`
- SQL authoritative counts: denominator `256`, numerator `58`, exclusions `0`
- CQL shadow counts: denominator `17`, numerator `0`, exclusions `0`
- denominator classifications:
  - `outside_cms122_age_range`: `101`
  - `missing_cql_qualifying_encounter_or_initial_population`: `106`
  - `residual_cql_or_qicore_semantic_gap`: `27`
  - `aligned_denominator`: `17`
  - `denominator_exclusion_evidence_present_but_not_cql_flagged`: `4`
  - `missing_cql_diabetes_value_set_evidence`: `1`
- numerator classifications:
  - `neither_numerator`: `198`
  - `local_gap_closed_without_qdm_hba1c_or_gmi_evidence`: `38`
  - `local_gap_closed_with_controlled_hba1c_not_cms122_poor_control`: `20`
- evidence coverage:
  - patients with QDM evidence: `256`
  - patients with CMS122 age-band eligibility: `155`
  - patients with diabetes evidence: `255`
  - patients with qualifying encounter evidence: `61`
  - patients with HbA1c evidence: `96`
  - patients with HbA1c > 9: `0`
  - maximum HbA1c value in the dossier cohort: `7.6`

Interpretation:

- The denominator drift is mostly expected because DM-02 is a broad local care-gap surrogate and CMS122 has stricter age, diabetes, encounter, timing, and exclusion semantics.
- The numerator drift is semantic inversion/overload: local `gap_status = closed` means the care gap was satisfied, while CMS122 numerator means poor control or missing/not-performed HbA1c/GMI assessment.
- Current governance remains correct: `CMS122v12` stays `cql_shadow`, SQL remains authoritative for current dashboards, and CQL cannot be promoted until the standards path is validated and accepted.

Residual drift worklist added after dossier generation:

- Added read-only worklist service and admin route:
  - `GET /api/admin/measure-promotion-configs/:measureCode/semantic-drift-worklist`
  - filters: `dossierId`, `denominatorDrift`, `numeratorDrift`, `exclusionDrift`, `patientId`, `limit`, `offset`
  - audit action: `measure_semantic_drift_worklist_view`
- The worklist deliberately returns compact persisted drift rows, compact evidence summaries, subject MeasureReport population counts, and derived review buckets only. It does not return raw `qdm_evidence` or raw `fhir_subject_report` payloads.
- Live smoke against dossier `2` and `denominatorDrift = residual_cql_or_qicore_semantic_gap` returned `27` total residual rows and a paged response of `5`.
- All sampled residual rows had age, diabetes, and qualifying encounter evidence in the compact summary, while subject MeasureReport population counts remained `initial-population = 0`, `denominator = 0`, `numerator = 0`, and `denominator-exclusion = 0`.
- Derived review buckets now classify local gap state, HbA1c evidence/control state, QDM evidence volume, denominator prerequisites, and subject population zero/non-zero status.
- Added audited raw-evidence drilldown:
  - `GET /api/admin/measure-promotion-configs/:measureCode/semantic-drift-worklist/:dossierPatientId`
  - audit action: `measure_semantic_drift_detail_view`
  - returns raw `qdm_evidence` and raw `fhir_subject_report` only for one persisted dossier patient row.
  - audit metadata records row/evidence ids and counts, not the raw QDM/FHIR payload.
- Evidence joins are source-aware and deterministic: drift generation filters evidence to the selected MeasureReport source, while worklist/detail views prefer evidence from that source and then order by newest evidence row. This prevents mixed-source semantic drift or nondeterministic raw evidence drilldowns when future evidence sources coexist.
- Live detail smoke for the first residual row returned dossier patient row `243`, patient `3`, MeasureReport evidence row `95`, `58` QDM evidence items, and a subject MeasureReport with all CQL subject populations at zero.
- Added an admin-only Measure Governance tab under `/admin`, not the public `/measures` page. It uses `ADMIN_TABS`, `AdminPage`, the shared `api` wrapper, and TanStack query keys like `['admin', 'measure-governance', ...]`.
- The tab lists promotion configs, filters the semantic drift worklist, and loads raw QDM/FHIR detail only after a row is selected.
- Added QDM bridge operations closure:
  - migration `079_qdm_bridge_operations.sql`
  - `phm_edw.qdm_bridge_run`
  - `phm_edw.qdm_bridge_issue`
  - `phm_edw.v_qdm_bridge_operational_status`
  - `phm_star.v_measure_evidence_lineage`
  - admin routes: `/api/admin/qdm-bridge/status`, `/api/admin/qdm-bridge/runs`, `/api/admin/qdm-bridge/issues`
  - `npm run qdm:shadow-refresh`, which wraps the existing CQL smoke harness with a PHI-safe run ledger and forces `QDM_CQL_PROMOTION_ELIGIBLE=false`
  - Bridge Ops panel in the Measure Governance admin tab
  - runbook: `docs/superpowers/runbooks/qdm-bridge-operations.md`
- Applied migration `079_qdm_bridge_operations.sql` locally. Follow-up dry run reports `Applied migrations: 78` and `Pending migrations: none`.
- Live ledger smoke created and completed a `manual_review` run for `CMS122v12`, proving the run table and status view are usable without invoking the CQL engine.

Completion boundary: this engineering phase is complete when the FHIR/QDM bridge is auditable, replayable, source-aware, and visible in governance surfaces. It does not include changing `CMS122v12` to CQL-authoritative because the current SQL baseline is a governed DM-02 surrogate and the semantic drift dossier shows clinically meaningful differences.

## Bidirectional Definition for This Work

Bidirectional integration means all of the following are true:

1. Inbound FHIR resources can be normalized into QDM data elements, EDW rows, and star facts without losing source identity.
2. Existing EDW rows can be projected back into QDM elements and QI-Core/FHIR resources with stable ids and QDM semantics.
3. Analytics facts can trace back to QDM criteria and source evidence.
4. Measure/CQL outputs can update star facts and also produce FHIR MeasureReport, DEQM Gaps-in-Care, and QRDA outputs.
5. Manual or analytics-side care-gap closure can emit standards-shaped FHIR evidence or at least a deterministic QDM/FHIR task/order/result relationship.
6. Every transformation is replayable, idempotent, versioned, and auditable by source run, FHIR resource version/hash, value-set expansion version, QDM spec version, QI-Core profile version, and measure artifact version.

## TODO Backlog

### Data Model TODO

- [ ] Add QDM catalog tables for versioned categories, datatypes, attributes, allowed timing types, allowed actor roles, and retired/deprecated attributes.
- [ ] Add `phm_edw.qdm_data_element` as canonical row-level semantic evidence.
- [ ] Add `phm_edw.qdm_data_element_attribute` for typed QDM attributes.
- [ ] Add `phm_edw.qdm_data_element_component` for lab/assessment/procedure components and encounter diagnoses.
- [ ] Add `phm_edw.qdm_entity` and `phm_edw.qdm_element_actor`.
- [ ] Add `phm_edw.qdm_data_element_relation` for `relatedTo`, `basedOn`, `partOf`, `derivedFrom`, `fulfills`.
- [ ] Add `phm_edw.qdm_data_element_source` linking QDM elements to `fhir_ingest_staging`, `ehr_resource_crosswalk`, EDW local table/id, and content hash.
- [x] Add `phm_edw.measure_data_criteria` or equivalent, binding measure artifacts/CQL data criteria to QDM datatypes/value sets/population roles.
- [x] Add `phm_edw.measure_sql_baseline_alias` for explicit local SQL baseline aliases such as `CMS122v12 <- DM-02`.
- [x] Add semantic drift dossier tables for surrogate-vs-standards measure comparison.
- [ ] Add star dimensions/bridges for QDM provenance: `dim_qdm_datatype`, `dim_qdm_value_set`, `bridge_measure_qdm_criteria`, `fact_qdm_evidence`, `bridge_fact_measure_evidence`.
- [x] Add PHI-safe operational run/issue tables and evidence lineage/status views for QDM bridge monitoring.
- [x] Add columns or bridge tables so `fact_measure_result` can distinguish `source = sql|cql|manual|import`, `qdm_run_id`, `measure_report_id`, and `reconciliation_status`.
- [x] Add reconciliation scope provenance so scoped sidecar runs cannot be promoted as full-population authority.

### Normalization TODO

- [ ] Implement `fhirToQdm` normalizers for Patient, Encounter, Condition, Observation, DiagnosticReport, MedicationRequest, MedicationStatement, MedicationAdministration, MedicationDispense, Procedure, Immunization, AllergyIntolerance, ServiceRequest, Communication, CarePlan, Goal, Coverage, Practitioner, Organization, Location, RelatedPerson.
- [ ] Implement QDM result normalization with typed values and coded interpretation.
- [ ] Implement QDM timing extraction and fallback recording.
- [ ] Implement QDM actor/entity extraction from performer, requester, recorder, asserter, participant, author, sender, recipient, prescriber, dispenser.
- [ ] Implement FHIR `basedOn`, `partOf`, `derivedFrom`, `encounter`, `reasonCode`, `reasonReference` to QDM `relatedTo` / relationship rows.
- [x] Implement source crosswalk updates when staged resources normalize successfully.
- [ ] Implement replay behavior for changed resource hashes/version ids.
- [x] Implement first bounded EDW -> QDM backfill for Patient, Diagnosis, Encounter, and Laboratory Test evidence.

### Analytics TODO

- [ ] Update star ETL to consume QDM elements as the semantic input, not only EDW source tables.
- [ ] Populate `fact_observation`, `fact_diagnosis`, `fact_encounter`, `fact_medication_order`, `fact_procedure`, `fact_immunization`, `fact_patient_insurance`, `fact_care_gap` with QDM/source provenance.
- [x] Populate scoped shadow `fact_measure_result` rows from bounded individual CQL `MeasureReport` evidence.
- [x] Populate full-population CQL shadow `fact_measure_result` rows for CMS122 without changing authoritative analytics.
- [ ] Promote full-population `fact_measure_result` rows from CQL subject-list/individual `MeasureReport` data when reconciliation accepts the measure.
- [x] Keep the existing SQL care-gap rollup as a fallback, but mark its source and reconciliation status.
- [x] Project DM-02 SQL care-gap baseline rows into CMS122v12 through an explicit governed alias for SQL/CQL reconciliation.
- [x] Persist reconciliation deltas between SQL star facts and CQL engine reports.
- [x] Persist CMS122/DM-02 semantic drift dossier summaries and patient-level drift classifications.
- [x] Add guarded admin/service controls and reader-side source switching for accepted CQL-authoritative promotion.
- [ ] Add materialized views for measure evidence, source lineage, and QDM coverage gaps.
- [x] Add read-only evidence lineage view from `fact_measure_result` to persisted CQL/QDM MeasureReport evidence.

### Outbound TODO

- [ ] Refactor QI-Core export to use QDM elements as its input.
- [x] Preserve QDM ids in FHIR identifiers/extensions where appropriate for traceability.
- [ ] Generate DEQM Gaps-in-Care from QDM/star evidence, not only direct `care_gap` rows.
- [ ] Complete QRDA Cat I patient data section with real QDM data elements.
- [ ] Expose `$evaluate-measure` and dossier outputs with evidence/source links.

### Validation TODO

- [ ] Golden FHIR fixture -> QDM element tests for each supported resource.
- [x] QDM element -> QI-Core resource tests for the first supported datatype set.
- [ ] Round-trip tests: FHIR -> QDM -> FHIR preserves identity and clinically important fields.
- [x] QDM -> star tests for bounded CQL shadow result and evidence provenance.
- [ ] CQL engine tests with CMS122 and at least one measure involving medication duration, encounter diagnosis, and negation.
- [ ] HL7 validator gates for US Core/QI-Core, DEQM, and QRDA/CVU+.
- [ ] Performance tests that prove observation exports use bounded indexed paths and statement timeouts.

### Operational TODO

- [x] Add run ledger for QDM normalization and star bridge refresh.
- [x] Add data-quality issue tables for unmapped codes, missing timing, missing actor, invalid units, ambiguous components, and unsupported QDM datatypes.
- [x] Add admin/dossier surfaces for semantic drift worklists.
- [x] Add audited raw-evidence detail endpoint for one semantic drift row.
- [x] Add admin Measure Governance tab for promotion config, semantic drift worklist, and audited detail drilldown.
- [x] Add admin/dossier surfaces for broader data-quality and evidence lineage.
- [x] Add feature flags/config for measure-by-measure promotion from SQL to CQL/QDM.
- [x] Add admin controls for promotion config, dry-run validation, and accepted CQL-authoritative promotion.
- [x] Add admin control for generating audited semantic drift dossiers.
- [x] Define rollback/replay procedures for bad mappings or value-set expansion drift.
