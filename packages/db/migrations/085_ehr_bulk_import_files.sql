-- =============================================================================
-- 085: EHR Bulk Data import file ledger
-- Tracks per-NDJSON-file import progress for completed SMART Bulk Data jobs.
-- The table stores file URLs and counters only; raw NDJSON payloads and bearer
-- tokens are intentionally excluded.
-- =============================================================================

CREATE TABLE phm_edw.ehr_bulk_import_file (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_job_id        UUID NOT NULL REFERENCES phm_edw.ehr_bulk_job(id) ON DELETE CASCADE,
  org_id             INTEGER,
  ehr_tenant_id      BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id),
  ingest_run_id      UUID REFERENCES phm_edw.ehr_ingest_run(id),
  resource_type      VARCHAR(80) NOT NULL,
  file_url_hash      CHAR(64) NOT NULL,
  file_url_redacted  TEXT NOT NULL,
  manifest_count     INTEGER,
  status             VARCHAR(40) NOT NULL DEFAULT 'pending',
  rows_read          INTEGER NOT NULL DEFAULT 0,
  resources_staged   INTEGER NOT NULL DEFAULT 0,
  error_count        INTEGER NOT NULL DEFAULT 0,
  error              JSONB,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ehr_bulk_import_file_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  CONSTRAINT ck_ehr_bulk_import_file_resource_type CHECK (length(trim(resource_type)) > 0),
  CONSTRAINT ck_ehr_bulk_import_file_counts CHECK (
    (manifest_count IS NULL OR manifest_count >= 0)
    AND rows_read >= 0
    AND resources_staged >= 0
    AND error_count >= 0
  ),
  CONSTRAINT ck_ehr_bulk_import_file_error CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  CONSTRAINT ck_ehr_bulk_import_file_metadata CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT uq_ehr_bulk_import_file_url_hash UNIQUE (bulk_job_id, file_url_hash)
);

CREATE INDEX idx_ehr_bulk_import_file_job_status
  ON phm_edw.ehr_bulk_import_file (bulk_job_id, status);

CREATE INDEX idx_ehr_bulk_import_file_tenant_status
  ON phm_edw.ehr_bulk_import_file (ehr_tenant_id, status, created_at DESC);

CREATE INDEX idx_ehr_bulk_import_file_ingest_run
  ON phm_edw.ehr_bulk_import_file (ingest_run_id);

COMMENT ON TABLE phm_edw.ehr_bulk_import_file IS
  'Per-file SMART Bulk Data NDJSON import ledger with PHI-safe counters and errors.';
COMMENT ON COLUMN phm_edw.ehr_bulk_import_file.file_url_hash IS
  'SHA-256 hash of the manifest output URL. The raw URL may be signed or bearer-equivalent and is not stored here.';
COMMENT ON COLUMN phm_edw.ehr_bulk_import_file.file_url_redacted IS
  'Redacted origin/hash descriptor for the manifest output URL. Query strings, fragments, and raw paths are not stored here.';
