-- =====================================================================
-- Kimball Star Schema for Population Health Management
-- PostgreSQL DDL (Comprehensive)
-- =====================================================================

-- (Optional) Drop schema if you want a clean slate:
-- DROP SCHEMA IF EXISTS phm_star CASCADE;

-- 1. Create Schema
CREATE SCHEMA IF NOT EXISTS phm_star;
COMMENT ON SCHEMA phm_star IS 'Kimball star schema for Population Health Management analytics.';


-- ---------------------------------------------------------------------
-- 2. Dimension Tables
-- ---------------------------------------------------------------------

-- 2.1 DimDate
CREATE TABLE phm_star.dim_date (
    date_key           INT          NOT NULL,  -- Surrogate key (YYYYMMDD)
    full_date          DATE         NOT NULL,
    day                SMALLINT     NOT NULL,
    month              SMALLINT     NOT NULL,
    year               SMALLINT     NOT NULL,
    quarter            SMALLINT     NOT NULL,
    week_of_year       SMALLINT     NOT NULL,
    day_of_week        SMALLINT     NOT NULL,  -- e.g., 1=Monday, 7=Sunday
    day_name           VARCHAR(20)  NOT NULL,  -- e.g., 'Monday'
    month_name         VARCHAR(20)  NOT NULL,  -- e.g., 'January'
    fiscal_year        SMALLINT     NULL,
    fiscal_quarter     SMALLINT     NULL,
    CONSTRAINT pk_dim_date PRIMARY KEY (date_key)
);
COMMENT ON TABLE phm_star.dim_date
  IS 'Date dimension (one row per calendar date). Typically prepopulated via script.';


-- 2.2 DimOrganization (SCD Type 2)
CREATE TABLE phm_star.dim_organization (
    org_key              SERIAL         PRIMARY KEY,
    org_id               INT            NOT NULL,     -- Natural key from EDW
    organization_name    VARCHAR(200)   NOT NULL,
    organization_type    VARCHAR(50)    NULL,         -- e.g., Clinic, Hospital
    parent_org_key       INT            NULL,         -- Self-referencing for hierarchy

    -- SCD2 fields
    effective_start_date DATE           NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date   DATE           NOT NULL DEFAULT ('9999-12-31')::date,
    is_current           BOOLEAN        NOT NULL DEFAULT TRUE,

    created_at           TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP      NULL,

    CONSTRAINT fk_dimorg_parent
        FOREIGN KEY (parent_org_key)
        REFERENCES phm_star.dim_organization (org_key)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_star.dim_organization
  IS 'Organization dimension (clinics, hospitals, etc.) with SCD Type 2.';


-- 2.3 DimProvider (SCD Type 2)
CREATE TABLE phm_star.dim_provider (
    provider_key         SERIAL         PRIMARY KEY,
    provider_id          INT            NOT NULL,     -- Natural key from EDW
    first_name           VARCHAR(100)   NULL,
    last_name            VARCHAR(100)   NULL,
    npi_number           VARCHAR(15)    NULL,
    specialty            VARCHAR(100)   NULL,
    provider_type        VARCHAR(50)    NULL,         -- e.g., MD, DO, NP
    org_key              INT            NULL,         -- Current org affiliation

    -- SCD2 fields
    effective_start_date DATE           NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date   DATE           NOT NULL DEFAULT ('9999-12-31')::date,
    is_current           BOOLEAN        NOT NULL DEFAULT TRUE,

    created_at           TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP      NULL,

    CONSTRAINT fk_dimprov_dimorg
        FOREIGN KEY (org_key)
        REFERENCES phm_star.dim_organization (org_key)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_star.dim_provider
  IS 'Provider dimension (physicians, NPs, etc.) with SCD Type 2.';


-- 2.4 DimPatient (SCD Type 2)
CREATE TABLE phm_star.dim_patient (
    patient_key          SERIAL        PRIMARY KEY,
    patient_id           INT           NOT NULL,     -- Natural key from EDW
    first_name           VARCHAR(100)  NULL,
    last_name            VARCHAR(100)  NULL,
    date_of_birth        DATE          NULL,
    gender               VARCHAR(50)   NULL,
    race                 VARCHAR(50)   NULL,
    ethnicity            VARCHAR(50)   NULL,
    marital_status       VARCHAR(50)   NULL,
    primary_language     VARCHAR(50)   NULL,

    -- Link to a PCP if needed
    pcp_provider_key     INT           NULL,

    -- SCD2 fields
    effective_start_date DATE          NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date   DATE          NOT NULL DEFAULT ('9999-12-31')::date,
    is_current           BOOLEAN       NOT NULL DEFAULT TRUE,

    created_at           TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP     NULL,

    CONSTRAINT fk_dimpat_provider
        FOREIGN KEY (pcp_provider_key)
        REFERENCES phm_star.dim_provider (provider_key)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_star.dim_patient
  IS 'Patient dimension (demographics), SCD Type 2.';


-- 2.5 DimCondition
-- Updated to explicitly handle ICD-10 codes with an optional code_system
CREATE TABLE phm_star.dim_condition (
    condition_key       SERIAL         PRIMARY KEY,
    condition_id        INT            NOT NULL,         -- Natural key from EDW
    icd10_code          VARCHAR(50)    NOT NULL,         -- e.g., "E11.9"
    condition_name      VARCHAR(255)   NOT NULL,         -- e.g., "Type 2 diabetes mellitus"
    code_system         VARCHAR(50)    NOT NULL DEFAULT 'ICD-10'
        CHECK (code_system IN ('ICD-10','SNOMED','ICD-9','OTHER')),
    created_at          TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP      NULL
);
COMMENT ON TABLE phm_star.dim_condition
  IS 'Condition dimension storing ICD-10 or SNOMED codes.';


-- 2.6 DimProcedure
CREATE TABLE phm_star.dim_procedure (
    procedure_key       SERIAL         PRIMARY KEY,
    procedure_id        INT            NOT NULL,       -- Natural key from EDW
    procedure_code      VARCHAR(50)    NOT NULL,       -- e.g., "99213"
    procedure_desc      VARCHAR(255)   NOT NULL,       -- e.g., "Office visit"
    code_system         VARCHAR(50)    NULL,           -- e.g., "CPT"
    created_at          TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP      NULL
);
COMMENT ON TABLE phm_star.dim_procedure
  IS 'Procedure dimension (CPT, HCPCS, ICD-10-PCS, etc.).';


-- 2.7 DimMedication
CREATE TABLE phm_star.dim_medication (
    medication_key      SERIAL         PRIMARY KEY,
    medication_id       INT            NOT NULL,      -- Natural key from EDW
    medication_code     VARCHAR(50)    NOT NULL,      -- e.g., RxNorm
    medication_name     VARCHAR(255)   NOT NULL,      -- e.g., "Metformin 500mg tablet"
    code_system         VARCHAR(50)    NULL,          -- e.g., "RxNorm" or "NDC"
    form                VARCHAR(50)    NULL,          -- e.g., "Tablet"
    strength            VARCHAR(50)    NULL,          -- e.g., "500 mg"
    created_at          TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP      NULL
);
COMMENT ON TABLE phm_star.dim_medication
  IS 'Medication dimension referencing RxNorm or NDC codes.';


-- 2.8 DimMeasure
CREATE TABLE phm_star.dim_measure (
    measure_key         SERIAL         PRIMARY KEY,
    measure_id          INT            NOT NULL,     -- Natural key from EDW
    measure_code        VARCHAR(50)    NOT NULL,     -- e.g. "CMS130v10"
    measure_name        VARCHAR(255)   NOT NULL,     -- e.g. "Colorectal Cancer Screening"
    measure_type        VARCHAR(50)    NULL,         -- e.g., Preventive, Chronic
    description         TEXT           NULL,
    created_at          TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP      NULL
);
COMMENT ON TABLE phm_star.dim_measure
  IS 'Dimension for eCQMs or other quality measures (Preventive, Chronic, etc.).';


-- ---------------------------------------------------------------------
-- 3. Fact Tables
-- ---------------------------------------------------------------------

-- 3.1 FactEncounter
CREATE TABLE phm_star.fact_encounter (
    encounter_key        BIGSERIAL      PRIMARY KEY,
    encounter_id         INT            NOT NULL,   -- Degenerate dimension from EDW
    patient_key          INT            NOT NULL,
    provider_key         INT            NULL,
    org_key              INT            NULL,
    date_key_encounter   INT            NOT NULL,   -- e.g., day of the encounter
    encounter_type       VARCHAR(50)    NULL,       -- e.g., Inpatient, Outpatient
    encounter_status     VARCHAR(50)    NULL,       -- e.g., Completed, Scheduled
    length_of_stay       DECIMAL(5,2)   NULL,       -- If inpatient
    count_encounter      INT            NOT NULL DEFAULT 1,

    CONSTRAINT fk_encounter_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient (patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_encounter_provider
        FOREIGN KEY (provider_key)
        REFERENCES phm_star.dim_provider (provider_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_encounter_org
        FOREIGN KEY (org_key)
        REFERENCES phm_star.dim_organization (org_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_encounter_date
        FOREIGN KEY (date_key_encounter)
        REFERENCES phm_star.dim_date (date_key)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_star.fact_encounter
  IS 'One row per patient encounter or visit.';


-- 3.2 FactDiagnosis
-- Updated to capture acute/chronic, active/resolved, etc.
CREATE TABLE phm_star.fact_diagnosis (
    diagnosis_key        BIGSERIAL      PRIMARY KEY,
    patient_key          INT            NOT NULL,
    encounter_key        BIGINT         NULL,       -- if diagnosis is associated w/ a specific encounter
    provider_key         INT            NULL,
    condition_key        INT            NOT NULL,   -- references dim_condition w/ ICD-10 code
    date_key_onset       INT            NULL,       -- date of onset
    diagnosis_type       VARCHAR(50)    NULL
        CHECK (diagnosis_type IN ('ACUTE','CHRONIC','OTHER') OR diagnosis_type IS NULL),
    diagnosis_status     VARCHAR(50)    NULL
        CHECK (diagnosis_status IN ('ACTIVE','RESOLVED','INACTIVE','UNKNOWN') OR diagnosis_status IS NULL),
    primary_indicator    BOOLEAN        DEFAULT FALSE,
    count_diagnosis      INT            NOT NULL DEFAULT 1,

    CONSTRAINT fk_diag_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient (patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_diag_encounter
        FOREIGN KEY (encounter_key)
        REFERENCES phm_star.fact_encounter (encounter_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_diag_provider
        FOREIGN KEY (provider_key)
        REFERENCES phm_star.dim_provider (provider_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_diag_condition
        FOREIGN KEY (condition_key)
        REFERENCES phm_star.dim_condition (condition_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_diag_date_onset
        FOREIGN KEY (date_key_onset)
        REFERENCES phm_star.dim_date (date_key)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_star.fact_diagnosis
  IS 'One row per diagnosis per encounter (grain). Tracks acute/chronic, active/resolved, etc.';


-- 3.3 FactProcedure
CREATE TABLE phm_star.fact_procedure (
    procedure_perf_key   BIGSERIAL      PRIMARY KEY,
    patient_key          INT            NOT NULL,
    encounter_key        BIGINT         NULL,
    provider_key         INT            NULL,
    procedure_key        INT            NOT NULL,
    date_key_procedure   INT            NULL,
    count_procedure      INT            NOT NULL DEFAULT 1,

    CONSTRAINT fk_fp_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient (patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fp_encounter
        FOREIGN KEY (encounter_key)
        REFERENCES phm_star.fact_encounter (encounter_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fp_provider
        FOREIGN KEY (provider_key)
        REFERENCES phm_star.dim_provider (provider_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fp_procedure
        FOREIGN KEY (procedure_key)
        REFERENCES phm_star.dim_procedure (procedure_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fp_date
        FOREIGN KEY (date_key_procedure)
        REFERENCES phm_star.dim_date (date_key)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_star.fact_procedure
  IS 'One row per procedure performed.';


-- 3.4 FactMedicationOrder
CREATE TABLE phm_star.fact_medication_order (
    med_order_key       BIGSERIAL      PRIMARY KEY,
    patient_key         INT            NOT NULL,
    encounter_key       BIGINT         NULL,
    provider_key        INT            NULL,
    medication_key      INT            NOT NULL,
    date_key_start      INT            NOT NULL,  -- e.g., prescription start
    date_key_end        INT            NULL,      -- if discontinued
    frequency           VARCHAR(50)    NULL,      -- e.g., "BID"
    route               VARCHAR(50)    NULL,      -- e.g., "Oral"
    refill_count        INT            NULL,
    prescription_status VARCHAR(50)    NULL,      -- Active, Completed, etc.
    count_med_order     INT            NOT NULL DEFAULT 1,

    CONSTRAINT fk_mo_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient (patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_mo_encounter
        FOREIGN KEY (encounter_key)
        REFERENCES phm_star.fact_encounter (encounter_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_mo_provider
        FOREIGN KEY (provider_key)
        REFERENCES phm_star.dim_provider (provider_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_mo_medication
        FOREIGN KEY (medication_key)
        REFERENCES phm_star.dim_medication (medication_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_mo_date_start
        FOREIGN KEY (date_key_start)
        REFERENCES phm_star.dim_date (date_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_mo_date_end
        FOREIGN KEY (date_key_end)
        REFERENCES phm_star.dim_date (date_key)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_star.fact_medication_order
  IS 'One row per medication order/prescription.';


-- 3.5 FactObservation
CREATE TABLE phm_star.fact_observation (
    observation_key     BIGSERIAL      PRIMARY KEY,
    patient_key         INT            NOT NULL,
    encounter_key       BIGINT         NULL,
    provider_key        INT            NULL,
    date_key_obs        INT            NOT NULL,  -- date of observation
    observation_code    VARCHAR(50)    NOT NULL,  -- e.g., LOINC
    observation_desc    VARCHAR(255)   NULL,
    value_numeric       DECIMAL(18,4)  NULL,
    value_text          VARCHAR(500)   NULL,
    units               VARCHAR(50)    NULL,
    abnormal_flag       CHAR(1)        NULL,      -- e.g., 'Y'/'N'
    count_observation   INT            NOT NULL DEFAULT 1,

    CONSTRAINT fk_obs_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient (patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_obs_encounter
        FOREIGN KEY (encounter_key)
        REFERENCES phm_star.fact_encounter (encounter_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_obs_provider
        FOREIGN KEY (provider_key)
        REFERENCES phm_star.dim_provider (provider_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_obs_date
        FOREIGN KEY (date_key_obs)
        REFERENCES phm_star.dim_date (date_key)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_star.fact_observation
  IS 'One row per lab result or clinical observation.';


-- 3.6 FactCareGap
CREATE TABLE phm_star.fact_care_gap (
    care_gap_key         BIGSERIAL     PRIMARY KEY,
    patient_key          INT           NOT NULL,
    measure_key          INT           NOT NULL,
    date_key_identified  INT           NOT NULL,
    date_key_resolved    INT           NULL,
    gap_status           VARCHAR(50)   NOT NULL,  -- e.g., Open, Closed
    count_care_gap       INT           NOT NULL DEFAULT 1,

    CONSTRAINT fk_cg_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient (patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_cg_measure
        FOREIGN KEY (measure_key)
        REFERENCES phm_star.dim_measure (measure_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_cg_date_ident
        FOREIGN KEY (date_key_identified)
        REFERENCES phm_star.dim_date (date_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_cg_date_resolved
        FOREIGN KEY (date_key_resolved)
        REFERENCES phm_star.dim_date (date_key)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_star.fact_care_gap
  IS 'Tracks care gaps (per measure) for a patient. Grain = one row per patient-measure gap.';


-- 3.7 FactMeasureResult (Optional)
CREATE TABLE phm_star.fact_measure_result (
    measure_result_key  BIGSERIAL      PRIMARY KEY,
    patient_key         INT            NOT NULL,
    measure_key         INT            NOT NULL,
    date_key_period     INT            NOT NULL,   -- e.g., monthly or quarterly snapshot
    denominator_flag    BOOLEAN        NOT NULL DEFAULT FALSE,
    numerator_flag      BOOLEAN        NOT NULL DEFAULT FALSE,
    exclusion_flag      BOOLEAN        NOT NULL DEFAULT FALSE,
    measure_value       DECIMAL(10,2)  NULL,       -- numeric measure (e.g., average A1C)
    count_measure       INT            NOT NULL DEFAULT 1,

    CONSTRAINT fk_mr_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient (patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_mr_measure
        FOREIGN KEY (measure_key)
        REFERENCES phm_star.dim_measure (measure_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_mr_date
        FOREIGN KEY (date_key_period)
        REFERENCES phm_star.dim_date (date_key)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_star.fact_measure_result
  IS 'Optional table to store periodic snapshots or computed measure results (e.g., monthly eCQM).';


-- =====================================================================
-- End of Comprehensive Kimball DDL for PHM
-- =====================================================================
