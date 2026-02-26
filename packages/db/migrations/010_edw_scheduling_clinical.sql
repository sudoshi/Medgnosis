-- =====================================================================
-- 010_edw_scheduling_clinical.sql
-- Phase: Demo Account — New EDW Tables (Part 1)
-- Adds scheduling + clinical documentation tables to phm_edw
-- Follows EDW convention: SERIAL PK, active_ind CHAR(1), created_date/updated_date
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- SCHEDULING TABLES
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.clinic_resource (
    resource_id     SERIAL        PRIMARY KEY,
    org_id          INT           REFERENCES phm_edw.organization(org_id),
    resource_name   VARCHAR(100)  NOT NULL,           -- e.g., 'Exam Room 1', 'Telehealth Suite A'
    resource_type   VARCHAR(50)   NOT NULL,           -- 'exam_room', 'telehealth', 'procedure_room'
    capacity        INT           NOT NULL DEFAULT 1,
    notes           VARCHAR(500)  NULL,
    active_ind      CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date    TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_clinic_resource_org ON phm_edw.clinic_resource(org_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.provider_schedule (
    schedule_id         SERIAL        PRIMARY KEY,
    provider_id         INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    org_id              INT           REFERENCES phm_edw.organization(org_id),
    day_of_week         SMALLINT      NOT NULL,           -- 0=Sun … 6=Sat
    start_time          TIME          NOT NULL,
    end_time            TIME          NOT NULL,
    slot_duration_min   SMALLINT      NOT NULL DEFAULT 30,
    schedule_type       VARCHAR(50)   NOT NULL DEFAULT 'clinic', -- 'clinic', 'telehealth', 'admin', 'off'
    effective_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
    end_date            DATE          NULL,
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_prov_sched_provider ON phm_edw.provider_schedule(provider_id);
CREATE INDEX IF NOT EXISTS idx_prov_sched_dow ON phm_edw.provider_schedule(day_of_week);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.appointment (
    appointment_id      SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    provider_id         INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    org_id              INT           REFERENCES phm_edw.organization(org_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),  -- linked after check-in
    resource_id         INT           REFERENCES phm_edw.clinic_resource(resource_id),
    appointment_date    DATE          NOT NULL,
    start_time          TIME          NOT NULL,
    end_time            TIME          NOT NULL,
    appointment_type    VARCHAR(50)   NOT NULL DEFAULT 'office_visit',
    -- 'office_visit','telehealth','annual_wellness','urgent','new_patient','procedure'
    chief_complaint     VARCHAR(500)  NULL,
    visit_reason        VARCHAR(255)  NULL,
    status              VARCHAR(30)   NOT NULL DEFAULT 'Scheduled',
    -- 'Scheduled','Confirmed','Checked-In','In-Progress','Completed','No-Show','Cancelled'
    check_in_time       TIMESTAMP     NULL,
    rooming_time        TIMESTAMP     NULL,
    visit_start_time    TIMESTAMP     NULL,
    visit_end_time      TIMESTAMP     NULL,
    is_telehealth       BOOLEAN       NOT NULL DEFAULT FALSE,
    telehealth_url      VARCHAR(500)  NULL,
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_patient  ON phm_edw.appointment(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_provider ON phm_edw.appointment(provider_id);
CREATE INDEX IF NOT EXISTS idx_appt_date     ON phm_edw.appointment(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appt_status   ON phm_edw.appointment(status);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.patient_check_in (
    check_in_id         SERIAL        PRIMARY KEY,
    appointment_id      INT           NOT NULL REFERENCES phm_edw.appointment(appointment_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    check_in_timestamp  TIMESTAMP     NOT NULL DEFAULT NOW(),
    check_in_method     VARCHAR(30)   NOT NULL DEFAULT 'front_desk', -- 'front_desk','kiosk','portal','telehealth'
    copay_amount        NUMERIC(8,2)  NULL,
    copay_collected     BOOLEAN       NOT NULL DEFAULT FALSE,
    insurance_verified  BOOLEAN       NOT NULL DEFAULT FALSE,
    id_verified         BOOLEAN       NOT NULL DEFAULT FALSE,
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_checkin_appt ON phm_edw.patient_check_in(appointment_id);

-- ─────────────────────────────────────────────────────────────────────
-- CLINICAL DOCUMENTATION TABLES
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.problem_list (
    problem_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    condition_id        INT           REFERENCES phm_edw.condition(condition_id),
    problem_name        VARCHAR(255)  NOT NULL,
    icd10_code          VARCHAR(20)   NULL,
    onset_date          DATE          NULL,
    resolved_date       DATE          NULL,
    problem_status      VARCHAR(30)   NOT NULL DEFAULT 'Active', -- 'Active','Resolved','Inactive','Chronic'
    problem_type        VARCHAR(50)   NOT NULL DEFAULT 'Chronic', -- 'Chronic','Acute','Preventive','Social'
    severity            VARCHAR(20)   NULL,                        -- 'Mild','Moderate','Severe'
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_problem_list_patient ON phm_edw.problem_list(patient_id);
CREATE INDEX IF NOT EXISTS idx_problem_list_status  ON phm_edw.problem_list(problem_status);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.vital_sign (
    vital_id            SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    recorded_by         INT           REFERENCES phm_edw.provider(provider_id),
    recorded_datetime   TIMESTAMP     NOT NULL,
    -- Blood pressure
    bp_systolic         SMALLINT      NULL,
    bp_diastolic        SMALLINT      NULL,
    bp_position         VARCHAR(20)   NULL DEFAULT 'sitting',
    -- Heart rate
    heart_rate          SMALLINT      NULL,
    heart_rhythm        VARCHAR(20)   NULL DEFAULT 'Regular',
    -- Temperature
    temperature_f       NUMERIC(5,2)  NULL,
    temp_route          VARCHAR(20)   NULL DEFAULT 'oral',
    -- Respiratory
    respiratory_rate    SMALLINT      NULL,
    -- Oxygen saturation
    spo2_percent        NUMERIC(5,2)  NULL,
    o2_delivery         VARCHAR(50)   NULL DEFAULT 'Room Air',
    -- Anthropometric
    weight_lbs          NUMERIC(7,2)  NULL,
    height_in           NUMERIC(6,2)  NULL,
    bmi                 NUMERIC(6,2)  NULL,
    -- Pain
    pain_score          SMALLINT      NULL,              -- 0–10
    -- Notes
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_vital_patient   ON phm_edw.vital_sign(patient_id);
CREATE INDEX IF NOT EXISTS idx_vital_encounter ON phm_edw.vital_sign(encounter_id);
CREATE INDEX IF NOT EXISTS idx_vital_datetime  ON phm_edw.vital_sign(recorded_datetime);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.exam_template (
    template_id         SERIAL        PRIMARY KEY,
    template_name       VARCHAR(200)  NOT NULL,
    template_type       VARCHAR(50)   NOT NULL, -- 'system_review','specialty','ros','pe_summary'
    specialty           VARCHAR(100)  NULL,
    description         VARCHAR(500)  NULL,
    version             VARCHAR(20)   NOT NULL DEFAULT '1.0',
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.exam_template_item (
    item_id             SERIAL        PRIMARY KEY,
    template_id         INT           NOT NULL REFERENCES phm_edw.exam_template(template_id),
    section_name        VARCHAR(100)  NOT NULL,   -- e.g., 'Cardiovascular', 'Respiratory'
    item_text           VARCHAR(500)  NOT NULL,   -- The finding text
    item_type           VARCHAR(30)   NOT NULL DEFAULT 'checkbox', -- 'checkbox','text','numeric','radio'
    normal_text         VARCHAR(255)  NULL,        -- Default normal finding text
    ordinal             SMALLINT      NOT NULL DEFAULT 0,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_template_item_tid ON phm_edw.exam_template_item(template_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.exam_finding (
    finding_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    template_id         INT           REFERENCES phm_edw.exam_template(template_id),
    item_id             INT           REFERENCES phm_edw.exam_template_item(item_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    section_name        VARCHAR(100)  NOT NULL,
    finding_text        TEXT          NOT NULL,
    is_abnormal         BOOLEAN       NOT NULL DEFAULT FALSE,
    finding_datetime    TIMESTAMP     NOT NULL DEFAULT NOW(),
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_finding_patient   ON phm_edw.exam_finding(patient_id);
CREATE INDEX IF NOT EXISTS idx_exam_finding_encounter ON phm_edw.exam_finding(encounter_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.review_of_systems (
    ros_id              SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    completed_datetime  TIMESTAMP     NOT NULL DEFAULT NOW(),
    completed_by        VARCHAR(50)   NOT NULL DEFAULT 'provider', -- 'provider','patient','ma'
    -- System by system (positive/negative/not_assessed)
    constitutional      VARCHAR(20)   DEFAULT 'negative',
    heent               VARCHAR(20)   DEFAULT 'negative',
    cardiovascular      VARCHAR(20)   DEFAULT 'negative',
    respiratory         VARCHAR(20)   DEFAULT 'negative',
    gastrointestinal    VARCHAR(20)   DEFAULT 'negative',
    genitourinary       VARCHAR(20)   DEFAULT 'negative',
    musculoskeletal     VARCHAR(20)   DEFAULT 'negative',
    integumentary       VARCHAR(20)   DEFAULT 'negative',
    neurological        VARCHAR(20)   DEFAULT 'negative',
    psychiatric         VARCHAR(20)   DEFAULT 'negative',
    endocrine           VARCHAR(20)   DEFAULT 'negative',
    hematologic         VARCHAR(20)   DEFAULT 'negative',
    allergic_immunologic VARCHAR(20)  DEFAULT 'negative',
    positive_systems    VARCHAR(500)  NULL,  -- Free text for positive systems
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_ros_patient   ON phm_edw.review_of_systems(patient_id);
CREATE INDEX IF NOT EXISTS idx_ros_encounter ON phm_edw.review_of_systems(encounter_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.clinical_note (
    note_id             SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    note_type           VARCHAR(50)   NOT NULL DEFAULT 'progress_note',
    -- 'progress_note','discharge_summary','consult_note','procedure_note','ai_draft'
    note_datetime       TIMESTAMP     NOT NULL DEFAULT NOW(),
    status              VARCHAR(20)   NOT NULL DEFAULT 'Signed', -- 'Draft','Pending Review','Signed','Amended'
    -- SOAP sections stored as text
    subjective          TEXT          NULL,
    objective           TEXT          NULL,
    assessment          TEXT          NULL,
    plan                TEXT          NULL,
    -- Optional structured fields
    hpi                 TEXT          NULL,
    pmh                 TEXT          NULL,
    social_history      TEXT          NULL,
    family_history      TEXT          NULL,
    ros_summary         TEXT          NULL,
    physical_exam       TEXT          NULL,
    -- Metadata
    word_count          INT           NULL,
    is_ai_generated     BOOLEAN       NOT NULL DEFAULT FALSE,
    signed_datetime     TIMESTAMP     NULL,
    addendum            TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_clinical_note_patient   ON phm_edw.clinical_note(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_encounter ON phm_edw.clinical_note(encounter_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_type      ON phm_edw.clinical_note(note_type);
CREATE INDEX IF NOT EXISTS idx_clinical_note_date      ON phm_edw.clinical_note(note_datetime);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.specialty_note (
    specialty_note_id   SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    specialty           VARCHAR(100)  NOT NULL,
    note_subtype        VARCHAR(50)   NOT NULL DEFAULT 'initial', -- 'initial','follow_up','procedure'
    note_datetime       TIMESTAMP     NOT NULL DEFAULT NOW(),
    structured_data     JSONB         NULL,    -- Specialty-specific fields as JSON
    narrative           TEXT          NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'Signed',
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_specialty_note_patient ON phm_edw.specialty_note(patient_id);

-- ─────────────────────────────────────────────────────────────────────
-- TELEHEALTH
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.telehealth_session (
    session_id          SERIAL        PRIMARY KEY,
    appointment_id      INT           REFERENCES phm_edw.appointment(appointment_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    provider_id         INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    session_url         VARCHAR(500)  NULL,
    session_token       VARCHAR(255)  NULL,
    platform            VARCHAR(50)   NOT NULL DEFAULT 'Medgnosis Telehealth',
    scheduled_start     TIMESTAMP     NULL,
    actual_start        TIMESTAMP     NULL,
    actual_end          TIMESTAMP     NULL,
    duration_min        SMALLINT      NULL,
    status              VARCHAR(30)   NOT NULL DEFAULT 'Scheduled',
    -- 'Scheduled','In-Progress','Completed','Patient-No-Show','Technical-Failure'
    recording_url       VARCHAR(500)  NULL,
    patient_device      VARCHAR(50)   NULL,
    connection_quality  VARCHAR(20)   NULL,
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_telehealth_patient  ON phm_edw.telehealth_session(patient_id);
CREATE INDEX IF NOT EXISTS idx_telehealth_provider ON phm_edw.telehealth_session(provider_id);

COMMENT ON TABLE phm_edw.clinic_resource      IS 'Exam rooms, telehealth suites, and procedure rooms for scheduling';
COMMENT ON TABLE phm_edw.provider_schedule    IS 'Provider weekly schedule templates with slot durations';
COMMENT ON TABLE phm_edw.appointment          IS 'Patient appointments: historical and future';
COMMENT ON TABLE phm_edw.patient_check_in     IS 'Check-in records for appointments (kiosk, front desk, portal)';
COMMENT ON TABLE phm_edw.problem_list         IS 'Persistent patient problem list, distinct from encounter-level diagnoses';
COMMENT ON TABLE phm_edw.vital_sign           IS 'Structured vital sign readings per encounter';
COMMENT ON TABLE phm_edw.exam_template        IS 'Physical exam and specialty template definitions';
COMMENT ON TABLE phm_edw.exam_template_item   IS 'Individual items within an exam template';
COMMENT ON TABLE phm_edw.exam_finding         IS 'Recorded physical exam findings per encounter';
COMMENT ON TABLE phm_edw.review_of_systems    IS 'Structured ROS per encounter';
COMMENT ON TABLE phm_edw.clinical_note        IS 'SOAP-structured clinical notes with AI draft support';
COMMENT ON TABLE phm_edw.specialty_note       IS 'Specialty-specific clinical notes with JSONB structured data';
COMMENT ON TABLE phm_edw.telehealth_session   IS 'Telehealth video session metadata and tracking';
