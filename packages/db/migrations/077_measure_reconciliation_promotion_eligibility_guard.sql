-- =============================================================================
-- 077: Reconciliation promotion eligibility guard
-- A reconciliation row is promotion eligible only when it is full-population,
-- accepted, and linked to the CQL MeasureReport that produced the accepted
-- counts. Drift rows remain useful evidence, but cannot be promotion candidates.
-- =============================================================================

UPDATE phm_edw.measure_reconciliation_run
SET
  promotion_eligible = FALSE,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'promotionEligibilityReset', 'not_accepted_full_population_with_report'
  )
WHERE promotion_eligible = TRUE
  AND (
    evaluation_scope <> 'full_population'
    OR agree IS DISTINCT FROM TRUE
    OR status <> 'agree'
    OR cql_measure_report_id IS NULL
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_mrr_promotion_eligible_requires_accepted_report'
  ) THEN
    ALTER TABLE phm_edw.measure_reconciliation_run
      ADD CONSTRAINT ck_mrr_promotion_eligible_requires_accepted_report
      CHECK (
        promotion_eligible = FALSE
        OR (
          evaluation_scope = 'full_population'
          AND agree = TRUE
          AND status = 'agree'
          AND cql_measure_report_id IS NOT NULL
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN phm_edw.measure_reconciliation_run.promotion_eligible IS
  'Whether this reconciliation run can be considered by CQL-authoritative promotion guards. True only for accepted full-population runs linked to the persisted CQL MeasureReport.';
