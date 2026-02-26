-- =====================================================================
-- 012_edw_quality_ai_oncology_research.sql
-- Phase: Demo Account — New EDW Tables (Part 3)
-- Adds quality/performance, AI/notifications, oncology, research, specialty tables
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- QUALITY & PERFORMANCE
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.quality_reporting_period (
    period_id           SERIAL        PRIMARY KEY,
    period_name         VARCHAR(100)  NOT NULL,       -- e.g., 'Q1 2025', 'CY2025'
    period_type         VARCHAR(30)   NOT NULL DEFAULT 'quarterly', -- 'quarterly','annual','monthly'
    start_date          DATE          NOT NULL,
    end_date            DATE          NOT NULL,
    reporting_year      SMALLINT      NOT NULL,
    reporting_quarter   SMALLINT      NULL,            -- 1–4
    program             VARCHAR(50)   NOT NULL DEFAULT 'MIPS', -- 'MIPS','HEDIS','PCMH','VBC'
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.quality_score (
    score_id            SERIAL        PRIMARY KEY,
    provider_id         INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    period_id           INT           NOT NULL REFERENCES phm_edw.quality_reporting_period(period_id),
    measure_id          INT           REFERENCES phm_edw.measure_definition(measure_id),
    bundle_id           INT           REFERENCES phm_edw.condition_bundle(bundle_id),
    numerator_count     INT           NOT NULL DEFAULT 0,
    denominator_count   INT           NOT NULL DEFAULT 0,
    performance_rate    NUMERIC(6,3)  NULL,    -- 0.000–1.000
    performance_score   NUMERIC(6,2)  NULL,    -- weighted score contribution
    benchmark_percentile SMALLINT     NULL,    -- 0–100
    mips_points_earned  NUMERIC(6,2)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL,
    UNIQUE (provider_id, period_id, measure_id)
);
CREATE INDEX IF NOT EXISTS idx_quality_score_provider ON phm_edw.quality_score(provider_id);
CREATE INDEX IF NOT EXISTS idx_quality_score_period   ON phm_edw.quality_score(period_id);

CREATE TABLE IF NOT EXISTS phm_edw.cms_benchmark (
    benchmark_id        SERIAL        PRIMARY KEY,
    measure_id          INT           NOT NULL REFERENCES phm_edw.measure_definition(measure_id),
    reporting_year      SMALLINT      NOT NULL,
    program             VARCHAR(50)   NOT NULL DEFAULT 'MIPS',
    benchmark_type      VARCHAR(30)   NOT NULL DEFAULT 'national', -- 'national','regional','specialty'
    pct_25              NUMERIC(6,3)  NULL,
    pct_50              NUMERIC(6,3)  NULL,
    pct_75              NUMERIC(6,3)  NULL,
    pct_90              NUMERIC(6,3)  NULL,
    mean_rate           NUMERIC(6,3)  NULL,
    top_performer_rate  NUMERIC(6,3)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_cms_benchmark_measure ON phm_edw.cms_benchmark(measure_id);

CREATE TABLE IF NOT EXISTS phm_edw.peer_review (
    review_id           SERIAL        PRIMARY KEY,
    reviewed_provider_id INT          NOT NULL REFERENCES phm_edw.provider(provider_id),
    reviewer_provider_id INT          REFERENCES phm_edw.provider(provider_id),
    patient_id          INT           REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    review_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
    review_type         VARCHAR(50)   NOT NULL DEFAULT 'case_review',
    case_summary        TEXT          NULL,
    review_criteria     TEXT          NULL,
    strengths           TEXT          NULL,
    areas_for_improvement TEXT        NULL,
    overall_rating      SMALLINT      NULL,   -- 1–5
    outcome             VARCHAR(30)   NULL,   -- 'Meets Standards','Needs Improvement','Excellent'
    action_required     BOOLEAN       NOT NULL DEFAULT FALSE,
    action_plan         TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.peer_review_score (
    score_id            SERIAL        PRIMARY KEY,
    review_id           INT           NOT NULL REFERENCES phm_edw.peer_review(review_id),
    category            VARCHAR(100)  NOT NULL,
    score               SMALLINT      NOT NULL,     -- 1–5
    max_score           SMALLINT      NOT NULL DEFAULT 5,
    comments            VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.provider_incentive (
    incentive_id        SERIAL        PRIMARY KEY,
    provider_id         INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    period_id           INT           REFERENCES phm_edw.quality_reporting_period(period_id),
    incentive_type      VARCHAR(50)   NOT NULL DEFAULT 'quality_bonus',
    -- 'quality_bonus','mips_adjustment','value_based','panel_bonus'
    base_compensation   NUMERIC(12,2) NULL,
    incentive_potential NUMERIC(12,2) NULL,
    incentive_earned    NUMERIC(12,2) NULL,
    performance_rate    NUMERIC(6,3)  NULL,
    metrics_summary     JSONB         NULL,   -- key metrics driving the incentive
    payment_date        DATE          NULL,
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

-- ─────────────────────────────────────────────────────────────────────
-- AI & NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.notification (
    notification_id     SERIAL        PRIMARY KEY,
    provider_id         INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    patient_id          INT           REFERENCES phm_edw.patient(patient_id),
    notification_type   VARCHAR(50)   NOT NULL,
    -- 'critical_lab','care_gap_alert','referral_report','patient_message','peer_review','system','task'
    priority            VARCHAR(20)   NOT NULL DEFAULT 'normal',
    title               VARCHAR(255)  NOT NULL,
    body                TEXT          NOT NULL,
    action_url          VARCHAR(500)  NULL,
    action_label        VARCHAR(100)  NULL,
    source_entity_type  VARCHAR(50)   NULL,    -- 'order_result','care_gap','referral','message'
    source_entity_id    INT           NULL,
    created_datetime    TIMESTAMP     NOT NULL DEFAULT NOW(),
    read_ind            CHAR(1)       NOT NULL DEFAULT 'N',
    read_datetime       TIMESTAMP     NULL,
    dismissed_ind       CHAR(1)       NOT NULL DEFAULT 'N',
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_provider ON phm_edw.notification(provider_id);
CREATE INDEX IF NOT EXISTS idx_notification_unread   ON phm_edw.notification(provider_id, read_ind) WHERE read_ind = 'N';

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.ai_insight (
    insight_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    insight_type        VARCHAR(50)   NOT NULL,
    -- 'coding_suggestion','care_gap_alert','drug_interaction','risk_escalation','documentation'
    priority            VARCHAR(20)   NOT NULL DEFAULT 'normal',
    title               VARCHAR(255)  NOT NULL,
    description         TEXT          NOT NULL,
    evidence_summary    TEXT          NULL,
    recommended_action  TEXT          NULL,
    icd10_suggestion    VARCHAR(20)   NULL,
    confidence_score    NUMERIC(4,3)  NULL,   -- 0.000–1.000
    generated_datetime  TIMESTAMP     NOT NULL DEFAULT NOW(),
    acknowledged_by     INT           REFERENCES phm_edw.provider(provider_id),
    acknowledged_datetime TIMESTAMP   NULL,
    action_taken        VARCHAR(255)  NULL,
    is_dismissed        BOOLEAN       NOT NULL DEFAULT FALSE,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_insight_patient  ON phm_edw.ai_insight(patient_id);
CREATE INDEX IF NOT EXISTS idx_ai_insight_provider ON phm_edw.ai_insight(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_insight_type     ON phm_edw.ai_insight(insight_type);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.ai_priority_queue (
    queue_id            SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    provider_id         INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    priority_date       DATE          NOT NULL DEFAULT CURRENT_DATE,
    priority_rank       SMALLINT      NOT NULL,
    priority_score      NUMERIC(6,2)  NOT NULL,  -- composite priority 0–100
    primary_reason      VARCHAR(100)  NOT NULL,
    -- 'overdue_care_gap','deteriorating_labs','recent_ed','high_risk_score','documentation_opportunity'
    reason_detail       TEXT          NULL,
    risk_tier           VARCHAR(20)   NOT NULL DEFAULT 'medium',
    open_care_gaps      SMALLINT      NULL,
    critical_labs       SMALLINT      NULL,
    last_encounter_days INT           NULL,   -- days since last encounter
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_priority_provider_date ON phm_edw.ai_priority_queue(provider_id, priority_date);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.ai_generated_note (
    ai_note_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    generated_datetime  TIMESTAMP     NOT NULL DEFAULT NOW(),
    note_type           VARCHAR(50)   NOT NULL DEFAULT 'soap',
    subjective          TEXT          NULL,
    objective           TEXT          NULL,
    assessment          TEXT          NULL,
    plan                TEXT          NULL,
    icd10_suggestions   JSONB         NULL,     -- Array of {code, description, confidence}
    cpt_suggestion      VARCHAR(20)   NULL,
    status              VARCHAR(30)   NOT NULL DEFAULT 'Pending Review',
    -- 'Pending Review','Accepted','Edited & Accepted','Rejected'
    accepted_by         INT           REFERENCES phm_edw.provider(provider_id),
    accepted_datetime   TIMESTAMP     NULL,
    edits_made          BOOLEAN       NOT NULL DEFAULT FALSE,
    final_note_id       INT           REFERENCES phm_edw.clinical_note(note_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_note_patient  ON phm_edw.ai_generated_note(patient_id);
CREATE INDEX IF NOT EXISTS idx_ai_note_status   ON phm_edw.ai_generated_note(status);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.differential_diagnosis (
    diff_dx_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    generated_datetime  TIMESTAMP     NOT NULL DEFAULT NOW(),
    chief_complaint     VARCHAR(255)  NOT NULL,
    diagnosis_rank      SMALLINT      NOT NULL,     -- 1=most likely
    diagnosis_name      VARCHAR(255)  NOT NULL,
    icd10_code          VARCHAR(20)   NULL,
    probability_pct     SMALLINT      NULL,          -- 0–100
    supporting_evidence TEXT          NULL,
    against_evidence    TEXT          NULL,
    recommended_workup  TEXT          NULL,
    status              VARCHAR(30)   NOT NULL DEFAULT 'Active', -- 'Active','Ruled Out','Confirmed'
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_diff_dx_patient   ON phm_edw.differential_diagnosis(patient_id);
CREATE INDEX IF NOT EXISTS idx_diff_dx_encounter ON phm_edw.differential_diagnosis(encounter_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.alert_rule (
    rule_id             SERIAL        PRIMARY KEY,
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    org_id              INT           REFERENCES phm_edw.organization(org_id),
    rule_name           VARCHAR(200)  NOT NULL,
    rule_category       VARCHAR(50)   NOT NULL, -- 'lab','vitals','care_gap','medication','risk_score'
    trigger_condition   TEXT          NOT NULL,  -- Human-readable description
    trigger_logic       JSONB         NULL,       -- Machine-readable logic
    severity            VARCHAR(20)   NOT NULL DEFAULT 'warning',
    is_enabled          BOOLEAN       NOT NULL DEFAULT TRUE,
    notify_provider     BOOLEAN       NOT NULL DEFAULT TRUE,
    notify_care_team    BOOLEAN       NOT NULL DEFAULT FALSE,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.provider_preference (
    preference_id       SERIAL        PRIMARY KEY,
    provider_id         INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    preference_key      VARCHAR(100)  NOT NULL,
    preference_value    TEXT          NOT NULL,
    preference_category VARCHAR(50)   NOT NULL DEFAULT 'ui',
    -- 'ui','notifications','ai','workflow','display'
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL,
    UNIQUE (provider_id, preference_key)
);
CREATE INDEX IF NOT EXISTS idx_prov_pref_provider ON phm_edw.provider_preference(provider_id);

-- ─────────────────────────────────────────────────────────────────────
-- ONCOLOGY SUITE
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.cancer_staging (
    staging_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    cancer_type         VARCHAR(100)  NOT NULL,
    primary_site        VARCHAR(100)  NOT NULL,
    icd10_code          VARCHAR(20)   NULL,
    staging_system      VARCHAR(30)   NOT NULL DEFAULT 'AJCC_8',
    t_stage             VARCHAR(10)   NULL,
    n_stage             VARCHAR(10)   NULL,
    m_stage             VARCHAR(10)   NULL,
    clinical_stage      VARCHAR(20)   NULL,       -- e.g., 'Stage IIA', 'Stage IIIB'
    pathologic_stage    VARCHAR(20)   NULL,
    grade               VARCHAR(20)   NULL,
    diagnosis_date      DATE          NOT NULL,
    staging_date        DATE          NULL,
    staged_by           INT           REFERENCES phm_edw.provider(provider_id),
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_cancer_staging_patient ON phm_edw.cancer_staging(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.tumor_registry (
    registry_id         SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    staging_id          INT           REFERENCES phm_edw.cancer_staging(staging_id),
    cancer_type         VARCHAR(100)  NOT NULL,
    histology           VARCHAR(100)  NULL,
    laterality          VARCHAR(20)   NULL,
    behavior            VARCHAR(20)   NULL,        -- 'Malignant','Benign','In-Situ'
    sequence_number     SMALLINT      NULL,         -- 00=not a primary, 01=first primary, etc.
    diagnosis_date      DATE          NOT NULL,
    first_course_date   DATE          NULL,
    treatment_summary   TEXT          NULL,
    registry_status     VARCHAR(30)   NOT NULL DEFAULT 'Active', -- 'Active','NED','Recurrence','Deceased'
    last_contact_date   DATE          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_tumor_registry_patient ON phm_edw.tumor_registry(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.genomic_marker (
    marker_id           SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    staging_id          INT           REFERENCES phm_edw.cancer_staging(staging_id),
    gene_name           VARCHAR(50)   NOT NULL,   -- e.g., 'BRCA2', 'EGFR', 'MSI', 'BRAF'
    alteration_type     VARCHAR(50)   NULL,        -- 'mutation','amplification','deletion','fusion','expression'
    variant_detail      VARCHAR(200)  NULL,        -- e.g., 'Exon 19 deletion', 'V600E'
    result              VARCHAR(50)   NOT NULL,    -- 'Positive','Negative','Variant of Uncertain Significance'
    test_date           DATE          NOT NULL,
    test_platform       VARCHAR(100)  NULL,
    lab_name            VARCHAR(200)  NULL,
    clinical_significance VARCHAR(100) NULL,       -- 'Pathogenic','Likely Pathogenic','Benign'
    actionable          BOOLEAN       NOT NULL DEFAULT FALSE,
    therapy_implication TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_genomic_marker_patient ON phm_edw.genomic_marker(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.biomarker_result (
    biomarker_id        SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    staging_id          INT           REFERENCES phm_edw.cancer_staging(staging_id),
    biomarker_name      VARCHAR(100)  NOT NULL,  -- e.g., 'PD-L1','PSA','CA-125','CEA','AFP'
    result_value        VARCHAR(100)  NOT NULL,
    result_unit         VARCHAR(30)   NULL,
    reference_range     VARCHAR(100)  NULL,
    result_date         DATE          NOT NULL,
    is_abnormal         BOOLEAN       NOT NULL DEFAULT FALSE,
    clinical_note       VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_biomarker_patient ON phm_edw.biomarker_result(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.chemo_regimen (
    regimen_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    staging_id          INT           REFERENCES phm_edw.cancer_staging(staging_id),
    regimen_name        VARCHAR(100)  NOT NULL,   -- e.g., 'FOLFOX','AC-T','CHOP'
    regimen_type        VARCHAR(50)   NOT NULL,   -- 'adjuvant','neoadjuvant','palliative','curative'
    drugs               JSONB         NOT NULL,    -- [{name, dose, route, schedule}]
    planned_cycles      SMALLINT      NOT NULL,
    start_date          DATE          NOT NULL,
    end_date            DATE          NULL,
    status              VARCHAR(30)   NOT NULL DEFAULT 'Active',
    -- 'Active','Completed','Discontinued','On Hold'
    discontinue_reason  VARCHAR(500)  NULL,
    oncologist_id       INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_chemo_regimen_patient ON phm_edw.chemo_regimen(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.chemo_cycle (
    cycle_id            SERIAL        PRIMARY KEY,
    regimen_id          INT           NOT NULL REFERENCES phm_edw.chemo_regimen(regimen_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    cycle_number        SMALLINT      NOT NULL,
    planned_date        DATE          NOT NULL,
    administered_date   DATE          NULL,
    cycle_status        VARCHAR(30)   NOT NULL DEFAULT 'Planned',
    -- 'Planned','Administered','Delayed','Skipped','Completed'
    dose_modification   VARCHAR(100)  NULL,         -- e.g., '75% dose'
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_chemo_cycle_regimen  ON phm_edw.chemo_cycle(regimen_id);
CREATE INDEX IF NOT EXISTS idx_chemo_cycle_patient  ON phm_edw.chemo_cycle(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.infusion_administration (
    infusion_id         SERIAL        PRIMARY KEY,
    cycle_id            INT           REFERENCES phm_edw.chemo_cycle(cycle_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    drug_name           VARCHAR(100)  NOT NULL,
    dose                VARCHAR(50)   NOT NULL,
    route               VARCHAR(30)   NOT NULL DEFAULT 'IV',
    start_datetime      TIMESTAMP     NOT NULL,
    end_datetime        TIMESTAMP     NULL,
    administered_by     VARCHAR(100)  NULL,
    pre_medications     TEXT          NULL,
    post_medications    TEXT          NULL,
    adverse_events      TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_infusion_patient ON phm_edw.infusion_administration(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.toxicity_assessment (
    toxicity_id         SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    cycle_id            INT           REFERENCES phm_edw.chemo_cycle(cycle_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    assessment_date     DATE          NOT NULL,
    toxicity_type       VARCHAR(100)  NOT NULL,   -- e.g., 'Nausea/Vomiting','Neuropathy','Fatigue'
    ctcae_grade         SMALLINT      NOT NULL,    -- 1–5 (CTCAE grading)
    description         TEXT          NULL,
    management          TEXT          NULL,
    resolved_date       DATE          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_toxicity_patient ON phm_edw.toxicity_assessment(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.radiation_plan (
    plan_id             SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    staging_id          INT           REFERENCES phm_edw.cancer_staging(staging_id),
    plan_name           VARCHAR(100)  NOT NULL,
    radiation_type      VARCHAR(50)   NOT NULL,  -- 'EBRT','Brachytherapy','SBRT','IMRT','Proton'
    target_site         VARCHAR(100)  NOT NULL,
    total_dose_gy       NUMERIC(6,2)  NULL,
    fractions           SMALLINT      NULL,
    fraction_dose_gy    NUMERIC(5,3)  NULL,
    start_date          DATE          NULL,
    end_date            DATE          NULL,
    status              VARCHAR(30)   NOT NULL DEFAULT 'Planned',
    radiation_oncologist_id INT       REFERENCES phm_edw.provider(provider_id),
    concurrent_chemo    BOOLEAN       NOT NULL DEFAULT FALSE,
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_radiation_plan_patient ON phm_edw.radiation_plan(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.survivor_care_plan (
    survivor_plan_id    SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    staging_id          INT           REFERENCES phm_edw.cancer_staging(staging_id),
    plan_created_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
    treatment_summary   TEXT          NOT NULL,
    late_effects_risk   TEXT          NULL,
    screening_plan      TEXT          NULL,
    lifestyle_recommendations TEXT    NULL,
    pcp_instructions    TEXT          NULL,        -- For PCP who takes over survivorship care
    author_id           INT           REFERENCES phm_edw.provider(provider_id),
    next_review_date    DATE          NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'Active',
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_survivor_plan_patient ON phm_edw.survivor_care_plan(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.surveillance_schedule (
    surveillance_id     SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    survivor_plan_id    INT           REFERENCES phm_edw.survivor_care_plan(survivor_plan_id),
    test_name           VARCHAR(100)  NOT NULL,   -- e.g., 'Annual Mammogram','CEA every 3 months'
    frequency           VARCHAR(100)  NOT NULL,
    next_due_date       DATE          NULL,
    last_completed_date DATE          NULL,
    status              VARCHAR(30)   NOT NULL DEFAULT 'Pending', -- 'Pending','Completed','Overdue'
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_surveillance_patient ON phm_edw.surveillance_schedule(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.treatment_outcome (
    outcome_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    staging_id          INT           REFERENCES phm_edw.cancer_staging(staging_id),
    assessment_date     DATE          NOT NULL,
    response_type       VARCHAR(50)   NOT NULL,
    -- 'Complete Response','Partial Response','Stable Disease','Progressive Disease'
    assessment_method   VARCHAR(100)  NULL,         -- 'CT','PET','Clinical','MRI'
    survival_status     VARCHAR(30)   NULL,          -- 'Alive-NED','Alive-With-Disease','Deceased'
    performance_status  VARCHAR(10)   NULL,          -- ECOG: '0','1','2','3','4'
    quality_of_life_score NUMERIC(5,2) NULL,
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_treatment_outcome_patient ON phm_edw.treatment_outcome(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.tumor_board_case (
    tb_case_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    staging_id          INT           REFERENCES phm_edw.cancer_staging(staging_id),
    presentation_date   DATE          NOT NULL,
    case_summary        TEXT          NOT NULL,
    clinical_question   TEXT          NULL,
    attendees           TEXT          NULL,
    status              VARCHAR(30)   NOT NULL DEFAULT 'Presented',
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.tumor_board_recommendation (
    recommendation_id   SERIAL        PRIMARY KEY,
    tb_case_id          INT           NOT NULL REFERENCES phm_edw.tumor_board_case(tb_case_id),
    recommendation_type VARCHAR(50)   NOT NULL, -- 'treatment','referral','trial','surveillance','supportive'
    recommendation_text TEXT          NOT NULL,
    rationale           TEXT          NULL,
    assigned_to_id      INT           REFERENCES phm_edw.provider(provider_id),
    due_date            DATE          NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'Pending',
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

-- ─────────────────────────────────────────────────────────────────────
-- RESEARCH & CLINICAL TRIALS
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.research_site (
    site_id             SERIAL        PRIMARY KEY,
    site_name           VARCHAR(200)  NOT NULL,
    org_id              INT           REFERENCES phm_edw.organization(org_id),
    pi_name             VARCHAR(200)  NULL,
    address             VARCHAR(500)  NULL,
    city                VARCHAR(100)  NULL,
    state               CHAR(2)       NULL,
    irb_number          VARCHAR(50)   NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.clinical_trial (
    trial_id            SERIAL        PRIMARY KEY,
    nct_number          VARCHAR(20)   NULL UNIQUE,  -- ClinicalTrials.gov identifier
    trial_name          VARCHAR(300)  NOT NULL,
    sponsor             VARCHAR(200)  NULL,
    phase               VARCHAR(20)   NOT NULL,      -- 'Phase I','Phase II','Phase III','Phase IV'
    trial_type          VARCHAR(50)   NOT NULL DEFAULT 'interventional',
    therapeutic_area    VARCHAR(100)  NULL,
    conditions          TEXT          NULL,           -- Comma-separated conditions
    interventions       TEXT          NULL,
    primary_endpoint    TEXT          NULL,
    start_date          DATE          NULL,
    estimated_end_date  DATE          NULL,
    status              VARCHAR(30)   NOT NULL DEFAULT 'Recruiting',
    -- 'Recruiting','Active Not Recruiting','Completed','Suspended','Withdrawn'
    target_enrollment   INT           NULL,
    current_enrollment  INT           NOT NULL DEFAULT 0,
    primary_site_id     INT           REFERENCES phm_edw.research_site(site_id),
    principal_investigator INT        REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_clinical_trial_status ON phm_edw.clinical_trial(status);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.trial_criteria (
    criteria_id         SERIAL        PRIMARY KEY,
    trial_id            INT           NOT NULL REFERENCES phm_edw.clinical_trial(trial_id),
    criteria_type       VARCHAR(20)   NOT NULL,    -- 'inclusion','exclusion'
    criteria_text       TEXT          NOT NULL,
    ordinal             SMALLINT      NOT NULL DEFAULT 0,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_trial_criteria_trial ON phm_edw.trial_criteria(trial_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.informed_consent (
    consent_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    trial_id            INT           NOT NULL REFERENCES phm_edw.clinical_trial(trial_id),
    consented_datetime  TIMESTAMP     NOT NULL DEFAULT NOW(),
    consent_version     VARCHAR(20)   NULL,
    consented_by        INT           REFERENCES phm_edw.provider(provider_id),
    consent_method      VARCHAR(30)   NOT NULL DEFAULT 'signed', -- 'signed','electronic','verbal'
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    withdrawn_datetime  TIMESTAMP     NULL,
    withdrawal_reason   VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.trial_enrollment (
    enrollment_id       SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    trial_id            INT           NOT NULL REFERENCES phm_edw.clinical_trial(trial_id),
    consent_id          INT           REFERENCES phm_edw.informed_consent(consent_id),
    site_id             INT           REFERENCES phm_edw.research_site(site_id),
    enrolled_date       DATE          NOT NULL,
    arm                 VARCHAR(100)  NULL,          -- e.g., 'Treatment A','Placebo','Open Label'
    enrollment_status   VARCHAR(30)   NOT NULL DEFAULT 'Active',
    -- 'Screening','Active','Completed','Withdrawn','Lost to Follow-up'
    completion_date     DATE          NULL,
    withdrawal_date     DATE          NULL,
    withdrawal_reason   VARCHAR(500)  NULL,
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_trial_enrollment_patient ON phm_edw.trial_enrollment(patient_id);
CREATE INDEX IF NOT EXISTS idx_trial_enrollment_trial   ON phm_edw.trial_enrollment(trial_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.research_publication (
    publication_id      SERIAL        PRIMARY KEY,
    trial_id            INT           REFERENCES phm_edw.clinical_trial(trial_id),
    title               VARCHAR(500)  NOT NULL,
    authors             TEXT          NOT NULL,
    journal             VARCHAR(200)  NULL,
    publication_date    DATE          NULL,
    doi                 VARCHAR(100)  NULL,
    abstract            TEXT          NULL,
    publication_type    VARCHAR(50)   NOT NULL DEFAULT 'article', -- 'article','abstract','poster','oral'
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.research_collaboration (
    collaboration_id    SERIAL        PRIMARY KEY,
    trial_id            INT           NOT NULL REFERENCES phm_edw.clinical_trial(trial_id),
    site_id             INT           NOT NULL REFERENCES phm_edw.research_site(site_id),
    role                VARCHAR(50)   NOT NULL, -- 'Lead','Participating','Coordinating'
    enrollment_target   INT           NULL,
    enrollment_actual   INT           NOT NULL DEFAULT 0,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

-- ─────────────────────────────────────────────────────────────────────
-- SPECIALTY-SPECIFIC TABLES
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.ecg_result (
    ecg_id              SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    ecg_datetime        TIMESTAMP     NOT NULL,
    heart_rate          SMALLINT      NULL,
    pr_interval_ms      SMALLINT      NULL,
    qrs_duration_ms     SMALLINT      NULL,
    qt_interval_ms      SMALLINT      NULL,
    qtc_interval_ms     SMALLINT      NULL,
    rhythm              VARCHAR(50)   NULL,          -- 'NSR','AFib','Sinus Tachycardia', etc.
    axis                VARCHAR(30)   NULL,
    interpretation      TEXT          NULL,
    is_abnormal         BOOLEAN       NOT NULL DEFAULT FALSE,
    read_by             INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_ecg_patient ON phm_edw.ecg_result(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.echo_result (
    echo_id             SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    echo_datetime       TIMESTAMP     NOT NULL,
    echo_type           VARCHAR(50)   NOT NULL DEFAULT 'TTE', -- 'TTE','TEE','Stress','Dobutamine'
    lvef_percent        SMALLINT      NULL,
    lv_diastolic_function VARCHAR(50) NULL,
    wall_motion         VARCHAR(100)  NULL,
    valve_assessment    TEXT          NULL,
    pericardium         VARCHAR(50)   NULL,
    impression          TEXT          NULL,
    read_by             INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_echo_patient ON phm_edw.echo_result(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.pulmonary_function_test (
    pft_id              SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    test_datetime       TIMESTAMP     NOT NULL,
    fev1_liters         NUMERIC(4,2)  NULL,
    fvc_liters          NUMERIC(4,2)  NULL,
    fev1_fvc_ratio      NUMERIC(5,3)  NULL,
    fev1_percent_predicted SMALLINT   NULL,
    fvc_percent_predicted SMALLINT    NULL,
    dlco_percent        SMALLINT      NULL,
    gold_stage          VARCHAR(10)   NULL,           -- 'I','II','III','IV' (for COPD)
    interpretation      TEXT          NULL,
    post_bronchodilator BOOLEAN       NOT NULL DEFAULT FALSE,
    read_by             INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_pft_patient ON phm_edw.pulmonary_function_test(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.visual_acuity (
    va_id               SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    test_datetime       TIMESTAMP     NOT NULL,
    right_eye_uncorrected VARCHAR(20) NULL,   -- e.g., '20/40'
    right_eye_corrected   VARCHAR(20) NULL,
    left_eye_uncorrected  VARCHAR(20) NULL,
    left_eye_corrected    VARCHAR(20) NULL,
    iop_right_mmhg      SMALLINT      NULL,
    iop_left_mmhg       SMALLINT      NULL,
    notes               TEXT          NULL,
    read_by             INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_visual_acuity_patient ON phm_edw.visual_acuity(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.retinal_image (
    image_id            SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    image_datetime      TIMESTAMP     NOT NULL,
    image_type          VARCHAR(50)   NOT NULL DEFAULT 'fundus_photo',
    eye                 VARCHAR(10)   NOT NULL, -- 'right','left','bilateral'
    dr_grade            VARCHAR(50)   NULL,      -- Diabetic retinopathy grade
    dme_present         BOOLEAN       NULL,
    findings            TEXT          NULL,
    read_by             INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_retinal_image_patient ON phm_edw.retinal_image(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.pregnancy_record (
    pregnancy_id        SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    lmp_date            DATE          NULL,
    edd_date            DATE          NULL,
    gestational_age_weeks SMALLINT    NULL,
    gravida             SMALLINT      NULL,
    para                SMALLINT      NULL,
    pregnancy_status    VARCHAR(30)   NOT NULL DEFAULT 'Active',
    -- 'Active','Delivered','Terminated','Miscarriage','Ectopic'
    risk_level          VARCHAR(20)   NULL, -- 'Low','Moderate','High'
    delivery_date       DATE          NULL,
    delivery_type       VARCHAR(30)   NULL, -- 'SVD','C-Section','Assisted'
    birth_outcome       VARCHAR(100)  NULL,
    notes               TEXT          NULL,
    ob_provider_id      INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_pregnancy_patient ON phm_edw.pregnancy_record(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.audiogram (
    audiogram_id        SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    test_datetime       TIMESTAMP     NOT NULL,
    right_500hz         SMALLINT      NULL,   -- dB HL thresholds
    right_1000hz        SMALLINT      NULL,
    right_2000hz        SMALLINT      NULL,
    right_4000hz        SMALLINT      NULL,
    left_500hz          SMALLINT      NULL,
    left_1000hz         SMALLINT      NULL,
    left_2000hz         SMALLINT      NULL,
    left_4000hz         SMALLINT      NULL,
    pta_right           NUMERIC(4,1)  NULL,   -- Pure-tone average
    pta_left            NUMERIC(4,1)  NULL,
    hearing_loss_type   VARCHAR(50)   NULL,   -- 'Conductive','Sensorineural','Mixed'
    severity            VARCHAR(30)   NULL,    -- 'Normal','Mild','Moderate','Severe','Profound'
    interpretation      TEXT          NULL,
    read_by             INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_audiogram_patient ON phm_edw.audiogram(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.lesion_documentation (
    lesion_id           SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    documented_datetime TIMESTAMP     NOT NULL DEFAULT NOW(),
    body_location       VARCHAR(100)  NOT NULL,
    body_subsite        VARCHAR(100)  NULL,
    lesion_type         VARCHAR(50)   NOT NULL, -- 'papule','plaque','macule','nodule','ulcer','vesicle'
    size_mm             NUMERIC(5,1)  NULL,
    color               VARCHAR(100)  NULL,
    borders             VARCHAR(50)   NULL,
    surface             VARCHAR(50)   NULL,
    dermoscopy_findings TEXT          NULL,
    differential        TEXT          NULL,
    management          VARCHAR(100)  NULL,     -- 'Monitor','Biopsy','Excision','Treat'
    image_reference     VARCHAR(200)  NULL,
    read_by             INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_lesion_patient ON phm_edw.lesion_documentation(patient_id);

COMMENT ON TABLE phm_edw.notification         IS 'Provider notifications: critical labs, care gaps, referrals, messages';
COMMENT ON TABLE phm_edw.ai_insight           IS 'Abigail AI-generated clinical insights per patient';
COMMENT ON TABLE phm_edw.ai_priority_queue    IS 'Daily AI-ranked priority patient list per provider';
COMMENT ON TABLE phm_edw.ai_generated_note    IS 'AI scribe-generated SOAP notes pending provider review';
COMMENT ON TABLE phm_edw.cancer_staging       IS 'AJCC cancer staging records';
COMMENT ON TABLE phm_edw.clinical_trial       IS 'Active and completed clinical trials';
COMMENT ON TABLE phm_edw.trial_enrollment     IS 'Patient enrollment in clinical trials';
