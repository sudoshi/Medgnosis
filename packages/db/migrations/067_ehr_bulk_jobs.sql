-- =============================================================================
-- 067: EHR Bulk Data job ledger
-- Persists SMART Bulk Data kickoff/status metadata for approved tenant exports.
-- Raw bearer tokens and downloaded NDJSON payloads are intentionally excluded.
-- =============================================================================

CREATE TABLE phm_edw.ehr_bulk_job (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                INTEGER,
  ehr_tenant_id         BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id),
  ingest_run_id         UUID REFERENCES phm_edw.ehr_ingest_run(id),
  export_level          VARCHAR(20) NOT NULL,
  group_id              TEXT,
  patient_id            TEXT,
  status                VARCHAR(40) NOT NULL DEFAULT 'accepted',
  resource_types        TEXT[] NOT NULL DEFAULT '{}',
  since                 TIMESTAMPTZ,
  type_filters          JSONB NOT NULL DEFAULT '[]'::jsonb,
  request_url           TEXT NOT NULL,
  status_url            TEXT NOT NULL,
  manifest              JSONB,
  output_files          JSONB NOT NULL DEFAULT '[]'::jsonb,
  error                 JSONB,
  retry_after_seconds   INTEGER,
  poll_count            INTEGER NOT NULL DEFAULT 0,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_poll_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ehr_bulk_job_export_level CHECK (export_level IN ('system', 'group', 'patient')),
  CONSTRAINT ck_ehr_bulk_job_target CHECK (
    (export_level = 'system' AND group_id IS NULL AND patient_id IS NULL)
    OR (export_level = 'group' AND group_id IS NOT NULL AND patient_id IS NULL)
    OR (export_level = 'patient' AND patient_id IS NOT NULL AND group_id IS NULL)
  ),
  CONSTRAINT ck_ehr_bulk_job_status CHECK (status IN ('accepted', 'in_progress', 'completed', 'failed', 'canceled')),
  CONSTRAINT ck_ehr_bulk_job_resource_types CHECK (cardinality(resource_types) > 0),
  CONSTRAINT ck_ehr_bulk_job_type_filters CHECK (jsonb_typeof(type_filters) = 'array'),
  CONSTRAINT ck_ehr_bulk_job_manifest CHECK (manifest IS NULL OR jsonb_typeof(manifest) = 'object'),
  CONSTRAINT ck_ehr_bulk_job_output_files CHECK (jsonb_typeof(output_files) = 'array'),
  CONSTRAINT ck_ehr_bulk_job_error CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  CONSTRAINT ck_ehr_bulk_job_retry_after CHECK (retry_after_seconds IS NULL OR retry_after_seconds >= 0),
  CONSTRAINT ck_ehr_bulk_job_poll_count CHECK (poll_count >= 0),
  CONSTRAINT ck_ehr_bulk_job_metadata CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_ehr_bulk_job_tenant_status_requested
  ON phm_edw.ehr_bulk_job (ehr_tenant_id, status, requested_at DESC);

CREATE INDEX idx_ehr_bulk_job_org_status_requested
  ON phm_edw.ehr_bulk_job (org_id, status, requested_at DESC);

CREATE INDEX idx_ehr_bulk_job_next_poll
  ON phm_edw.ehr_bulk_job (status, next_poll_at)
  WHERE status IN ('accepted', 'in_progress');

COMMENT ON TABLE phm_edw.ehr_bulk_job IS
  'SMART Bulk Data async export job ledger with tenant scope, polling metadata, manifest summary, and PHI-safe operational state.';
COMMENT ON COLUMN phm_edw.ehr_bulk_job.status_url IS
  'Content-Location URL returned by the EHR for polling Bulk Data export status.';
COMMENT ON COLUMN phm_edw.ehr_bulk_job.output_files IS
  'Manifest output file descriptors only; downloaded NDJSON payloads are staged separately after explicit import.';
