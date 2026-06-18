-- =============================================================================
-- 070: QDM/CQL measure-result promotion contract
-- Adds provenance columns and a non-SQL natural key to fact_measure_result so
-- bounded CQL MeasureReport evidence can be promoted into the star model without
-- changing the existing SQL bundle refresh grain.
-- =============================================================================

ALTER TABLE phm_star.fact_measure_result
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'sql_bundle',
  ADD COLUMN IF NOT EXISTS evaluation_scope VARCHAR(40) NOT NULL DEFAULT 'full_population',
  ADD COLUMN IF NOT EXISTS measure_report_id BIGINT,
  ADD COLUMN IF NOT EXISTS measure_report_evidence_id BIGINT,
  ADD COLUMN IF NOT EXISTS qdm_run_id UUID,
  ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(40) NOT NULL DEFAULT 'authoritative',
  ADD COLUMN IF NOT EXISTS reconciliation_delta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;

UPDATE phm_star.fact_measure_result
SET source = 'sql_bundle'
WHERE source IS NULL OR length(trim(source)) = 0;

UPDATE phm_star.fact_measure_result
SET evaluation_scope = 'full_population'
WHERE evaluation_scope IS NULL OR length(trim(evaluation_scope)) = 0;

UPDATE phm_star.fact_measure_result
SET reconciliation_status = 'authoritative'
WHERE reconciliation_status IS NULL OR length(trim(reconciliation_status)) = 0;

UPDATE phm_star.fact_measure_result
SET promoted_at = NOW()
WHERE promoted_at IS NULL
  AND source <> 'sql_bundle';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fmr_source_nonempty'
  ) THEN
    ALTER TABLE phm_star.fact_measure_result
      ADD CONSTRAINT ck_fmr_source_nonempty CHECK (length(trim(source)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fmr_reconciliation_delta_object'
  ) THEN
    ALTER TABLE phm_star.fact_measure_result
      ADD CONSTRAINT ck_fmr_reconciliation_delta_object
      CHECK (jsonb_typeof(reconciliation_delta) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fmr_evaluation_scope_nonempty'
  ) THEN
    ALTER TABLE phm_star.fact_measure_result
      ADD CONSTRAINT ck_fmr_evaluation_scope_nonempty CHECK (length(trim(evaluation_scope)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fmr_reconciliation_status_nonempty'
  ) THEN
    ALTER TABLE phm_star.fact_measure_result
      ADD CONSTRAINT ck_fmr_reconciliation_status_nonempty CHECK (length(trim(reconciliation_status)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_fmr_measure_report'
  ) THEN
    ALTER TABLE phm_star.fact_measure_result
      ADD CONSTRAINT fk_fmr_measure_report
      FOREIGN KEY (measure_report_id)
      REFERENCES phm_edw.measure_report(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_fmr_measure_report_evidence'
  ) THEN
    ALTER TABLE phm_star.fact_measure_result
      ADD CONSTRAINT fk_fmr_measure_report_evidence
      FOREIGN KEY (measure_report_evidence_id)
      REFERENCES phm_edw.measure_report_evidence(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fmr_patient_measure_period_non_sql_source
  ON phm_star.fact_measure_result (patient_key, measure_key, date_key_period, source, evaluation_scope)
  WHERE source <> 'sql_bundle';

CREATE INDEX IF NOT EXISTS idx_fmr_source_measure
  ON phm_star.fact_measure_result (source, evaluation_scope, reconciliation_status, measure_key, date_key_period);

CREATE INDEX IF NOT EXISTS idx_fmr_patient_measure
  ON phm_star.fact_measure_result (patient_key, measure_key);

CREATE INDEX IF NOT EXISTS idx_fmr_measure_period
  ON phm_star.fact_measure_result (measure_key, date_key_period);

CREATE INDEX IF NOT EXISTS idx_fmr_measure_report
  ON phm_star.fact_measure_result (measure_report_id);

CREATE INDEX IF NOT EXISTS idx_fmr_measure_report_evidence
  ON phm_star.fact_measure_result (measure_report_evidence_id);

CREATE INDEX IF NOT EXISTS idx_fmre_report_evidence
  ON phm_star.fact_measure_result_evidence (measure_report_evidence_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fmre_result_qdm_event_role_nd
  ON phm_star.fact_measure_result_evidence (
    measure_result_key,
    qdm_event_id,
    population_role,
    evidence_role,
    population_criteria_id
  ) NULLS NOT DISTINCT
  WHERE qdm_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fmre_result_report_evidence_role_nd
  ON phm_star.fact_measure_result_evidence (
    measure_result_key,
    measure_report_evidence_id,
    population_role,
    evidence_role,
    population_criteria_id
  ) NULLS NOT DISTINCT
  WHERE measure_report_evidence_id IS NOT NULL;

COMMENT ON COLUMN phm_star.fact_measure_result.source IS
  'Origin of the measure result row. Existing SQL bundle refresh rows use sql_bundle; promoted CQL/QDM rows use a non-sql source and are protected by a partial natural key.';
COMMENT ON COLUMN phm_star.fact_measure_result.evaluation_scope IS
  'Evaluation scope for this result. Default SQL analytics use full_population; bounded CQL shadow rows use scoped_subjects until promoted.';
COMMENT ON COLUMN phm_star.fact_measure_result.measure_report_id IS
  'FHIR MeasureReport aggregate row that produced this promoted measure result, when source is CQL/QDM.';
COMMENT ON COLUMN phm_star.fact_measure_result.measure_report_evidence_id IS
  'Patient-level MeasureReport evidence row that produced this promoted measure result.';
COMMENT ON COLUMN phm_star.fact_measure_result.qdm_run_id IS
  'Optional run identifier for a bounded QDM/CQL promotion batch.';
COMMENT ON COLUMN phm_star.fact_measure_result.reconciliation_status IS
  'SQL-vs-CQL reconciliation status. Existing SQL rows default to authoritative; bounded CQL rows should start as shadow_pending or cql_shadow.';
COMMENT ON COLUMN phm_star.fact_measure_result.reconciliation_delta IS
  'Optional evaluator-specific reconciliation delta payload. JSON object by constraint.';
COMMENT ON COLUMN phm_star.fact_measure_result.promoted_at IS
  'Timestamp when a non-SQL result was promoted into the star fact.';
