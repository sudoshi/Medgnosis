-- =====================================================================
-- DDL.sql
-- Inmon-Style 3NF Data Model for Population Health Management
-- PostgreSQL Version
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Create Schema (If you want to isolate these objects)
-- ---------------------------------------------------------------------
DROP SCHEMA IF EXISTS phm_edw CASCADE;
CREATE SCHEMA phm_edw;
COMMENT ON SCHEMA phm_edw IS 'Inmon-style 3NF EDW for Population Health Management';


-- *********************************************************************
-- SECTION A: CORE ENTITIES
-- *********************************************************************

-- ---------------------------------------------------------------------
-- A1. Address
-- Holds address details used by multiple entities (Patients, Providers, Orgs)
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.address (
    address_id         SERIAL        PRIMARY KEY,        -- PK
    address_line1      VARCHAR(255)  NOT NULL,           -- Street/PO Box
    address_line2      VARCHAR(255)  NULL,               -- Apt/Suite
    city               VARCHAR(100)  NOT NULL,
    state              VARCHAR(50)   NOT NULL,
    zip                VARCHAR(20)   NOT NULL,
    county             VARCHAR(100)  NULL,
    country            VARCHAR(50)   NOT NULL DEFAULT 'USA',
    latitude           DECIMAL(9,6)  NULL,               -- If storing geocodes
    longitude          DECIMAL(9,6)  NULL,
    effective_start_date DATE        NULL,
    effective_end_date   DATE        NULL,
    created_date       TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date       TIMESTAMP     NULL
);
COMMENT ON TABLE phm_edw.address IS 'Stores physical addresses. Referenced by Patient, Provider, Organization';


-- ---------------------------------------------------------------------
-- A2. Organization
-- Represents clinics, hospitals, practices, etc.
-- Self-reference for parent-child relationships (health system hierarchies)
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.organization (
    org_id             SERIAL        PRIMARY KEY,
    organization_name  VARCHAR(200)  NOT NULL,
    organization_type  VARCHAR(50)   NULL,           -- e.g., Clinic, Hospital
    parent_org_id      INT           NULL,           -- Self-referencing
    address_id         INT           NULL,           -- FK to Address
    primary_phone      VARCHAR(20)   NULL,
    secondary_phone    VARCHAR(20)   NULL,
    fax                VARCHAR(20)   NULL,
    email              VARCHAR(100)  NULL,
    website            VARCHAR(200)  NULL,
    active_ind         CHAR(1)       NOT NULL DEFAULT 'Y', -- Y=Active, N=Inactive
    effective_start_date DATE        NULL,
    effective_end_date   DATE        NULL,
    created_date       TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date       TIMESTAMP     NULL,

    CONSTRAINT fk_org_parent
        FOREIGN KEY (parent_org_id)
        REFERENCES phm_edw.organization(org_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_org_address
        FOREIGN KEY (address_id)
        REFERENCES phm_edw.address(address_id)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_edw.organization IS 'Master table for healthcare organizations (clinics, hospitals).';


-- ---------------------------------------------------------------------
-- A3. Provider
-- Stores providers (physicians, NPs, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.provider (
    provider_id        SERIAL        PRIMARY KEY,
    first_name         VARCHAR(100)  NOT NULL,
    middle_name        VARCHAR(100)  NULL,
    last_name          VARCHAR(100)  NOT NULL,
    display_name       VARCHAR(200)  NULL,           -- e.g., Dr. John Smith
    npi_number         VARCHAR(15)   NULL,
    license_number     VARCHAR(30)   NULL,
    license_state      VARCHAR(2)    NULL,
    dea_number         VARCHAR(20)   NULL,           -- If applicable
    provider_type      VARCHAR(50)   NULL,           -- e.g., MD, DO, NP
    specialty          VARCHAR(100)  NULL,
    org_id             INT           NULL,           -- FK to Organization
    primary_phone      VARCHAR(20)   NULL,
    email              VARCHAR(100)  NULL,
    active_ind         CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE        NULL,
    effective_end_date   DATE        NULL,
    created_date       TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date       TIMESTAMP     NULL,

    CONSTRAINT fk_provider_org
        FOREIGN KEY (org_id)
        REFERENCES phm_edw.organization(org_id)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_edw.provider IS 'Stores provider (physician, NP) details, includes NPI and org affiliation.';


-- ---------------------------------------------------------------------
-- A4. Patient
-- Stores patient demographic info
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.patient (
    patient_id         SERIAL        PRIMARY KEY,
    mrn                VARCHAR(50)   NULL,            -- Medical Record Number
    ssn                VARCHAR(11)   NULL,            -- If stored, mind PHI security
    first_name         VARCHAR(100)  NOT NULL,
    middle_name        VARCHAR(100)  NULL,
    last_name          VARCHAR(100)  NOT NULL,
    date_of_birth      DATE          NOT NULL,
    gender             VARCHAR(50)   NULL,            -- e.g., M, F, Non-binary
    race               VARCHAR(50)   NULL,
    ethnicity          VARCHAR(50)   NULL,
    marital_status     VARCHAR(50)   NULL,
    primary_language   VARCHAR(50)   NULL,
    address_id         INT           NULL,            -- FK to Address
    pcp_provider_id    INT           NULL,            -- FK to Provider (PCP)
    primary_phone      VARCHAR(20)   NULL,
    email              VARCHAR(100)  NULL,
    next_of_kin_name   VARCHAR(200)  NULL,
    next_of_kin_phone  VARCHAR(20)   NULL,
    active_ind         CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE        NULL,
    effective_end_date   DATE        NULL,
    created_date       TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date       TIMESTAMP     NULL,

    CONSTRAINT fk_patient_address
        FOREIGN KEY (address_id)
        REFERENCES phm_edw.address(address_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_patient_pcp
        FOREIGN KEY (pcp_provider_id)
        REFERENCES phm_edw.provider(provider_id)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_edw.patient IS 'Patient demographics. PCP_Provider links to provider as primary care physician.';


-- *********************************************************************
-- SECTION B: CLINICAL ENTITIES
-- *********************************************************************

-- ---------------------------------------------------------------------
-- B1. Encounter
-- Captures each patient encounter/visit
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.encounter (
    encounter_id         SERIAL        PRIMARY KEY,
    patient_id           INT           NOT NULL,      -- FK to Patient
    provider_id          INT           NULL,          -- FK to Provider (attending)
    org_id               INT           NULL,          -- FK to Organization
    encounter_number     VARCHAR(50)   NULL,          -- EHR's unique encounter/visit number
    encounter_type       VARCHAR(50)   NULL,          -- e.g., Outpatient, Inpatient, ER
    encounter_reason     VARCHAR(255)  NULL,          -- Chief complaint
    admission_datetime   TIMESTAMP     NULL,          -- For inpatient
    discharge_datetime   TIMESTAMP     NULL,          -- For inpatient
    encounter_datetime   TIMESTAMP     NULL,          -- For ambulatory visits
    disposition          VARCHAR(100)  NULL,          -- e.g., discharged to home, transfer
    status               VARCHAR(50)   NULL,          -- e.g., Completed, Canceled
    active_ind           CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE          NULL,
    effective_end_date   DATE          NULL,
    created_date         TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date         TIMESTAMP     NULL,

    CONSTRAINT fk_encounter_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_encounter_provider
        FOREIGN KEY (provider_id)
        REFERENCES phm_edw.provider(provider_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_encounter_org
        FOREIGN KEY (org_id)
        REFERENCES phm_edw.organization(org_id)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_edw.encounter IS 'Captures each patient encounter (visit).';


-- ---------------------------------------------------------------------
-- B2. Condition
-- Master table for diagnoses/conditions (ICD-10, SNOMED, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.condition (
    condition_id     SERIAL        PRIMARY KEY,
    condition_code   VARCHAR(50)   NOT NULL,  -- e.g., ICD-10 code "E11.9"
    condition_name   VARCHAR(255)  NOT NULL,  -- e.g., "Type 2 diabetes mellitus"
    code_system      VARCHAR(50)   NOT NULL DEFAULT 'ICD-10'
        CHECK (code_system IN ('ICD-10','SNOMED','ICD-9','OTHER')),
    description      VARCHAR(500)  NULL,      -- optional extended text
    active_ind       CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE      NULL,
    effective_end_date   DATE      NULL,
    created_date     TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date     TIMESTAMP     NULL
);
COMMENT ON TABLE phm_edw.condition IS 'Master list of diagnoses with ICD-10 or SNOMED codes.';


-- ---------------------------------------------------------------------
-- B3. Condition_Diagnosis
-- Linking table for actual diagnoses assigned to a patient (and encounter).
-- Incorporates acute/chronic & status (active/resolved).
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.condition_diagnosis (
    condition_diagnosis_id SERIAL      PRIMARY KEY,
    patient_id             INT         NOT NULL,
    encounter_id           INT         NULL,          -- Link if diagnosis assigned in an encounter
    provider_id            INT         NULL,          -- Who assigned diagnosis
    condition_id           INT         NOT NULL,      -- FK to Condition
    diagnosis_type         VARCHAR(50) NULL
        CHECK (diagnosis_type IN ('ACUTE','CHRONIC','OTHER') OR diagnosis_type IS NULL),
    diagnosis_status       VARCHAR(50) NULL
        CHECK (diagnosis_status IN ('ACTIVE','RESOLVED','INACTIVE','UNKNOWN') OR diagnosis_status IS NULL),
    onset_date             DATE        NULL,          -- When condition started
    resolution_date        DATE        NULL,          -- If resolved
    primary_indicator      CHAR(1)     NOT NULL DEFAULT 'N', -- 'Y' if primary for that encounter
    active_ind             CHAR(1)     NOT NULL DEFAULT 'Y',
    effective_start_date   DATE        NULL,
    effective_end_date     DATE        NULL,
    created_date           TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_date           TIMESTAMP   NULL,

    CONSTRAINT fk_conddiag_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_conddiag_encounter
        FOREIGN KEY (encounter_id)
        REFERENCES phm_edw.encounter(encounter_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_conddiag_provider
        FOREIGN KEY (provider_id)
        REFERENCES phm_edw.provider(provider_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_conddiag_condition
        FOREIGN KEY (condition_id)
        REFERENCES phm_edw.condition(condition_id)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_edw.condition_diagnosis
  IS 'Links patient/encounter to a condition. Tracks acute/chronic, status (active/resolved).';


-- ---------------------------------------------------------------------
-- B4. Procedure
-- Master table for clinical procedures (CPT, HCPCS, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.procedure (
    procedure_id     SERIAL        PRIMARY KEY,
    procedure_code   VARCHAR(50)   NOT NULL,  -- e.g., CPT code "99213"
    procedure_desc   VARCHAR(255)  NOT NULL,
    code_system      VARCHAR(50)   NULL,      -- e.g., "CPT", "HCPCS"
    active_ind       CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE      NULL,
    effective_end_date   DATE      NULL,
    created_date     TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date     TIMESTAMP     NULL
);
COMMENT ON TABLE phm_edw.procedure IS 'Master table for procedures (CPT, HCPCS, etc.).';


-- ---------------------------------------------------------------------
-- B5. Procedure_Performed
-- Many-to-many link between Patient/Encounter and Procedure
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.procedure_performed (
    procedure_performed_id SERIAL      PRIMARY KEY,
    patient_id             INT         NOT NULL,
    encounter_id           INT         NULL,
    provider_id            INT         NULL,
    procedure_id           INT         NOT NULL,
    procedure_datetime     TIMESTAMP   NULL,
    modifiers              VARCHAR(50) NULL,      -- e.g., CPT modifiers
    comments               VARCHAR(500)NULL,
    active_ind             CHAR(1)     NOT NULL DEFAULT 'Y',
    effective_start_date   DATE        NULL,
    effective_end_date     DATE        NULL,
    created_date           TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_date           TIMESTAMP   NULL,

    CONSTRAINT fk_pp_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_pp_encounter
        FOREIGN KEY (encounter_id)
        REFERENCES phm_edw.encounter(encounter_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_pp_provider
        FOREIGN KEY (provider_id)
        REFERENCES phm_edw.provider(provider_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_pp_procedure
        FOREIGN KEY (procedure_id)
        REFERENCES phm_edw.procedure(procedure_id)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_edw.procedure_performed
  IS 'Stores actual procedures performed for a patient (links to procedure master).';


-- ---------------------------------------------------------------------
-- B6. Observation
-- Stores clinical observations, lab results, vital signs, etc.
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.observation (
    observation_id       SERIAL      PRIMARY KEY,
    patient_id           INT         NOT NULL,
    encounter_id         INT         NULL,
    provider_id          INT         NULL,
    observation_datetime TIMESTAMP   NOT NULL,
    observation_code     VARCHAR(50) NOT NULL,  -- e.g., LOINC code
    observation_desc     VARCHAR(255)NULL,
    value_numeric        DECIMAL(18,4)NULL,
    value_text           VARCHAR(500)NULL,
    units                VARCHAR(50) NULL,
    reference_range      VARCHAR(100)NULL,
    abnormal_flag        CHAR(1)     NULL,      -- Y/N
    status               VARCHAR(50) NULL,      -- e.g., Final, Preliminary
    comments             VARCHAR(500)NULL,
    active_ind           CHAR(1)     NOT NULL DEFAULT 'Y',
    effective_start_date DATE        NULL,
    effective_end_date   DATE        NULL,
    created_date         TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_date         TIMESTAMP   NULL,

    CONSTRAINT fk_obs_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_obs_encounter
        FOREIGN KEY (encounter_id)
        REFERENCES phm_edw.encounter(encounter_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_obs_provider
        FOREIGN KEY (provider_id)
        REFERENCES phm_edw.provider(provider_id)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_edw.observation
  IS 'Stores lab results, vital signs, or other clinical observations.';


-- ---------------------------------------------------------------------
-- B7. Medication
-- Master table for medication codes (RxNorm, NDC)
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.medication (
    medication_id     SERIAL        PRIMARY KEY,
    medication_code   VARCHAR(50)   NOT NULL,   -- e.g., RxNorm, NDC
    medication_name   VARCHAR(255)  NOT NULL,   -- e.g., "Metformin 500mg tablet"
    code_system       VARCHAR(50)   NULL,       -- e.g., RxNorm, NDC
    form              VARCHAR(50)   NULL,       -- e.g., Tablet
    strength          VARCHAR(50)   NULL,       -- e.g., 500 mg
    active_ind        CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE       NULL,
    effective_end_date   DATE       NULL,
    created_date      TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date      TIMESTAMP     NULL
);
COMMENT ON TABLE phm_edw.medication
  IS 'Master table for medications (RxNorm, NDC).';


-- ---------------------------------------------------------------------
-- B8. Medication_Order
-- Tracks prescriptions or medication orders placed
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.medication_order (
    medication_order_id SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL,
    encounter_id        INT           NULL,
    provider_id         INT           NULL,
    medication_id       INT           NOT NULL,
    dosage              VARCHAR(50)   NULL,       -- e.g., 500 mg
    frequency           VARCHAR(50)   NULL,       -- e.g., BID, TID
    route               VARCHAR(50)   NULL,       -- e.g., Oral, IV
    start_datetime      TIMESTAMP     NULL,       -- e.g., prescription start
    end_datetime        TIMESTAMP     NULL,       -- if discontinued
    prescription_status VARCHAR(50)   NULL,       -- e.g., Active, Completed
    refill_count        INT           NULL,
    comments            VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE         NULL,
    effective_end_date   DATE         NULL,
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL,

    CONSTRAINT fk_mo_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_mo_encounter
        FOREIGN KEY (encounter_id)
        REFERENCES phm_edw.encounter(encounter_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_mo_provider
        FOREIGN KEY (provider_id)
        REFERENCES phm_edw.provider(provider_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_mo_medication
        FOREIGN KEY (medication_id)
        REFERENCES phm_edw.medication(medication_id)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_edw.medication_order
  IS 'Links patient + medication. Captures prescription or med order details.';


-- ---------------------------------------------------------------------
-- B9. Measure_Definition
-- Stores eCQM or other measure definitions
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.measure_definition (
    measure_id          SERIAL        PRIMARY KEY,
    measure_code        VARCHAR(50)   NOT NULL,   -- e.g., "CMS130v10"
    measure_name        VARCHAR(255)  NOT NULL,   -- e.g., "Colorectal Cancer Screening"
    measure_type        VARCHAR(50)   NULL,       -- e.g., Preventive, Chronic
    denominator_criteria VARCHAR(2000)NULL,
    numerator_criteria   VARCHAR(2000)NULL,
    exclusion_criteria   VARCHAR(2000)NULL,
    description         VARCHAR(2000) NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE         NULL,
    effective_end_date   DATE         NULL,
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL
);
COMMENT ON TABLE phm_edw.measure_definition
  IS 'Stores definitions of eCQMs, preventive measures, etc.';


-- ---------------------------------------------------------------------
-- B10. Care_Gap
-- Tracks open/closed gaps in care for recommended screenings or measures
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.care_gap (
    care_gap_id        SERIAL        PRIMARY KEY,
    patient_id         INT           NOT NULL,
    measure_id         INT           NOT NULL,
    gap_status         VARCHAR(50)   NOT NULL,    -- e.g., Open, Closed
    identified_date    TIMESTAMP     NOT NULL,
    resolved_date      TIMESTAMP     NULL,
    comments           VARCHAR(500)  NULL,
    active_ind         CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date       TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date       TIMESTAMP     NULL,

    CONSTRAINT fk_cg_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_cg_measure
        FOREIGN KEY (measure_id)
        REFERENCES phm_edw.measure_definition(measure_id)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_edw.care_gap
  IS 'Tracks patient-level care gaps (measure compliance).';


-- *********************************************************************
-- SECTION C: ADDITIONAL ENTITIES
-- *********************************************************************

-- ---------------------------------------------------------------------
-- C1. Payer
-- Tracks insurers/payers (Medicare, Medicaid, private, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.payer (
    payer_id          SERIAL        PRIMARY KEY,
    payer_name        VARCHAR(200)  NOT NULL,
    payer_type        VARCHAR(50)   NULL,           -- e.g., Commercial, Medicare
    address_id        INT           NULL,           -- If we track payer address
    active_ind        CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE       NULL,
    effective_end_date   DATE       NULL,
    created_date      TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date      TIMESTAMP     NULL,

    CONSTRAINT fk_payer_address
        FOREIGN KEY (address_id)
        REFERENCES phm_edw.address(address_id)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_edw.payer
  IS 'Stores insurance payer or plan entities (e.g., Medicare, BCBS).';


-- ---------------------------------------------------------------------
-- C2. Patient_Insurance_Coverage
-- Many-to-many link between patients and payers
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.patient_insurance_coverage (
    coverage_id        SERIAL        PRIMARY KEY,
    patient_id         INT           NOT NULL,
    payer_id           INT           NOT NULL,
    policy_number      VARCHAR(50)   NULL,
    coverage_start_date DATE         NOT NULL,
    coverage_end_date   DATE         NULL,
    primary_indicator CHAR(1)        NOT NULL DEFAULT 'Y', -- Y if this is primary coverage
    active_ind        CHAR(1)        NOT NULL DEFAULT 'Y',
    effective_start_date DATE        NULL,
    effective_end_date   DATE        NULL,
    created_date      TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_date      TIMESTAMP      NULL,

    CONSTRAINT fk_cov_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_cov_payer
        FOREIGN KEY (payer_id)
        REFERENCES phm_edw.payer(payer_id)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_edw.patient_insurance_coverage
  IS 'Tracks insurance coverage for a patient with a given payer.';


-- ---------------------------------------------------------------------
-- C3. Allergy
-- Master table for allergy codes (SNOMED or others)
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.allergy (
    allergy_id         SERIAL        PRIMARY KEY,
    allergy_code       VARCHAR(50)   NOT NULL,    -- e.g., SNOMED code
    allergy_name       VARCHAR(255)  NOT NULL,    -- e.g., "Penicillin Allergy"
    code_system        VARCHAR(50)   NULL,        -- e.g., SNOMED
    category           VARCHAR(50)   NULL,        -- e.g., Medication, Food, Environmental
    active_ind         CHAR(1)       NOT NULL DEFAULT 'Y',
    effective_start_date DATE        NULL,
    effective_end_date   DATE        NULL,
    created_date       TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date       TIMESTAMP     NULL
);
COMMENT ON TABLE phm_edw.allergy
  IS 'Master table for allergy definitions (e.g., SNOMED-coded allergies).';


-- ---------------------------------------------------------------------
-- C4. Patient_Allergy
-- Links patient to specific allergies
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.patient_allergy (
    patient_allergy_id  SERIAL       PRIMARY KEY,
    patient_id          INT          NOT NULL,
    allergy_id          INT          NOT NULL,
    reaction            VARCHAR(500) NULL,        -- e.g., "Hives", "Anaphylaxis"
    severity            VARCHAR(50)  NULL,        -- e.g., Mild, Moderate, Severe
    onset_date          DATE         NULL,
    end_date            DATE         NULL,
    status              VARCHAR(50)  NULL,        -- e.g., "Active", "Resolved"
    active_ind          CHAR(1)      NOT NULL DEFAULT 'Y',
    effective_start_date DATE        NULL,
    effective_end_date   DATE        NULL,
    created_date        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP    NULL,

    CONSTRAINT fk_patall_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_patall_allergy
        FOREIGN KEY (allergy_id)
        REFERENCES phm_edw.allergy(allergy_id)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_edw.patient_allergy
  IS 'Links patients to specific allergies, storing reaction/severity.';


-- ---------------------------------------------------------------------
-- C5. Immunization
-- Tracks vaccination events for a patient
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.immunization (
    immunization_id       SERIAL       PRIMARY KEY,
    patient_id            INT          NOT NULL,
    provider_id           INT          NULL,       -- who administered
    vaccine_code          VARCHAR(50)  NOT NULL,   -- e.g., CVX code
    vaccine_name          VARCHAR(255) NOT NULL,   -- e.g., "Influenza, injectable"
    administration_datetime TIMESTAMP  NOT NULL,
    lot_number            VARCHAR(50)  NULL,
    expiration_date       DATE         NULL,
    administration_site   VARCHAR(50)  NULL,       -- e.g., "Left Deltoid"
    reaction              VARCHAR(500) NULL,
    status                VARCHAR(50)  NULL,       -- e.g., Completed, Refused
    active_ind            CHAR(1)      NOT NULL DEFAULT 'Y',
    created_date          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_date          TIMESTAMP    NULL,

    CONSTRAINT fk_imm_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_imm_provider
        FOREIGN KEY (provider_id)
        REFERENCES phm_edw.provider(provider_id)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_edw.immunization
  IS 'Tracks immunizations or vaccinations for a patient.';


-- ---------------------------------------------------------------------
-- C6. SDOH_Assessment
-- Stores social determinants of health info
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.sdoh_assessment (
    sdoh_assessment_id  SERIAL        PRIMARY KEY,
    patient_id          INT           NOT NULL,
    assessment_date     DATE          NOT NULL,
    housing_status      VARCHAR(100)  NULL,   -- e.g., "Stable", "Homeless"
    food_insecurity_ind CHAR(1)       NULL,   -- Y/N
    transportation_ind  CHAR(1)       NULL,   -- Y/N
    social_isolation_score INT        NULL,   -- integer or numeric scale
    comments            VARCHAR(500)  NULL,
    active_ind          CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMP     NULL,

    CONSTRAINT fk_sdoh_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_edw.sdoh_assessment
  IS 'Social Determinants of Health data for a patient.';


-- ---------------------------------------------------------------------
-- C7. Patient_Attribution
-- Tracks patient attribution for a value-based program, e.g., ACO, MSSP
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.patient_attribution (
    attribution_id       SERIAL        PRIMARY KEY,
    patient_id           INT           NOT NULL,
    provider_id          INT           NULL,    -- If attributing to a specific provider
    org_id               INT           NULL,    -- Or attributing to an org
    program_name         VARCHAR(100)  NOT NULL, -- e.g., MSSP, Commercial ACO
    attribution_start_date DATE        NOT NULL,
    attribution_end_date   DATE        NULL,
    active_ind           CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date         TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date         TIMESTAMP     NULL,

    CONSTRAINT fk_attrib_patient
        FOREIGN KEY (patient_id)
        REFERENCES phm_edw.patient(patient_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_attrib_provider
        FOREIGN KEY (provider_id)
        REFERENCES phm_edw.provider(provider_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_attrib_org
        FOREIGN KEY (org_id)
        REFERENCES phm_edw.organization(org_id)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_edw.patient_attribution
  IS 'Tracks which provider or organization a patient is attributed to under a given program.';


-- ---------------------------------------------------------------------
-- C8. ETL_Log
-- Logs details of ETL runs, data loads, etc.
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.etl_log (
    etl_log_id          SERIAL        PRIMARY KEY,
    source_system       VARCHAR(100)  NOT NULL,  -- e.g., "EHR1", "HL7_feed"
    load_start_timestamp TIMESTAMP    NOT NULL,
    load_end_timestamp   TIMESTAMP    NULL,
    rows_inserted       INT           DEFAULT 0,
    rows_updated        INT           DEFAULT 0,
    load_status         VARCHAR(50)   NOT NULL,  -- e.g., SUCCESS, FAILURE
    error_message       VARCHAR(2000) NULL,
    created_date        TIMESTAMP     NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE phm_edw.etl_log
  IS 'Tracks ETL processes for auditing data loads into the EDW.';


-- ---------------------------------------------------------------------
-- C9. Code_Crosswalk
-- Generic table for code mappings (ICD-9 to ICD-10, old to new codes, etc.)
-- ---------------------------------------------------------------------
CREATE TABLE phm_edw.code_crosswalk (
    crosswalk_id      SERIAL        PRIMARY KEY,
    source_code       VARCHAR(50)   NOT NULL,   -- e.g., ICD-9 "250.00"
    source_code_system VARCHAR(50)  NOT NULL,   -- e.g., "ICD-9"
    target_code       VARCHAR(50)   NOT NULL,   -- e.g., ICD-10 "E11.9"
    target_code_system VARCHAR(50)  NOT NULL,   -- e.g., "ICD-10"
    valid_from        DATE          NULL,
    valid_to          DATE          NULL,
    active_ind        CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date      TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date      TIMESTAMP     NULL
);
COMMENT ON TABLE phm_edw.code_crosswalk
  IS 'Generic reference for mapping codes between systems (ICD-9, ICD-10, SNOMED, etc.).';

-- =====================================================================
-- End of DDL.sql
-- =====================================================================
