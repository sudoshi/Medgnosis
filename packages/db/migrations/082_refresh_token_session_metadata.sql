-- =============================================================================
-- Migration 082 — Refresh-token session metadata
-- =============================================================================

ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
  ON public.refresh_tokens(user_id, expires_at DESC)
  WHERE revoked = FALSE;

UPDATE public.refresh_tokens
SET revoked_at = COALESCE(revoked_at, created_at)
WHERE revoked = TRUE
  AND revoked_at IS NULL;
