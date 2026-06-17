-- =============================================================================
-- 066: EHR workbook metadata
-- Adds vendor registration/workbook metadata to EHR client registrations.
-- This keeps the current one-client-per-type default by using client_type as the
-- default client_slot, while allowing future named slots per tenant.
-- =============================================================================

ALTER TABLE phm_edw.ehr_client_registration
  ADD COLUMN IF NOT EXISTS client_slot VARCHAR(80),
  ADD COLUMN IF NOT EXISTS auth_method VARCHAR(40),
  ADD COLUMN IF NOT EXISTS profile_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS profile_version VARCHAR(80),
  ADD COLUMN IF NOT EXISTS portal_app_id TEXT,
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(40) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approval_evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE phm_edw.ehr_client_registration
SET client_slot = client_type
WHERE client_slot IS NULL;

UPDATE phm_edw.ehr_client_registration
SET auth_method = CASE client_type
  WHEN 'smart_launch' THEN 'public_pkce'
  WHEN 'backend_services' THEN 'private_key_jwt'
  WHEN 'cds_hooks' THEN 'fhir_authorization_jwt'
  ELSE 'public_pkce'
END
WHERE auth_method IS NULL;

ALTER TABLE phm_edw.ehr_client_registration
  ALTER COLUMN client_slot SET NOT NULL,
  ALTER COLUMN auth_method SET NOT NULL;

ALTER TABLE phm_edw.ehr_client_registration
  DROP CONSTRAINT IF EXISTS uq_ehr_client_registration_tenant_type;

ALTER TABLE phm_edw.ehr_client_registration
  ADD CONSTRAINT ck_ehr_client_registration_slot
    CHECK (length(trim(client_slot)) > 0),
  ADD CONSTRAINT ck_ehr_client_registration_auth_method
    CHECK (auth_method IN (
      'public_pkce',
      'client_secret_post',
      'client_secret_basic',
      'private_key_jwt',
      'fhir_authorization_jwt',
      'shared_secret'
    )),
  ADD CONSTRAINT ck_ehr_client_registration_approval_status
    CHECK (approval_status IN (
      'draft',
      'submitted',
      'approved',
      'rejected',
      'expired',
      'revoked',
      'unknown'
    )),
  ADD CONSTRAINT ck_ehr_client_registration_approval_evidence
    CHECK (jsonb_typeof(approval_evidence) = 'object'),
  ADD CONSTRAINT uq_ehr_client_registration_tenant_slot
    UNIQUE (ehr_tenant_id, client_slot);

CREATE INDEX IF NOT EXISTS idx_ehr_client_registration_workbook_status
  ON phm_edw.ehr_client_registration (ehr_tenant_id, approval_status, auth_method);

COMMENT ON COLUMN phm_edw.ehr_client_registration.client_slot IS
  'Named vendor workbook/app slot for this registration, for example smart_launch, backend_services, or cds_hooks.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.auth_method IS
  'OAuth/CDS authentication method expected for this client slot.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.profile_id IS
  'Vendor onboarding profile/workbook identifier used to create or validate this registration.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.profile_version IS
  'Vendor onboarding profile/workbook version used to create or validate this registration.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.portal_app_id IS
  'Vendor portal application identifier assigned by Epic, Oracle Cerner, or another EHR vendor.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.approval_status IS
  'Vendor/customer approval state for this app registration slot.';
COMMENT ON COLUMN phm_edw.ehr_client_registration.approval_evidence IS
  'Non-secret evidence and references for the approval workflow, such as ticket IDs, dates, contacts, or portal URLs.';
