-- =============================================================================
-- 068: FHIR<->QDM dimensional analytics bridge foundation
-- Adds the first vertical slice for QDM-native analytics without rewriting
-- existing EDW or star facts:
--   1. phm_edw.qdm_event - canonical QDM event spine.
--   2. phm_edw.fhir_qdm_crosswalk - FHIR resource identity to QDM events.
--   3. phm_star.bridge_qdm_star_evidence - QDM evidence attached to star facts.
--   4. phm_edw.measure_report_evidence - row-level MeasureReport evidence.
--   5. phm_star.fact_measure_result_evidence - measure-result evidence ledger.
-- Additive: no destructive changes and no high-volume table rewrites.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS phm_edw;
CREATE SCHEMA IF NOT EXISTS phm_star;

-- -----------------------------------------------------------------------------
-- SECTION 1: CANONICAL QDM EVENT SPINE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS phm_edw.qdm_event (
  qdm_event_id           BIGSERIAL PRIMARY KEY,
  qdm_event_key          VARCHAR(220) NOT NULL,
  org_id                 INT,
  patient_id             INT REFERENCES phm_edw.patient(patient_id) ON DELETE SET NULL,
  patient_ref            VARCHAR(300),
  encounter_id           INT REFERENCES phm_edw.encounter(encounter_id) ON DELETE SET NULL,
  provider_id            INT REFERENCES phm_edw.provider(provider_id) ON DELETE SET NULL,
  ehr_tenant_id          BIGINT REFERENCES phm_edw.ehr_tenant(id) ON DELETE SET NULL,
  source_staging_id      BIGINT REFERENCES phm_edw.fhir_ingest_staging(id) ON DELETE SET NULL,
  source_table           VARCHAR(120),
  source_id              BIGINT,
  source_hash            VARCHAR(128),
  qdm_category           VARCHAR(120) NOT NULL,
  qdm_datatype           VARCHAR(160) NOT NULL,
  qdm_status             VARCHAR(80),
  code_system            VARCHAR(80),
  code                   VARCHAR(120),
  code_display           TEXT,
  value_set_oid          VARCHAR(120) REFERENCES phm_edw.vsac_value_set(value_set_oid) ON DELETE SET NULL,
  relevant_start_at      TIMESTAMPTZ,
  relevant_end_at        TIMESTAMPTZ,
  author_datetime        TIMESTAMPTZ,
  result_datetime        TIMESTAMPTZ,
  value_numeric          NUMERIC,
  value_text             TEXT,
  value_unit             VARCHAR(80),
  negation_rationale_code VARCHAR(120),
  negation_rationale_system VARCHAR(80),
  attributes             JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_payload         JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_qdm_event_key UNIQUE (qdm_event_key),
  CONSTRAINT ck_qdm_event_key CHECK (length(trim(qdm_event_key)) > 0),
  CONSTRAINT ck_qdm_event_category CHECK (length(trim(qdm_category)) > 0),
  CONSTRAINT ck_qdm_event_datatype CHECK (length(trim(qdm_datatype)) > 0),
  CONSTRAINT ck_qdm_event_relevant_period CHECK (
    relevant_end_at IS NULL
    OR relevant_start_at IS NULL
    OR relevant_end_at >= relevant_start_at
  ),
  CONSTRAINT ck_qdm_event_attributes CHECK (jsonb_typeof(attributes) = 'object'),
  CONSTRAINT ck_qdm_event_source_payload CHECK (
    source_payload IS NULL
    OR jsonb_typeof(source_payload) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_qdm_event_patient_category_time
  ON phm_edw.qdm_event (patient_id, qdm_category, relevant_start_at DESC);

CREATE INDEX IF NOT EXISTS idx_qdm_event_patient_ref
  ON phm_edw.qdm_event (ehr_tenant_id, patient_ref, qdm_datatype);

CREATE INDEX IF NOT EXISTS idx_qdm_event_patient_datatype_time
  ON phm_edw.qdm_event (patient_id, qdm_datatype, relevant_start_at DESC);

CREATE INDEX IF NOT EXISTS idx_qdm_event_code
  ON phm_edw.qdm_event (code_system, code);

CREATE INDEX IF NOT EXISTS idx_qdm_event_value_set
  ON phm_edw.qdm_event (value_set_oid);

CREATE INDEX IF NOT EXISTS idx_qdm_event_tenant_source
  ON phm_edw.qdm_event (ehr_tenant_id, source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_qdm_event_staging
  ON phm_edw.qdm_event (source_staging_id);

COMMENT ON TABLE phm_edw.qdm_event IS
  'Canonical patient-level QDM event spine for dimensional analytics, sourced from normalized EDW rows and/or FHIR resources.';
COMMENT ON COLUMN phm_edw.qdm_event.qdm_event_key IS
  'Stable ETL-assigned canonical event key. It should include enough source identity to be idempotent across refreshes.';
COMMENT ON COLUMN phm_edw.qdm_event.patient_ref IS
  'Source FHIR patient reference retained when a staged resource has not yet resolved to phm_edw.patient.patient_id.';
COMMENT ON COLUMN phm_edw.qdm_event.source_staging_id IS
  'Raw phm_edw.fhir_ingest_staging row that produced this QDM event when sourced from staged FHIR.';
COMMENT ON COLUMN phm_edw.qdm_event.qdm_category IS
  'QDM category, commonly aligned to VSAC qdm_category values such as Encounter, Diagnosis, Laboratory Test, Medication, or Procedure.';
COMMENT ON COLUMN phm_edw.qdm_event.qdm_datatype IS
  'Canonical QDM datatype for the event, such as Laboratory Test, Performed or Encounter, Performed.';
COMMENT ON COLUMN phm_edw.qdm_event.value_set_oid IS
  'Primary VSAC value set OID matched by this event when the ETL can determine one canonical value-set membership.';
COMMENT ON COLUMN phm_edw.qdm_event.attributes IS
  'QDM datatype-specific attributes that do not deserve first-class columns in the canonical spine.';

-- -----------------------------------------------------------------------------
-- SECTION 2: FHIR<->QDM SOURCE CROSSWALK
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS phm_edw.fhir_qdm_crosswalk (
  id                    BIGSERIAL PRIMARY KEY,
  qdm_event_id          BIGINT NOT NULL REFERENCES phm_edw.qdm_event(qdm_event_id) ON DELETE CASCADE,
  ehr_tenant_id         BIGINT REFERENCES phm_edw.ehr_tenant(id) ON DELETE SET NULL,
  source_staging_id     BIGINT REFERENCES phm_edw.fhir_ingest_staging(id) ON DELETE SET NULL,
  resource_crosswalk_id BIGINT REFERENCES phm_edw.ehr_resource_crosswalk(id) ON DELETE SET NULL,
  fhir_resource_type    VARCHAR(80) NOT NULL,
  fhir_resource_id      VARCHAR(300) NOT NULL,
  fhir_path             TEXT,
  fhir_profile          TEXT,
  mapping_method        VARCHAR(40) NOT NULL DEFAULT 'etl',
  mapping_version       VARCHAR(80),
  mapping_confidence    NUMERIC(5,4),
  mapped_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_fhir_qdm_resource_type CHECK (length(trim(fhir_resource_type)) > 0),
  CONSTRAINT ck_fhir_qdm_resource_id CHECK (length(trim(fhir_resource_id)) > 0),
  CONSTRAINT ck_fhir_qdm_confidence CHECK (
    mapping_confidence IS NULL
    OR (mapping_confidence >= 0 AND mapping_confidence <= 1)
  ),
  CONSTRAINT ck_fhir_qdm_metadata CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT uq_fhir_qdm_event_resource UNIQUE NULLS NOT DISTINCT (
    qdm_event_id,
    fhir_resource_type,
    fhir_resource_id,
    fhir_path
  )
);

CREATE INDEX IF NOT EXISTS idx_fhir_qdm_qdm_event
  ON phm_edw.fhir_qdm_crosswalk (qdm_event_id);

CREATE INDEX IF NOT EXISTS idx_fhir_qdm_tenant_resource
  ON phm_edw.fhir_qdm_crosswalk (ehr_tenant_id, fhir_resource_type, fhir_resource_id);

CREATE INDEX IF NOT EXISTS idx_fhir_qdm_resource_crosswalk
  ON phm_edw.fhir_qdm_crosswalk (resource_crosswalk_id);

CREATE INDEX IF NOT EXISTS idx_fhir_qdm_staging
  ON phm_edw.fhir_qdm_crosswalk (source_staging_id);

COMMENT ON TABLE phm_edw.fhir_qdm_crosswalk IS
  'Crosswalk from source FHIR resource identity and path to canonical QDM events for replayable FHIR<->QDM mapping.';
COMMENT ON COLUMN phm_edw.fhir_qdm_crosswalk.fhir_path IS
  'Optional FHIRPath or local path identifying the resource element that produced the QDM event.';
COMMENT ON COLUMN phm_edw.fhir_qdm_crosswalk.mapping_method IS
  'Mapping provenance such as etl, cql, manual, or terminology.';

-- -----------------------------------------------------------------------------
-- SECTION 3: MEASUREREPORT ROW-LEVEL EVIDENCE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS phm_edw.measure_report_evidence (
  id                     BIGSERIAL PRIMARY KEY,
  measure_report_id      BIGINT NOT NULL REFERENCES phm_edw.measure_report(id) ON DELETE CASCADE,
  measure_code           VARCHAR(120) NOT NULL,
  patient_id             INT REFERENCES phm_edw.patient(patient_id) ON DELETE SET NULL,
  patient_ref            VARCHAR(300),
  patient_key            INT REFERENCES phm_star.dim_patient(patient_key) ON DELETE SET NULL,
  measure_key            INT REFERENCES phm_star.dim_measure(measure_key) ON DELETE SET NULL,
  period_start           DATE NOT NULL,
  period_end             DATE NOT NULL,
  denominator_flag       BOOLEAN NOT NULL DEFAULT FALSE,
  numerator_flag         BOOLEAN NOT NULL DEFAULT FALSE,
  exclusion_flag         BOOLEAN NOT NULL DEFAULT FALSE,
  measure_value          NUMERIC,
  source                 VARCHAR(40) NOT NULL DEFAULT 'cql',
  qdm_evidence           JSONB NOT NULL DEFAULT '[]'::jsonb,
  fhir_subject_report    JSONB,
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_mre_patient_identity CHECK (patient_id IS NOT NULL OR patient_ref IS NOT NULL),
  CONSTRAINT ck_mre_period CHECK (period_end >= period_start),
  CONSTRAINT ck_mre_qdm_evidence CHECK (jsonb_typeof(qdm_evidence) = 'array'),
  CONSTRAINT ck_mre_fhir_subject_report CHECK (
    fhir_subject_report IS NULL
    OR jsonb_typeof(fhir_subject_report) = 'object'
  ),
  CONSTRAINT uq_measure_report_evidence_subject UNIQUE NULLS NOT DISTINCT (
    measure_code,
    period_start,
    period_end,
    patient_id,
    patient_ref,
    source
  )
);

CREATE INDEX IF NOT EXISTS idx_mre_report
  ON phm_edw.measure_report_evidence (measure_report_id);

CREATE INDEX IF NOT EXISTS idx_mre_measure_patient
  ON phm_edw.measure_report_evidence (measure_code, patient_id, patient_ref);

CREATE INDEX IF NOT EXISTS idx_mre_patient_key_measure
  ON phm_edw.measure_report_evidence (patient_key, measure_key);

COMMENT ON TABLE phm_edw.measure_report_evidence IS
  'Row-level patient evidence adjacent to persisted FHIR MeasureReport resources, kept separate from fact_measure_result so CQL evidence can be reconciled before changing SQL analytics math.';
COMMENT ON COLUMN phm_edw.measure_report_evidence.qdm_evidence IS
  'Array of normalized QDM event/evidence summaries that explain this patient-level measure outcome.';
COMMENT ON COLUMN phm_edw.measure_report_evidence.fhir_subject_report IS
  'Optional subject-level FHIR MeasureReport payload or fragment from the CQL engine.';

-- -----------------------------------------------------------------------------
-- SECTION 4: QDM-TO-STAR EVIDENCE BRIDGE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS phm_star.bridge_qdm_star_evidence (
  qdm_star_evidence_key BIGSERIAL PRIMARY KEY,
  qdm_event_id          BIGINT NOT NULL REFERENCES phm_edw.qdm_event(qdm_event_id) ON DELETE CASCADE,
  patient_key           INT REFERENCES phm_star.dim_patient(patient_key) ON DELETE SET NULL,
  measure_key           INT REFERENCES phm_star.dim_measure(measure_key) ON DELETE SET NULL,
  star_fact_table       VARCHAR(120) NOT NULL,
  star_fact_key         BIGINT NOT NULL,
  evidence_role         VARCHAR(60) NOT NULL DEFAULT 'supporting',
  population_role       VARCHAR(30) NOT NULL DEFAULT 'unclassified',
  value_set_oid         VARCHAR(120) REFERENCES phm_edw.vsac_value_set(value_set_oid) ON DELETE SET NULL,
  matched_code_system   VARCHAR(80),
  matched_code          VARCHAR(120),
  evaluator             VARCHAR(80),
  confidence            NUMERIC(5,4),
  evidence_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_bqse_star_fact_table CHECK (length(trim(star_fact_table)) > 0),
  CONSTRAINT ck_bqse_star_fact_key CHECK (star_fact_key > 0),
  CONSTRAINT ck_bqse_population_role CHECK (population_role IN (
    'initial_population',
    'denominator',
    'denominator_exclusion',
    'numerator',
    'supplemental',
    'unclassified'
  )),
  CONSTRAINT ck_bqse_confidence CHECK (
    confidence IS NULL
    OR (confidence >= 0 AND confidence <= 1)
  ),
  CONSTRAINT ck_bqse_metadata CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT uq_bqse_event_fact_role UNIQUE (
    qdm_event_id,
    star_fact_table,
    star_fact_key,
    evidence_role,
    population_role
  )
);

CREATE INDEX IF NOT EXISTS idx_bqse_qdm_event
  ON phm_star.bridge_qdm_star_evidence (qdm_event_id);

CREATE INDEX IF NOT EXISTS idx_bqse_star_target
  ON phm_star.bridge_qdm_star_evidence (star_fact_table, star_fact_key);

CREATE INDEX IF NOT EXISTS idx_bqse_patient_measure_role
  ON phm_star.bridge_qdm_star_evidence (patient_key, measure_key, population_role);

CREATE INDEX IF NOT EXISTS idx_bqse_value_set
  ON phm_star.bridge_qdm_star_evidence (value_set_oid);

COMMENT ON TABLE phm_star.bridge_qdm_star_evidence IS
  'Generic bridge from canonical QDM events to star facts, preserving the event-level evidence behind dimensional analytics.';
COMMENT ON COLUMN phm_star.bridge_qdm_star_evidence.star_fact_table IS
  'Target phm_star fact table name. The key is intentionally generic so one bridge can cover observations, diagnoses, encounters, care gaps, and measure results.';
COMMENT ON COLUMN phm_star.bridge_qdm_star_evidence.population_role IS
  'eCQM/QDM population role contributed by this evidence row, aligned to measure_value_set.population_role where available.';

-- -----------------------------------------------------------------------------
-- SECTION 5: MEASURE RESULT EVIDENCE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS phm_star.fact_measure_result_evidence (
  evidence_key          BIGSERIAL PRIMARY KEY,
  measure_result_key    BIGINT NOT NULL REFERENCES phm_star.fact_measure_result(measure_result_key) ON DELETE CASCADE,
  qdm_event_id          BIGINT REFERENCES phm_edw.qdm_event(qdm_event_id) ON DELETE SET NULL,
  qdm_star_evidence_key BIGINT REFERENCES phm_star.bridge_qdm_star_evidence(qdm_star_evidence_key) ON DELETE SET NULL,
  measure_report_id     BIGINT REFERENCES phm_edw.measure_report(id) ON DELETE SET NULL,
  measure_report_evidence_id BIGINT REFERENCES phm_edw.measure_report_evidence(id) ON DELETE SET NULL,
  patient_key           INT REFERENCES phm_star.dim_patient(patient_key) ON DELETE SET NULL,
  measure_key           INT REFERENCES phm_star.dim_measure(measure_key) ON DELETE SET NULL,
  population_role       VARCHAR(30) NOT NULL DEFAULT 'unclassified',
  evidence_role         VARCHAR(60) NOT NULL DEFAULT 'supporting',
  population_criteria_id VARCHAR(160),
  value_set_oid         VARCHAR(120) REFERENCES phm_edw.vsac_value_set(value_set_oid) ON DELETE SET NULL,
  decision              VARCHAR(40) NOT NULL DEFAULT 'matched',
  reason                TEXT,
  evaluator             VARCHAR(80),
  evaluated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence              JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_fmre_population_role CHECK (population_role IN (
    'initial_population',
    'denominator',
    'denominator_exclusion',
    'numerator',
    'supplemental',
    'unclassified'
  )),
  CONSTRAINT ck_fmre_evidence CHECK (jsonb_typeof(evidence) = 'object'),
  CONSTRAINT ck_fmre_decision CHECK (length(trim(decision)) > 0),
  CONSTRAINT uq_fmre_result_event_role UNIQUE (
    measure_result_key,
    qdm_event_id,
    population_role,
    evidence_role,
    population_criteria_id
  )
);

CREATE INDEX IF NOT EXISTS idx_fmre_measure_result
  ON phm_star.fact_measure_result_evidence (measure_result_key);

CREATE INDEX IF NOT EXISTS idx_fmre_qdm_event
  ON phm_star.fact_measure_result_evidence (qdm_event_id);

CREATE INDEX IF NOT EXISTS idx_fmre_report
  ON phm_star.fact_measure_result_evidence (measure_report_id);

CREATE INDEX IF NOT EXISTS idx_fmre_patient_measure_role
  ON phm_star.fact_measure_result_evidence (patient_key, measure_key, population_role);

CREATE INDEX IF NOT EXISTS idx_fmre_value_set
  ON phm_star.fact_measure_result_evidence (value_set_oid);

COMMENT ON TABLE phm_star.fact_measure_result_evidence IS
  'Event-level evidence ledger for fact_measure_result, preserving QDM events, value-set matches, population roles, and MeasureReport provenance.';
COMMENT ON COLUMN phm_star.fact_measure_result_evidence.population_criteria_id IS
  'Optional CQL/MeasureReport population criteria identifier used to explain why this evidence affected the measure result.';
COMMENT ON COLUMN phm_star.fact_measure_result_evidence.evidence IS
  'Evaluator-specific evidence payload, such as CQL trace fragments, source FHIR references, or normalized comparison details.';
