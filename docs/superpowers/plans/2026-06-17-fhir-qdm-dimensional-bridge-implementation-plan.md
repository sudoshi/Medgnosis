# FHIR to QDM Dimensional Bridge Implementation Plan

Date: 2026-06-17

Companion notes: `docs/superpowers/notes/2026-06-17-qdm-v56-fhir-qdm-dimensional-bridge-notes-and-todo.md`

## Goal

Make Medgnosis a standards-traceable quality analytics platform by inserting a canonical QDM v5.6 semantic layer between FHIR ingestion, EDW normalization, QI-Core/CQL evaluation, and the `phm_star` dimensional model.

The finished bridge must be bidirectional:

- Inbound FHIR resources normalize into durable QDM elements, EDW rows, and star facts.
- Existing EDW/star evidence can be re-projected into QDM-aware QI-Core/FHIR/DEQM/QRDA outputs.
- Every measure denominator, numerator, exclusion, care gap, and closure can trace to QDM criteria and source FHIR/EDW evidence.
- SQL analytics and CQL engine results reconcile through the same QDM evidence spine.

## Research Basis

Primary local source:

- `QDM-v5.6-508.pdf`, January 2021, 101 pages.

Official standards sources used:

- QDM current version page: https://ecqi.healthit.gov/qdm/versions
- QDM overview and entities: https://ecqi.healthit.gov/qdm/about
- Official QDM v5.6 PDF: https://ecqi.healthit.gov/sites/default/files/QDM-v5.6-508.pdf
- QI-Core overview: https://ecqi.healthit.gov/qi-core/about
- QDM v5.6 to QI-Core mapping, HL7 continuous build: https://build.fhir.org/ig/HL7/fhir-qi-core/qdm-to-qicore.html
- DEQM overview: https://ecqi.healthit.gov/tool/deqm-ig

Existing Medgnosis references inspected:

- `docs/edw-to-qicore-projection.md`
- `docs/superpowers/plans/2026-06-13-phase-0-standards-foundation.md`
- `docs/superpowers/plans/2026-06-13-phase-1-cql-engine.md`
- `docs/superpowers/plans/2026-06-13-phase-2-fhir-dqm.md`
- `docs/superpowers/plans/2026-06-16-ehr-integration-implementation-plan.md`
- `docs/superpowers/devlogs/2026-06-17-ehr-integration-current-state-devlog.md`
- `apps/api/src/services/fhir/*`
- `apps/api/src/services/cqlMeasureEvaluator.ts`
- `apps/api/src/services/measureCalculatorV2.ts`
- `apps/api/src/services/measureReportStore.ts`
- `apps/api/src/services/measureReconciliation.ts`
- `apps/api/src/services/ehr/resourceStaging.ts`
- `packages/db/migrations/001`, `002`, `013`, `024`, `050`, `052`, `056`, `057`, `061`, `063`

## Current State Summary

Medgnosis has the standards perimeter:

- FHIR read routes and mappers.
- US Core and QI-Core profile constants.
- QI-Core transaction export for clinical-reasoning sidecar loading.
- VSAC value-set tables and terminology operations.
- HAPI clinical-reasoning sidecar integration.
- CQL evaluator seam.
- MeasureReport persistence table and service.
- DEQM Gaps-in-Care builder and route.
- QRDA Cat I serializer skeleton.
- Raw inbound FHIR staging and source resource crosswalk tables.
- Dimensional facts for population health and measure analytics.

But Medgnosis does not yet have a canonical QDM semantic model. The analytics model knows about patients, measures, gaps, and facts, but not which QDM datatype/attribute/timing/entity/value-set semantics generated each fact. The FHIR/QI-Core export path mostly bypasses a durable QDM representation.

## Target Architecture

### Data Flow

Inbound:

1. EHR FHIR resource arrives through SMART launch, backend services, Bulk Data, or manual import.
2. Raw resource is staged in `phm_edw.fhir_ingest_staging`.
3. A normalizer maps the staged FHIR resource to one or more QDM data elements.
4. QDM elements upsert canonical EDW rows and source crosswalks.
5. Star ETL projects QDM elements into dimensions/facts.
6. Measure evaluation consumes QDM-derived QI-Core export and/or QDM-derived SQL facts.
7. MeasureReport, care gaps, and reconciliation deltas persist back with QDM/source lineage.

Outbound:

1. Analytics request, care-gap exchange, QRDA, DEQM, or CQL engine load asks for patient/measure evidence.
2. Query starts from star facts and QDM evidence bridges.
3. QDM elements project into QI-Core/FHIR, DEQM, QRDA, or dossier evidence.
4. Output includes stable source identifiers and provenance where allowed by the target format.

### Core Principle

FHIR is the interoperability envelope. QDM is the quality-measure semantic contract. `phm_edw` is normalized operational storage. `phm_star` is analytics storage. QI-Core is the CQL execution projection. DEQM/QRDA are reporting outputs.

Do not let any one layer replace the others.

## Proposed Schema Changes

Use migration numbers after the current EHR tranche. If migrations 068/069 already exist when implementation begins, increment accordingly.

### Migration 068 - QDM Catalog

Create `phm_edw.qdm_category`:

- `id BIGSERIAL PRIMARY KEY`
- `qdm_version VARCHAR(20) NOT NULL DEFAULT '5.6'`
- `category_code VARCHAR(120) NOT NULL`
- `display_name VARCHAR(200) NOT NULL`
- `description TEXT`
- `active_ind CHAR(1) NOT NULL DEFAULT 'Y'`
- unique `(qdm_version, category_code)`

Create `phm_edw.qdm_datatype`:

- `id BIGSERIAL PRIMARY KEY`
- `qdm_version VARCHAR(20) NOT NULL DEFAULT '5.6'`
- `category_id BIGINT NOT NULL REFERENCES qdm_category(id)`
- `datatype_code VARCHAR(160) NOT NULL`
- `display_name VARCHAR(240) NOT NULL`
- `context VARCHAR(80)`
- `is_retired BOOLEAN NOT NULL DEFAULT false`
- `retired_reason TEXT`
- unique `(qdm_version, datatype_code)`

Create `phm_edw.qdm_attribute_def`:

- `id BIGSERIAL PRIMARY KEY`
- `qdm_version VARCHAR(20) NOT NULL DEFAULT '5.6'`
- `attribute_code VARCHAR(160) NOT NULL`
- `display_name VARCHAR(240) NOT NULL`
- `value_type VARCHAR(60) NOT NULL`
- `description TEXT`
- unique `(qdm_version, attribute_code)`

Create `phm_edw.qdm_datatype_attribute`:

- `datatype_id BIGINT REFERENCES qdm_datatype(id)`
- `attribute_id BIGINT REFERENCES qdm_attribute_def(id)`
- `cardinality_min SMALLINT NOT NULL DEFAULT 0`
- `cardinality_max VARCHAR(12) NOT NULL DEFAULT '1'`
- `required_for_bridge BOOLEAN NOT NULL DEFAULT false`
- `timing_kind VARCHAR(60)`
- primary key `(datatype_id, attribute_id)`

Create `phm_edw.qdm_actor_role`:

- `role_code VARCHAR(80) PRIMARY KEY`
- `description TEXT`

Seed roles: participant, performer, requester, recorder, sender, recipient, prescriber, dispenser.

Create `phm_edw.qdm_datatype_actor_role`:

- `datatype_id BIGINT REFERENCES qdm_datatype(id)`
- `role_code VARCHAR(80) REFERENCES qdm_actor_role(role_code)`
- `cardinality_min SMALLINT NOT NULL DEFAULT 0`
- `cardinality_max VARCHAR(12) NOT NULL DEFAULT '*'`
- primary key `(datatype_id, role_code)`

Create `phm_edw.qdm_value_set_binding`:

- `id BIGSERIAL PRIMARY KEY`
- `datatype_id BIGINT REFERENCES qdm_datatype(id)`
- `value_set_oid VARCHAR(120) REFERENCES phm_edw.vsac_value_set(value_set_oid)`
- `direct_reference_code_system VARCHAR(120)`
- `direct_reference_code VARCHAR(120)`
- `binding_role VARCHAR(60)`
- `source VARCHAR(60) NOT NULL DEFAULT 'vsac'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Purpose: this catalog is the versioned source of truth for valid QDM datatypes, attributes, timing rules, actor roles, and value-set bindings.

### Migration 069 - QDM Data Elements and Provenance

Create `phm_edw.qdm_normalization_run`:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `org_id INTEGER`
- `ehr_tenant_id BIGINT`
- `ingest_run_id UUID`
- `mode VARCHAR(40) NOT NULL`
- `status VARCHAR(40) NOT NULL DEFAULT 'running'`
- `started_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `finished_at TIMESTAMPTZ`
- `resources_seen INTEGER NOT NULL DEFAULT 0`
- `elements_upserted INTEGER NOT NULL DEFAULT 0`
- `errors JSONB NOT NULL DEFAULT '[]'::jsonb`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`

Create `phm_edw.qdm_data_element`:

- `id BIGSERIAL PRIMARY KEY`
- `qdm_normalization_run_id UUID REFERENCES qdm_normalization_run(id)`
- `qdm_version VARCHAR(20) NOT NULL DEFAULT '5.6'`
- `datatype_id BIGINT NOT NULL REFERENCES qdm_datatype(id)`
- `patient_id INTEGER REFERENCES phm_edw.patient(patient_id)`
- `encounter_id INTEGER REFERENCES phm_edw.encounter(encounter_id)`
- `local_table VARCHAR(120)`
- `local_id BIGINT`
- `code_system VARCHAR(160)`
- `code VARCHAR(120)`
- `display TEXT`
- `value_set_oid VARCHAR(120)`
- `negated BOOLEAN NOT NULL DEFAULT false`
- `negation_reason_system VARCHAR(160)`
- `negation_reason_code VARCHAR(120)`
- `negation_reason_display TEXT`
- `author_datetime TIMESTAMPTZ`
- `relevant_datetime TIMESTAMPTZ`
- `relevant_start_datetime TIMESTAMPTZ`
- `relevant_end_datetime TIMESTAMPTZ`
- `prevalence_start_datetime TIMESTAMPTZ`
- `prevalence_end_datetime TIMESTAMPTZ`
- `result_datetime TIMESTAMPTZ`
- `status_date DATE`
- `timing_kind VARCHAR(60)`
- `status VARCHAR(80)`
- `confidence VARCHAR(40) NOT NULL DEFAULT 'mapped'`
- `source_hash VARCHAR(128)`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:

- `(patient_id, datatype_id)`
- `(patient_id, code_system, code)`
- `(value_set_oid)`
- `(local_table, local_id)`
- GIST or btree indexes on relevant period fields if range queries are added.

Create `phm_edw.qdm_data_element_attribute`:

- `id BIGSERIAL PRIMARY KEY`
- `qdm_data_element_id BIGINT REFERENCES qdm_data_element(id) ON DELETE CASCADE`
- `attribute_id BIGINT REFERENCES qdm_attribute_def(id)`
- `value_type VARCHAR(60) NOT NULL`
- `value_code_system VARCHAR(160)`
- `value_code VARCHAR(120)`
- `value_display TEXT`
- `value_numeric NUMERIC`
- `value_text TEXT`
- `value_boolean BOOLEAN`
- `value_datetime TIMESTAMPTZ`
- `value_json JSONB`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Create `phm_edw.qdm_data_element_component`:

- `id BIGSERIAL PRIMARY KEY`
- `qdm_data_element_id BIGINT REFERENCES qdm_data_element(id) ON DELETE CASCADE`
- `component_kind VARCHAR(80) NOT NULL`
- `code_system VARCHAR(160)`
- `code VARCHAR(120)`
- `display TEXT`
- `result_type VARCHAR(60)`
- `result_code_system VARCHAR(160)`
- `result_code VARCHAR(120)`
- `result_display TEXT`
- `result_numeric NUMERIC`
- `result_unit VARCHAR(80)`
- `result_text TEXT`
- `result_datetime TIMESTAMPTZ`
- `reference_range_low NUMERIC`
- `reference_range_high NUMERIC`
- `present_on_admission_system VARCHAR(160)`
- `present_on_admission_code VARCHAR(120)`
- `rank INTEGER`
- `location_start TIMESTAMPTZ`
- `location_end TIMESTAMPTZ`
- `source_json JSONB`

Create `phm_edw.qdm_entity`:

- `id BIGSERIAL PRIMARY KEY`
- `entity_type VARCHAR(60) NOT NULL`
- `patient_id INTEGER`
- `provider_id INTEGER`
- `org_id INTEGER`
- `location_id BIGINT`
- `identifier JSONB NOT NULL DEFAULT '[]'::jsonb`
- `display TEXT`
- `source_json JSONB`

Create `phm_edw.qdm_element_actor`:

- `qdm_data_element_id BIGINT REFERENCES qdm_data_element(id) ON DELETE CASCADE`
- `role_code VARCHAR(80) REFERENCES qdm_actor_role(role_code)`
- `qdm_entity_id BIGINT REFERENCES qdm_entity(id)`
- primary key `(qdm_data_element_id, role_code, qdm_entity_id)`

Create `phm_edw.qdm_data_element_relation`:

- `id BIGSERIAL PRIMARY KEY`
- `source_qdm_data_element_id BIGINT REFERENCES qdm_data_element(id) ON DELETE CASCADE`
- `target_qdm_data_element_id BIGINT REFERENCES qdm_data_element(id)`
- `relation_type VARCHAR(80) NOT NULL`
- `source_fhir_reference TEXT`
- `confidence VARCHAR(40) NOT NULL DEFAULT 'mapped'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Create `phm_edw.qdm_data_element_source`:

- `id BIGSERIAL PRIMARY KEY`
- `qdm_data_element_id BIGINT REFERENCES qdm_data_element(id) ON DELETE CASCADE`
- `fhir_ingest_staging_id BIGINT REFERENCES phm_edw.fhir_ingest_staging(id)`
- `ehr_resource_crosswalk_id BIGINT REFERENCES phm_edw.ehr_resource_crosswalk(id)`
- `source_resource_type VARCHAR(80)`
- `source_resource_id VARCHAR(300)`
- `source_version_id VARCHAR(200)`
- `source_last_updated TIMESTAMPTZ`
- `content_hash VARCHAR(128)`
- `local_table VARCHAR(120)`
- `local_id BIGINT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Migration 070 - Measure Criteria and QDM Evidence Bridges

Create `phm_edw.measure_data_criteria`:

- `id BIGSERIAL PRIMARY KEY`
- `measure_artifact_id BIGINT REFERENCES phm_edw.measure_artifact(id)`
- `measure_code VARCHAR(120) NOT NULL`
- `criteria_id VARCHAR(240) NOT NULL`
- `criteria_name TEXT`
- `population_role VARCHAR(60)`
- `datatype_id BIGINT REFERENCES phm_edw.qdm_datatype(id)`
- `value_set_oid VARCHAR(120)`
- `direct_reference_code_system VARCHAR(160)`
- `direct_reference_code VARCHAR(120)`
- `elm_path TEXT`
- `cql_expression TEXT`
- `required_profile VARCHAR(500)`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- unique `(measure_artifact_id, criteria_id)`

Create `phm_edw.measure_evidence`:

- `id BIGSERIAL PRIMARY KEY`
- `measure_artifact_id BIGINT REFERENCES phm_edw.measure_artifact(id)`
- `measure_report_id BIGINT REFERENCES phm_edw.measure_report(id)`
- `measure_data_criteria_id BIGINT REFERENCES phm_edw.measure_data_criteria(id)`
- `qdm_data_element_id BIGINT REFERENCES phm_edw.qdm_data_element(id)`
- `patient_id INTEGER`
- `population_role VARCHAR(60)`
- `matched BOOLEAN NOT NULL DEFAULT true`
- `engine_resource_reference TEXT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Purpose: this is the EDW-side evidence ledger that allows a measure result to explain which QDM elements satisfied which CQL/measure criteria.

### Migration 071 - Star QDM Bridge

Create `phm_star.dim_qdm_datatype`:

- `qdm_datatype_key SERIAL PRIMARY KEY`
- `qdm_datatype_id BIGINT NOT NULL`
- `qdm_version VARCHAR(20) NOT NULL`
- `category_code VARCHAR(120) NOT NULL`
- `datatype_code VARCHAR(160) NOT NULL`
- `display_name VARCHAR(240) NOT NULL`

Create `phm_star.dim_qdm_value_set`:

- `qdm_value_set_key SERIAL PRIMARY KEY`
- `value_set_oid VARCHAR(120) NOT NULL`
- `name VARCHAR(500)`
- `qdm_category VARCHAR(120)`
- `expansion_version VARCHAR(120)`

Create `phm_star.fact_qdm_evidence`:

- `qdm_evidence_key BIGSERIAL PRIMARY KEY`
- `qdm_data_element_id BIGINT NOT NULL`
- `patient_key INT REFERENCES phm_star.dim_patient(patient_key)`
- `encounter_key BIGINT REFERENCES phm_star.fact_encounter(encounter_key)`
- `provider_key INT REFERENCES phm_star.dim_provider(provider_key)`
- `org_key INT REFERENCES phm_star.dim_organization(org_key)`
- `qdm_datatype_key INT REFERENCES phm_star.dim_qdm_datatype(qdm_datatype_key)`
- `qdm_value_set_key INT REFERENCES phm_star.dim_qdm_value_set(qdm_value_set_key)`
- `date_key_event INT REFERENCES phm_star.dim_date(date_key)`
- `date_key_start INT REFERENCES phm_star.dim_date(date_key)`
- `date_key_end INT REFERENCES phm_star.dim_date(date_key)`
- `negated BOOLEAN NOT NULL DEFAULT false`
- `has_result BOOLEAN NOT NULL DEFAULT false`
- `result_numeric NUMERIC`
- `result_text TEXT`
- `source_resource_type VARCHAR(80)`
- `source_system VARCHAR(80)`
- `confidence VARCHAR(40)`
- `count_evidence INT NOT NULL DEFAULT 1`
- `etl_refreshed_at TIMESTAMP NOT NULL DEFAULT now()`

Create `phm_star.bridge_measure_qdm_criteria`:

- `bridge_key BIGSERIAL PRIMARY KEY`
- `measure_key INT REFERENCES phm_star.dim_measure(measure_key)`
- `measure_data_criteria_id BIGINT NOT NULL`
- `qdm_datatype_key INT REFERENCES phm_star.dim_qdm_datatype(qdm_datatype_key)`
- `qdm_value_set_key INT REFERENCES phm_star.dim_qdm_value_set(qdm_value_set_key)`
- `population_role VARCHAR(60)`
- `criteria_name TEXT`

Create `phm_star.bridge_fact_measure_evidence`:

- `measure_result_key BIGINT REFERENCES phm_star.fact_measure_result(measure_result_key) ON DELETE CASCADE`
- `qdm_evidence_key BIGINT REFERENCES phm_star.fact_qdm_evidence(qdm_evidence_key)`
- `population_role VARCHAR(60)`
- `matched BOOLEAN NOT NULL DEFAULT true`
- primary key `(measure_result_key, qdm_evidence_key, population_role)`

Alter `phm_star.fact_measure_result`:

- add `source VARCHAR(30) NOT NULL DEFAULT 'sql_bundle'`
- add `evaluation_scope VARCHAR(40) NOT NULL DEFAULT 'full_population'`
- add `measure_report_id BIGINT`
- add `measure_report_evidence_id BIGINT`
- add `qdm_run_id UUID`
- add `reconciliation_status VARCHAR(40) NOT NULL DEFAULT 'authoritative'`
- add `reconciliation_delta JSONB`

## Service Architecture

Create these modules:

- `apps/api/src/services/qdm/catalog.ts`
  - Reads QDM catalog, datatype attributes, actor roles, and value-set bindings.

- `apps/api/src/services/qdm/types.ts`
  - Shared TypeScript interfaces for QDM elements, attributes, components, actors, relations, source links.

- `apps/api/src/services/qdm/fhirToQdm.ts`
  - Pure resource normalizers.
  - Input: FHIR resource + source context.
  - Output: QDM element drafts.

- `apps/api/src/services/qdm/qdmStore.ts`
  - Idempotent persistence for QDM element drafts.
  - Maintains source links and actor/entity rows.

- `apps/api/src/services/qdm/normalizationRunner.ts`
  - Pulls staged resources by run/status.
  - Normalizes, persists, marks staging rows normalized/failed.

- `apps/api/src/services/qdm/qdmToEdw.ts`
  - Upserts QDM elements into existing EDW operational tables where needed.
  - Updates `ehr_resource_crosswalk.local_table/local_id`.

- `apps/api/src/services/qdm/qdmToStar.ts`
  - Populates star QDM dimensions and `fact_qdm_evidence`.
  - Adds bridges from clinical facts to QDM evidence.

- `apps/api/src/services/qdm/qdmToQiCore.ts`
  - Projects QDM elements to QI-Core resources.
  - Replaces direct EDW-row assumptions in `qicoreExport.ts` over time.

- `apps/api/src/services/qdm/measureCriteria.ts`
  - Ingests measure artifacts/ELM data requirements into `measure_data_criteria`.
  - Binds CQL data criteria to QDM datatypes and value sets.

- `apps/api/src/services/qdm/measureReportToStar.ts`
  - Converts individual/subject-list MeasureReport results to patient-level `fact_measure_result`.
  - Writes `measure_evidence` and `bridge_fact_measure_evidence`.

- `apps/api/src/services/qdm/lineage.ts`
  - Query helper for dossier and admin UI: measure -> population -> QDM criteria -> QDM elements -> source FHIR/EDW rows.

## Mapping Matrix: FHIR to QDM First Pass

### Patient

FHIR: `Patient`

QDM:

- `Patient Characteristic, Birthdate`
- `Patient Characteristic, Sex`
- `Patient Characteristic, Race`
- `Patient Characteristic, Ethnicity`

EDW/star:

- `phm_edw.patient`
- `phm_star.dim_patient`

Notes:

- Preserve identifiers in `ehr_resource_crosswalk` and `qdm_entity`.
- Do not collapse non-binary/unknown sex or gender. Current mapper already avoids the old collapse bug.

### Coverage

FHIR: `Coverage`

QDM:

- `Patient Characteristic, Payer` with relevantPeriod.

EDW/star:

- `patient_insurance_coverage`
- `payer`
- `fact_patient_insurance`
- `dim_payer`

### Condition

FHIR: `Condition`

QDM:

- `Diagnosis` with prevalencePeriod.

EDW/star:

- `condition`
- `condition_diagnosis`
- `dim_condition`
- `fact_diagnosis`

Notes:

- QI-Core condition category/profile must be retained.
- ClinicalStatus null should default active only when source does not explicitly demote it.
- Need onset/abatement, verification, recorder/asserter.

### Encounter

FHIR: `Encounter`

QDM:

- `Encounter, Performed`
- Optional encounter diagnoses components.
- Optional facility locations components with locationPeriod.
- `class` attribute.
- `participant` actors.
- `relatedTo`.

EDW/star:

- `encounter`
- `fact_encounter`

Notes:

- Current `encounterCrosswalk` is CMS122-focused. Move it into a versioned value-set/crosswalk table.
- Need facility location and encounter diagnosis components for inpatient/patient-safety measures.
- `Encounter, Performed` negation rationale is retired in QDM 5.6 and must not be emitted.

### Observation / Laboratory Result

FHIR: `Observation`, some `DiagnosticReport` panels.

QDM:

- `Laboratory Test, Performed`
- `Assessment, Performed`
- `Physical Exam, Performed`
- `Diagnostic Study, Performed`

EDW/star:

- `observation`
- `fact_observation`

Notes:

- Use value-set/QDM category to distinguish lab vs assessment vs physical exam vs diagnostic study.
- Normalize result type, interpretation, reference ranges, components, result dateTime.
- Keep specimen/event time separate from result availability time.

### MedicationRequest

FHIR: `MedicationRequest`

QDM:

- `Medication, Order`
- Potentially `Medication, Active` if it is the active med-list representation.

EDW/star:

- `medication`
- `medication_order`
- `fact_medication_order`

Notes:

- Preserve authoredOn as author dateTime.
- Preserve dosage, route, frequency, refills, daysSupplied, supply.
- QDM negation uses doNotPerform/reasonCode in QI-Core.

### MedicationDispense

FHIR: `MedicationDispense`

QDM:

- `Medication, Dispensed`

EDW/star:

- Add or extend EDW table; current model lacks a first-class dispense event.

Notes:

- Needed for cumulative medication duration and pharmacy claims workflows.

### MedicationAdministration

FHIR: `MedicationAdministration`

QDM:

- `Medication, Administered`

EDW/star:

- Add or extend EDW table; current model lacks a first-class administration fact.

### Procedure

FHIR: `Procedure`

QDM:

- `Procedure, Performed`

EDW/star:

- `procedure`
- `procedure_performed`
- `fact_procedure`

Notes:

- QDM 5.6 retires `Procedure, Performed` priority but keeps completed-vs-outcome guidance.
- Need reason, result, components, performer, relatedTo.

### ServiceRequest

FHIR: `ServiceRequest`

QDM:

- `Laboratory Test, Order`
- `Procedure, Order`
- `Diagnostic Study, Order`
- `Intervention, Order`
- `Encounter, Order`
- `Assessment, Order`

EDW/star:

- `clinical_order` or type-specific EDW order tables.

Notes:

- Map by ServiceRequest category/code/value-set.
- Use `authoredOn` as author dateTime.
- `doNotPerform` maps to QDM negation.

### Immunization

FHIR: `Immunization`

QDM:

- `Immunization, Administered`

EDW/star:

- `immunization`
- `fact_immunization`

Notes:

- status `not-done` plus reason maps to negation rationale.

### AllergyIntolerance

FHIR: `AllergyIntolerance`

QDM:

- `Allergy/Intolerance`

EDW/star:

- `allergy`
- `patient_allergy`
- `dim_allergy`

### Goal / CarePlan

FHIR: `Goal`, `CarePlan`

QDM:

- `Care Goal`
- possible `relatedTo` to Diagnosis/Procedure/Assessment.

EDW/star:

- Add EDW tables or map to care-plan tables if present.

### Communication

FHIR: `Communication`

QDM:

- `Communication, Performed`

Notes:

- sender/recipient must be entity bridge rows.
- sent and received dateTimes are separate.

## Implementation Phases

### Phase 0 - Baseline Verification and Guardrails

Deliverables:

- A current inventory doc for supported FHIR resources, QDM datatypes, EDW tables, star facts, and gaps.
- A benchmark query plan note for high-risk tables, especially `phm_edw.observation`.
- A feature flag plan.

Tasks:

- [ ] Run current root gates: `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Run read-only DB metadata checks only: applied migrations, QDM tables absent/present, indexes, row estimates.
- [ ] Confirm current uncommitted EHR tranche scope so staging is surgical.
- [ ] Add env flags:
  - `QDM_NORMALIZATION_ENABLED=false`
  - `QDM_STAR_BRIDGE_ENABLED=false`
  - `QDM_CQL_PROMOTION_ENABLED=false`
- [ ] Add a short `docs/edw-to-qicore-projection.md` addendum pointing to this plan and stating that QDM will become the canonical semantic source.

Acceptance:

- Existing tests pass before schema work.
- No broad clinical counts or unbounded scans are run.
- Current behavior remains unchanged with flags off.

### Phase 1 - QDM Catalog and Seed Data

Deliverables:

- Migrations 068.
- Catalog seed script.
- Unit tests for catalog lookup.

Tasks:

- [ ] Create QDM catalog migrations.
- [ ] Seed all 22 QDM categories.
- [ ] Seed first-pass datatypes for all current and near-term resources.
- [ ] Seed datatype attributes and actor roles from QDM v5.6.
- [ ] Mark retired attributes/datatype behavior:
  - `Device, Applied` retired.
  - `Encounter, Performed` negation rationale retired.
  - `Procedure, Performed` priority retired.
  - `Participation` recorder retired.
- [ ] Seed value-set bindings from `vsac_value_set.qdm_category` and `measure_value_set`.
- [ ] Implement `qdm/catalog.ts`.
- [ ] Tests:
  - category lookup by display/code.
  - datatype lookup.
  - allowed attribute validation.
  - actor role cardinality.
  - retired attribute rejection.

Acceptance:

- QDM catalog is queryable and versioned.
- Tests prove QDM 5.6 changed semantics are represented.

### Phase 2 - FHIR to QDM Normalization

Deliverables:

- Migrations 069.
- `fhirToQdm.ts`, `qdmStore.ts`, `normalizationRunner.ts`.
- Golden fixture tests.

Tasks:

- [ ] Implement QDM draft type system.
- [ ] Implement idempotent QDM store with source hash matching.
- [ ] Implement Patient normalizer.
- [ ] Implement Coverage normalizer.
- [ ] Implement Condition normalizer.
- [ ] Implement Encounter normalizer, including class, participant, facility location, and diagnosis components.
- [ ] Implement Observation normalizer with datatype classification:
  - Laboratory Test vs Assessment vs Physical Exam vs Diagnostic Study.
  - result type.
  - interpretation.
  - components.
- [ ] Implement MedicationRequest normalizer.
- [ ] Implement MedicationDispense and MedicationAdministration normalizers, even if EDW destination is initially additive/new.
- [ ] Implement Procedure normalizer.
- [ ] Implement ServiceRequest normalizer for orders.
- [ ] Implement Immunization normalizer.
- [ ] Implement AllergyIntolerance normalizer.
- [ ] Implement Goal/CarePlan and Communication normalizers.
- [ ] Implement actor/entity extraction.
- [ ] Implement relationship extraction from `basedOn`, `partOf`, `derivedFrom`, `encounter`, `reasonReference`.
- [ ] Update `resourceStaging` flow to enqueue normalization when enabled.
- [ ] Update staging rows to `normalized`, `failed`, or `skipped` with structured errors.

Acceptance:

- Golden FHIR fixtures produce deterministic QDM elements.
- Round-trip source links are present for every QDM element.
- Failures are replayable.
- No existing FHIR route behavior changes with flags off.

### Phase 3 - QDM to EDW and Source Crosswalk Completion

Deliverables:

- `qdmToEdw.ts`.
- Crosswalk updates.
- Data-quality tables or structured error classes.

Tasks:

- [ ] For each supported QDM datatype, define canonical local EDW target.
- [x] Backfill Patient EDW rows into QDM events for explicit bounded cohorts.
- [ ] Upsert Patient QDM elements to `phm_edw.patient`.
- [ ] Upsert Coverage to payer/coverage tables.
- [x] Backfill Diagnosis EDW rows into QDM events for explicit bounded cohorts.
- [ ] Upsert Diagnosis to condition/condition_diagnosis.
- [x] Backfill Encounter EDW rows into QDM events for explicit bounded cohorts.
- [ ] Upsert Encounter to encounter.
- [x] Backfill Lab/Observation EDW rows into QDM events for explicit bounded cohorts.
- [ ] Upsert Lab/Observation/Assessment to observation and/or additive tables.
- [ ] Upsert Medication Order to medication/medication_order.
- [ ] Add new EDW tables for dispense/administered events if absent.
- [ ] Upsert Procedure.
- [ ] Upsert Immunization.
- [ ] Upsert Allergy.
- [ ] Update `ehr_resource_crosswalk` with local table/id and patient id.
- [ ] Add data-quality issue rows for unmapped codes, unsupported datatypes, missing patient references, invalid dates, ambiguous value types, and missing required timing.

Acceptance:

- FHIR staging -> QDM -> EDW produces idempotent local rows.
- Crosswalks are populated.
- Re-ingesting the same resource hash does not duplicate local rows.

### Phase 4 - QDM to Star Analytics Bridge

Deliverables:

- Migration 071.
- `qdmToStar.ts`.
- Refresh job integration.
- Views for evidence lineage.

Tasks:

- [ ] Populate `dim_qdm_datatype`.
- [ ] Populate `dim_qdm_value_set`.
- [ ] Populate `fact_qdm_evidence` from `qdm_data_element`.
- [ ] Bridge `fact_qdm_evidence` to existing clinical facts by local table/id:
  - `fact_diagnosis`
  - `fact_observation`
  - `fact_encounter`
  - `fact_medication_order`
  - `fact_procedure`
  - `fact_immunization`
  - `fact_patient_insurance`
  - `fact_care_gap`
- [ ] Add patient/provider/org/date key resolution with current SCD rows.
- [ ] Add materialized view `phm_star.mv_qdm_evidence_patient`.
- [ ] Add materialized view `phm_star.mv_measure_evidence_lineage`.
- [ ] Add refresh script entries after base facts and before dashboard views.

Acceptance:

- A patient-level analytics query can show QDM evidence by datatype/value set/source resource.
- Existing patient and measure dashboards do not regress.
- Refresh is bounded and timed.

### Phase 5 - QDM to QI-Core and Engine Load

Deliverables:

- `qdmToQiCore.ts`.
- Refactor `qicoreExport.ts` to support QDM input.
- CQL live smoke using QDM-derived QI-Core resources.

Tasks:

- [ ] Keep current EDW-row export as fallback.
- [x] Implement QDM-derived Patient, Encounter, Condition, Observation, MedicationRequest, Procedure resources.
- [x] Preserve US Core and QI-Core profiles.
- [x] Preserve namespaced stable ids.
- [x] Add QDM element identifiers to FHIR `identifier` where safe:
  - system `urn:medgnosis:qdm-data-element`
  - value QDM element id
- [ ] Map QDM `relatedTo` to FHIR `basedOn`, `partOf`, or `derivedFrom`.
- [x] Map negation by resource type:
  - request resources: `doNotPerform=true` + reason.
  - event resources: `status=not-done` + statusReason.
- [x] Map QDM result types to FHIR value[x].
- [ ] Map encounter diagnosis components to FHIR Encounter diagnosis where needed.
- [x] Add bounded QDM-derived bundle loader for HAPI/CQL engine.
- [x] Load QDM-derived bundle to HAPI and evaluate CMS122 smoke path.
- [x] Backfill enough QDM condition/encounter/lab evidence for non-zero CMS122 evaluation.
- [x] Persist non-zero CMS122 QDM-backed CQL output into `measure_report` and `measure_report_evidence`.
- [x] Reconcile and persist non-zero full-population CMS122 SQL/CQL drift between SQL/star and QDM-backed CQL.
- [x] Raise the QDM CQL loader event cap enough to avoid truncating the current 26,313-event CMS122 cohort while keeping explicit cohort/period bounds.

Acceptance:

- CMS122 evaluation still returns the known non-zero live behavior from prior Phase 2 notes, or a documented delta explained by changed source data.
- QI-Core resources include QDM identifiers and profile assertions.
- Engine load remains bounded by cohort and period.

### Phase 6 - Measure Criteria and CQL/Star Reconciliation

Deliverables:

- Migration 070.
- Migration 071.
- `measureCriteria.ts`.
- `measureReportToStar.ts`.
- Reconciliation persistence.

Tasks:

- [x] Parse packaged FHIR Measure/Library/ELM artifacts for data requirements.
- [x] Insert `measure_data_criteria` rows:
  - criteria id/name.
  - population role.
  - QDM datatype.
  - value set/direct reference code.
  - required QI-Core profile.
  - CQL/ELM path.
- [x] Keep `Library.dataRequirement` inventory rows unclassified unless ELM traversal proves population role membership.
- [x] Traverse local primary-library ELM retrieves for population-scoped criteria rows.
- [x] Traverse included/external ELM libraries for exclusion logic such as hospice, advanced illness/frailty, and palliative care when the libraries are present in the artifact bundle.
- [ ] Add cross-artifact/library fetch for external libraries that are not packaged in the local executable bundle.
- [ ] Replace heuristic-only `measure_value_set.population_role` for promoted measures with artifact-derived roles.
- [x] Request bounded individual MeasureReports where engine support allows patient-level membership.
- [x] Persist bounded individual MeasureReport outcomes into `phm_edw.measure_report_evidence` with QDM evidence summaries.
- [x] Add migration 070 for non-SQL fact-result provenance, scoped shadow rows, and partial CQL upsert key.
- [x] Convert bounded CQL patient-level memberships to scoped `fact_measure_result` shadow rows.
- [x] Convert full-population CQL patient-level memberships to non-authoritative `fact_measure_result` shadow rows after persisted reconciliation.
- [x] Preserve `measure_report_id`, `measure_report_evidence_id`, `source`, `evaluation_scope`, and optional `qdm_run_id`.
- [x] Populate promoted star-result evidence from persisted QDM evidence summaries.
- [x] Populate `bridge_qdm_star_evidence` and `fact_measure_result_evidence` for CQL shadow rows.
- [x] Add first-class reconciliation scope provenance:
  - `full_population`
  - `scoped_subjects`
  - scoped patient ids/refs
  - linked CQL `MeasureReport`
  - explicit promotion eligibility.
- [x] Block scoped sidecar reconciliations from CQL-authoritative promotion, even when SQL and CQL counts agree.
- [x] Reset legacy unlinked reconciliation runs to not promotion eligible and make the database default conservative.
- [x] Enforce that promotion-eligible reconciliation rows must be accepted full-population rows linked to a CQL MeasureReport.
- [x] Add governed SQL baseline alias table and seed `CMS122v12 <- DM-02` as a local care-gap surrogate baseline, not as a complete CMS122 SQL evaluator.
- [x] Project active SQL baseline aliases into `fact_measure_result` during `measureCalculatorV2.refreshMeasureResults()`.
- [x] Fix JSONB object handling and evidence-ledger uniqueness for CQL shadow materialization.
- [x] Add semantic drift dossier persistence for local-surrogate versus standards-eCQM comparison.
- [x] Add CMS122/DM-02 patient-level drift classifier:
  - CMS122 age-band evidence.
  - diabetes value-set evidence.
  - qualifying encounter / initial-population evidence.
  - denominator-exclusion evidence review.
  - local gap closure versus CMS122 poor-control numerator semantics.
- [x] Add admin dossier generation endpoint with audit logging.
- [x] Add audited semantic drift worklist endpoint for persisted dossier rows with compact review buckets and no raw QDM/FHIR payloads.
- [x] Add audited semantic drift detail endpoint for one persisted dossier patient row with raw QDM/FHIR payloads.
- [x] Add admin Measure Governance tab for promotion config, semantic drift worklist, and audited detail drilldown.
- [ ] Promote a full-population CQL measure to authoritative `fact_measure_result` rows after reconciliation.
- [x] Add guarded CQL-authoritative promotion service/admin controls:
  - require `cql_shadow` or already `cql_authoritative`
  - require accepted persisted reconciliation
  - require matching persisted population `MeasureReport`
  - require full-population, promotion-eligible reconciliation scope
  - require selected `MeasureReport` counts to match accepted CQL reconciliation counts
  - require patient-level evidence coverage
  - record promotion audit metadata on the reconciliation run.
- [x] Update measure detail, measure summary, patient cohort filters, and admin analytics overview to honor `measure_promotion_config.authoritative_source`.
- [x] Persist reconciliation result:
  - SQL counts.
  - CQL counts.
  - deltas.
  - tolerance.
  - status.
- [x] Add measure promotion config:
  - `sql_only`
  - `cql_shadow`
  - `cql_authoritative`
  - `manual_hold`

Acceptance:

- `fact_measure_result` can be rebuilt from CQL for promoted measures.
- SQL and CQL deltas are visible and persisted.
- Dossier can explain a denominator/numerator/exclusion row down to QDM/source evidence.

Live status on 2026-06-18:

- Migrations 074, 075, 076, 077, and 078 are applied.
- SQL measure refresh rebuilt 27,223 `sql_bundle` rows.
- `CMS122v12` now has a SQL baseline via the governed DM-02 alias: denominator 256, numerator 58, exclusions 0.
- Scoped patient `9` CMS122 reconciliation agrees: SQL 1/0/0, CQL 1/0/0, deltas 0/0/0.
- That run is explicitly `evaluation_scope = scoped_subjects` and `promotion_eligible = false`, so it is not an authoritative promotion candidate.
- Full-population CMS122 CQL sidecar run completed without loader truncation: 25,970 QDM-derived QI-Core resources loaded, 256 patient evidence rows persisted, 19,110 QDM evidence summaries selected.
- Full-population reconciliation is drift, not accepted: SQL 256/58/0 vs CQL 17/0/0, deltas 239/58/0.
- CMS122 is now in `cql_shadow` mode with `authoritative_source = sql_bundle`.
- Full-population `qdm-cql` shadow rows are materialized in `fact_measure_result`: 256 rows, denominator 17, numerator 0, exclusions 0, `reconciliation_status = cql_shadow`.
- Semantic drift dossier `id = 2` is persisted for CMS122 reconciliation run `3` / MeasureReport `1`:
  - compared patients: 256
  - persisted drift rows: 242
  - denominator drift: 101 outside CMS122 age range, 106 missing qualifying encounter/initial-population evidence, 27 residual CQL/QI-Core semantic cases, 4 exclusion-evidence-review cases, 1 missing diabetes evidence, 17 aligned
  - numerator drift: 38 local closed without QDM HbA1c/GMI evidence, 20 local closed with controlled HbA1c not CMS122 poor-control, 198 neither numerator
- The semantic drift worklist for dossier `2` and `residual_cql_or_qicore_semantic_gap` returns 27 residual rows; sampled rows show compact review buckets and subject MeasureReport population counts of zero for initial population, denominator, numerator, and denominator exclusion.
- The semantic drift detail endpoint for the first residual row returned dossier patient row `243`, patient `3`, MeasureReport evidence row `95`, `58` QDM evidence items, and a subject MeasureReport present. This endpoint is admin/audit-only because it exposes raw patient-linked QDM/FHIR evidence. Evidence selection is source-aware and deterministic so source-mixed evidence cannot silently redefine a drift row.
- The admin-only Measure Governance tab in `/admin` lists promotion configs, loads compact semantic drift worklists, fetches audited raw QDM/FHIR evidence detail only for a selected row, and now shows QDM bridge operational status/open issues. The public `/measures` page remains the operational measure view.
- QDM bridge operations now have a PHI-safe ledger:
  - `phm_edw.qdm_bridge_run`
  - `phm_edw.qdm_bridge_issue`
  - `phm_edw.v_qdm_bridge_operational_status`
  - `phm_star.v_measure_evidence_lineage`
  - admin routes for status, runs, and issues
  - `npm run qdm:shadow-refresh` non-authoritative wrapper around the existing CQL smoke harness
  - runbook at `docs/superpowers/runbooks/qdm-bridge-operations.md`
- Authoritative CQL promotion remains blocked until the SQL-vs-CQL semantics are reconciled or the governance policy intentionally accepts a new CQL-authoritative baseline.

Completion boundary: engineering completion for this phase means the bridge can ingest/project evidence, persist CQL shadow analytics, reconcile against SQL, classify semantic drift, expose audited review surfaces, and run/replay shadow refreshes with an operational ledger. It does not mean overriding the clinical governance decision that CMS122 remains non-authoritative while the DM-02 surrogate-vs-eCQM semantic drift is unresolved.

### Phase 7 - Bidirectional Reporting Outputs

Deliverables:

- Evidence-aware DEQM.
- Complete QRDA patient data section.
- Dossier lineage endpoints.

Tasks:

- [ ] Refactor DEQM Gaps-in-Care builder to consume QDM/star evidence instead of only direct `care_gap` rows.
- [ ] Add DetectedIssue evidence references to QDM-backed MeasureReports.
- [ ] Complete QRDA Cat I patient-data section with QDM data elements:
  - diagnosis/prevalence period.
  - encounter/relevant period.
  - lab/result.
  - medication order/duration fields.
  - negation rationale where present.
- [ ] Add QRDA Cat III aggregate path from `fact_measure_result` and `measure_report`.
- [ ] Add `/measures/:code/dossier/evidence` route.
- [ ] Add `/patients/:id/quality-evidence` route.
- [x] Add admin route for QDM bridge runs and errors.

Acceptance:

- DEQM validator passes for generated gaps bundle.
- QRDA/CVU+ validation passes for sample patient reports or produces documented gaps.
- Dossier includes QDM criteria/evidence/source lineage.

### Phase 8 - Operations, Observability, and Performance

Deliverables:

- Runbooks.
- Metrics.
- Alert rules.
- Backfill scripts.

Tasks:

- [ ] Add `qdm:normalize` script for a bounded ingest run.
- [ ] Add `qdm:backfill` script with required args:
  - resource type.
  - tenant/org.
  - date range.
  - patient limit or roster file.
  - dry run.
- [x] Add non-authoritative `qdm:shadow-refresh` script wrapper for CQL shadow/star refresh and persisted reconciliation.
- [ ] Add dedicated `qdm:refresh-star` script separate from the CQL smoke harness.
- [ ] Add dedicated `qdm:reconcile-measure` script separate from the CQL smoke harness.
- [x] Add QDM bridge run/issue ledger and status view for operational metrics.
- [ ] Add metrics:
  - staged resources.
  - normalized resources.
  - QDM elements by datatype.
  - errors by reason.
  - fact evidence rows.
  - measure reconciliation deltas.
  - CQL engine evaluation duration.
- [ ] Add alerting for stuck normalization runs, high normalization failure rate, missing value-set mappings, CQL/SQL drift, and stale MeasureReports.
- [x] Add runbook sections for replay, bad mapping rollback, value-set drift, and engine outage.

Acceptance:

- Operators can backfill and replay safely.
- Performance gates prevent unbounded clinical table scans.
- Quality drift is visible before users see inconsistent analytics.

## Testing Strategy

### Unit Tests

- `fhirToQdm.test.ts` for each resource type.
- `qdmStore.test.ts` for idempotency and source hash changes.
- `qdmToQiCore.test.ts` for profile, timing, negation, result, and relatedTo mapping.
- `qdmToStar.test.ts` for key resolution and fact generation.
- `measureCriteria.test.ts` for ELM/Measure parsing.
- `measureReportToStar.test.ts` for population flags and evidence bridges.

### Integration Tests

- Stage a FHIR Bundle -> normalize to QDM -> upsert EDW -> refresh star -> query evidence.
- QDM-derived QI-Core export -> HAPI load -> `$evaluate-measure` -> MeasureReport persist -> star rows.
- DEQM Gaps-in-Care from QDM/star evidence.
- QRDA Cat I with populated patient data section.

### Regression Gates

- Existing root gates:
  - `npm run typecheck`
  - `npm run test`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`
- FHIR validator:
  - US Core/QI-Core fixtures.
  - DEQM sample.
- CQL engine smoke:
  - CMS122.
  - One medication-duration measure if available.
  - One encounter-diagnosis measure if available.
  - One negation-rationale fixture.

### Performance Gates

- All observation queries must include:
  - patient/roster bounds.
  - measurement period bounds.
  - `active_ind = 'Y'` where partial indexes require it.
  - `statement_timeout`.
- Backfills must use batches and checkpoints.
- Any full-table cardinality check must use metadata estimates unless explicitly approved.

## Rollout Plan

1. Ship schema and catalog behind flags.
2. Normalize only golden fixtures and one local sandbox tenant.
3. Backfill one small patient roster.
4. Enable QDM star evidence views without changing dashboard behavior.
5. Run CQL shadow mode for CMS122.
6. Compare SQL vs CQL in dossier.
7. Promote one measure to CQL-authoritative only after evidence and reconciliation are accepted.
8. Expand resource types and measures iteratively.

## Risks and Mitigations

- Risk: QDM model gets too generic and slow.
  - Mitigation: catalog tables are generic, but evidence facts are denormalized for analytics.

- Risk: CQL engine references cannot be mapped back to QDM evidence.
  - Mitigation: include stable QDM identifiers in QI-Core resource identifiers and keep engine load ids deterministic.

- Risk: value-set expansions differ between Medgnosis VSAC and packaged measure bundles.
  - Mitigation: record expansion source/version per run and prefer the engine-loaded expansion for CQL cohort selection.

- Risk: observation scans overload the host.
  - Mitigation: enforce bounded query helpers and statement timeouts; test explain plans.

- Risk: actor/entity model slows the first release.
  - Mitigation: implement actor bridge now, but require actors only for measures that use them.

- Risk: QRDA Cat I full QDM patient-data conformance is broader than the first bridge.
  - Mitigation: generate what is mapped, run CVU+, and track template gaps explicitly.

## Initial File List

Create:

- `packages/db/migrations/068_qdm_catalog.sql`
- `packages/db/migrations/069_qdm_data_elements.sql`
- `packages/db/migrations/070_measure_qdm_criteria.sql`
- `packages/db/migrations/071_star_qdm_bridge.sql`
- `apps/api/src/services/qdm/types.ts`
- `apps/api/src/services/qdm/catalog.ts`
- `apps/api/src/services/qdm/fhirToQdm.ts`
- `apps/api/src/services/qdm/qdmStore.ts`
- `apps/api/src/services/qdm/normalizationRunner.ts`
- `apps/api/src/services/qdm/qdmToEdw.ts`
- `apps/api/src/services/qdm/qdmToStar.ts`
- `apps/api/src/services/qdm/qdmToQiCore.ts`
- `apps/api/src/services/qdm/measureCriteria.ts`
- `apps/api/src/services/qdm/measureReportToStar.ts`
- `apps/api/src/services/qdm/lineage.ts`
- `apps/api/src/routes/qdm/admin.ts`
- `scripts/qdm-normalize.ts`
- `scripts/qdm-refresh-star.ts`
- `scripts/qdm-reconcile-measure.ts`

Modify:

- `apps/api/src/config.ts`
- `apps/api/src/services/ehr/resourceStaging.ts`
- `apps/api/src/services/fhir/qicoreExport.ts`
- `apps/api/src/services/cqlMeasureEvaluator.ts`
- `apps/api/src/services/measureReportStore.ts`
- `apps/api/src/services/measureReconciliation.ts`
- `apps/api/src/services/deqm/careGaps.ts`
- `apps/api/src/services/qrda/qrdaCat1.ts`
- `apps/api/src/routes/fhir/measureOps.ts`
- `apps/api/src/routes/measures/index.ts`
- `packages/db/scripts/refresh_star_views.sql`
- `docs/edw-to-qicore-projection.md`

## Definition of Done

- QDM v5.6 catalog exists and is versioned.
- Inbound FHIR resources can produce QDM elements with source links.
- QDM elements can populate EDW and star evidence facts.
- QI-Core export can run from QDM evidence.
- CQL MeasureReport results can populate `fact_measure_result` with evidence bridges.
- SQL/CQL reconciliation is persisted and visible.
- DEQM and QRDA outputs are QDM/evidence-aware.
- Dossier can answer: "why is this patient in this measure population?" with QDM criteria, source FHIR resource, source version/hash, EDW row, star fact, and measure artifact version.
- Existing app auth and patient scoping remain intact.
- Root validation gates pass.
