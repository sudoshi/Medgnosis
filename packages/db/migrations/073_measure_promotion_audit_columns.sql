-- =============================================================================
-- 073: Measure promotion audit columns
-- Records which persisted MeasureReport and actor promoted an accepted
-- reconciliation run to CQL-authoritative analytics.
-- =============================================================================

ALTER TABLE phm_edw.measure_reconciliation_run
  ADD COLUMN IF NOT EXISTS measure_report_id BIGINT REFERENCES phm_edw.measure_report(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promoted_by UUID,
  ADD COLUMN IF NOT EXISTS promotion_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_mrr_promotion_metadata_object'
  ) THEN
    ALTER TABLE phm_edw.measure_reconciliation_run
      ADD CONSTRAINT ck_mrr_promotion_metadata_object
      CHECK (jsonb_typeof(promotion_metadata) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mrr_measure_report
  ON phm_edw.measure_reconciliation_run (measure_report_id);

COMMENT ON COLUMN phm_edw.measure_reconciliation_run.measure_report_id IS
  'Persisted population MeasureReport used when this accepted reconciliation run was promoted to CQL-authoritative analytics.';
COMMENT ON COLUMN phm_edw.measure_reconciliation_run.promoted_at IS
  'Timestamp when this reconciliation run was promoted to authoritative analytics.';
COMMENT ON COLUMN phm_edw.measure_reconciliation_run.promoted_by IS
  'Application user id that promoted this reconciliation run, when available.';
COMMENT ON COLUMN phm_edw.measure_reconciliation_run.promotion_metadata IS
  'Promotion audit payload, including prior mode/source, row counts, and governance options.';
