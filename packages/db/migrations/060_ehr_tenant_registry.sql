-- =============================================================================
-- 060: EHR tenant registry
-- Stores vendor-neutral EHR site metadata, SMART/FHIR client registrations, and
-- captured capability metadata for Epic, Oracle Cerner, SMART generic, HAPI,
-- and other FHIR-capable environments.
-- Additive: three new tables in phm_edw.
-- =============================================================================

CREATE TABLE phm_edw.ehr_tenant (
  id                BIGSERIAL PRIMARY KEY,
  org_id            INTEGER,
  vendor            VARCHAR(40) NOT NULL,
  name              VARCHAR(200) NOT NULL,
  environment       VARCHAR(40) NOT NULL,
  fhir_base_url     TEXT NOT NULL,
  smart_config_url  TEXT,
  issuer            TEXT,
  audience          TEXT,
  status            VARCHAR(40) NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ehr_tenant_vendor CHECK (vendor IN ('epic', 'oracle_cerner', 'smart_generic', 'hapi', 'other')),
  CONSTRAINT ck_ehr_tenant_environment CHECK (environment IN ('sandbox', 'staging', 'production')),
  CONSTRAINT ck_ehr_tenant_fhir_base_url CHECK (length(trim(fhir_base_url)) > 0)
);

CREATE INDEX idx_ehr_tenant_vendor_env_status
  ON phm_edw.ehr_tenant (vendor, environment, status);

COMMENT ON TABLE phm_edw.ehr_tenant IS
  'Vendor-neutral registry of each customer EHR/FHIR environment and operational status.';
COMMENT ON COLUMN phm_edw.ehr_tenant.org_id IS
  'Optional Medgnosis organization/customer identifier for the EHR tenant.';
COMMENT ON COLUMN phm_edw.ehr_tenant.fhir_base_url IS
  'FHIR R4 base URL for the EHR tenant environment.';
COMMENT ON COLUMN phm_edw.ehr_tenant.smart_config_url IS
  'SMART well-known configuration URL, when discovered or explicitly configured.';
COMMENT ON COLUMN phm_edw.ehr_tenant.status IS
  'Operational status for onboarding and production readiness, for example draft, testing, active, paused, or retired.';

CREATE TABLE phm_edw.ehr_client_registration (
  id                 BIGSERIAL PRIMARY KEY,
  ehr_tenant_id      BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id),
  client_type        VARCHAR(40) NOT NULL,
  client_id          VARCHAR(300) NOT NULL,
  client_secret_ref  TEXT,
  jwks_url           TEXT,
  private_key_ref    TEXT,
  redirect_uris      JSONB NOT NULL DEFAULT '[]'::jsonb,
  launch_url         TEXT,
  scopes_requested   TEXT NOT NULL DEFAULT '',
  scopes_granted     TEXT NOT NULL DEFAULT '',
  enabled            BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ehr_client_registration_type CHECK (client_type IN ('smart_launch', 'backend_services', 'cds_hooks')),
  CONSTRAINT ck_ehr_client_registration_redirect_uris CHECK (jsonb_typeof(redirect_uris) = 'array'),
  CONSTRAINT uq_ehr_client_registration_tenant_type UNIQUE (ehr_tenant_id, client_type)
);

CREATE INDEX idx_ehr_client_registration_tenant_type
  ON phm_edw.ehr_client_registration (ehr_tenant_id, client_type);

COMMENT ON TABLE phm_edw.ehr_client_registration IS
  'Per-tenant SMART/CDS client registration metadata. Secret and private-key values are stored by reference only.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.client_secret_ref IS
  'Secret-manager reference for the client secret; raw secrets must not be stored in this table.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.private_key_ref IS
  'Secret-manager reference for backend-services private key material; raw private keys must not be stored in this table.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.redirect_uris IS
  'Registered SMART redirect URIs for launch/standalone OAuth flows.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.scopes_requested IS
  'Least-privilege scopes requested during EHR app registration.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.scopes_granted IS
  'Scopes actually granted by the EHR tenant registration.';

CREATE TABLE phm_edw.ehr_capability_snapshot (
  id                    BIGSERIAL PRIMARY KEY,
  ehr_tenant_id         BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id),
  smart_configuration   JSONB,
  capability_statement  JSONB,
  resource_support      JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ehr_capability_snapshot_resource_support CHECK (jsonb_typeof(resource_support) = 'object')
);

CREATE INDEX idx_ehr_capability_snapshot_tenant_captured
  ON phm_edw.ehr_capability_snapshot (ehr_tenant_id, captured_at DESC);

COMMENT ON TABLE phm_edw.ehr_capability_snapshot IS
  'Point-in-time SMART configuration, FHIR CapabilityStatement, and normalized resource-support summary per EHR tenant.';
COMMENT ON COLUMN phm_edw.ehr_capability_snapshot.smart_configuration IS
  'Raw SMART well-known configuration response captured for tenant onboarding and drift checks.';
COMMENT ON COLUMN phm_edw.ehr_capability_snapshot.capability_statement IS
  'Raw FHIR CapabilityStatement captured from the tenant FHIR server.';
COMMENT ON COLUMN phm_edw.ehr_capability_snapshot.resource_support IS
  'Normalized per-resource support map derived from the CapabilityStatement.';
