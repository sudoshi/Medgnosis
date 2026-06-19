-- =============================================================================
-- 086: EHR Bulk Data tenant schedules
-- Defines tenant-scoped recurring Bulk Data exports and PHI-safe schedule state.
-- Raw bearer tokens and downloaded NDJSON payloads are intentionally excluded.
-- =============================================================================

CREATE TABLE phm_edw.ehr_bulk_schedule (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 INTEGER,
  ehr_tenant_id          BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id) ON DELETE CASCADE,
  enabled                BOOLEAN NOT NULL DEFAULT TRUE,
  export_level           VARCHAR(20) NOT NULL,
  group_id               TEXT,
  patient_id             TEXT,
  resource_types         TEXT[] NOT NULL DEFAULT '{}',
  since_mode             VARCHAR(20) NOT NULL DEFAULT 'last_success',
  since                  TIMESTAMPTZ,
  type_filters           JSONB NOT NULL DEFAULT '[]'::jsonb,
  interval_minutes       INTEGER NOT NULL DEFAULT 1440,
  max_resources_per_file INTEGER,
  last_enqueued_at       TIMESTAMPTZ,
  last_queue_job_id      TEXT,
  last_bulk_job_id       UUID REFERENCES phm_edw.ehr_bulk_job(id) ON DELETE SET NULL,
  last_success_at        TIMESTAMPTZ,
  last_failure_at        TIMESTAMPTZ,
  last_error             JSONB,
  next_run_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ehr_bulk_schedule_export_level CHECK (export_level IN ('system', 'group', 'patient')),
  CONSTRAINT ck_ehr_bulk_schedule_target CHECK (
    (export_level = 'system' AND group_id IS NULL AND patient_id IS NULL)
    OR (export_level = 'group' AND group_id IS NOT NULL AND patient_id IS NULL)
    OR (export_level = 'patient' AND patient_id IS NOT NULL AND group_id IS NULL)
  ),
  CONSTRAINT ck_ehr_bulk_schedule_resource_types CHECK (cardinality(resource_types) > 0),
  CONSTRAINT ck_ehr_bulk_schedule_since_mode CHECK (since_mode IN ('none', 'fixed', 'last_success')),
  CONSTRAINT ck_ehr_bulk_schedule_fixed_since CHECK (since_mode <> 'fixed' OR since IS NOT NULL),
  CONSTRAINT ck_ehr_bulk_schedule_type_filters CHECK (jsonb_typeof(type_filters) = 'array'),
  CONSTRAINT ck_ehr_bulk_schedule_interval CHECK (interval_minutes BETWEEN 15 AND 525600),
  CONSTRAINT ck_ehr_bulk_schedule_max_file CHECK (
    max_resources_per_file IS NULL OR max_resources_per_file > 0
  ),
  CONSTRAINT ck_ehr_bulk_schedule_last_error CHECK (last_error IS NULL OR jsonb_typeof(last_error) = 'object'),
  CONSTRAINT ck_ehr_bulk_schedule_metadata CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_ehr_bulk_schedule_due
  ON phm_edw.ehr_bulk_schedule (enabled, next_run_at)
  WHERE enabled = TRUE;

CREATE INDEX idx_ehr_bulk_schedule_tenant_enabled
  ON phm_edw.ehr_bulk_schedule (ehr_tenant_id, enabled, next_run_at);

COMMENT ON TABLE phm_edw.ehr_bulk_schedule IS
  'Tenant-scoped recurring SMART Bulk Data export schedules with PHI-safe operational state.';
COMMENT ON COLUMN phm_edw.ehr_bulk_schedule.since_mode IS
  'Controls _since generation: none omits it, fixed uses since, last_success uses last_success_at then since.';
