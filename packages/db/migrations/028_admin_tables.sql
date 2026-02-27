-- =============================================================================
-- Migration 028 — Admin tables: FHIR endpoint registry + audit log hardening
-- =============================================================================

-- FHIR endpoint registry
-- Tracks connected EHR FHIR endpoints (Epic, Oracle Health, Cerner, custom)
CREATE TABLE IF NOT EXISTS phm_edw.fhir_endpoint (
  endpoint_id     SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  ehr_type        VARCHAR(20)  NOT NULL,   -- 'epic' | 'oracle' | 'cerner' | 'custom'
  base_url        TEXT         NOT NULL,
  auth_type       VARCHAR(20)  DEFAULT 'oauth2',
  status          VARCHAR(20)  DEFAULT 'disconnected',  -- 'connected' | 'degraded' | 'disconnected'
  version         VARCHAR(10)  DEFAULT 'R4',
  patients_linked INT          DEFAULT 0,
  last_sync_at    TIMESTAMP,
  token_expiry    TIMESTAMP,
  notes           TEXT,
  is_active       BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMP    DEFAULT NOW(),
  updated_at      TIMESTAMP    DEFAULT NOW()
);

-- Audit log — may already exist; IF NOT EXISTS prevents collision
-- NOTE: FK references public.app_users(id) — 'id' is the PK column name
CREATE TABLE IF NOT EXISTS public.audit_log (
  audit_id    BIGSERIAL PRIMARY KEY,
  event_type  VARCHAR(50) NOT NULL,   -- 'login' | 'phi_access' | 'order_placed' | 'user_modified' | 'etl_run'
  user_id     INT REFERENCES public.app_users(id),
  target_type VARCHAR(50),
  target_id   TEXT,
  description TEXT,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON public.audit_log (user_id);
-- idx_audit_log_type: omitted — audit_log.action column handled by existing table schema

-- Seed demo FHIR endpoints
INSERT INTO phm_edw.fhir_endpoint (name, ehr_type, base_url, status, patients_linked)
VALUES
  ('Memorial Hermann', 'epic',   'https://fhir.memorialhermann.org/api/FHIR/R4', 'connected',    42350),
  ('Geisinger Health', 'oracle', 'https://fhir.geisinger.org/fhir/R4',           'degraded',     18720),
  ('Cleveland Clinic', 'epic',   'https://fhir.clevelandclinic.org/api/FHIR/R4', 'disconnected', 0)
ON CONFLICT DO NOTHING;
