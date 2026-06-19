-- =============================================================================
-- Migration 080 — Tokenized invitation activation
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.app_user_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_user_invites_expires_after_create CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_app_user_invites_user_pending
  ON public.app_user_invites(user_id, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_user_invites_expires_pending
  ON public.app_user_invites(expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Any legacy admin-created placeholders must not remain usable while waiting
-- for a fresh tokenized invite resend.
UPDATE public.app_users
SET is_active = FALSE,
    must_change_password = FALSE,
    updated_at = NOW()
WHERE password_hash = 'INVITE_PENDING';
