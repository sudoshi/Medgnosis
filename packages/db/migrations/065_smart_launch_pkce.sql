-- =============================================================================
-- 065: SMART launch PKCE verifier storage
-- Adds the transient server-side PKCE verifier required to exchange SMART
-- authorization codes with EHR token endpoints that require S256 PKCE.
-- =============================================================================

ALTER TABLE phm_edw.smart_launch_session
  ADD COLUMN IF NOT EXISTS code_verifier TEXT;

UPDATE phm_edw.smart_launch_session
SET code_verifier = translate(rtrim(encode(gen_random_bytes(64), 'base64'), '='), '+/', '-_')
WHERE code_verifier IS NULL;

ALTER TABLE phm_edw.smart_launch_session
  ALTER COLUMN code_verifier SET NOT NULL;

COMMENT ON COLUMN phm_edw.smart_launch_session.code_verifier IS
  'Transient PKCE code verifier used for SMART authorization-code exchange. This high-entropy value is never returned to clients.';
