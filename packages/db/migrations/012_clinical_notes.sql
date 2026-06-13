-- =============================================================================
-- Migration 012: Clinical Notes (SOAP Encounter Notes with AI Scribe tracking)
-- =============================================================================
-- Migration 010 already created phm_edw.clinical_note with a SERIAL PK and
-- base SOAP columns. This migration adds the SOAP-AI-scribe columns introduced
-- by the modernized Fastify API (author_user_id, visit_type, chief_complaint,
-- plan_text alias, ai_generated JSON, lifecycle timestamps) using
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS so the migration is idempotent
-- whether or not 010 ran first.
-- =============================================================================

ALTER TABLE phm_edw.clinical_note
    ADD COLUMN IF NOT EXISTS author_user_id   UUID          NULL REFERENCES public.app_users(id),
    ADD COLUMN IF NOT EXISTS visit_type       VARCHAR(20)   NOT NULL DEFAULT 'followup',
    ADD COLUMN IF NOT EXISTS chief_complaint  TEXT          NULL,
    ADD COLUMN IF NOT EXISTS plan_text        TEXT          NULL,
    ADD COLUMN IF NOT EXISTS ai_generated     JSONB         NULL,
    ADD COLUMN IF NOT EXISTS finalized_at     TIMESTAMP     NULL,
    ADD COLUMN IF NOT EXISTS amended_at       TIMESTAMP     NULL,
    ADD COLUMN IF NOT EXISTS amendment_reason TEXT          NULL;

-- Indexes (IF NOT EXISTS is safe whether the column was just added or existed)
CREATE INDEX IF NOT EXISTS idx_clinical_note_patient ON phm_edw.clinical_note(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_author  ON phm_edw.clinical_note(author_user_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_status  ON phm_edw.clinical_note(status) WHERE active_ind = 'Y';
