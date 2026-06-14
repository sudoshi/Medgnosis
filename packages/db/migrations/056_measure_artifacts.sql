-- =============================================================================
-- 056: Measure artifact binding (measure_code <-> FHIR Measure/Library)
-- Binds a Medgnosis measure to its executable FHIR artifacts, eCQM version,
-- reporting period, and VSAC version pins — the provenance behind a measure
-- dossier and the engine Measure id the CQL evaluator targets.
-- Additive: one new table; touches no existing data.
-- =============================================================================

CREATE TABLE phm_edw.measure_artifact (
  id                     BIGSERIAL PRIMARY KEY,
  measure_code           VARCHAR(120) NOT NULL,
  ecqm_id                VARCHAR(200),          -- engine Measure id (e.g. CMS122FHIR...)
  ecqm_version           VARCHAR(50),           -- e.g. CMSxxxvN
  fhir_measure_url       VARCHAR(500),          -- canonical Measure url
  fhir_library_url       VARCHAR(500),          -- canonical primary Library url
  reporting_period_start DATE,
  reporting_period_end   DATE,
  vsac_version_pins       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {oid: version}
  status                 VARCHAR(20) NOT NULL DEFAULT 'active', -- CRMI: draft|active|retired
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_measure_artifact UNIQUE (measure_code, reporting_period_start)
);

CREATE INDEX idx_measure_artifact_code ON phm_edw.measure_artifact (measure_code);

COMMENT ON TABLE phm_edw.measure_artifact IS
  'Binds a measure_code to its executable FHIR Measure/Library, eCQM version, reporting period, and VSAC version pins (measure dossier provenance).';
