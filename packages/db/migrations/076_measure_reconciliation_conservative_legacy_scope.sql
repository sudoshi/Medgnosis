-- =============================================================================
-- 076: Conservative legacy reconciliation eligibility
-- Migration 074 introduced first-class reconciliation scope provenance. Rows
-- that existed before that migration have no linked CQL MeasureReport
-- provenance, so they must not be eligible for authoritative promotion by
-- default.
-- =============================================================================

ALTER TABLE phm_edw.measure_reconciliation_run
  ALTER COLUMN promotion_eligible SET DEFAULT FALSE;

UPDATE phm_edw.measure_reconciliation_run
SET
  promotion_eligible = FALSE,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'promotionEligibilityReset', 'legacy_unlinked_measure_report'
  )
WHERE promotion_eligible = TRUE
  AND cql_measure_report_id IS NULL
  AND promoted_at IS NULL;

COMMENT ON COLUMN phm_edw.measure_reconciliation_run.promotion_eligible IS
  'Whether this reconciliation run can be considered by CQL-authoritative promotion guards. Defaults false; full-population runs must opt in explicitly with linked provenance.';
