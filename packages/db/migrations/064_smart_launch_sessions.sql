-- =============================================================================
-- 064: SMART launch sessions and token metadata
-- Adds durable OAuth state/session tracking for SMART on FHIR launches and a
-- token metadata ledger that stores token hashes only, never raw bearer tokens.
-- Additive: two new tables in phm_edw.
-- =============================================================================

CREATE TABLE phm_edw.smart_launch_session (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ehr_tenant_id            BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id),
  org_id                   INTEGER REFERENCES phm_edw.organization(org_id),
  user_id                  UUID REFERENCES public.app_users(id),
  client_registration_id   BIGINT REFERENCES phm_edw.ehr_client_registration(id),
  state_hash               TEXT NOT NULL UNIQUE,
  nonce_hash               TEXT NOT NULL,
  redirect_uri             TEXT NOT NULL,
  app_redirect_url         TEXT,
  issuer                   TEXT,
  launch                   TEXT,
  requested_scope          TEXT NOT NULL DEFAULT '',
  launch_context           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                   VARCHAR(30) NOT NULL DEFAULT 'pending',
  expires_at               TIMESTAMPTZ NOT NULL,
  consumed_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_smart_launch_session_status CHECK (status IN ('pending', 'consumed', 'expired', 'cancelled')),
  CONSTRAINT ck_smart_launch_session_redirect_uri CHECK (length(trim(redirect_uri)) > 0),
  CONSTRAINT ck_smart_launch_session_context CHECK (jsonb_typeof(launch_context) = 'object')
);

CREATE INDEX idx_smart_launch_session_tenant_status_expiry
  ON phm_edw.smart_launch_session (ehr_tenant_id, status, expires_at);

CREATE INDEX idx_smart_launch_session_user_created
  ON phm_edw.smart_launch_session (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX idx_smart_launch_session_org_created
  ON phm_edw.smart_launch_session (org_id, created_at DESC)
  WHERE org_id IS NOT NULL;

COMMENT ON TABLE phm_edw.smart_launch_session IS
  'Durable SMART on FHIR launch state used to correlate authorization callbacks with Medgnosis tenant, org, and user context.';
COMMENT ON COLUMN phm_edw.smart_launch_session.state_hash IS
  'SHA-256 hash of the OAuth state value. The raw state is returned to the browser but is not stored.';
COMMENT ON COLUMN phm_edw.smart_launch_session.nonce_hash IS
  'SHA-256 hash of the OpenID Connect nonce value used for SMART launch authorization requests.';
COMMENT ON COLUMN phm_edw.smart_launch_session.redirect_uri IS
  'Registered SMART OAuth callback URL used for this authorization request.';
COMMENT ON COLUMN phm_edw.smart_launch_session.app_redirect_url IS
  'Optional Medgnosis-relative URL to return to after the SMART callback completes.';
COMMENT ON COLUMN phm_edw.smart_launch_session.launch IS
  'Opaque EHR launch parameter supplied by the SMART launch request.';
COMMENT ON COLUMN phm_edw.smart_launch_session.launch_context IS
  'Normalized SMART launch context returned by the EHR token response, excluding raw token values.';

CREATE TABLE phm_edw.smart_token_metadata (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_launch_session_id  UUID REFERENCES phm_edw.smart_launch_session(id) ON DELETE SET NULL,
  ehr_tenant_id            BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id),
  org_id                   INTEGER REFERENCES phm_edw.organization(org_id),
  user_id                  UUID REFERENCES public.app_users(id),
  token_type               VARCHAR(40) NOT NULL DEFAULT 'Bearer',
  scope                    TEXT NOT NULL DEFAULT '',
  access_token_hash        TEXT,
  refresh_token_hash       TEXT,
  id_token_hash            TEXT,
  patient_ref              TEXT,
  encounter_ref            TEXT,
  fhir_user_ref            TEXT,
  launch_context           JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_response_metadata  JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at               TIMESTAMPTZ,
  revoked_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_smart_token_metadata_context CHECK (jsonb_typeof(launch_context) = 'object'),
  CONSTRAINT ck_smart_token_metadata_response CHECK (jsonb_typeof(token_response_metadata) = 'object')
);

CREATE INDEX idx_smart_token_metadata_tenant_user_created
  ON phm_edw.smart_token_metadata (ehr_tenant_id, user_id, created_at DESC);

CREATE INDEX idx_smart_token_metadata_session
  ON phm_edw.smart_token_metadata (smart_launch_session_id)
  WHERE smart_launch_session_id IS NOT NULL;

CREATE INDEX idx_smart_token_metadata_patient
  ON phm_edw.smart_token_metadata (ehr_tenant_id, patient_ref)
  WHERE patient_ref IS NOT NULL;

CREATE INDEX idx_smart_token_metadata_active_expiry
  ON phm_edw.smart_token_metadata (ehr_tenant_id, expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE phm_edw.smart_token_metadata IS
  'Metadata ledger for SMART OAuth token responses. Raw access, refresh, and ID tokens are not stored.';
COMMENT ON COLUMN phm_edw.smart_token_metadata.access_token_hash IS
  'SHA-256 hash of the access token for audit correlation only; raw bearer tokens must stay outside this table.';
COMMENT ON COLUMN phm_edw.smart_token_metadata.refresh_token_hash IS
  'SHA-256 hash of the refresh token when one is issued; raw refresh tokens must be stored only in a dedicated secret store.';
COMMENT ON COLUMN phm_edw.smart_token_metadata.id_token_hash IS
  'SHA-256 hash of the OpenID Connect ID token when one is issued.';
COMMENT ON COLUMN phm_edw.smart_token_metadata.token_response_metadata IS
  'Sanitized non-secret token response metadata, excluding access_token, refresh_token, and id_token.';
