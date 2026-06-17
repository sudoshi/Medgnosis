-- =============================================================================
-- 061: EHR resource crosswalk and FHIR ingest staging
-- Preserves source FHIR identity/provenance while staging raw resources before
-- normalization into phm_edw and phm_star models.
-- Additive: two new tables in phm_edw.
-- =============================================================================

CREATE TABLE phm_edw.ehr_resource_crosswalk (
  id                   BIGSERIAL PRIMARY KEY,
  ehr_tenant_id        BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id),
  resource_type        VARCHAR(80) NOT NULL,
  ehr_resource_id      VARCHAR(300) NOT NULL,
  ehr_identifier       JSONB NOT NULL DEFAULT '[]'::jsonb,
  local_table          VARCHAR(120),
  local_id             BIGINT,
  patient_id           INTEGER,
  source_version_id    VARCHAR(200),
  source_last_updated  TIMESTAMPTZ,
  hash                 VARCHAR(128),
  last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ehr_resource_crosswalk_identifier CHECK (jsonb_typeof(ehr_identifier) = 'array'),
  CONSTRAINT ck_ehr_resource_crosswalk_resource_type CHECK (length(trim(resource_type)) > 0),
  CONSTRAINT ck_ehr_resource_crosswalk_resource_id CHECK (length(trim(ehr_resource_id)) > 0),
  CONSTRAINT uq_ehr_resource_crosswalk_source UNIQUE (ehr_tenant_id, resource_type, ehr_resource_id)
);

CREATE INDEX idx_ehr_resource_crosswalk_patient_resource
  ON phm_edw.ehr_resource_crosswalk (ehr_tenant_id, patient_id, resource_type);

CREATE INDEX idx_ehr_resource_crosswalk_local_target
  ON phm_edw.ehr_resource_crosswalk (ehr_tenant_id, local_table, local_id);

CREATE INDEX idx_ehr_resource_crosswalk_last_seen
  ON phm_edw.ehr_resource_crosswalk (ehr_tenant_id, last_seen_at DESC);

COMMENT ON TABLE phm_edw.ehr_resource_crosswalk IS
  'Crosswalk from tenant-scoped source FHIR resource identity to local normalized EDW rows, retaining identifiers and source-version provenance.';
COMMENT ON COLUMN phm_edw.ehr_resource_crosswalk.ehr_identifier IS
  'Original FHIR identifier array or equivalent identifier summary from the source resource.';
COMMENT ON COLUMN phm_edw.ehr_resource_crosswalk.local_table IS
  'Normalized phm_edw local target table name, when the resource has been reconciled.';
COMMENT ON COLUMN phm_edw.ehr_resource_crosswalk.hash IS
  'Hash of the normalized or source payload used for change detection and reconciliation.';

CREATE TABLE phm_edw.fhir_ingest_staging (
  id                   BIGSERIAL PRIMARY KEY,
  ehr_tenant_id        BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id),
  ingest_run_id        UUID NOT NULL,
  resource_type        VARCHAR(80) NOT NULL,
  resource_id          VARCHAR(300),
  patient_ref          VARCHAR(300),
  resource             JSONB NOT NULL,
  source_last_updated  TIMESTAMPTZ,
  normalized           BOOLEAN NOT NULL DEFAULT false,
  normalization_error  TEXT,
  received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_fhir_ingest_staging_resource_type CHECK (length(trim(resource_type)) > 0),
  CONSTRAINT ck_fhir_ingest_staging_resource_object CHECK (jsonb_typeof(resource) = 'object')
);

CREATE INDEX idx_fhir_ingest_staging_run_normalized
  ON phm_edw.fhir_ingest_staging (ingest_run_id, normalized);

CREATE INDEX idx_fhir_ingest_staging_tenant_resource_updated
  ON phm_edw.fhir_ingest_staging (ehr_tenant_id, resource_type, source_last_updated);

CREATE INDEX idx_fhir_ingest_staging_tenant_patient
  ON phm_edw.fhir_ingest_staging (ehr_tenant_id, patient_ref, resource_type);

COMMENT ON TABLE phm_edw.fhir_ingest_staging IS
  'Immutable staging area for raw tenant-scoped FHIR resources before normalization into EDW tables.';
COMMENT ON COLUMN phm_edw.fhir_ingest_staging.ingest_run_id IS
  'UUID for the ingestion run that received this resource batch.';
COMMENT ON COLUMN phm_edw.fhir_ingest_staging.resource IS
  'Raw FHIR resource JSON as received from the source system.';
COMMENT ON COLUMN phm_edw.fhir_ingest_staging.normalized IS
  'Whether this staged resource has completed normalization into local models.';
COMMENT ON COLUMN phm_edw.fhir_ingest_staging.normalization_error IS
  'Last normalization error text, retained for replay and data-quality review.';
