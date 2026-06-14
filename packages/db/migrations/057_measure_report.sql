-- =============================================================================
-- 057: FHIR MeasureReport persistence + CMS122 artifact binding
-- Two additive changes:
--   1. phm_edw.measure_report — stores the FHIR MeasureReport JSONB produced by
--      the clinical-reasoning engine ($evaluate-measure) per measure + period +
--      report type, with denormalized population counts for fast rollup into
--      fact_measure_result and the measure dossier.
--   2. Seeds the measure_artifact binding for the Medgnosis EDW measure
--      'CMS122v12' (Diabetes HbA1c Poor Control >9%) to the executable QI-Core
--      FHIR Measure loaded into the sidecar in Phase 1
--      (CMS122FHIRDiabetesAssessGreaterThan9Percent, eCQM CMS122v13).
-- Touches no existing data; one new table + one upserted reference row.
-- =============================================================================

CREATE TABLE phm_edw.measure_report (
  id                     BIGSERIAL PRIMARY KEY,
  measure_code           VARCHAR(120) NOT NULL,
  period_start           DATE NOT NULL,
  period_end             DATE NOT NULL,
  report_type            VARCHAR(20) NOT NULL DEFAULT 'population', -- subject|subject-list|population
  report                 JSONB NOT NULL,        -- the FHIR MeasureReport resource
  measure_score          NUMERIC,               -- group[0].measureScore.value
  initial_population     INTEGER,
  denominator            INTEGER,
  numerator              INTEGER,
  denominator_exclusion  INTEGER,
  source                 VARCHAR(20) NOT NULL DEFAULT 'cql', -- evaluator that produced it
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_measure_report UNIQUE (measure_code, period_start, period_end, report_type)
);

CREATE INDEX idx_measure_report_code ON phm_edw.measure_report (measure_code, computed_at DESC);

COMMENT ON TABLE phm_edw.measure_report IS
  'Persisted FHIR MeasureReport (JSONB) + denormalized population counts per measure_code/period/report_type, produced by the clinical-reasoning engine via $evaluate-measure (Phase 2).';

-- CMS122 binding: Medgnosis EDW measure_code 'CMS122v12' -> executable QI-Core
-- artifact loaded in Phase 1. ecqm_version records the eCQM version (CMS122v13);
-- the EDW measure_code remains v12 (a known, dossier-surfaced version drift).
INSERT INTO phm_edw.measure_artifact
  (measure_code, ecqm_id, ecqm_version, fhir_measure_url, fhir_library_url,
   reporting_period_start, reporting_period_end, vsac_version_pins, status)
VALUES
  ('CMS122v12',
   'CMS122FHIRDiabetesAssessGreaterThan9Percent',
   'CMS122v13',
   'https://madie.cms.gov/Measure/CMS122FHIRDiabetesAssessGreaterThan9Percent',
   'https://madie.cms.gov/Library/CMS122FHIRDiabetesAssessGreaterThan9Percent',
   '2026-01-01', '2026-12-31',
   '{}'::jsonb,
   'active')
ON CONFLICT (measure_code, reporting_period_start) DO UPDATE
  SET ecqm_id              = EXCLUDED.ecqm_id,
      ecqm_version         = EXCLUDED.ecqm_version,
      fhir_measure_url     = EXCLUDED.fhir_measure_url,
      fhir_library_url     = EXCLUDED.fhir_library_url,
      reporting_period_end = EXCLUDED.reporting_period_end,
      status               = EXCLUDED.status;
