-- =============================================================================
-- Migration 093 - Measure semantic drift review workflow
-- Adds review-state lifecycle, an assignee, and a threaded comment trail on top
-- of the patient-level semantic drift worklist (migration 078). This lets the
-- measure-governance review board triage SQL-vs-CQL drift rows (open ->
-- in_review -> resolved/accepted/dismissed) and capture reviewer rationale.
-- Comments store free text and are NOT exposed to the audit trail (audit logs
-- record only comment length, never the body) to keep PHI out of compliance logs.
-- =============================================================================

ALTER TABLE phm_edw.measure_semantic_drift_patient
  ADD COLUMN IF NOT EXISTS review_state      VARCHAR(40) NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS assignee_user_id  UUID,
  ADD COLUMN IF NOT EXISTS review_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_updated_by UUID;

-- Constraint added separately so a re-run does not fail on an existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_msdp_review_state'
      AND conrelid = 'phm_edw.measure_semantic_drift_patient'::regclass
  ) THEN
    ALTER TABLE phm_edw.measure_semantic_drift_patient
      ADD CONSTRAINT ck_msdp_review_state
        CHECK (review_state IN ('open', 'in_review', 'resolved', 'accepted', 'dismissed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_msdp_review_state
  ON phm_edw.measure_semantic_drift_patient (review_state);

CREATE INDEX IF NOT EXISTS idx_msdp_assignee
  ON phm_edw.measure_semantic_drift_patient (assignee_user_id)
  WHERE assignee_user_id IS NOT NULL;

COMMENT ON COLUMN phm_edw.measure_semantic_drift_patient.review_state IS
  'Review lifecycle state for this drift row: open, in_review, resolved, accepted, or dismissed.';
COMMENT ON COLUMN phm_edw.measure_semantic_drift_patient.assignee_user_id IS
  'app_users.id of the reviewer currently assigned this drift row, or NULL when unassigned.';

CREATE TABLE IF NOT EXISTS phm_edw.measure_drift_comment (
  id                 BIGSERIAL PRIMARY KEY,
  drift_patient_id   BIGINT NOT NULL
                       REFERENCES phm_edw.measure_semantic_drift_patient(id) ON DELETE CASCADE,
  author_user_id     UUID,
  body               TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_mdc_body CHECK (length(trim(body)) > 0 AND length(body) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_mdc_drift_patient
  ON phm_edw.measure_drift_comment (drift_patient_id, created_at);

COMMENT ON TABLE phm_edw.measure_drift_comment IS
  'Threaded reviewer comments for a semantic drift patient row. Bodies are free text and are excluded from the audit trail (only comment length is audited) to avoid leaking PHI into compliance logs.';
COMMENT ON COLUMN phm_edw.measure_drift_comment.author_user_id IS
  'app_users.id of the comment author, captured from the authenticated request actor.';
