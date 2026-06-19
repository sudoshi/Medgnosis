-- =============================================================================
-- Migration 083 — TOTP MFA lifecycle support
-- =============================================================================

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS mfa_secret_pending TEXT,
  ADD COLUMN IF NOT EXISTS mfa_secret_pending_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_recovery_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_last_used_step BIGINT;

ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;

UPDATE public.app_users
SET mfa_recovery_codes = '[]'::jsonb
WHERE mfa_recovery_codes IS NULL;

COMMENT ON COLUMN public.app_users.mfa_secret IS
  'Encrypted TOTP secret for the active authenticator factor. Legacy plaintext values are accepted during verification.';

COMMENT ON COLUMN public.app_users.mfa_secret_pending IS
  'Encrypted TOTP secret staged during setup before the first verification code confirms enrollment.';

COMMENT ON COLUMN public.app_users.mfa_secret_pending_expires_at IS
  'Expiration timestamp for the staged TOTP secret.';

COMMENT ON COLUMN public.app_users.mfa_recovery_codes IS
  'JSON array of hashed recovery-code records. Raw recovery codes are returned only once during setup confirmation.';

COMMENT ON COLUMN public.refresh_tokens.mfa_verified_at IS
  'Timestamp when the session completed MFA verification; null for sessions issued before MFA enforcement.';
