-- =============================================================================
-- 063: EHR ingest run tracking and staged FHIR resource identity
-- Tracks inbound EHR/FHIR ingestion runs and strengthens the raw staging table
-- created in 061 with tenant/org identity, source-version metadata, hashes,
-- processing status, and replayable error details.
-- Additive: one new table plus columns/indexes/constraints on fhir_ingest_staging.
-- =============================================================================

CREATE TABLE phm_edw.ehr_ingest_run (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              INTEGER,
  ehr_tenant_id       BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id),
  resource_type       VARCHAR(80),
  mode                VARCHAR(40) NOT NULL DEFAULT 'incremental',
  status              VARCHAR(40) NOT NULL DEFAULT 'running',
  requested_since     TIMESTAMPTZ,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMPTZ,
  resources_received  INTEGER NOT NULL DEFAULT 0,
  resources_staged    INTEGER NOT NULL DEFAULT 0,
  resources_updated   INTEGER NOT NULL DEFAULT 0,
  error_count         INTEGER NOT NULL DEFAULT 0,
  error_message       TEXT,
  errors              JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ehr_ingest_run_mode CHECK (mode IN ('incremental', 'backfill', 'bulk', 'manual')),
  CONSTRAINT ck_ehr_ingest_run_status CHECK (status IN ('running', 'succeeded', 'failed', 'canceled')),
  CONSTRAINT ck_ehr_ingest_run_resource_type CHECK (resource_type IS NULL OR length(trim(resource_type)) > 0),
  CONSTRAINT ck_ehr_ingest_run_finished_at CHECK (finished_at IS NULL OR finished_at >= started_at),
  CONSTRAINT ck_ehr_ingest_run_counts CHECK (
    resources_received >= 0
    AND resources_staged >= 0
    AND resources_updated >= 0
    AND error_count >= 0
  ),
  CONSTRAINT ck_ehr_ingest_run_errors CHECK (jsonb_typeof(errors) = 'array'),
  CONSTRAINT ck_ehr_ingest_run_metadata CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_ehr_ingest_run_tenant_status_started
  ON phm_edw.ehr_ingest_run (ehr_tenant_id, status, started_at DESC);

CREATE INDEX idx_ehr_ingest_run_org_resource_started
  ON phm_edw.ehr_ingest_run (org_id, resource_type, started_at DESC);

COMMENT ON TABLE phm_edw.ehr_ingest_run IS
  'Inbound EHR/FHIR ingestion run ledger with tenant/org scope, run status, counters, and replayable error details.';
COMMENT ON COLUMN phm_edw.ehr_ingest_run.resource_type IS
  'FHIR resource type for a single-resource ingest run; NULL when a run spans multiple resource types.';
COMMENT ON COLUMN phm_edw.ehr_ingest_run.requested_since IS
  'Optional source _lastUpdated lower bound or equivalent cursor timestamp requested for the run.';
COMMENT ON COLUMN phm_edw.ehr_ingest_run.resources_received IS
  'Number of FHIR resources received from the source system during this run.';
COMMENT ON COLUMN phm_edw.ehr_ingest_run.resources_staged IS
  'Number of resources written or refreshed in raw FHIR staging.';
COMMENT ON COLUMN phm_edw.ehr_ingest_run.resources_updated IS
  'Number of staged resources whose source payload or metadata changed during this run.';
COMMENT ON COLUMN phm_edw.ehr_ingest_run.errors IS
  'Array of structured ingestion errors captured for operator triage and replay.';
COMMENT ON COLUMN phm_edw.ehr_ingest_run.metadata IS
  'Connector-specific run metadata such as page counts, search params, or source cursors.';

ALTER TABLE phm_edw.fhir_ingest_staging
  ADD COLUMN IF NOT EXISTS org_id INTEGER,
  ADD COLUMN IF NOT EXISTS source_version_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'staged',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE phm_edw.fhir_ingest_staging
  ADD CONSTRAINT fk_fhir_ingest_staging_run
    FOREIGN KEY (ingest_run_id) REFERENCES phm_edw.ehr_ingest_run(id),
  ADD CONSTRAINT ck_fhir_ingest_staging_status
    CHECK (status IN ('staged', 'normalized', 'failed', 'skipped')),
  ADD CONSTRAINT ck_fhir_ingest_staging_content_hash
    CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT ck_fhir_ingest_staging_errors
    CHECK (jsonb_typeof(errors) = 'array'),
  ADD CONSTRAINT uq_fhir_ingest_staging_source_identity
    UNIQUE NULLS NOT DISTINCT (
      org_id,
      ehr_tenant_id,
      resource_type,
      resource_id,
      source_version_id,
      source_last_updated,
      content_hash
    );

CREATE INDEX idx_fhir_ingest_staging_org_status_received
  ON phm_edw.fhir_ingest_staging (org_id, status, received_at DESC);

CREATE INDEX idx_fhir_ingest_staging_tenant_hash
  ON phm_edw.fhir_ingest_staging (ehr_tenant_id, resource_type, content_hash);

CREATE INDEX idx_fhir_ingest_staging_run_status
  ON phm_edw.fhir_ingest_staging (ingest_run_id, status);

COMMENT ON COLUMN phm_edw.fhir_ingest_staging.org_id IS
  'Medgnosis organization/customer identifier associated with the source EHR tenant.';
COMMENT ON COLUMN phm_edw.fhir_ingest_staging.source_version_id IS
  'FHIR meta.versionId from the source resource when supplied by the EHR.';
COMMENT ON COLUMN phm_edw.fhir_ingest_staging.content_hash IS
  'Stable SHA-256 hash of canonical source FHIR resource JSON used for idempotent staging and change detection.';
COMMENT ON COLUMN phm_edw.fhir_ingest_staging.status IS
  'Raw staging lifecycle status: staged, normalized, failed, or skipped.';
COMMENT ON COLUMN phm_edw.fhir_ingest_staging.error_message IS
  'Latest staging or normalization error summary for this resource version.';
COMMENT ON COLUMN phm_edw.fhir_ingest_staging.errors IS
  'Array of structured staging or normalization errors retained for replay and data-quality review.';
