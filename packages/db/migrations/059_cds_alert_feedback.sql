-- =============================================================================
-- 059: CDS Hooks 2.0.1 alert-feedback (closed feedback loop)
-- Persists per-card accepted/overridden outcomes + overrideReason +
-- outcomeTimestamp from POST /cds-services/{id}/feedback. Backs the per-service
-- override-rate signal behind the open alert-burden dashboard (Phase 3).
-- Additive: one new table.
-- =============================================================================

CREATE TABLE phm_edw.cds_alert_feedback (
  id                      BIGSERIAL PRIMARY KEY,
  service_id              VARCHAR(120) NOT NULL,
  card_uuid               VARCHAR(120) NOT NULL,
  hook_instance           VARCHAR(120),
  patient_id              INTEGER,
  outcome                 VARCHAR(20) NOT NULL,   -- accepted | overridden
  override_reason_key     VARCHAR(120),
  override_reason_display  VARCHAR(200),
  override_comment        VARCHAR(1000),
  accepted_suggestion_id  VARCHAR(120),
  outcome_timestamp       TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_cds_feedback_outcome CHECK (outcome IN ('accepted', 'overridden'))
);

CREATE INDEX idx_cds_feedback_service ON phm_edw.cds_alert_feedback (service_id, outcome, created_at DESC);

COMMENT ON TABLE phm_edw.cds_alert_feedback IS
  'CDS Hooks 2.0.1 feedback loop: per-card accepted/overridden outcomes + overrideReason, aggregated into the alert-burden dashboard (Phase 3).';
