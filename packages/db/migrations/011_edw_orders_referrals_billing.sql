-- =====================================================================
-- 011_edw_orders_referrals_billing.sql
-- Phase: Demo Account — New EDW Tables (Part 2)
-- Adds orders, prescribing, referrals, care planning, billing tables
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.order_set (
    order_set_id        SERIAL        PRIMARY KEY,
    set_name            VARCHAR(200)  NOT NULL,
    set_type            VARCHAR(50)   NOT NULL DEFAULT 'clinical', -- 'clinical','preventive','chronic'
    specialty           VARCHAR(100)  NULL,
    description         VARCHAR(500)  NULL,
    version             VARCHAR(20)   NOT NULL DEFAULT '1.0',
    org_id              INT           REFERENCES phm_edw.organization(org_id),
    created_by          INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.order_set_version (
    version_id          SERIAL        PRIMARY KEY,
    order_set_id        INT           NOT NULL REFERENCES phm_edw.order_set(order_set_id),
    version_number      VARCHAR(20)   NOT NULL,
    change_summary      TEXT          NULL,
    approved_by         INT           REFERENCES phm_edw.provider(provider_id),
    approved_date       TIMESTAMP     NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.order_set_item (
    item_id             SERIAL        PRIMARY KEY,
    order_set_id        INT           NOT NULL REFERENCES phm_edw.order_set(order_set_id),
    item_name           VARCHAR(200)  NOT NULL,
    item_type           VARCHAR(30)   NOT NULL, -- 'lab','imaging','referral','medication','procedure','instruction'
    loinc_code          VARCHAR(20)   NULL,
    cpt_code            VARCHAR(20)   NULL,
    icd10_indication    VARCHAR(20)   NULL,
    frequency           VARCHAR(100)  NULL,
    default_priority    VARCHAR(20)   NOT NULL DEFAULT 'routine', -- 'stat','urgent','routine'
    is_required         BOOLEAN       NOT NULL DEFAULT FALSE,
    notes               VARCHAR(500)  NULL,
    ordinal             SMALLINT      NOT NULL DEFAULT 0,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_order_set_item_set ON phm_edw.order_set_item(order_set_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.clinical_order (
    order_id            SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    ordering_provider_id INT          REFERENCES phm_edw.provider(provider_id),
    order_set_id        INT           REFERENCES phm_edw.order_set(order_set_id),
    order_type          VARCHAR(30)   NOT NULL, -- 'lab','imaging','referral','procedure','medication'
    order_name          VARCHAR(255)  NOT NULL,
    loinc_code          VARCHAR(20)   NULL,
    cpt_code            VARCHAR(20)   NULL,
    icd10_indication    VARCHAR(20)   NULL,
    priority            VARCHAR(20)   NOT NULL DEFAULT 'routine',
    order_datetime      TIMESTAMP     NOT NULL DEFAULT NOW(),
    due_date            DATE          NULL,
    order_status        VARCHAR(30)   NOT NULL DEFAULT 'Ordered',
    -- 'Ordered','Pending','Resulted','Scheduled','Completed','Cancelled'
    instructions        TEXT          NULL,
    specimen_type       VARCHAR(50)   NULL,      -- for lab orders
    fasting_required    BOOLEAN       NOT NULL DEFAULT FALSE,
    order_source        VARCHAR(50)   NOT NULL DEFAULT 'provider', -- 'provider','order_set','standing'
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_clinical_order_patient  ON phm_edw.clinical_order(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_order_provider ON phm_edw.clinical_order(ordering_provider_id);
CREATE INDEX IF NOT EXISTS idx_clinical_order_status   ON phm_edw.clinical_order(order_status);
CREATE INDEX IF NOT EXISTS idx_clinical_order_type     ON phm_edw.clinical_order(order_type);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.order_result (
    result_id           SERIAL        PRIMARY KEY,
    order_id            INT           NOT NULL REFERENCES phm_edw.clinical_order(order_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    result_datetime     TIMESTAMP     NOT NULL DEFAULT NOW(),
    resulted_by         VARCHAR(100)  NULL,
    result_status       VARCHAR(20)   NOT NULL DEFAULT 'Final', -- 'Preliminary','Final','Corrected','Cancelled'
    result_value        TEXT          NULL,
    result_unit         VARCHAR(50)   NULL,
    reference_range     VARCHAR(100)  NULL,
    abnormal_flag       VARCHAR(10)   NULL,    -- 'H','L','HH','LL','A','N'
    critical_flag       BOOLEAN       NOT NULL DEFAULT FALSE,
    narrative           TEXT          NULL,
    performing_lab      VARCHAR(200)  NULL,
    reviewed_by         INT           REFERENCES phm_edw.provider(provider_id),
    reviewed_datetime   TIMESTAMP     NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_order_result_order   ON phm_edw.order_result(order_id);
CREATE INDEX IF NOT EXISTS idx_order_result_patient ON phm_edw.order_result(patient_id);
CREATE INDEX IF NOT EXISTS idx_order_result_critical ON phm_edw.order_result(critical_flag) WHERE critical_flag = TRUE;

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.order_basket (
    basket_id           SERIAL        PRIMARY KEY,
    provider_id         INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    order_id            INT           REFERENCES phm_edw.clinical_order(order_id),
    basket_status       VARCHAR(20)   NOT NULL DEFAULT 'Pending', -- 'Pending','Signed','Cancelled'
    added_datetime      TIMESTAMP     NOT NULL DEFAULT NOW(),
    signed_datetime     TIMESTAMP     NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_order_basket_provider ON phm_edw.order_basket(provider_id);

-- ─────────────────────────────────────────────────────────────────────
-- PRESCRIBING
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.pharmacy (
    pharmacy_id         SERIAL        PRIMARY KEY,
    pharmacy_name       VARCHAR(200)  NOT NULL,
    ncpdp_id            VARCHAR(20)   NULL,
    address             VARCHAR(500)  NULL,
    city                VARCHAR(100)  NULL,
    state               CHAR(2)       NULL,
    zip                 VARCHAR(10)   NULL,
    phone               VARCHAR(20)   NULL,
    fax                 VARCHAR(20)   NULL,
    pharmacy_type       VARCHAR(30)   NOT NULL DEFAULT 'retail', -- 'retail','mail_order','specialty','hospital'
    accepts_erx         BOOLEAN       NOT NULL DEFAULT TRUE,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.e_prescription (
    erx_id              SERIAL        PRIMARY KEY,
    medication_order_id INT           REFERENCES phm_edw.medication_order(medication_order_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    prescriber_id       INT           NOT NULL REFERENCES phm_edw.provider(provider_id),
    pharmacy_id         INT           REFERENCES phm_edw.pharmacy(pharmacy_id),
    drug_name           VARCHAR(200)  NOT NULL,
    ndc_code            VARCHAR(20)   NULL,
    sig                 VARCHAR(500)  NOT NULL,
    quantity            VARCHAR(50)   NOT NULL,
    days_supply         SMALLINT      NULL,
    refills_authorized  SMALLINT      NOT NULL DEFAULT 0,
    is_controlled       BOOLEAN       NOT NULL DEFAULT FALSE,
    dea_schedule        VARCHAR(5)    NULL,
    transmission_status VARCHAR(30)   NOT NULL DEFAULT 'Sent', -- 'Draft','Sent','Received','Filled','Error'
    sent_datetime       TIMESTAMP     NULL,
    filled_datetime     TIMESTAMP     NULL,
    prior_auth_required BOOLEAN       NOT NULL DEFAULT FALSE,
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_erx_patient ON phm_edw.e_prescription(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.drug_interaction_alert (
    alert_id            SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    drug_1_name         VARCHAR(200)  NOT NULL,
    drug_2_name         VARCHAR(200)  NOT NULL,
    interaction_type    VARCHAR(50)   NOT NULL, -- 'major','moderate','minor','contraindicated'
    description         TEXT          NOT NULL,
    clinical_significance VARCHAR(500) NULL,
    management          TEXT          NULL,
    triggered_datetime  TIMESTAMP     NOT NULL DEFAULT NOW(),
    acknowledged_by     INT           REFERENCES phm_edw.provider(provider_id),
    acknowledged_datetime TIMESTAMP   NULL,
    override_reason     VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_drug_alert_patient ON phm_edw.drug_interaction_alert(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.refill_request (
    refill_id           SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    medication_order_id INT           REFERENCES phm_edw.medication_order(medication_order_id),
    pharmacy_id         INT           REFERENCES phm_edw.pharmacy(pharmacy_id),
    drug_name           VARCHAR(200)  NOT NULL,
    requested_datetime  TIMESTAMP     NOT NULL DEFAULT NOW(),
    request_source      VARCHAR(30)   NOT NULL DEFAULT 'portal', -- 'portal','phone','pharmacy','app'
    request_status      VARCHAR(30)   NOT NULL DEFAULT 'Pending', -- 'Pending','Approved','Denied','Completed'
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    reviewed_datetime   TIMESTAMP     NULL,
    denial_reason       VARCHAR(500)  NULL,
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_refill_patient ON phm_edw.refill_request(patient_id);

-- ─────────────────────────────────────────────────────────────────────
-- REFERRALS & CARE COORDINATION
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.specialist_directory (
    specialist_id       SERIAL        PRIMARY KEY,
    org_id              INT           REFERENCES phm_edw.organization(org_id),
    practice_name       VARCHAR(200)  NOT NULL,
    specialty           VARCHAR(100)  NOT NULL,
    contact_name        VARCHAR(200)  NULL,
    npi_number          VARCHAR(20)   NULL,
    phone               VARCHAR(20)   NULL,
    fax                 VARCHAR(20)   NULL,
    address             VARCHAR(500)  NULL,
    city                VARCHAR(100)  NULL,
    state               CHAR(2)       NULL,
    zip                 VARCHAR(10)   NULL,
    accepting_new_patients BOOLEAN    NOT NULL DEFAULT TRUE,
    avg_wait_days       SMALLINT      NULL,
    quality_rating      NUMERIC(3,1)  NULL,        -- 0.0–5.0
    accepts_medicare    BOOLEAN       NOT NULL DEFAULT TRUE,
    accepts_medicaid    BOOLEAN       NOT NULL DEFAULT TRUE,
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_specialist_specialty ON phm_edw.specialist_directory(specialty);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.referral (
    referral_id         SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    referring_provider_id INT         REFERENCES phm_edw.provider(provider_id),
    specialist_id       INT           REFERENCES phm_edw.specialist_directory(specialist_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    order_id            INT           REFERENCES phm_edw.clinical_order(order_id),
    specialty           VARCHAR(100)  NOT NULL,
    referral_reason     TEXT          NOT NULL,
    urgency             VARCHAR(20)   NOT NULL DEFAULT 'Routine', -- 'Stat','Urgent','Routine'
    referral_date       DATE          NOT NULL DEFAULT CURRENT_DATE,
    referral_status     VARCHAR(30)   NOT NULL DEFAULT 'Sent',
    -- 'Sent','Scheduled','Completed','Report Received','Closed','Cancelled'
    scheduled_date      DATE          NULL,
    completed_date      DATE          NULL,
    report_received_date DATE         NULL,
    prior_auth_number   VARCHAR(50)   NULL,
    authorization_status VARCHAR(30)  NULL, -- 'Approved','Pending','Denied','Not Required'
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_referral_patient  ON phm_edw.referral(patient_id);
CREATE INDEX IF NOT EXISTS idx_referral_status   ON phm_edw.referral(referral_status);
CREATE INDEX IF NOT EXISTS idx_referral_provider ON phm_edw.referral(referring_provider_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.consult_note (
    consult_note_id     SERIAL        PRIMARY KEY,
    referral_id         INT           NOT NULL REFERENCES phm_edw.referral(referral_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    specialist_id       INT           REFERENCES phm_edw.specialist_directory(specialist_id),
    note_datetime       TIMESTAMP     NOT NULL DEFAULT NOW(),
    note_type           VARCHAR(50)   NOT NULL DEFAULT 'initial_consult',
    summary             TEXT          NOT NULL,
    findings            TEXT          NULL,
    recommendations     TEXT          NULL,
    follow_up_plan      TEXT          NULL,
    medications_changed TEXT          NULL,
    reviewed_by         INT           REFERENCES phm_edw.provider(provider_id),
    reviewed_datetime   TIMESTAMP     NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_consult_note_referral ON phm_edw.consult_note(referral_id);
CREATE INDEX IF NOT EXISTS idx_consult_note_patient  ON phm_edw.consult_note(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.care_team (
    care_team_id        SERIAL        PRIMARY KEY,
    team_name           VARCHAR(200)  NOT NULL,
    org_id              INT           REFERENCES phm_edw.organization(org_id),
    lead_provider_id    INT           REFERENCES phm_edw.provider(provider_id),
    team_type           VARCHAR(50)   NOT NULL DEFAULT 'primary_care',
    description         VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.care_team_member (
    member_id           SERIAL        PRIMARY KEY,
    care_team_id        INT           NOT NULL REFERENCES phm_edw.care_team(care_team_id),
    member_name         VARCHAR(200)  NOT NULL,
    role                VARCHAR(100)  NOT NULL,
    specialty           VARCHAR(100)  NULL,
    email               VARCHAR(100)  NULL,
    phone               VARCHAR(20)   NULL,
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    is_lead             BOOLEAN       NOT NULL DEFAULT FALSE,
    joined_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_care_team_member_team ON phm_edw.care_team_member(care_team_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.care_team_task (
    task_id             SERIAL        PRIMARY KEY,
    care_team_id        INT           REFERENCES phm_edw.care_team(care_team_id),
    patient_id          INT           REFERENCES phm_edw.patient(patient_id),
    assigned_to_member  INT           REFERENCES phm_edw.care_team_member(member_id),
    created_by_provider INT           REFERENCES phm_edw.provider(provider_id),
    task_title          VARCHAR(255)  NOT NULL,
    task_description    TEXT          NULL,
    task_category       VARCHAR(50)   NOT NULL DEFAULT 'clinical',
    -- 'clinical','administrative','care_coordination','follow_up','prior_auth'
    priority            VARCHAR(20)   NOT NULL DEFAULT 'normal', -- 'urgent','high','normal','low'
    due_date            DATE          NULL,
    task_status         VARCHAR(20)   NOT NULL DEFAULT 'To-Do', -- 'To-Do','In Progress','Completed','Cancelled'
    completed_datetime  TIMESTAMP     NULL,
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_care_task_patient ON phm_edw.care_team_task(patient_id);
CREATE INDEX IF NOT EXISTS idx_care_task_status  ON phm_edw.care_team_task(task_status);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.team_message (
    message_id          SERIAL        PRIMARY KEY,
    care_team_id        INT           NOT NULL REFERENCES phm_edw.care_team(care_team_id),
    sender_member_id    INT           REFERENCES phm_edw.care_team_member(member_id),
    patient_id          INT           REFERENCES phm_edw.patient(patient_id),
    message_text        TEXT          NOT NULL,
    sent_datetime       TIMESTAMP     NOT NULL DEFAULT NOW(),
    is_urgent           BOOLEAN       NOT NULL DEFAULT FALSE,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.huddle_session (
    huddle_id           SERIAL        PRIMARY KEY,
    care_team_id        INT           NOT NULL REFERENCES phm_edw.care_team(care_team_id),
    huddle_datetime     TIMESTAMP     NOT NULL,
    huddle_type         VARCHAR(30)   NOT NULL DEFAULT 'daily', -- 'daily','weekly','case_review'
    duration_min        SMALLINT      NULL,
    agenda              TEXT          NULL,
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.huddle_recommendation (
    recommendation_id   SERIAL        PRIMARY KEY,
    huddle_id           INT           NOT NULL REFERENCES phm_edw.huddle_session(huddle_id),
    patient_id          INT           REFERENCES phm_edw.patient(patient_id),
    recommendation_text TEXT          NOT NULL,
    assigned_to         INT           REFERENCES phm_edw.care_team_member(member_id),
    due_date            DATE          NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'Open',
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

CREATE TABLE IF NOT EXISTS phm_edw.medication_reconciliation (
    reconciliation_id   SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    referral_id         INT           REFERENCES phm_edw.referral(referral_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    reconciled_by       INT           REFERENCES phm_edw.provider(provider_id),
    reconciled_datetime TIMESTAMP     NOT NULL DEFAULT NOW(),
    source              VARCHAR(50)   NOT NULL DEFAULT 'referral', -- 'referral','discharge','portal'
    medications_added   JSONB         NULL,
    medications_changed JSONB         NULL,
    medications_stopped JSONB         NULL,
    reconciliation_notes TEXT         NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

-- ─────────────────────────────────────────────────────────────────────
-- CARE PLANNING
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.care_plan (
    care_plan_id        SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    plan_name           VARCHAR(200)  NOT NULL,
    plan_type           VARCHAR(50)   NOT NULL DEFAULT 'chronic_disease',
    -- 'chronic_disease','preventive','behavioral_health','palliative','transition'
    effective_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
    review_date         DATE          NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'Active',
    goals               TEXT          NULL,
    barriers            TEXT          NULL,
    notes               TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_care_plan_patient ON phm_edw.care_plan(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.care_plan_item (
    item_id             SERIAL        PRIMARY KEY,
    care_plan_id        INT           NOT NULL REFERENCES phm_edw.care_plan(care_plan_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    item_category       VARCHAR(50)   NOT NULL, -- 'medication','lab','referral','lifestyle','education'
    description         TEXT          NOT NULL,
    target_value        VARCHAR(100)  NULL,
    current_value       VARCHAR(100)  NULL,
    frequency           VARCHAR(100)  NULL,
    due_date            DATE          NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'Active',
    ordinal             SMALLINT      NOT NULL DEFAULT 0,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_care_plan_item_plan    ON phm_edw.care_plan_item(care_plan_id);
CREATE INDEX IF NOT EXISTS idx_care_plan_item_patient ON phm_edw.care_plan_item(patient_id);

CREATE TABLE IF NOT EXISTS phm_edw.patient_reported_outcome (
    pro_id              SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    instrument_name     VARCHAR(100)  NOT NULL, -- 'PHQ-9','GAD-7','PROMIS','Pre-Visit ROS'
    instrument_version  VARCHAR(20)   NULL,
    completed_datetime  TIMESTAMP     NOT NULL DEFAULT NOW(),
    total_score         NUMERIC(6,2)  NULL,
    score_interpretation VARCHAR(100) NULL,    -- e.g., 'Mild Depression','Remission'
    responses           JSONB         NULL,     -- Individual item responses
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_pro_patient ON phm_edw.patient_reported_outcome(patient_id);

-- ─────────────────────────────────────────────────────────────────────
-- BILLING & INSURANCE
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.encounter_diagnosis_code (
    code_id             SERIAL        PRIMARY KEY,
    encounter_id        INT           NOT NULL REFERENCES phm_edw.encounter(encounter_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    icd10_code          VARCHAR(20)   NOT NULL,
    icd10_description   VARCHAR(500)  NOT NULL,
    diagnosis_pointer   SMALLINT      NOT NULL DEFAULT 1,  -- 1=primary, 2-4=secondary
    hcc_code            VARCHAR(20)   NULL,
    hcc_description     VARCHAR(255)  NULL,
    hcc_weight          NUMERIC(6,4)  NULL,
    cpt_code            VARCHAR(20)   NULL,
    modifier            VARCHAR(10)   NULL,
    is_billable         BOOLEAN       NOT NULL DEFAULT TRUE,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_enc_dx_code_encounter ON phm_edw.encounter_diagnosis_code(encounter_id);
CREATE INDEX IF NOT EXISTS idx_enc_dx_code_icd10     ON phm_edw.encounter_diagnosis_code(icd10_code);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.insurance_eligibility (
    eligibility_id      SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    payer_id            INT           REFERENCES phm_edw.payer(payer_id),
    checked_datetime    TIMESTAMP     NOT NULL DEFAULT NOW(),
    appointment_id      INT           REFERENCES phm_edw.appointment(appointment_id),
    eligibility_status  VARCHAR(30)   NOT NULL, -- 'Eligible','Ineligible','Pending','Error'
    coverage_start      DATE          NULL,
    coverage_end        DATE          NULL,
    copay_amount        NUMERIC(8,2)  NULL,
    deductible_remaining NUMERIC(10,2) NULL,
    out_of_pocket_max   NUMERIC(10,2) NULL,
    response_code       VARCHAR(20)   NULL,
    response_message    VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_ins_elig_patient ON phm_edw.insurance_eligibility(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.prior_authorization (
    auth_id             SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    payer_id            INT           REFERENCES phm_edw.payer(payer_id),
    order_id            INT           REFERENCES phm_edw.clinical_order(order_id),
    referral_id         INT           REFERENCES phm_edw.referral(referral_id),
    service_type        VARCHAR(50)   NOT NULL, -- 'medication','imaging','referral','procedure','DME'
    service_description VARCHAR(500)  NOT NULL,
    cpt_code            VARCHAR(20)   NULL,
    icd10_code          VARCHAR(20)   NULL,
    requested_datetime  TIMESTAMP     NOT NULL DEFAULT NOW(),
    auth_status         VARCHAR(30)   NOT NULL DEFAULT 'Pending',
    -- 'Approved','Denied','Pending','Peer-to-Peer','Withdrawn'
    auth_number         VARCHAR(50)   NULL,
    approved_units      INT           NULL,
    approved_from       DATE          NULL,
    approved_to         DATE          NULL,
    denial_reason       VARCHAR(500)  NULL,
    submitted_by        INT           REFERENCES phm_edw.provider(provider_id),
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_prior_auth_patient ON phm_edw.prior_authorization(patient_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.billing_claim (
    claim_id            SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    payer_id            INT           REFERENCES phm_edw.payer(payer_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    claim_number        VARCHAR(50)   NULL,
    claim_type          VARCHAR(30)   NOT NULL DEFAULT 'professional', -- 'professional','facility'
    service_date        DATE          NOT NULL,
    submission_date     DATE          NULL,
    claim_status        VARCHAR(30)   NOT NULL DEFAULT 'Pending',
    -- 'Submitted','Pending','Paid','Denied','Adjusted','Voided'
    total_charges       NUMERIC(10,2) NOT NULL DEFAULT 0,
    allowed_amount      NUMERIC(10,2) NULL,
    paid_amount         NUMERIC(10,2) NULL,
    patient_responsibility NUMERIC(10,2) NULL,
    denial_reason       VARCHAR(500)  NULL,
    denial_code         VARCHAR(20)   NULL,
    remittance_date     DATE          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_claim_patient  ON phm_edw.billing_claim(patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_claim_encounter ON phm_edw.billing_claim(encounter_id);
CREATE INDEX IF NOT EXISTS idx_billing_claim_status   ON phm_edw.billing_claim(claim_status);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.billing_line_item (
    line_item_id        SERIAL        PRIMARY KEY,
    claim_id            INT           NOT NULL REFERENCES phm_edw.billing_claim(claim_id),
    cpt_code            VARCHAR(20)   NOT NULL,
    cpt_description     VARCHAR(255)  NULL,
    modifier            VARCHAR(10)   NULL,
    icd10_pointer_1     VARCHAR(20)   NULL,
    units               SMALLINT      NOT NULL DEFAULT 1,
    charge_amount       NUMERIC(10,2) NOT NULL,
    allowed_amount      NUMERIC(10,2) NULL,
    paid_amount         NUMERIC(10,2) NULL,
    line_status         VARCHAR(30)   NOT NULL DEFAULT 'Pending',
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_line_claim ON phm_edw.billing_line_item(claim_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.payment (
    payment_id          SERIAL        PRIMARY KEY,
    claim_id            INT           NOT NULL REFERENCES phm_edw.billing_claim(claim_id),
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    payer_id            INT           REFERENCES phm_edw.payer(payer_id),
    payment_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
    payment_type        VARCHAR(30)   NOT NULL DEFAULT 'insurance', -- 'insurance','patient','adjustment'
    payment_method      VARCHAR(30)   NULL,                         -- 'EFT','check','credit_card','cash'
    payment_amount      NUMERIC(10,2) NOT NULL,
    check_number        VARCHAR(50)   NULL,
    eob_number          VARCHAR(50)   NULL,
    notes               VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_claim   ON phm_edw.payment(claim_id);
CREATE INDEX IF NOT EXISTS idx_payment_patient ON phm_edw.payment(patient_id);

-- ─────────────────────────────────────────────────────────────────────
-- PATIENT PORTAL & MESSAGING
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.patient_message (
    message_id          SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    thread_id           INT           NULL,             -- groups messages into threads
    direction           VARCHAR(10)   NOT NULL,          -- 'inbound' (pt→prov), 'outbound' (prov→pt)
    subject             VARCHAR(255)  NOT NULL,
    message_body        TEXT          NOT NULL,
    category            VARCHAR(50)   NOT NULL DEFAULT 'general',
    -- 'general','medication','lab_result','appointment','billing','referral','symptom'
    priority            VARCHAR(20)   NOT NULL DEFAULT 'normal',
    sent_datetime       TIMESTAMP     NOT NULL DEFAULT NOW(),
    read_datetime       TIMESTAMP     NULL,
    is_read             BOOLEAN       NOT NULL DEFAULT FALSE,
    requires_response   BOOLEAN       NOT NULL DEFAULT FALSE,
    responded_datetime  TIMESTAMP     NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_patient_msg_patient  ON phm_edw.patient_message(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_msg_provider ON phm_edw.patient_message(provider_id);
CREATE INDEX IF NOT EXISTS idx_patient_msg_unread   ON phm_edw.patient_message(is_read) WHERE is_read = FALSE;

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.patient_feedback (
    feedback_id         SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    provider_id         INT           REFERENCES phm_edw.provider(provider_id),
    encounter_id        INT           REFERENCES phm_edw.encounter(encounter_id),
    feedback_date       DATE          NOT NULL DEFAULT CURRENT_DATE,
    survey_type         VARCHAR(50)   NOT NULL DEFAULT 'post_visit', -- 'post_visit','annual','nps'
    nps_score           SMALLINT      NULL,               -- 0–100 (or 0–10 scaled to 100)
    satisfaction_score  SMALLINT      NULL,               -- 1–5
    -- Dimension scores (1–5)
    score_communication SMALLINT      NULL,
    score_wait_time     SMALLINT      NULL,
    score_care_quality  SMALLINT      NULL,
    score_facility      SMALLINT      NULL,
    score_portal        SMALLINT      NULL,
    verbatim_comment    TEXT          NULL,
    sentiment           VARCHAR(20)   NULL,              -- 'positive','neutral','negative'
    follow_up_required  BOOLEAN       NOT NULL DEFAULT FALSE,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
CREATE INDEX IF NOT EXISTS idx_patient_feedback_patient  ON phm_edw.patient_feedback(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_feedback_provider ON phm_edw.patient_feedback(provider_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_edw.service_recovery_case (
    case_id             SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL REFERENCES phm_edw.patient(patient_id),
    feedback_id         INT           REFERENCES phm_edw.patient_feedback(feedback_id),
    assigned_to         INT           REFERENCES phm_edw.provider(provider_id),
    case_type           VARCHAR(50)   NOT NULL, -- 'complaint','escalation','grievance'
    description         TEXT          NOT NULL,
    priority            VARCHAR(20)   NOT NULL DEFAULT 'normal',
    case_status         VARCHAR(30)   NOT NULL DEFAULT 'Open', -- 'Open','In Progress','Resolved','Closed'
    opened_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
    resolved_date       DATE          NULL,
    resolution_notes    TEXT          NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);

COMMENT ON TABLE phm_edw.order_set IS 'Predefined clinical order sets (e.g., Diabetes Quarterly Follow-up)';
COMMENT ON TABLE phm_edw.clinical_order IS 'Unified order table for lab, imaging, referral, and procedure orders';
COMMENT ON TABLE phm_edw.order_result IS 'Results for clinical orders (lab, imaging, procedure)';
COMMENT ON TABLE phm_edw.pharmacy IS 'Pharmacy directory for e-prescription routing';
COMMENT ON TABLE phm_edw.e_prescription IS 'Electronic prescription transmissions';
COMMENT ON TABLE phm_edw.referral IS 'Specialist referrals with status tracking';
COMMENT ON TABLE phm_edw.billing_claim IS 'Professional billing claims per encounter';
COMMENT ON TABLE phm_edw.patient_message IS 'Secure messaging between patients and care team';
