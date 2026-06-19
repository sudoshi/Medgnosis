-- =============================================================================
-- 084: SMART launch handoff binding
-- Adds a one-time browser handoff code for completed SMART launches so the SPA
-- does not receive or route with durable smart_launch_session ids.
-- =============================================================================

ALTER TABLE phm_edw.smart_launch_session
  ADD COLUMN IF NOT EXISTS handoff_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS handoff_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_session_id UUID REFERENCES public.refresh_tokens(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_smart_launch_session_handoff_code_hash
  ON phm_edw.smart_launch_session (handoff_code_hash)
  WHERE handoff_code_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_smart_launch_session_handoff_pending
  ON phm_edw.smart_launch_session (handoff_expires_at)
  WHERE handoff_code_hash IS NOT NULL AND handoff_consumed_at IS NULL;

COMMENT ON COLUMN phm_edw.smart_launch_session.handoff_code_hash IS
  'SHA-256 hash of the short-lived one-time handoff code returned to the SPA after SMART callback completion.';
COMMENT ON COLUMN phm_edw.smart_launch_session.handoff_expires_at IS
  'Expiration timestamp for the one-time SMART launch handoff code.';
COMMENT ON COLUMN phm_edw.smart_launch_session.handoff_consumed_at IS
  'Timestamp when an authenticated Medgnosis app session consumed the SMART launch handoff code.';
COMMENT ON COLUMN phm_edw.smart_launch_session.app_session_id IS
  'Medgnosis refresh-token session that consumed the completed SMART launch handoff.';
