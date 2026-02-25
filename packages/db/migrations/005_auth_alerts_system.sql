-- =============================================================================
-- Medgnosis — Migration 005: Auth, Alerts & Modern Platform Tables
-- Adds authentication, clinical alerts, audit trail, and AI insights
-- tables required by the modernized Fastify API.
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fuzzy search on patient names

-- =============================================================================
-- SECTION 1 — AUTHENTICATION & AUTHORIZATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               TEXT        NOT NULL UNIQUE,
    password_hash       TEXT        NOT NULL,
    first_name          TEXT        NOT NULL,
    last_name           TEXT        NOT NULL,
    role                TEXT        NOT NULL CHECK (role IN (
                            'provider', 'analyst', 'admin', 'care_coordinator'
                        )),
    org_id              INTEGER     REFERENCES phm_edw.organization(organization_id),
    mfa_enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
    mfa_secret          TEXT,
    session_timeout_min INTEGER     NOT NULL DEFAULT 30,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_org ON app_users(org_id);

-- Refresh tokens table for JWT rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    token_hash      TEXT        NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- =============================================================================
-- SECTION 2 — CLINICAL ALERTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS clinical_alerts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          INTEGER     NOT NULL,
    org_id              INTEGER,
    alert_type          TEXT        NOT NULL CHECK (alert_type IN (
                            'care_gap_overdue', 'risk_threshold', 'measure_non_compliance',
                            'lab_critical', 'medication_adherence', 'encounter_followup',
                            'population_drift', 'ai_anomaly', 'custom'
                        )),
    rule_key            TEXT,
    severity            TEXT        NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title               TEXT        NOT NULL,
    body                TEXT,
    rule_context        JSONB,
    acknowledged_at     TIMESTAMPTZ,
    acknowledged_by     UUID        REFERENCES app_users(id),
    auto_resolved       BOOLEAN     NOT NULL DEFAULT FALSE,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_alerts_patient ON clinical_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_alerts_org ON clinical_alerts(org_id);
CREATE INDEX IF NOT EXISTS idx_clinical_alerts_severity ON clinical_alerts(severity) WHERE auto_resolved = FALSE AND acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clinical_alerts_rule ON clinical_alerts(rule_key);

-- =============================================================================
-- SECTION 3 — AUDIT TRAIL
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        REFERENCES app_users(id),
    action          TEXT        NOT NULL,
    resource_type   TEXT        NOT NULL,
    resource_id     TEXT,
    details         JSONB,
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- =============================================================================
-- SECTION 4 — AI INSIGHTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_insights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      INTEGER     NOT NULL,
    insight_type    TEXT        NOT NULL CHECK (insight_type IN (
                        'weekly_summary', 'trend_narrative', 'anomaly_detection',
                        'risk_analysis', 'care_recommendation'
                    )),
    content         TEXT        NOT NULL,
    model_id        TEXT        NOT NULL,
    provider        TEXT        NOT NULL CHECK (provider IN ('anthropic', 'ollama')),
    input_tokens    INTEGER     NOT NULL DEFAULT 0,
    output_tokens   INTEGER     NOT NULL DEFAULT 0,
    cost_cents      INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_patient ON ai_insights(patient_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(insight_type);

-- =============================================================================
-- SECTION 5 — RISK SCORE HISTORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_risk_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      INTEGER     NOT NULL,
    score           INTEGER     NOT NULL,
    band            TEXT        NOT NULL CHECK (band IN ('low', 'moderate', 'high', 'critical')),
    factors         JSONB,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_history_patient ON patient_risk_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_risk_history_computed ON patient_risk_history(computed_at);

-- =============================================================================
-- SECTION 6 — FULL-TEXT SEARCH SUPPORT
-- =============================================================================

-- Add trigram index on patient names for fuzzy search
-- (The phm_edw.patient table is created by migration 001)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'phm_edw' AND table_name = 'patient'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_patient_name_trgm
      ON phm_edw.patient
      USING gin((first_name || ' ' || last_name) gin_trgm_ops);
  END IF;
END $$;

-- =============================================================================
-- SECTION 7 — INSERT DEFAULT ADMIN USER
-- =============================================================================

INSERT INTO app_users (email, password_hash, first_name, last_name, role, mfa_enabled)
VALUES (
  'admin@medgnosis.app',
  -- bcrypt hash of 'password' — DEVELOPMENT ONLY
  '$2b$10$8K1p/a0dL1rJv7o4vInJSOenQr.YhGqKiQ0fNs9EXg7/Hh1nGQHPq',
  'System',
  'Admin',
  'admin',
  FALSE
)
ON CONFLICT (email) DO NOTHING;
