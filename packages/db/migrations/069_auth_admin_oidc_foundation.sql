-- =============================================================================
-- Migration 069 — Auth admin + Authentik OIDC foundation
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Super-admin is intentionally local-app controlled. OIDC may grant admin, but
-- never this break-glass tier.
ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('provider', 'analyst', 'admin', 'super_admin', 'care_coordinator'));

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.app_users
SET role = 'super_admin',
    updated_at = NOW()
WHERE email = 'admin@medgnosis.app'
  AND role = 'admin';

CREATE TABLE IF NOT EXISTS public.auth_provider_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type TEXT NOT NULL UNIQUE CHECK (provider_type IN ('local', 'oidc', 'ldap', 'oauth2', 'saml2')),
  display_name  TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_provider_settings_type
  ON public.auth_provider_settings(provider_type);

CREATE TABLE IF NOT EXISTS public.user_external_identities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  provider_type     TEXT NOT NULL,
  provider_subject  TEXT NOT NULL,
  email_at_link     TEXT,
  claims            JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_type, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_user_external_identities_user
  ON public.user_external_identities(user_id);

CREATE TABLE IF NOT EXISTS public.oidc_email_aliases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_email     TEXT NOT NULL UNIQUE,
  canonical_email TEXT NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.oidc_handshakes (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('state', 'exchange')),
  payload    JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oidc_handshakes_expires
  ON public.oidc_handshakes(expires_at);

INSERT INTO public.auth_provider_settings (provider_type, display_name, enabled, settings)
VALUES
  ('local', 'Email and password', TRUE, '{}'::jsonb),
  (
    'oidc',
    'Authentik',
    FALSE,
    jsonb_build_object(
      'label', 'Authentik',
      'discovery_url', 'https://auth.acumenus.net/application/o/medgnosis-oidc/.well-known/openid-configuration',
      'client_id', '',
      'client_secret_ref', 'OIDC_CLIENT_SECRET',
      'redirect_uri', 'https://medgnosis.acumenus.net/api/v1/auth/oidc/callback',
      'scopes', jsonb_build_array('openid', 'profile', 'email', 'groups'),
      'allowed_groups', jsonb_build_array('Medgnosis Admins'),
      'admin_groups', jsonb_build_array('Medgnosis Admins')
    )
  )
ON CONFLICT (provider_type) DO NOTHING;
