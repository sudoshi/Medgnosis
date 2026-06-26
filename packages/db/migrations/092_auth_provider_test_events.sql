-- =============================================================================
-- Migration 092 - Auth provider test evidence
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.auth_provider_test_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type          TEXT NOT NULL CHECK (provider_type IN ('oidc')),
  status                 TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  tested_by              UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  tested_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_ms            INTEGER CHECK (response_ms IS NULL OR response_ms >= 0),
  issuer                 TEXT,
  authorization_endpoint TEXT,
  token_endpoint         TEXT,
  jwks_uri               TEXT,
  client_configured      BOOLEAN,
  redirect_uri           TEXT,
  error_code             TEXT,
  error_message          TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_provider_test_events_latest
  ON public.auth_provider_test_events(provider_type, tested_at DESC);
