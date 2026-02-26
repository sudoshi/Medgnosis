-- =====================================================================
-- 010_star_schema_v2.sql
-- Phase 6: Star Schema v2 — Bundles, AI Risk, Composite, Performance
--
-- Adds to phm_star:
--   New dimensions: dim_payer, dim_allergy, dim_care_gap_bundle,
--                   bridge_bundle_measure, dim_risk_model
--   Altered tables: dim_measure (7 cols), fact_care_gap (4 cols)
--   New fact tables: fact_patient_bundle, fact_patient_bundle_detail,
--                    fact_patient_composite, fact_provider_quality,
--                    fact_ai_risk_score, fact_population_snapshot,
--                    fact_immunization, fact_patient_insurance, fact_sdoh
--   Indexes: 27 performance indexes
--   Materialized views: mv_patient_dashboard, mv_bundle_compliance_by_provider,
--                       mv_population_overview, mv_care_gap_worklist
-- =====================================================================

-- =====================================================================
-- SECTION 1: NEW DIMENSIONS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.1 dim_payer — insurance payer dimension (Type 1)
-- Source: phm_edw.payer
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.dim_payer (
    payer_key            SERIAL         PRIMARY KEY,
    payer_id             INT            NOT NULL,         -- Natural key from EDW
    payer_name           VARCHAR(200)   NOT NULL,
    payer_type           VARCHAR(50)    NULL,             -- e.g., Medicare, Medicaid, Commercial
    is_current           BOOLEAN        NOT NULL DEFAULT TRUE,
    effective_start_date DATE           NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date   DATE           NOT NULL DEFAULT '9999-12-31',
    created_at           TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP      NULL
);
COMMENT ON TABLE phm_star.dim_payer
    IS 'Payer (insurance) dimension. Type 1 — truncate/reload each ETL run.';

CREATE UNIQUE INDEX uq_dim_payer_id ON phm_star.dim_payer(payer_id);


-- ---------------------------------------------------------------------
-- 1.2 dim_allergy — allergy reference dimension (Type 1)
-- Source: phm_edw.allergy
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.dim_allergy (
    allergy_key          SERIAL         PRIMARY KEY,
    allergy_id           INT            NOT NULL,         -- Natural key from EDW
    allergy_code         VARCHAR(50)    NOT NULL,
    allergy_name         VARCHAR(255)   NOT NULL,
    code_system          VARCHAR(50)    NULL,             -- e.g., SNOMED
    category             VARCHAR(50)    NULL,             -- e.g., Medication, Food
    created_at           TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP      NULL
);
COMMENT ON TABLE phm_star.dim_allergy
    IS 'Allergy reference dimension. Type 1 — truncate/reload each ETL run.';

CREATE UNIQUE INDEX uq_dim_allergy_id ON phm_star.dim_allergy(allergy_id);


-- ---------------------------------------------------------------------
-- 1.3 dim_care_gap_bundle — chronic disease bundle dimension (Type 1)
-- Source: phm_edw.condition_bundle (seeded via 011_seed_star_bundles.sql)
-- 45 bundles covering chronic conditions with eCQM-based care gap measures
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.dim_care_gap_bundle (
    bundle_key           SERIAL         PRIMARY KEY,
    bundle_code          VARCHAR(30)    NOT NULL UNIQUE,  -- NK matching EDW bundle_code
    bundle_name          VARCHAR(200)   NOT NULL,
    disease_category     VARCHAR(100)   NULL,             -- e.g., Endocrine, Cardiovascular
    icd10_codes          TEXT           NOT NULL,         -- Comma-separated LIKE patterns (e.g., 'E11%,E11.0')
    bundle_size          SMALLINT       NOT NULL,         -- Number of measures in this bundle
    total_diseases       SMALLINT       NOT NULL DEFAULT 45,
    is_active            BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP      NULL
);
COMMENT ON TABLE phm_star.dim_care_gap_bundle
    IS '45 chronic disease bundles. Each bundle defines eCQM-based care measures for a condition.';

CREATE INDEX idx_bundle_code ON phm_star.dim_care_gap_bundle(bundle_code);
CREATE INDEX idx_bundle_active ON phm_star.dim_care_gap_bundle(is_active) WHERE is_active = TRUE;


-- ---------------------------------------------------------------------
-- 1.4 bridge_bundle_measure — many-to-many: bundle ↔ measure
-- Includes deduplication metadata for cross-bundle shared measures
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.bridge_bundle_measure (
    bridge_key           SERIAL         PRIMARY KEY,
    bundle_key           INT            NOT NULL,
    measure_key          INT            NOT NULL,
    measure_sequence     SMALLINT       NULL,             -- Display order within bundle
    frequency            VARCHAR(50)    NULL,             -- e.g., 'Annual', 'Every 6 months'
    is_shared_measure    BOOLEAN        NOT NULL DEFAULT FALSE, -- TRUE if appears in multiple bundles
    dedup_domain         VARCHAR(100)   NULL,             -- e.g., 'Blood Pressure Control'

    CONSTRAINT fk_bridge_bundle
        FOREIGN KEY (bundle_key)
        REFERENCES phm_star.dim_care_gap_bundle(bundle_key)
        ON DELETE CASCADE,

    CONSTRAINT fk_bridge_measure
        FOREIGN KEY (measure_key)
        REFERENCES phm_star.dim_measure(measure_key)
        ON DELETE CASCADE,

    CONSTRAINT uq_bridge_bundle_measure UNIQUE (bundle_key, measure_key)
);
COMMENT ON TABLE phm_star.bridge_bundle_measure
    IS 'Maps each disease bundle to its care measures. Tracks shared/deduped measures across bundles.';

CREATE INDEX idx_bridge_bundle ON phm_star.bridge_bundle_measure(bundle_key);
CREATE INDEX idx_bridge_measure ON phm_star.bridge_bundle_measure(measure_key);
CREATE INDEX idx_bridge_shared ON phm_star.bridge_bundle_measure(is_shared_measure)
    WHERE is_shared_measure = TRUE;


-- ---------------------------------------------------------------------
-- 1.5 dim_risk_model — AI/ML model registry dimension (Type 1)
-- Defines models used for patient risk scoring (HCC, readmission, Abigail AI)
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.dim_risk_model (
    risk_model_key       SERIAL         PRIMARY KEY,
    model_code           VARCHAR(50)    NOT NULL UNIQUE,  -- e.g., 'HCC_V28', 'ABIGAIL_COMPOSITE'
    model_name           VARCHAR(200)   NOT NULL,
    model_version        VARCHAR(20)    NOT NULL,
    model_type           VARCHAR(50)    NULL,             -- e.g., 'Risk Adjustment', 'Predictive'
    description          TEXT           NULL,
    is_active            BOOLEAN        NOT NULL DEFAULT TRUE,
    effective_start      DATE           NOT NULL DEFAULT CURRENT_DATE,
    effective_end        DATE           NOT NULL DEFAULT '9999-12-31',
    created_at           TIMESTAMP      NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE phm_star.dim_risk_model
    IS 'Registry of AI/ML risk scoring models used by the Abigail AI engine.';


-- =====================================================================
-- SECTION 2: ALTER EXISTING DIMENSIONS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2.1 dim_measure — add bundle integration and clinical target columns
-- ---------------------------------------------------------------------
ALTER TABLE phm_star.dim_measure
    ADD COLUMN IF NOT EXISTS frequency         VARCHAR(50)     NULL,    -- 'Annual', 'Every 6 months'
    ADD COLUMN IF NOT EXISTS guideline_source  VARCHAR(200)    NULL,    -- 'ADA 2024', 'ACC/AHA 2023'
    ADD COLUMN IF NOT EXISTS loinc_code        VARCHAR(50)     NULL,    -- Primary LOINC for obs matching
    ADD COLUMN IF NOT EXISTS cpt_codes         TEXT            NULL,    -- CSV CPT codes satisfying measure
    ADD COLUMN IF NOT EXISTS target_value_low  DECIMAL(10,2)   NULL,    -- e.g., 0 for A1C < 7.0
    ADD COLUMN IF NOT EXISTS target_value_high DECIMAL(10,2)   NULL,    -- e.g., 7.0 for A1C < 7.0
    ADD COLUMN IF NOT EXISTS target_text       VARCHAR(200)    NULL;    -- 'A1C < 7.0%'

COMMENT ON COLUMN phm_star.dim_measure.frequency        IS 'How often this measure must be satisfied.';
COMMENT ON COLUMN phm_star.dim_measure.guideline_source IS 'Clinical guideline authorizing this measure.';
COMMENT ON COLUMN phm_star.dim_measure.loinc_code       IS 'LOINC code for matching observations in fact_observation.';
COMMENT ON COLUMN phm_star.dim_measure.cpt_codes        IS 'Comma-separated CPT codes that satisfy this measure.';
COMMENT ON COLUMN phm_star.dim_measure.target_text      IS 'Human-readable clinical target (e.g., ''A1C < 7.0%'').';


-- =====================================================================
-- SECTION 3: ALTER EXISTING FACT TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- 3.1 fact_care_gap — add bundle attribution and lifecycle columns
-- ---------------------------------------------------------------------
ALTER TABLE phm_star.fact_care_gap
    ADD COLUMN IF NOT EXISTS bundle_key    INT  NULL,
    ADD COLUMN IF NOT EXISTS provider_key  INT  NULL,
    ADD COLUMN IF NOT EXISTS org_key       INT  NULL,
    ADD COLUMN IF NOT EXISTS days_open     INT  NULL;  -- Calculated: resolved_date (or NOW()) minus identified_date

-- FK constraints (added separately so they don't fail if column already existed)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_fcg_bundle'
    ) THEN
        ALTER TABLE phm_star.fact_care_gap
            ADD CONSTRAINT fk_fcg_bundle
                FOREIGN KEY (bundle_key)
                REFERENCES phm_star.dim_care_gap_bundle(bundle_key)
                ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_fcg_provider'
    ) THEN
        ALTER TABLE phm_star.fact_care_gap
            ADD CONSTRAINT fk_fcg_provider
                FOREIGN KEY (provider_key)
                REFERENCES phm_star.dim_provider(provider_key)
                ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_fcg_org'
    ) THEN
        ALTER TABLE phm_star.fact_care_gap
            ADD CONSTRAINT fk_fcg_org
                FOREIGN KEY (org_key)
                REFERENCES phm_star.dim_organization(org_key)
                ON DELETE SET NULL;
    END IF;
END;
$$;

COMMENT ON COLUMN phm_star.fact_care_gap.bundle_key   IS 'Bundle this gap belongs to (FK to dim_care_gap_bundle).';
COMMENT ON COLUMN phm_star.fact_care_gap.provider_key IS 'Attributed PCP for this patient at time of gap identification.';
COMMENT ON COLUMN phm_star.fact_care_gap.days_open    IS 'Days from identified to resolved (or current date if still open).';


-- =====================================================================
-- SECTION 4: NEW FACT TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.1 fact_patient_bundle
-- Grain: one row per patient per active disease bundle
-- Summary table — truncate/reload each ETL run
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.fact_patient_bundle (
    patient_bundle_key   BIGSERIAL      PRIMARY KEY,
    patient_key          INT            NOT NULL,
    bundle_key           INT            NOT NULL,
    provider_key         INT            NULL,             -- Attributed PCP
    org_key              INT            NULL,
    date_key_assigned    INT            NOT NULL,         -- When patient first qualified
    date_key_last_eval   INT            NULL,             -- Last ETL evaluation date
    total_measures       SMALLINT       NOT NULL,         -- Bundle size
    measures_met         SMALLINT       NOT NULL DEFAULT 0,
    measures_open        SMALLINT       NOT NULL DEFAULT 0,
    compliance_pct       DECIMAL(5,2)   NULL,             -- measures_met / total_measures * 100
    risk_tier            VARCHAR(20)    NULL              -- 'High', 'Medium', 'Low'
        CHECK (risk_tier IN ('Critical','High','Medium','Low') OR risk_tier IS NULL),
    is_active            BOOLEAN        NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_fpb_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient(patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpb_bundle
        FOREIGN KEY (bundle_key)
        REFERENCES phm_star.dim_care_gap_bundle(bundle_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpb_provider
        FOREIGN KEY (provider_key)
        REFERENCES phm_star.dim_provider(provider_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fpb_org
        FOREIGN KEY (org_key)
        REFERENCES phm_star.dim_organization(org_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fpb_date_assigned
        FOREIGN KEY (date_key_assigned)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpb_date_eval
        FOREIGN KEY (date_key_last_eval)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_star.fact_patient_bundle
    IS 'One row per active patient-bundle assignment. Summary of compliance per disease bundle. Truncate/reload.';

-- Partial unique index: only one active row per patient-bundle combination
CREATE UNIQUE INDEX uq_patient_bundle_active
    ON phm_star.fact_patient_bundle(patient_key, bundle_key)
    WHERE is_active = TRUE;


-- ---------------------------------------------------------------------
-- 4.2 fact_patient_bundle_detail
-- Grain: one row per patient × bundle × measure
-- Detailed compliance status with cross-bundle deduplication flags
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.fact_patient_bundle_detail (
    detail_key              BIGSERIAL      PRIMARY KEY,
    patient_bundle_key      BIGINT         NOT NULL,
    patient_key             INT            NOT NULL,
    bundle_key              INT            NOT NULL,
    measure_key             INT            NOT NULL,
    date_key_last_action    INT            NULL,          -- Date of last satisfying event
    gap_status              VARCHAR(50)    NOT NULL DEFAULT 'Open'
        CHECK (gap_status IN ('Open','Closed','Excluded')),
    is_overdue              BOOLEAN        NOT NULL DEFAULT FALSE,
    days_since_last_action  INT            NULL,
    dedup_applied           BOOLEAN        NOT NULL DEFAULT FALSE, -- TRUE = satisfied by another bundle
    dedup_source_bundle     INT            NULL,                   -- bundle_key that owns this measure

    CONSTRAINT fk_fpbd_pbundle
        FOREIGN KEY (patient_bundle_key)
        REFERENCES phm_star.fact_patient_bundle(patient_bundle_key)
        ON DELETE CASCADE,

    CONSTRAINT fk_fpbd_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient(patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpbd_bundle
        FOREIGN KEY (bundle_key)
        REFERENCES phm_star.dim_care_gap_bundle(bundle_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpbd_measure
        FOREIGN KEY (measure_key)
        REFERENCES phm_star.dim_measure(measure_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpbd_date_action
        FOREIGN KEY (date_key_last_action)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fpbd_dedup_bundle
        FOREIGN KEY (dedup_source_bundle)
        REFERENCES phm_star.dim_care_gap_bundle(bundle_key)
        ON DELETE SET NULL,

    CONSTRAINT uq_bundle_detail UNIQUE (patient_key, bundle_key, measure_key)
);
COMMENT ON TABLE phm_star.fact_patient_bundle_detail
    IS 'One row per patient-bundle-measure. Tracks per-measure gap status and cross-bundle dedup. Truncate/reload.';


-- ---------------------------------------------------------------------
-- 4.3 fact_patient_composite
-- Grain: one row per active patient — the "dashboard row"
-- Wide pre-aggregated fact; supports sub-second patient list queries
-- Truncate/reload each ETL run (with SAVEPOINT before build)
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.fact_patient_composite (
    composite_key              BIGSERIAL      PRIMARY KEY,
    patient_key                INT            NOT NULL UNIQUE,
    provider_key               INT            NULL,   -- Attributed PCP
    org_key                    INT            NULL,
    payer_key                  INT            NULL,   -- Primary payer

    -- Demographics snapshot (denormalized from dim_patient for query speed)
    age                        SMALLINT       NULL,
    gender                     VARCHAR(10)    NULL,
    race                       VARCHAR(50)    NULL,
    primary_language           VARCHAR(50)    NULL,

    -- Bundle summary (aggregated from fact_patient_bundle)
    active_bundle_count        SMALLINT       NOT NULL DEFAULT 0,
    total_measures_due         SMALLINT       NOT NULL DEFAULT 0,   -- After dedup
    total_measures_met         SMALLINT       NOT NULL DEFAULT 0,
    total_measures_open        SMALLINT       NOT NULL DEFAULT 0,
    overall_compliance_pct     DECIMAL(5,2)   NULL,
    worst_bundle_code          VARCHAR(30)    NULL,   -- Bundle with lowest compliance
    worst_bundle_pct           DECIMAL(5,2)   NULL,

    -- Clinical flags (for quick patient list filters)
    has_diabetes               BOOLEAN        NOT NULL DEFAULT FALSE,
    has_hypertension           BOOLEAN        NOT NULL DEFAULT FALSE,
    has_cad                    BOOLEAN        NOT NULL DEFAULT FALSE,
    has_heart_failure          BOOLEAN        NOT NULL DEFAULT FALSE,
    has_copd                   BOOLEAN        NOT NULL DEFAULT FALSE,
    has_ckd                    BOOLEAN        NOT NULL DEFAULT FALSE,
    has_depression             BOOLEAN        NOT NULL DEFAULT FALSE,
    chronic_condition_count    SMALLINT       NOT NULL DEFAULT 0,

    -- AI risk scores (populated by Abigail engine or HCC calculator)
    hcc_risk_score             DECIMAL(6,3)   NULL,
    readmission_risk           DECIMAL(5,4)   NULL,   -- 0.0000 to 1.0000
    ed_utilization_risk        DECIMAL(5,4)   NULL,
    abigail_priority_score     DECIMAL(5,2)   NULL,   -- Composite priority 0–100
    risk_tier                  VARCHAR(20)    NULL
        CHECK (risk_tier IN ('Critical','High','Medium','Low') OR risk_tier IS NULL),

    -- Utilization summary (last 12 months)
    encounters_last_12mo       SMALLINT       NOT NULL DEFAULT 0,
    ed_visits_last_12mo        SMALLINT       NOT NULL DEFAULT 0,
    inpatient_last_12mo        SMALLINT       NOT NULL DEFAULT 0,
    last_encounter_date_key    INT            NULL,
    days_since_last_visit      INT            NULL,

    -- SDOH flags (from most recent assessment)
    food_insecurity            BOOLEAN        NOT NULL DEFAULT FALSE,
    housing_instability        BOOLEAN        NOT NULL DEFAULT FALSE,
    transportation_barrier     BOOLEAN        NOT NULL DEFAULT FALSE,
    social_isolation_score     SMALLINT       NULL,

    -- Quality eligibility
    mips_eligible              BOOLEAN        NOT NULL DEFAULT FALSE,

    -- Metadata
    date_key_snapshot          INT            NOT NULL,
    etl_refreshed_at           TIMESTAMP      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_fpc_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient(patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpc_provider
        FOREIGN KEY (provider_key)
        REFERENCES phm_star.dim_provider(provider_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fpc_org
        FOREIGN KEY (org_key)
        REFERENCES phm_star.dim_organization(org_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fpc_payer
        FOREIGN KEY (payer_key)
        REFERENCES phm_star.dim_payer(payer_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fpc_encounter_date
        FOREIGN KEY (last_encounter_date_key)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fpc_snapshot_date
        FOREIGN KEY (date_key_snapshot)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_star.fact_patient_composite
    IS 'One row per active patient. Wide pre-aggregated fact for dashboard patient list. Truncate/reload.';


-- ---------------------------------------------------------------------
-- 4.4 fact_provider_quality
-- Grain: provider × bundle × reporting period
-- Provider scorecard with compliance rates and percentile ranking
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.fact_provider_quality (
    quality_key            BIGSERIAL      PRIMARY KEY,
    provider_key           INT            NOT NULL,
    org_key                INT            NULL,
    bundle_key             INT            NULL,   -- NULL = overall (all bundles combined)
    date_key_period        INT            NOT NULL,
    attributed_patients    INT            NOT NULL DEFAULT 0,
    patients_with_bundle   INT            NOT NULL DEFAULT 0,
    total_gaps_open        INT            NOT NULL DEFAULT 0,
    total_gaps_closed      INT            NOT NULL DEFAULT 0,
    compliance_rate        DECIMAL(5,2)   NULL,
    mips_quality_score     DECIMAL(5,2)   NULL,
    percentile_rank        DECIMAL(5,2)   NULL,   -- 0–100; PERCENT_RANK vs peers

    CONSTRAINT fk_fpq_provider
        FOREIGN KEY (provider_key)
        REFERENCES phm_star.dim_provider(provider_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpq_org
        FOREIGN KEY (org_key)
        REFERENCES phm_star.dim_organization(org_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fpq_bundle
        FOREIGN KEY (bundle_key)
        REFERENCES phm_star.dim_care_gap_bundle(bundle_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fpq_date
        FOREIGN KEY (date_key_period)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_star.fact_provider_quality
    IS 'Provider scorecard. One row per provider per bundle per reporting period. Truncate/reload.';


-- ---------------------------------------------------------------------
-- 4.5 fact_ai_risk_score
-- Grain: patient × risk model × scoring run date
-- Stores AI/ML risk scores with JSONB feature attribution for Abigail
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.fact_ai_risk_score (
    risk_score_key         BIGSERIAL      PRIMARY KEY,
    patient_key            INT            NOT NULL,
    risk_model_key         INT            NOT NULL,
    date_key_scored        INT            NOT NULL,
    score_value            DECIMAL(10,4)  NOT NULL,
    score_percentile       DECIMAL(5,2)   NULL,
    risk_tier              VARCHAR(20)    NULL
        CHECK (risk_tier IN ('Critical','High','Medium','Low') OR risk_tier IS NULL),
    contributing_factors   JSONB          NULL,  -- e.g., [{"factor":"A1C > 9.0","weight":0.35},...]
    model_version          VARCHAR(20)    NULL,
    confidence             DECIMAL(5,4)   NULL,  -- 0.0000 to 1.0000

    CONSTRAINT fk_fairs_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient(patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fairs_model
        FOREIGN KEY (risk_model_key)
        REFERENCES phm_star.dim_risk_model(risk_model_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fairs_date
        FOREIGN KEY (date_key_scored)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_star.fact_ai_risk_score
    IS 'AI/ML risk scores per patient per model. JSONB contributing_factors powers Abigail explanations.';


-- ---------------------------------------------------------------------
-- 4.6 fact_population_snapshot
-- Grain: org × snapshot date × bundle (NULL bundle = org-wide)
-- Pre-aggregated population metrics for population health dashboards
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.fact_population_snapshot (
    snapshot_key           BIGSERIAL      PRIMARY KEY,
    org_key                INT            NOT NULL,
    date_key_snapshot      INT            NOT NULL,
    bundle_key             INT            NULL,   -- NULL = org-wide aggregate
    total_patients         INT            NOT NULL DEFAULT 0,
    patients_with_bundle   INT            NOT NULL DEFAULT 0,
    avg_compliance_pct     DECIMAL(5,2)   NULL,
    median_compliance_pct  DECIMAL(5,2)   NULL,
    open_gaps_total        INT            NOT NULL DEFAULT 0,
    closed_gaps_total      INT            NOT NULL DEFAULT 0,
    high_risk_patients     INT            NOT NULL DEFAULT 0,
    critical_risk_patients INT            NOT NULL DEFAULT 0,
    avg_hcc_score          DECIMAL(6,3)   NULL,
    avg_chronic_conditions DECIMAL(4,1)   NULL,
    sdoh_flagged_patients  INT            NOT NULL DEFAULT 0,

    CONSTRAINT fk_fps_org
        FOREIGN KEY (org_key)
        REFERENCES phm_star.dim_organization(org_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fps_date
        FOREIGN KEY (date_key_snapshot)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fps_bundle
        FOREIGN KEY (bundle_key)
        REFERENCES phm_star.dim_care_gap_bundle(bundle_key)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_star.fact_population_snapshot
    IS 'Daily/weekly population health snapshot per org (and per bundle). Supports trend dashboards.';


-- ---------------------------------------------------------------------
-- 4.7 fact_immunization
-- Grain: one row per immunization event
-- Source: phm_edw.immunization — incremental insert
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.fact_immunization (
    immunization_key       BIGSERIAL      PRIMARY KEY,
    immunization_id        INT            NOT NULL UNIQUE,  -- NK from EDW (dedup guard)
    patient_key            INT            NOT NULL,
    provider_key           INT            NULL,
    date_key_administered  INT            NOT NULL,
    vaccine_code           VARCHAR(50)    NOT NULL,         -- e.g., CVX code
    vaccine_name           VARCHAR(255)   NOT NULL,
    status                 VARCHAR(50)    NULL,             -- e.g., Completed, Refused
    count_immunization     INT            NOT NULL DEFAULT 1,

    CONSTRAINT fk_fi_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient(patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fi_provider
        FOREIGN KEY (provider_key)
        REFERENCES phm_star.dim_provider(provider_key)
        ON DELETE SET NULL,

    CONSTRAINT fk_fi_date
        FOREIGN KEY (date_key_administered)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_star.fact_immunization
    IS 'Immunization events. Incremental insert from phm_edw.immunization.';


-- ---------------------------------------------------------------------
-- 4.8 fact_patient_insurance
-- Grain: one row per patient-payer coverage period
-- Source: phm_edw.patient_insurance_coverage — UPSERT on coverage_id
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.fact_patient_insurance (
    coverage_key           BIGSERIAL      PRIMARY KEY,
    coverage_id            INT            NOT NULL UNIQUE,  -- NK from EDW
    patient_key            INT            NOT NULL,
    payer_key              INT            NOT NULL,
    date_key_start         INT            NOT NULL,
    date_key_end           INT            NULL,             -- NULL = currently active
    primary_indicator      BOOLEAN        NOT NULL DEFAULT TRUE,
    is_active              BOOLEAN        NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_fpi_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient(patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpi_payer
        FOREIGN KEY (payer_key)
        REFERENCES phm_star.dim_payer(payer_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpi_date_start
        FOREIGN KEY (date_key_start)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fpi_date_end
        FOREIGN KEY (date_key_end)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE SET NULL
);
COMMENT ON TABLE phm_star.fact_patient_insurance
    IS 'Patient insurance coverage periods. UPSERT from phm_edw.patient_insurance_coverage.';


-- ---------------------------------------------------------------------
-- 4.9 fact_sdoh
-- Grain: one row per SDOH assessment
-- Source: phm_edw.sdoh_assessment — incremental insert
-- ---------------------------------------------------------------------
CREATE TABLE phm_star.fact_sdoh (
    sdoh_key               BIGSERIAL      PRIMARY KEY,
    sdoh_assessment_id     INT            NOT NULL UNIQUE,  -- NK from EDW
    patient_key            INT            NOT NULL,
    date_key_assessment    INT            NOT NULL,
    housing_status         VARCHAR(100)   NULL,             -- e.g., 'Stable', 'Homeless'
    food_insecurity        BOOLEAN        NOT NULL DEFAULT FALSE,
    transportation_barrier BOOLEAN        NOT NULL DEFAULT FALSE,
    social_isolation_score SMALLINT       NULL,

    CONSTRAINT fk_fsdoh_patient
        FOREIGN KEY (patient_key)
        REFERENCES phm_star.dim_patient(patient_key)
        ON DELETE RESTRICT,

    CONSTRAINT fk_fsdoh_date
        FOREIGN KEY (date_key_assessment)
        REFERENCES phm_star.dim_date(date_key)
        ON DELETE RESTRICT
);
COMMENT ON TABLE phm_star.fact_sdoh
    IS 'SDOH assessments. Incremental insert from phm_edw.sdoh_assessment.';


-- =====================================================================
-- SECTION 5: PERFORMANCE INDEXES
-- =====================================================================

-- --- fact_patient_composite (primary dashboard table) ---------------
CREATE INDEX idx_composite_provider
    ON phm_star.fact_patient_composite(provider_key);

CREATE INDEX idx_composite_org
    ON phm_star.fact_patient_composite(org_key);

CREATE INDEX idx_composite_risk
    ON phm_star.fact_patient_composite(risk_tier, abigail_priority_score DESC NULLS LAST);

CREATE INDEX idx_composite_compliance
    ON phm_star.fact_patient_composite(overall_compliance_pct);

CREATE INDEX idx_composite_bundles
    ON phm_star.fact_patient_composite(active_bundle_count);

CREATE INDEX idx_composite_conditions
    ON phm_star.fact_patient_composite
    (has_diabetes, has_hypertension, has_cad, has_heart_failure, has_copd, has_ckd, has_depression);

-- --- fact_patient_bundle --------------------------------------------
CREATE INDEX idx_patient_bundle_patient
    ON phm_star.fact_patient_bundle(patient_key)
    WHERE is_active = TRUE;

CREATE INDEX idx_patient_bundle_bundle
    ON phm_star.fact_patient_bundle(bundle_key)
    WHERE is_active = TRUE;

CREATE INDEX idx_patient_bundle_compliance
    ON phm_star.fact_patient_bundle(compliance_pct);

CREATE INDEX idx_patient_bundle_provider
    ON phm_star.fact_patient_bundle(provider_key);

-- --- fact_patient_bundle_detail -------------------------------------
CREATE INDEX idx_bundle_detail_patient
    ON phm_star.fact_patient_bundle_detail(patient_key);

CREATE INDEX idx_bundle_detail_status
    ON phm_star.fact_patient_bundle_detail(gap_status);

CREATE INDEX idx_bundle_detail_overdue
    ON phm_star.fact_patient_bundle_detail(is_overdue)
    WHERE is_overdue = TRUE;

-- --- fact_care_gap (existing table — new indexes) -------------------
CREATE INDEX idx_care_gap_status
    ON phm_star.fact_care_gap(gap_status);

CREATE INDEX idx_care_gap_patient_measure
    ON phm_star.fact_care_gap(patient_key, measure_key);

CREATE INDEX idx_care_gap_bundle
    ON phm_star.fact_care_gap(bundle_key);

-- --- fact_encounter -------------------------------------------------
CREATE INDEX idx_encounter_date
    ON phm_star.fact_encounter(date_key_encounter);

CREATE INDEX idx_encounter_patient
    ON phm_star.fact_encounter(patient_key);

-- --- fact_diagnosis -------------------------------------------------
CREATE INDEX idx_diagnosis_patient
    ON phm_star.fact_diagnosis(patient_key);

CREATE INDEX idx_diagnosis_condition
    ON phm_star.fact_diagnosis(condition_key);

-- --- fact_observation -----------------------------------------------
CREATE INDEX idx_observation_patient_code
    ON phm_star.fact_observation(patient_key, observation_code);

CREATE INDEX idx_observation_date
    ON phm_star.fact_observation(date_key_obs);

-- --- fact_medication_order ------------------------------------------
CREATE INDEX idx_med_order_patient
    ON phm_star.fact_medication_order(patient_key);

-- --- fact_ai_risk_score --------------------------------------------
CREATE INDEX idx_risk_score_patient
    ON phm_star.fact_ai_risk_score(patient_key);

CREATE INDEX idx_risk_score_model_date
    ON phm_star.fact_ai_risk_score(risk_model_key, date_key_scored);

-- --- fact_provider_quality -----------------------------------------
CREATE INDEX idx_provider_quality_provider
    ON phm_star.fact_provider_quality(provider_key, date_key_period);

CREATE INDEX idx_provider_quality_bundle
    ON phm_star.fact_provider_quality(bundle_key, date_key_period);

-- --- fact_population_snapshot --------------------------------------
CREATE INDEX idx_pop_snapshot_org_date
    ON phm_star.fact_population_snapshot(org_key, date_key_snapshot);

CREATE INDEX idx_pop_snapshot_bundle
    ON phm_star.fact_population_snapshot(bundle_key, date_key_snapshot);


-- =====================================================================
-- SECTION 6: MATERIALIZED VIEWS
-- Each view requires a UNIQUE index to support REFRESH CONCURRENTLY
-- Views are created empty here; first REFRESH runs at end of ETL 012
-- =====================================================================

-- ---------------------------------------------------------------------
-- 6.1 mv_patient_dashboard
-- Primary view for the patient list/grid screen.
-- Query: SELECT * FROM phm_star.mv_patient_dashboard WHERE provider_key = ? AND risk_tier = 'High'
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW phm_star.mv_patient_dashboard AS
SELECT
    fpc.composite_key,
    fpc.patient_key,
    fpc.provider_key,
    fpc.org_key,
    fpc.payer_key,
    -- Patient identity
    dp.first_name                   AS patient_first_name,
    dp.last_name                    AS patient_last_name,
    dp.date_of_birth,
    fpc.age,
    fpc.gender,
    fpc.race,
    fpc.primary_language,
    -- Provider
    dprov.first_name                AS provider_first_name,
    dprov.last_name                 AS provider_last_name,
    -- Organization
    dorg.organization_name,
    -- Payer
    dpay.payer_name,
    dpay.payer_type,
    -- Bundle compliance summary
    fpc.active_bundle_count,
    fpc.total_measures_due,
    fpc.total_measures_met,
    fpc.total_measures_open,
    fpc.overall_compliance_pct,
    fpc.worst_bundle_code,
    fpc.worst_bundle_pct,
    -- Risk
    fpc.risk_tier,
    fpc.abigail_priority_score,
    fpc.hcc_risk_score,
    fpc.readmission_risk,
    fpc.ed_utilization_risk,
    -- Clinical summary
    fpc.chronic_condition_count,
    fpc.has_diabetes,
    fpc.has_hypertension,
    fpc.has_cad,
    fpc.has_heart_failure,
    fpc.has_copd,
    fpc.has_ckd,
    fpc.has_depression,
    -- Utilization
    fpc.encounters_last_12mo,
    fpc.ed_visits_last_12mo,
    fpc.inpatient_last_12mo,
    fpc.days_since_last_visit,
    -- SDOH
    fpc.food_insecurity,
    fpc.housing_instability,
    fpc.transportation_barrier,
    -- Quality
    fpc.mips_eligible,
    fpc.etl_refreshed_at
FROM phm_star.fact_patient_composite fpc
JOIN  phm_star.dim_patient     dp    ON dp.patient_key   = fpc.patient_key   AND dp.is_current   = TRUE
LEFT JOIN phm_star.dim_provider    dprov ON dprov.provider_key = fpc.provider_key AND dprov.is_current = TRUE
LEFT JOIN phm_star.dim_organization dorg ON dorg.org_key       = fpc.org_key      AND dorg.is_current  = TRUE
LEFT JOIN phm_star.dim_payer        dpay ON dpay.payer_key     = fpc.payer_key
ORDER BY fpc.abigail_priority_score DESC NULLS LAST;

CREATE UNIQUE INDEX uq_mv_patient_dashboard
    ON phm_star.mv_patient_dashboard(composite_key);

CREATE INDEX idx_mv_dashboard_provider
    ON phm_star.mv_patient_dashboard(provider_key);
CREATE INDEX idx_mv_dashboard_risk
    ON phm_star.mv_patient_dashboard(risk_tier, abigail_priority_score DESC NULLS LAST);
CREATE INDEX idx_mv_dashboard_compliance
    ON phm_star.mv_patient_dashboard(overall_compliance_pct);

COMMENT ON MATERIALIZED VIEW phm_star.mv_patient_dashboard
    IS 'Primary patient list view for dashboard grid. Refreshed CONCURRENTLY each ETL run.';


-- ---------------------------------------------------------------------
-- 6.2 mv_bundle_compliance_by_provider
-- Provider scorecard: compliance rates per provider per bundle with percentile rank
-- Query: SELECT * FROM phm_star.mv_bundle_compliance_by_provider WHERE provider_key = ?
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW phm_star.mv_bundle_compliance_by_provider AS
WITH agg AS (
    SELECT
        fpb.provider_key,
        fpb.bundle_key,
        COUNT(DISTINCT fpb.patient_key)            AS patient_count,
        AVG(fpb.compliance_pct)                    AS avg_compliance_pct,
        SUM(fpb.measures_open)                     AS total_gaps_open,
        SUM(fpb.measures_met)                      AS total_gaps_closed
    FROM phm_star.fact_patient_bundle fpb
    WHERE fpb.is_active = TRUE
    GROUP BY fpb.provider_key, fpb.bundle_key
)
SELECT
    agg.provider_key,
    dprov.first_name                 AS provider_first_name,
    dprov.last_name                  AS provider_last_name,
    agg.bundle_key,
    dcgb.bundle_code,
    dcgb.bundle_name,
    dcgb.disease_category,
    agg.patient_count,
    ROUND(agg.avg_compliance_pct, 2) AS avg_compliance_pct,
    agg.total_gaps_open,
    agg.total_gaps_closed,
    ROUND(
        PERCENT_RANK() OVER (
            PARTITION BY agg.bundle_key
            ORDER BY agg.avg_compliance_pct
        )::NUMERIC * 100, 1
    )                                AS percentile_rank
FROM agg
JOIN  phm_star.dim_care_gap_bundle dcgb  ON dcgb.bundle_key   = agg.bundle_key AND dcgb.is_active = TRUE
LEFT JOIN phm_star.dim_provider        dprov ON dprov.provider_key = agg.provider_key AND dprov.is_current = TRUE;

CREATE UNIQUE INDEX uq_mv_bundle_compliance
    ON phm_star.mv_bundle_compliance_by_provider(provider_key, bundle_key);

CREATE INDEX idx_mv_bundle_compliance_bundle
    ON phm_star.mv_bundle_compliance_by_provider(bundle_key);

COMMENT ON MATERIALIZED VIEW phm_star.mv_bundle_compliance_by_provider
    IS 'Provider scorecard by bundle. Shows compliance rates and peer percentile rank.';


-- ---------------------------------------------------------------------
-- 6.3 mv_population_overview
-- Organization-level population health: aggregates from fact_population_snapshot
-- Query: SELECT * FROM phm_star.mv_population_overview WHERE org_key = ? AND bundle_key IS NULL
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW phm_star.mv_population_overview AS
SELECT
    fps.snapshot_key,
    fps.org_key,
    dorg.organization_name,
    fps.date_key_snapshot,
    dd.full_date                     AS snapshot_date,
    fps.bundle_key,
    dcgb.bundle_code,
    dcgb.bundle_name,
    dcgb.disease_category,
    fps.total_patients,
    fps.patients_with_bundle,
    fps.avg_compliance_pct,
    fps.median_compliance_pct,
    fps.open_gaps_total,
    fps.closed_gaps_total,
    fps.high_risk_patients,
    fps.critical_risk_patients,
    fps.avg_hcc_score,
    fps.avg_chronic_conditions,
    fps.sdoh_flagged_patients
FROM phm_star.fact_population_snapshot fps
JOIN  phm_star.dim_organization    dorg  ON dorg.org_key       = fps.org_key          AND dorg.is_current = TRUE
JOIN  phm_star.dim_date            dd    ON dd.date_key        = fps.date_key_snapshot
LEFT JOIN phm_star.dim_care_gap_bundle dcgb ON dcgb.bundle_key = fps.bundle_key;

CREATE UNIQUE INDEX uq_mv_population_overview
    ON phm_star.mv_population_overview(snapshot_key);

CREATE INDEX idx_mv_pop_org_date
    ON phm_star.mv_population_overview(org_key, date_key_snapshot);
CREATE INDEX idx_mv_pop_bundle
    ON phm_star.mv_population_overview(bundle_key, date_key_snapshot);

COMMENT ON MATERIALIZED VIEW phm_star.mv_population_overview
    IS 'Organization-level population health metrics by date and bundle. Drives trend charts.';


-- ---------------------------------------------------------------------
-- 6.4 mv_care_gap_worklist
-- Clinical care gap worklist for care coordinators and nurses
-- Query: SELECT * FROM phm_star.mv_care_gap_worklist WHERE provider_key = ? ORDER BY is_overdue DESC
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW phm_star.mv_care_gap_worklist AS
SELECT
    fpbd.detail_key,
    fpbd.patient_bundle_key,
    fpbd.patient_key,
    dp.first_name                    AS patient_first_name,
    dp.last_name                     AS patient_last_name,
    dp.date_of_birth,
    -- Provider (from parent bundle row)
    fpb.provider_key,
    dprov.first_name                 AS provider_first_name,
    dprov.last_name                  AS provider_last_name,
    -- Bundle
    fpbd.bundle_key,
    dcgb.bundle_code,
    dcgb.bundle_name,
    dcgb.disease_category,
    -- Measure
    fpbd.measure_key,
    dm.measure_code,
    dm.measure_name,
    dm.frequency                     AS measure_frequency,
    dm.target_text,
    -- Gap status
    fpbd.gap_status,
    fpbd.is_overdue,
    fpbd.days_since_last_action,
    fpbd.dedup_applied
FROM phm_star.fact_patient_bundle_detail fpbd
JOIN  phm_star.fact_patient_bundle    fpb   ON fpb.patient_bundle_key = fpbd.patient_bundle_key
JOIN  phm_star.dim_patient            dp    ON dp.patient_key         = fpbd.patient_key   AND dp.is_current  = TRUE
JOIN  phm_star.dim_care_gap_bundle    dcgb  ON dcgb.bundle_key        = fpbd.bundle_key
JOIN  phm_star.dim_measure            dm    ON dm.measure_key         = fpbd.measure_key
LEFT JOIN phm_star.dim_provider       dprov ON dprov.provider_key     = fpb.provider_key   AND dprov.is_current = TRUE
WHERE fpbd.gap_status = 'Open'
  AND fpbd.dedup_applied = FALSE   -- Only show canonical (non-deduped) rows in worklist
ORDER BY fpbd.is_overdue DESC, fpbd.days_since_last_action DESC NULLS LAST;

CREATE UNIQUE INDEX uq_mv_care_gap_worklist
    ON phm_star.mv_care_gap_worklist(detail_key);

CREATE INDEX idx_mv_worklist_provider
    ON phm_star.mv_care_gap_worklist(provider_key);
CREATE INDEX idx_mv_worklist_patient
    ON phm_star.mv_care_gap_worklist(patient_key);
CREATE INDEX idx_mv_worklist_bundle
    ON phm_star.mv_care_gap_worklist(bundle_key);
CREATE INDEX idx_mv_worklist_overdue
    ON phm_star.mv_care_gap_worklist(is_overdue)
    WHERE is_overdue = TRUE;

COMMENT ON MATERIALIZED VIEW phm_star.mv_care_gap_worklist
    IS 'Open care gaps for clinical worklist. Shows only canonical (non-deduped) gaps. Sorted by overdue status.';


-- =====================================================================
-- End of 010_star_schema_v2.sql
-- Run next: 011_seed_star_bundles.sql, then 012_etl_star_v2.sql
-- =====================================================================
