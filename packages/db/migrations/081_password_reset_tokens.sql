-- =============================================================================
-- Migration 081 — Tokenized password reset lifecycle
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.app_password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_password_reset_tokens_expires_after_create CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_app_password_reset_tokens_user_pending
  ON public.app_password_reset_tokens(user_id, expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_password_reset_tokens_expires_pending
  ON public.app_password_reset_tokens(expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
