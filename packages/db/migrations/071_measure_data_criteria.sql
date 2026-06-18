-- =============================================================================
-- 071: Measure data criteria inventory for QDM/FHIR bridge analytics
-- Captures executable FHIR Measure/Library data requirements as a durable
-- measure dossier table that can be joined to VSAC, QDM events, and star facts.
-- Additive: one new table; no existing data rewrites.
-- =============================================================================

CREATE TABLE IF NOT EXISTS phm_edw.measure_data_criteria (
  id                    BIGSERIAL PRIMARY KEY,
  measure_code          VARCHAR(120) NOT NULL,
  measure_artifact_id   BIGINT NOT NULL REFERENCES phm_edw.measure_artifact(id) ON DELETE CASCADE,
  measure_id            INT REFERENCES phm_edw.measure_definition(measure_id) ON DELETE RESTRICT,
  library_id            VARCHAR(200) NOT NULL,
  library_url           VARCHAR(500),
  library_name          VARCHAR(240),
  criteria_id           VARCHAR(240) NOT NULL,
  criteria_name         TEXT,
  population_role       VARCHAR(30) NOT NULL DEFAULT 'unclassified',
  fhir_resource_type    VARCHAR(80) NOT NULL,
  qicore_profile        TEXT,
  qdm_category          VARCHAR(120),
  qdm_datatype          VARCHAR(160),
  code_filter_path      VARCHAR(160),
  value_set_oid         VARCHAR(120) REFERENCES phm_edw.vsac_value_set(value_set_oid) ON DELETE SET NULL,
  value_set_url         TEXT,
  direct_code_system    VARCHAR(160),
  direct_code           VARCHAR(160),
  direct_code_display   TEXT,
  must_support          JSONB NOT NULL DEFAULT '[]'::jsonb,
  elm_expression_name   TEXT,
  elm_local_id          VARCHAR(120),
  elm_path              TEXT,
  criteria_payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_method         VARCHAR(60) NOT NULL DEFAULT 'fhir_library_data_requirement',
  mapping_confidence    NUMERIC(5,4),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_mdc_measure_code CHECK (length(trim(measure_code)) > 0),
  CONSTRAINT ck_mdc_library_id CHECK (length(trim(library_id)) > 0),
  CONSTRAINT ck_mdc_criteria_id CHECK (length(trim(criteria_id)) > 0),
  CONSTRAINT ck_mdc_fhir_resource_type CHECK (length(trim(fhir_resource_type)) > 0),
  CONSTRAINT ck_mdc_population_role CHECK (population_role IN (
    'initial_population',
    'denominator',
    'denominator_exclusion',
    'numerator',
    'supplemental',
    'unclassified'
  )),
  CONSTRAINT ck_mdc_must_support_array CHECK (jsonb_typeof(must_support) = 'array'),
  CONSTRAINT ck_mdc_payload_object CHECK (jsonb_typeof(criteria_payload) = 'object'),
  CONSTRAINT ck_mdc_confidence CHECK (
    mapping_confidence IS NULL
    OR (mapping_confidence >= 0 AND mapping_confidence <= 1)
  ),
  CONSTRAINT uq_measure_data_criteria UNIQUE NULLS NOT DISTINCT (
    measure_artifact_id,
    criteria_id,
    population_role,
    qdm_datatype,
    fhir_resource_type,
    qicore_profile,
    code_filter_path,
    value_set_oid,
    direct_code_system,
    direct_code
  )
);

CREATE INDEX IF NOT EXISTS idx_mdc_measure_role
  ON phm_edw.measure_data_criteria (measure_code, population_role);

CREATE INDEX IF NOT EXISTS idx_mdc_measure_resource
  ON phm_edw.measure_data_criteria (measure_code, fhir_resource_type, qdm_datatype);

CREATE INDEX IF NOT EXISTS idx_mdc_value_set
  ON phm_edw.measure_data_criteria (value_set_oid);

CREATE INDEX IF NOT EXISTS idx_mdc_artifact
  ON phm_edw.measure_data_criteria (measure_artifact_id, criteria_id);

CREATE INDEX IF NOT EXISTS idx_mdc_measure_value_set_role
  ON phm_edw.measure_data_criteria (measure_id, value_set_oid, population_role)
  WHERE value_set_oid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mdc_direct_code
  ON phm_edw.measure_data_criteria (direct_code_system, direct_code)
  WHERE direct_code IS NOT NULL;

COMMENT ON TABLE phm_edw.measure_data_criteria IS
  'Executable measure data criteria extracted from packaged FHIR Measure/Library artifacts. Links QI-Core data requirements to QDM datatypes, VSAC value sets, and direct codes for analytics lineage.';
COMMENT ON COLUMN phm_edw.measure_data_criteria.population_role IS
  'Population role only when the artifact safely ties a criterion to a population expression. FHIR Library.dataRequirement rows default to unclassified until ELM traversal resolves role membership.';
COMMENT ON COLUMN phm_edw.measure_data_criteria.criteria_payload IS
  'Raw and derived parser metadata, including Measure population expressions and selected ELM statement metadata used to audit extraction.';
COMMENT ON COLUMN phm_edw.measure_data_criteria.source_method IS
  'Extraction method such as fhir_library_data_requirement or elm_retrieve_traversal.';
