-- =============================================================================
-- 079: QDM bridge operational ledger
-- Adds PHI-safe run and issue ledgers for QDM/FHIR/CQL bridge refreshes, semantic
-- drift review, and scheduled shadow analytics. Raw FHIR/QDM payloads remain in
-- their evidence tables and are not duplicated here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS phm_edw.qdm_bridge_run (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation                VARCHAR(60) NOT NULL,
  measure_code             VARCHAR(120),
  period_start             DATE,
  period_end               DATE,
  status                   VARCHAR(30) NOT NULL DEFAULT 'running',
  trigger_source           VARCHAR(40) NOT NULL DEFAULT 'manual',
  started_by               UUID,
  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at             TIMESTAMPTZ,
  duration_ms              INTEGER,
  qdm_events_loaded        INTEGER,
  patients_selected        INTEGER,
  evidence_rows_persisted  INTEGER,
  measure_report_id        BIGINT REFERENCES phm_edw.measure_report(id) ON DELETE SET NULL,
  reconciliation_run_id    BIGINT REFERENCES phm_edw.measure_reconciliation_run(id) ON DELETE SET NULL,
  semantic_drift_dossier_id BIGINT REFERENCES phm_edw.measure_semantic_drift_dossier(id) ON DELETE SET NULL,
  result                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  error                    JSONB,
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_qbr_operation CHECK (operation IN (
    'normalization',
    'cql_shadow_refresh',
    'star_refresh',
    'reconciliation',
    'semantic_drift_dossier',
    'promotion_validation',
    'manual_review'
  )),
  CONSTRAINT ck_qbr_status CHECK (status IN ('running', 'completed', 'failed', 'canceled')),
  CONSTRAINT ck_qbr_trigger_source CHECK (trigger_source IN ('manual', 'scheduled', 'script', 'admin', 'test')),
  CONSTRAINT ck_qbr_period CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start),
  CONSTRAINT ck_qbr_duration CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT ck_qbr_qdm_events CHECK (qdm_events_loaded IS NULL OR qdm_events_loaded >= 0),
  CONSTRAINT ck_qbr_patients CHECK (patients_selected IS NULL OR patients_selected >= 0),
  CONSTRAINT ck_qbr_evidence_rows CHECK (evidence_rows_persisted IS NULL OR evidence_rows_persisted >= 0),
  CONSTRAINT ck_qbr_result_object CHECK (jsonb_typeof(result) = 'object'),
  CONSTRAINT ck_qbr_error_object CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  CONSTRAINT ck_qbr_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT ck_qbr_completed_status CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status <> 'running' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_qbr_measure_started
  ON phm_edw.qdm_bridge_run (measure_code, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_qbr_operation_status_started
  ON phm_edw.qdm_bridge_run (operation, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_qbr_status_started
  ON phm_edw.qdm_bridge_run (status, started_at DESC);

COMMENT ON TABLE phm_edw.qdm_bridge_run IS
  'Operational run ledger for FHIR/QDM/CQL bridge refreshes, shadow measure runs, reconciliations, drift dossiers, and promotion validation.';
COMMENT ON COLUMN phm_edw.qdm_bridge_run.result IS
  'PHI-safe aggregate result payload for the run. Raw patient evidence remains in measure_report_evidence and dossier detail routes.';

CREATE TABLE IF NOT EXISTS phm_edw.qdm_bridge_issue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID REFERENCES phm_edw.qdm_bridge_run(id) ON DELETE SET NULL,
  issue_type            VARCHAR(80) NOT NULL,
  severity              VARCHAR(20) NOT NULL DEFAULT 'warning',
  status                VARCHAR(30) NOT NULL DEFAULT 'open',
  measure_code          VARCHAR(120),
  patient_id            INTEGER,
  patient_ref           VARCHAR(300),
  qdm_event_id          BIGINT REFERENCES phm_edw.qdm_event(qdm_event_id) ON DELETE SET NULL,
  source_table          VARCHAR(160),
  source_id             BIGINT,
  message               TEXT NOT NULL,
  details               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID,
  CONSTRAINT ck_qbi_issue_type CHECK (length(trim(issue_type)) > 0),
  CONSTRAINT ck_qbi_severity CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  CONSTRAINT ck_qbi_status CHECK (status IN ('open', 'acknowledged', 'resolved', 'suppressed')),
  CONSTRAINT ck_qbi_message CHECK (length(trim(message)) > 0),
  CONSTRAINT ck_qbi_details_object CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT ck_qbi_resolution_status CHECK (
    (status IN ('resolved', 'suppressed') AND resolved_at IS NOT NULL)
    OR (status NOT IN ('resolved', 'suppressed'))
  )
);

CREATE INDEX IF NOT EXISTS idx_qbi_run_severity_created
  ON phm_edw.qdm_bridge_issue (run_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qbi_measure_status_created
  ON phm_edw.qdm_bridge_issue (measure_code, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qbi_patient
  ON phm_edw.qdm_bridge_issue (patient_id, patient_ref);

COMMENT ON TABLE phm_edw.qdm_bridge_issue IS
  'Operational issue ledger for QDM bridge runs: unmapped codes, missing timing, missing actor, invalid units, ambiguous components, unsupported datatypes, engine failures, and drift review findings.';
COMMENT ON COLUMN phm_edw.qdm_bridge_issue.details IS
  'PHI-safe structured issue metadata. Do not store raw FHIR resources, raw QDM payloads, or full subject MeasureReports here.';

CREATE OR REPLACE VIEW phm_edw.v_qdm_bridge_operational_status AS
WITH latest_runs AS (
  SELECT DISTINCT ON (operation, COALESCE(measure_code, ''))
    operation,
    measure_code,
    id AS latest_run_id,
    status AS latest_status,
    started_at AS latest_started_at,
    completed_at AS latest_completed_at,
    result AS latest_result,
    error AS latest_error
  FROM phm_edw.qdm_bridge_run
  ORDER BY operation, COALESCE(measure_code, ''), started_at DESC, id DESC
),
open_issues AS (
  SELECT
    COALESCE(measure_code, '') AS measure_key,
    COUNT(*) FILTER (WHERE status IN ('open', 'acknowledged'))::int AS open_issue_count,
    COUNT(*) FILTER (WHERE status IN ('open', 'acknowledged') AND severity IN ('error', 'critical'))::int AS open_blocking_issue_count
  FROM phm_edw.qdm_bridge_issue
  GROUP BY COALESCE(measure_code, '')
)
SELECT
  lr.operation,
  lr.measure_code,
  lr.latest_run_id,
  lr.latest_status,
  lr.latest_started_at,
  lr.latest_completed_at,
  COALESCE(oi.open_issue_count, 0) AS open_issue_count,
  COALESCE(oi.open_blocking_issue_count, 0) AS open_blocking_issue_count,
  lr.latest_result,
  lr.latest_error
FROM latest_runs lr
LEFT JOIN open_issues oi
  ON oi.measure_key = COALESCE(lr.measure_code, '');

COMMENT ON VIEW phm_edw.v_qdm_bridge_operational_status IS
  'Latest QDM bridge run state per operation/measure with open issue counts for admin monitoring.';

CREATE OR REPLACE VIEW phm_star.v_measure_evidence_lineage AS
SELECT
  fmr.measure_result_key,
  dm.measure_code,
  dp.patient_id,
  fmr.date_key_period,
  fmr.source AS result_source,
  fmr.evaluation_scope,
  fmr.reconciliation_status,
  fmr.measure_report_id,
  fmr.measure_report_evidence_id,
  mre.source AS evidence_source,
  COALESCE(jsonb_array_length(mre.qdm_evidence), 0) AS qdm_evidence_count,
  (mre.fhir_subject_report IS NOT NULL) AS fhir_subject_report_present,
  fmr.qdm_run_id,
  fmr.promoted_at
FROM phm_star.fact_measure_result fmr
JOIN phm_star.dim_measure dm
  ON dm.measure_key = fmr.measure_key
JOIN phm_star.dim_patient dp
  ON dp.patient_key = fmr.patient_key
LEFT JOIN phm_edw.measure_report_evidence mre
  ON mre.id = fmr.measure_report_evidence_id;

COMMENT ON VIEW phm_star.v_measure_evidence_lineage IS
  'PHI-safe measure result lineage view from star facts to persisted CQL/QDM MeasureReport evidence summaries.';
