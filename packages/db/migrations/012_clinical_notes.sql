-- =============================================================================
-- Migration 012: Clinical Notes (SOAP Encounter Notes with AI Scribe tracking)
-- =============================================================================

-- Clinical notes table: SOAP-structured encounter documentation
CREATE TABLE IF NOT EXISTS phm_edw.clinical_note (
    note_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id       INT NOT NULL REFERENCES phm_edw.patient(patient_id),
    author_user_id   UUID NOT NULL REFERENCES public.app_users(id),
    encounter_id     INT NULL REFERENCES phm_edw.encounter(encounter_id),

    -- Visit metadata
    visit_type       VARCHAR(20) NOT NULL DEFAULT 'followup',  -- initial|followup|procedure|telehealth
    status           VARCHAR(20) NOT NULL DEFAULT 'draft',     -- draft|finalized|amended
    chief_complaint  TEXT NULL,

    -- SOAP sections (HTML from TipTap editor)
    subjective       TEXT NULL,
    objective        TEXT NULL,
    assessment       TEXT NULL,
    plan_text        TEXT NULL,

    -- AI provenance tracking
    ai_generated     JSONB NULL,   -- { sections: ['subjective','objective'], model: 'gemma:7b', generated_at: '...' }

    -- Lifecycle timestamps
    finalized_at     TIMESTAMP NULL,
    amended_at       TIMESTAMP NULL,
    amendment_reason TEXT NULL,
    created_date     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_date     TIMESTAMP NOT NULL DEFAULT NOW(),
    active_ind       CHAR(1) NOT NULL DEFAULT 'Y'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clinical_note_patient ON phm_edw.clinical_note(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_author  ON phm_edw.clinical_note(author_user_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_status  ON phm_edw.clinical_note(status) WHERE active_ind = 'Y';
