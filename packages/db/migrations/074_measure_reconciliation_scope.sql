-- =============================================================================
-- 074: Measure reconciliation scope provenance
-- Prevents scoped sidecar evaluations from being promoted as full-population
-- agreement, and records the optional persisted CQL MeasureReport used by a
-- reconciliation run.
-- =============================================================================

ALTER TABLE phm_edw.measure_reconciliation_run
  ADD COLUMN IF NOT EXISTS evaluation_scope VARCHAR(40) NOT NULL DEFAULT 'full_population',
  ADD COLUMN IF NOT EXISTS scope_patient_ids INTEGER[],
  ADD COLUMN IF NOT EXISTS scope_patient_refs TEXT[],
  ADD COLUMN IF NOT EXISTS promotion_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cql_measure_report_id BIGINT REFERENCES phm_edw.measure_report(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_mrr_evaluation_scope'
  ) THEN
    ALTER TABLE phm_edw.measure_reconciliation_run
      ADD CONSTRAINT ck_mrr_evaluation_scope
      CHECK (evaluation_scope IN ('full_population', 'scoped_subjects'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_mrr_scoped_not_promotion_eligible'
  ) THEN
    ALTER TABLE phm_edw.measure_reconciliation_run
      ADD CONSTRAINT ck_mrr_scoped_not_promotion_eligible
      CHECK (evaluation_scope = 'full_population' OR promotion_eligible = FALSE);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mrr_scope
  ON phm_edw.measure_reconciliation_run (evaluation_scope, promotion_eligible, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrr_cql_measure_report
  ON phm_edw.measure_reconciliation_run (cql_measure_report_id);

COMMENT ON COLUMN phm_edw.measure_reconciliation_run.evaluation_scope IS
  'full_population means the sidecar was evaluated as a complete measure population; scoped_subjects means a bounded patient/event subset and is never authoritative-promotion eligible.';
COMMENT ON COLUMN phm_edw.measure_reconciliation_run.scope_patient_ids IS
  'Patient ids used for a scoped reconciliation run, when applicable.';
COMMENT ON COLUMN phm_edw.measure_reconciliation_run.scope_patient_refs IS
  'FHIR Patient references used for a scoped reconciliation run, when applicable.';
COMMENT ON COLUMN phm_edw.measure_reconciliation_run.promotion_eligible IS
  'Whether this reconciliation run can be considered by CQL-authoritative promotion guards.';
COMMENT ON COLUMN phm_edw.measure_reconciliation_run.cql_measure_report_id IS
  'Persisted CQL population MeasureReport used to produce the CQL counts for this reconciliation run, when known.';
