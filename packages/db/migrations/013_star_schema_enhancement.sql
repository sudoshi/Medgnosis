-- =====================================================================
-- 013_star_schema_enhancement.sql
-- Phase: Star Schema v2 — Consolidated
-- Adds new dimensions, bridge tables, fact tables, alters existing
-- tables, and creates materialized views for phm_star.
-- Consolidates original 010_star_schema_v2 + 013_star_schema_enhancement
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 1: ALTER EXISTING TABLES
-- ─────────────────────────────────────────────────────────────────────

-- dim_measure — add bundle integration and clinical target columns
ALTER TABLE phm_star.dim_measure
    ADD COLUMN IF NOT EXISTS frequency         VARCHAR(50)     NULL,
    ADD COLUMN IF NOT EXISTS guideline_source  VARCHAR(200)    NULL,
    ADD COLUMN IF NOT EXISTS loinc_code        VARCHAR(50)     NULL,
    ADD COLUMN IF NOT EXISTS cpt_codes         TEXT            NULL,
    ADD COLUMN IF NOT EXISTS target_value_low  DECIMAL(10,2)   NULL,
    ADD COLUMN IF NOT EXISTS target_value_high DECIMAL(10,2)   NULL,
    ADD COLUMN IF NOT EXISTS target_text       VARCHAR(200)    NULL;

-- fact_care_gap — add bundle attribution and lifecycle columns (FKs added in Section 2a below)
ALTER TABLE phm_star.fact_care_gap
    ADD COLUMN IF NOT EXISTS bundle_key    INT  NULL,
    ADD COLUMN IF NOT EXISTS provider_key  INT  NULL,
    ADD COLUMN IF NOT EXISTS org_key       INT  NULL,
    ADD COLUMN IF NOT EXISTS days_open     INT  NULL;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 2: NEW DIMENSIONS
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.dim_payer (
    payer_key           SERIAL        PRIMARY KEY,
    payer_id            INT           NOT NULL,   -- NK from phm_edw.payer
    payer_name          VARCHAR(200)  NOT NULL,
    payer_type          VARCHAR(50)   NULL,        -- 'Medicare','Medicaid','Commercial','Medicare Advantage'
    payer_code          VARCHAR(30)   NULL,
    is_government       BOOLEAN       NOT NULL DEFAULT FALSE,
    is_current          BOOLEAN       NOT NULL DEFAULT TRUE,
    effective_start     DATE          NOT NULL DEFAULT CURRENT_DATE,
    effective_end       DATE          NOT NULL DEFAULT '9999-12-31',
    created_at          TIMESTAMP     NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dim_payer_id ON phm_star.dim_payer(payer_id) WHERE is_current = TRUE;

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.dim_allergy (
    allergy_key         SERIAL        PRIMARY KEY,
    allergy_id          INT           NOT NULL,   -- NK from phm_edw.allergy
    allergy_code        VARCHAR(50)   NULL,
    allergy_name        VARCHAR(200)  NOT NULL,
    code_system         VARCHAR(30)   NULL,
    category            VARCHAR(50)   NULL,        -- 'Medication','Food','Environmental','Latex'
    is_current          BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.dim_care_gap_bundle (
    bundle_key          SERIAL        PRIMARY KEY,
    bundle_id           INT           NOT NULL,   -- NK from phm_edw.condition_bundle
    bundle_code         VARCHAR(30)   NOT NULL,
    bundle_name         VARCHAR(200)  NOT NULL,
    disease_category    VARCHAR(100)  NULL,        -- 'Endocrine','Cardiovascular','Respiratory', etc.
    icd10_pattern       VARCHAR(500)  NOT NULL,
    bundle_size         SMALLINT      NOT NULL,
    total_diseases      SMALLINT      NOT NULL DEFAULT 45,
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP     NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dim_cgb_code ON phm_star.dim_care_gap_bundle(bundle_code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_dim_cgb_bundle_id ON phm_star.dim_care_gap_bundle(bundle_id);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.bridge_bundle_measure (
    bridge_key          SERIAL        PRIMARY KEY,
    bundle_key          INT           NOT NULL REFERENCES phm_star.dim_care_gap_bundle(bundle_key),
    measure_key         INT           NOT NULL REFERENCES phm_star.dim_measure(measure_key),
    measure_sequence    SMALLINT      NULL,
    frequency           VARCHAR(50)   NULL,        -- 'Annual','Every 6 months','Every visit','Every 3 months'
    is_shared_measure   BOOLEAN       NOT NULL DEFAULT FALSE,
    dedup_domain        VARCHAR(100)  NULL,         -- 'Blood Pressure Control','Statin Therapy', etc.
    UNIQUE (bundle_key, measure_key)
);
CREATE INDEX IF NOT EXISTS idx_bridge_bm_bundle  ON phm_star.bridge_bundle_measure(bundle_key);
CREATE INDEX IF NOT EXISTS idx_bridge_bm_measure ON phm_star.bridge_bundle_measure(measure_key);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.dim_risk_model (
    risk_model_key      SERIAL        PRIMARY KEY,
    model_code          VARCHAR(50)   NOT NULL UNIQUE,
    model_name          VARCHAR(200)  NOT NULL,
    model_version       VARCHAR(20)   NOT NULL,
    model_type          VARCHAR(50)   NULL,   -- 'Risk Adjustment','Predictive','Classification'
    description         TEXT          NULL,
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    effective_start     DATE          NOT NULL DEFAULT CURRENT_DATE,
    effective_end       DATE          NOT NULL DEFAULT '9999-12-31',
    created_at          TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- Pre-seed the risk models used by Abigail
INSERT INTO phm_star.dim_risk_model (model_code, model_name, model_version, model_type, description)
VALUES
  ('HCC_V28',        'HCC Risk Adjustment Score',        'v28',  'Risk Adjustment', 'CMS-HCC V28 model for Medicare Advantage risk scoring'),
  ('READMIT_30D',    '30-Day Readmission Risk',          '2.1',  'Predictive',      'ML model predicting 30-day hospital readmission probability'),
  ('ED_RISK',        'ED Utilization Risk Score',        '1.4',  'Predictive',      'Probability of ED visit within 90 days'),
  ('ABIGAIL_COMP',   'Abigail Composite Priority Score', '3.0',  'Classification',  'Composite AI priority score 0-100 for daily patient list')
ON CONFLICT (model_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 2a: DEFERRED FK CONSTRAINTS (dim_care_gap_bundle now exists)
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fcg_bundle') THEN
        ALTER TABLE phm_star.fact_care_gap
            ADD CONSTRAINT fk_fcg_bundle FOREIGN KEY (bundle_key)
                REFERENCES phm_star.dim_care_gap_bundle(bundle_key) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fcg_provider') THEN
        ALTER TABLE phm_star.fact_care_gap
            ADD CONSTRAINT fk_fcg_provider FOREIGN KEY (provider_key)
                REFERENCES phm_star.dim_provider(provider_key) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fcg_org') THEN
        ALTER TABLE phm_star.fact_care_gap
            ADD CONSTRAINT fk_fcg_org FOREIGN KEY (org_key)
                REFERENCES phm_star.dim_organization(org_key) ON DELETE SET NULL;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 3: NEW FACT TABLES
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.fact_patient_bundle (
    patient_bundle_key  BIGSERIAL     PRIMARY KEY,
    patient_key         INT           NOT NULL REFERENCES phm_star.dim_patient(patient_key),
    bundle_key          INT           NOT NULL REFERENCES phm_star.dim_care_gap_bundle(bundle_key),
    provider_key        INT           NULL REFERENCES phm_star.dim_provider(provider_key),
    org_key             INT           NULL REFERENCES phm_star.dim_organization(org_key),
    date_key_assigned   INT           NOT NULL REFERENCES phm_star.dim_date(date_key),
    date_key_last_eval  INT           NULL REFERENCES phm_star.dim_date(date_key),
    total_measures      SMALLINT      NOT NULL DEFAULT 0,
    measures_met        SMALLINT      NOT NULL DEFAULT 0,
    measures_open       SMALLINT      NOT NULL DEFAULT 0,
    measures_excluded   SMALLINT      NOT NULL DEFAULT 0,
    compliance_pct      DECIMAL(5,2)  NULL,
    risk_tier           VARCHAR(20)   NULL,   -- 'Critical','High','Medium','Low'
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
    etl_refreshed_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpb_patient_bundle ON phm_star.fact_patient_bundle(patient_key, bundle_key) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fpb_bundle   ON phm_star.fact_patient_bundle(bundle_key);
CREATE INDEX IF NOT EXISTS idx_fpb_provider ON phm_star.fact_patient_bundle(provider_key);
CREATE INDEX IF NOT EXISTS idx_fpb_risk     ON phm_star.fact_patient_bundle(risk_tier);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.fact_patient_bundle_detail (
    detail_key              BIGSERIAL   PRIMARY KEY,
    patient_bundle_key      BIGINT      NOT NULL REFERENCES phm_star.fact_patient_bundle(patient_bundle_key),
    patient_key             INT         NOT NULL REFERENCES phm_star.dim_patient(patient_key),
    bundle_key              INT         NOT NULL REFERENCES phm_star.dim_care_gap_bundle(bundle_key),
    measure_key             INT         NOT NULL REFERENCES phm_star.dim_measure(measure_key),
    date_key_last_action    INT         NULL REFERENCES phm_star.dim_date(date_key),
    gap_status              VARCHAR(20) NOT NULL DEFAULT 'Open',   -- 'Open','Closed','Excluded'
    is_overdue              BOOLEAN     NOT NULL DEFAULT FALSE,
    days_overdue            INT         NULL,
    dedup_applied           BOOLEAN     NOT NULL DEFAULT FALSE,
    dedup_source_bundle_key INT         NULL REFERENCES phm_star.dim_care_gap_bundle(bundle_key),
    etl_refreshed_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    UNIQUE (patient_key, bundle_key, measure_key)
);
CREATE INDEX IF NOT EXISTS idx_fpbd_patient  ON phm_star.fact_patient_bundle_detail(patient_key);
CREATE INDEX IF NOT EXISTS idx_fpbd_bundle   ON phm_star.fact_patient_bundle_detail(bundle_key);
CREATE INDEX IF NOT EXISTS idx_fpbd_status   ON phm_star.fact_patient_bundle_detail(gap_status);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.fact_patient_composite (
    composite_key           BIGSERIAL   PRIMARY KEY,
    patient_key             INT         NOT NULL UNIQUE REFERENCES phm_star.dim_patient(patient_key),
    provider_key            INT         NULL REFERENCES phm_star.dim_provider(provider_key),
    org_key                 INT         NULL REFERENCES phm_star.dim_organization(org_key),
    payer_key               INT         NULL REFERENCES phm_star.dim_payer(payer_key),
    -- Demographics snapshot
    age                     SMALLINT    NULL,
    gender                  VARCHAR(10) NULL,
    race                    VARCHAR(50) NULL,
    primary_language        VARCHAR(50) NULL,
    -- Bundle summary
    active_bundle_count     SMALLINT    NOT NULL DEFAULT 0,
    total_measures_due      SMALLINT    NOT NULL DEFAULT 0,
    total_measures_met      SMALLINT    NOT NULL DEFAULT 0,
    total_measures_open     SMALLINT    NOT NULL DEFAULT 0,
    overall_compliance_pct  DECIMAL(5,2) NULL,
    worst_bundle_code       VARCHAR(20) NULL,
    worst_bundle_pct        DECIMAL(5,2) NULL,
    -- Clinical flags
    has_diabetes            BOOLEAN     NOT NULL DEFAULT FALSE,
    has_hypertension        BOOLEAN     NOT NULL DEFAULT FALSE,
    has_cad                 BOOLEAN     NOT NULL DEFAULT FALSE,
    has_heart_failure       BOOLEAN     NOT NULL DEFAULT FALSE,
    has_copd                BOOLEAN     NOT NULL DEFAULT FALSE,
    has_ckd                 BOOLEAN     NOT NULL DEFAULT FALSE,
    has_depression          BOOLEAN     NOT NULL DEFAULT FALSE,
    chronic_condition_count SMALLINT    NOT NULL DEFAULT 0,
    -- Risk scores
    hcc_risk_score          DECIMAL(6,3) NULL,
    readmission_risk        DECIMAL(5,4) NULL,
    ed_utilization_risk     DECIMAL(5,4) NULL,
    abigail_priority_score  DECIMAL(5,2) NULL,
    risk_tier               VARCHAR(20) NULL,
    -- Utilization summary
    encounters_last_12mo    SMALLINT    NOT NULL DEFAULT 0,
    ed_visits_last_12mo     SMALLINT    NOT NULL DEFAULT 0,
    inpatient_last_12mo     SMALLINT    NOT NULL DEFAULT 0,
    last_encounter_date_key INT         NULL REFERENCES phm_star.dim_date(date_key),
    days_since_last_visit   INT         NULL,
    -- SDOH flags
    food_insecurity         BOOLEAN     NOT NULL DEFAULT FALSE,
    housing_instability     BOOLEAN     NOT NULL DEFAULT FALSE,
    transportation_barrier  BOOLEAN     NOT NULL DEFAULT FALSE,
    social_isolation_score  SMALLINT    NULL,
    -- Quality
    mips_eligible           BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Metadata
    date_key_snapshot       INT         NOT NULL REFERENCES phm_star.dim_date(date_key),
    etl_refreshed_at        TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fpc_provider    ON phm_star.fact_patient_composite(provider_key);
CREATE INDEX IF NOT EXISTS idx_fpc_risk_tier   ON phm_star.fact_patient_composite(risk_tier);
CREATE INDEX IF NOT EXISTS idx_fpc_compliance  ON phm_star.fact_patient_composite(overall_compliance_pct);
CREATE INDEX IF NOT EXISTS idx_fpc_diabetes    ON phm_star.fact_patient_composite(has_diabetes) WHERE has_diabetes = TRUE;
CREATE INDEX IF NOT EXISTS idx_fpc_htn         ON phm_star.fact_patient_composite(has_hypertension) WHERE has_hypertension = TRUE;

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.fact_ai_risk_score (
    risk_score_key      BIGSERIAL     PRIMARY KEY,
    patient_key         INT           NOT NULL REFERENCES phm_star.dim_patient(patient_key),
    risk_model_key      INT           NOT NULL REFERENCES phm_star.dim_risk_model(risk_model_key),
    date_key_scored     INT           NOT NULL REFERENCES phm_star.dim_date(date_key),
    score_value         DECIMAL(10,4) NOT NULL,
    score_percentile    DECIMAL(5,2)  NULL,
    risk_tier           VARCHAR(20)   NULL,
    contributing_factors JSONB        NULL,
    model_version       VARCHAR(20)   NULL,
    confidence          DECIMAL(5,4)  NULL,
    etl_refreshed_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    UNIQUE (patient_key, risk_model_key, date_key_scored)
);
CREATE INDEX IF NOT EXISTS idx_fairs_patient ON phm_star.fact_ai_risk_score(patient_key);
CREATE INDEX IF NOT EXISTS idx_fairs_model   ON phm_star.fact_ai_risk_score(risk_model_key);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.fact_population_snapshot (
    snapshot_key        BIGSERIAL     PRIMARY KEY,
    org_key             INT           NOT NULL REFERENCES phm_star.dim_organization(org_key),
    date_key_snapshot   INT           NOT NULL REFERENCES phm_star.dim_date(date_key),
    bundle_key          INT           NULL REFERENCES phm_star.dim_care_gap_bundle(bundle_key),
    provider_key        INT           NULL REFERENCES phm_star.dim_provider(provider_key),
    total_patients      INT           NOT NULL DEFAULT 0,
    patients_with_bundle INT          NOT NULL DEFAULT 0,
    avg_compliance_pct  DECIMAL(5,2)  NULL,
    median_compliance_pct DECIMAL(5,2) NULL,
    open_gaps_total     INT           NOT NULL DEFAULT 0,
    closed_gaps_total   INT           NOT NULL DEFAULT 0,
    excluded_gaps_total INT           NOT NULL DEFAULT 0,
    high_risk_patients  INT           NOT NULL DEFAULT 0,
    critical_risk_patients INT        NOT NULL DEFAULT 0,
    avg_hcc_score       DECIMAL(6,3)  NULL,
    avg_chronic_conditions DECIMAL(4,1) NULL,
    sdoh_flagged_patients INT         NOT NULL DEFAULT 0,
    etl_refreshed_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fps_org_date   ON phm_star.fact_population_snapshot(org_key, date_key_snapshot);
CREATE INDEX IF NOT EXISTS idx_fps_bundle     ON phm_star.fact_population_snapshot(bundle_key);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.fact_provider_quality (
    quality_key         BIGSERIAL     PRIMARY KEY,
    provider_key        INT           NOT NULL REFERENCES phm_star.dim_provider(provider_key),
    org_key             INT           NULL REFERENCES phm_star.dim_organization(org_key),
    bundle_key          INT           NULL REFERENCES phm_star.dim_care_gap_bundle(bundle_key),
    date_key_period     INT           NOT NULL REFERENCES phm_star.dim_date(date_key),
    reporting_year      SMALLINT      NOT NULL,
    attributed_patients INT           NOT NULL DEFAULT 0,
    patients_with_bundle INT          NOT NULL DEFAULT 0,
    total_gaps_open     INT           NOT NULL DEFAULT 0,
    total_gaps_closed   INT           NOT NULL DEFAULT 0,
    compliance_rate     DECIMAL(5,2)  NULL,
    mips_quality_score  DECIMAL(5,2)  NULL,
    percentile_rank     DECIMAL(5,2)  NULL,
    etl_refreshed_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fpq_provider ON phm_star.fact_provider_quality(provider_key);
CREATE INDEX IF NOT EXISTS idx_fpq_period   ON phm_star.fact_provider_quality(date_key_period);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.fact_immunization (
    immunization_key       BIGSERIAL      PRIMARY KEY,
    immunization_id        INT            NOT NULL UNIQUE,
    patient_key            INT            NOT NULL REFERENCES phm_star.dim_patient(patient_key),
    provider_key           INT            NULL REFERENCES phm_star.dim_provider(provider_key),
    date_key_administered  INT            NOT NULL REFERENCES phm_star.dim_date(date_key),
    vaccine_code           VARCHAR(50)    NOT NULL,
    vaccine_name           VARCHAR(255)   NOT NULL,
    status                 VARCHAR(50)    NULL,
    count_immunization     INT            NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.fact_patient_insurance (
    coverage_key           BIGSERIAL      PRIMARY KEY,
    coverage_id            INT            NOT NULL UNIQUE,
    patient_key            INT            NOT NULL REFERENCES phm_star.dim_patient(patient_key),
    payer_key              INT            NOT NULL REFERENCES phm_star.dim_payer(payer_key),
    date_key_start         INT            NOT NULL REFERENCES phm_star.dim_date(date_key),
    date_key_end           INT            NULL REFERENCES phm_star.dim_date(date_key),
    primary_indicator      BOOLEAN        NOT NULL DEFAULT TRUE,
    is_active              BOOLEAN        NOT NULL DEFAULT TRUE
);

-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phm_star.fact_sdoh (
    sdoh_key               BIGSERIAL      PRIMARY KEY,
    sdoh_assessment_id     INT            NOT NULL UNIQUE,
    patient_key            INT            NOT NULL REFERENCES phm_star.dim_patient(patient_key),
    date_key_assessment    INT            NOT NULL REFERENCES phm_star.dim_date(date_key),
    housing_status         VARCHAR(100)   NULL,
    food_insecurity        BOOLEAN        NOT NULL DEFAULT FALSE,
    transportation_barrier BOOLEAN        NOT NULL DEFAULT FALSE,
    social_isolation_score SMALLINT       NULL
);

-- ─────────────────────────────────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────────────

-- fact_patient_composite
CREATE INDEX IF NOT EXISTS idx_fpc_org         ON phm_star.fact_patient_composite(org_key);
CREATE INDEX IF NOT EXISTS idx_fpc_risk_score  ON phm_star.fact_patient_composite(risk_tier, abigail_priority_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_fpc_bundles     ON phm_star.fact_patient_composite(active_bundle_count);
CREATE INDEX IF NOT EXISTS idx_fpc_conditions  ON phm_star.fact_patient_composite(has_diabetes, has_hypertension, has_cad, has_heart_failure, has_copd, has_ckd, has_depression);

-- fact_patient_bundle
CREATE INDEX IF NOT EXISTS idx_fpb_patient_active ON phm_star.fact_patient_bundle(patient_key) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fpb_compliance     ON phm_star.fact_patient_bundle(compliance_pct);

-- fact_patient_bundle_detail
CREATE INDEX IF NOT EXISTS idx_fpbd_overdue ON phm_star.fact_patient_bundle_detail(is_overdue) WHERE is_overdue = TRUE;

-- fact_care_gap
CREATE INDEX IF NOT EXISTS idx_fcg_status         ON phm_star.fact_care_gap(gap_status);
CREATE INDEX IF NOT EXISTS idx_fcg_patient_measure ON phm_star.fact_care_gap(patient_key, measure_key);
CREATE INDEX IF NOT EXISTS idx_fcg_bundle         ON phm_star.fact_care_gap(bundle_key);

-- fact_encounter
CREATE INDEX IF NOT EXISTS idx_fe_date    ON phm_star.fact_encounter(date_key_encounter);
CREATE INDEX IF NOT EXISTS idx_fe_patient ON phm_star.fact_encounter(patient_key);

-- fact_diagnosis
CREATE INDEX IF NOT EXISTS idx_fd_patient   ON phm_star.fact_diagnosis(patient_key);
CREATE INDEX IF NOT EXISTS idx_fd_condition ON phm_star.fact_diagnosis(condition_key);

-- fact_observation
CREATE INDEX IF NOT EXISTS idx_fo_patient_code ON phm_star.fact_observation(patient_key, observation_code);
CREATE INDEX IF NOT EXISTS idx_fo_date         ON phm_star.fact_observation(date_key_obs);

-- fact_medication_order
CREATE INDEX IF NOT EXISTS idx_fmo_patient ON phm_star.fact_medication_order(patient_key);

-- fact_ai_risk_score
CREATE INDEX IF NOT EXISTS idx_fairs_model_date ON phm_star.fact_ai_risk_score(risk_model_key, date_key_scored);

-- fact_provider_quality
CREATE INDEX IF NOT EXISTS idx_fpq_prov_period   ON phm_star.fact_provider_quality(provider_key, date_key_period);
CREATE INDEX IF NOT EXISTS idx_fpq_bundle_period ON phm_star.fact_provider_quality(bundle_key, date_key_period);

-- fact_population_snapshot
CREATE INDEX IF NOT EXISTS idx_fps_bundle_date ON phm_star.fact_population_snapshot(bundle_key, date_key_snapshot);

-- ─────────────────────────────────────────────────────────────────────
-- MATERIALIZED VIEWS
-- ─────────────────────────────────────────────────────────────────────

-- 1. Patient dashboard — primary patient list/grid screen
CREATE MATERIALIZED VIEW IF NOT EXISTS phm_star.mv_patient_dashboard AS
SELECT
    fpc.composite_key,
    fpc.patient_key,
    fpc.provider_key,
    fpc.org_key,
    fpc.payer_key,
    dp.first_name                   AS patient_first_name,
    dp.last_name                    AS patient_last_name,
    dp.date_of_birth,
    fpc.age,
    fpc.gender,
    fpc.race,
    fpc.primary_language,
    dprov.first_name                AS provider_first_name,
    dprov.last_name                 AS provider_last_name,
    dorg.organization_name,
    dpay.payer_name,
    dpay.payer_type,
    fpc.active_bundle_count,
    fpc.total_measures_due,
    fpc.total_measures_met,
    fpc.total_measures_open,
    fpc.overall_compliance_pct,
    fpc.worst_bundle_code,
    fpc.worst_bundle_pct,
    fpc.risk_tier,
    fpc.abigail_priority_score,
    fpc.hcc_risk_score,
    fpc.readmission_risk,
    fpc.ed_utilization_risk,
    fpc.chronic_condition_count,
    fpc.has_diabetes,
    fpc.has_hypertension,
    fpc.has_cad,
    fpc.has_heart_failure,
    fpc.has_copd,
    fpc.has_ckd,
    fpc.has_depression,
    fpc.encounters_last_12mo,
    fpc.ed_visits_last_12mo,
    fpc.inpatient_last_12mo,
    fpc.days_since_last_visit,
    fpc.food_insecurity,
    fpc.housing_instability,
    fpc.transportation_barrier,
    fpc.mips_eligible,
    fpc.etl_refreshed_at
FROM phm_star.fact_patient_composite fpc
JOIN  phm_star.dim_patient       dp    ON dp.patient_key   = fpc.patient_key   AND dp.is_current   = TRUE
LEFT JOIN phm_star.dim_provider  dprov ON dprov.provider_key = fpc.provider_key AND dprov.is_current = TRUE
LEFT JOIN phm_star.dim_organization dorg ON dorg.org_key    = fpc.org_key      AND dorg.is_current  = TRUE
LEFT JOIN phm_star.dim_payer     dpay  ON dpay.payer_key    = fpc.payer_key
ORDER BY fpc.abigail_priority_score DESC NULLS LAST
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_patient_dashboard    ON phm_star.mv_patient_dashboard(composite_key);
CREATE INDEX IF NOT EXISTS idx_mv_dash_provider              ON phm_star.mv_patient_dashboard(provider_key);
CREATE INDEX IF NOT EXISTS idx_mv_dash_risk                  ON phm_star.mv_patient_dashboard(risk_tier, abigail_priority_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_mv_dash_compliance            ON phm_star.mv_patient_dashboard(overall_compliance_pct);

-- 2. Bundle compliance by provider — provider scorecard with percentile rank
CREATE MATERIALIZED VIEW IF NOT EXISTS phm_star.mv_bundle_compliance_by_provider AS
WITH agg AS (
    SELECT
        fpb.provider_key,
        fpb.bundle_key,
        COUNT(DISTINCT fpb.patient_key)  AS patient_count,
        AVG(fpb.compliance_pct)          AS avg_compliance_pct,
        SUM(fpb.measures_open)           AS total_gaps_open,
        SUM(fpb.measures_met)            AS total_gaps_closed
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
    ROUND(PERCENT_RANK() OVER (PARTITION BY agg.bundle_key ORDER BY agg.avg_compliance_pct)::NUMERIC * 100, 1) AS percentile_rank
FROM agg
JOIN  phm_star.dim_care_gap_bundle dcgb  ON dcgb.bundle_key   = agg.bundle_key AND dcgb.is_active = TRUE
LEFT JOIN phm_star.dim_provider    dprov ON dprov.provider_key = agg.provider_key AND dprov.is_current = TRUE
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_bundle_compliance       ON phm_star.mv_bundle_compliance_by_provider(provider_key, bundle_key);
CREATE INDEX IF NOT EXISTS idx_mv_bundle_compliance_bundle      ON phm_star.mv_bundle_compliance_by_provider(bundle_key);

-- 3. Population overview — org-level population health from fact_population_snapshot
CREATE MATERIALIZED VIEW IF NOT EXISTS phm_star.mv_population_overview AS
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
JOIN  phm_star.dim_organization     dorg ON dorg.org_key       = fps.org_key          AND dorg.is_current = TRUE
JOIN  phm_star.dim_date             dd   ON dd.date_key        = fps.date_key_snapshot
LEFT JOIN phm_star.dim_care_gap_bundle dcgb ON dcgb.bundle_key = fps.bundle_key
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_population_overview  ON phm_star.mv_population_overview(snapshot_key);
CREATE INDEX IF NOT EXISTS idx_mv_pop_org_date               ON phm_star.mv_population_overview(org_key, date_key_snapshot);
CREATE INDEX IF NOT EXISTS idx_mv_pop_bundle                 ON phm_star.mv_population_overview(bundle_key, date_key_snapshot);

-- 4. Care gap worklist — clinical worklist for care coordinators
CREATE MATERIALIZED VIEW IF NOT EXISTS phm_star.mv_care_gap_worklist AS
SELECT
    fpbd.detail_key,
    fpbd.patient_bundle_key,
    fpbd.patient_key,
    dp.first_name                    AS patient_first_name,
    dp.last_name                     AS patient_last_name,
    dp.date_of_birth,
    fpb.provider_key,
    dprov.first_name                 AS provider_first_name,
    dprov.last_name                  AS provider_last_name,
    fpbd.bundle_key,
    dcgb.bundle_code,
    dcgb.bundle_name,
    dcgb.disease_category,
    fpbd.measure_key,
    dm.measure_code,
    dm.measure_name,
    dm.frequency                     AS measure_frequency,
    dm.target_text,
    fpbd.gap_status,
    fpbd.is_overdue,
    fpbd.days_overdue,
    fpbd.dedup_applied
FROM phm_star.fact_patient_bundle_detail fpbd
JOIN  phm_star.fact_patient_bundle    fpb   ON fpb.patient_bundle_key = fpbd.patient_bundle_key
JOIN  phm_star.dim_patient            dp    ON dp.patient_key         = fpbd.patient_key   AND dp.is_current  = TRUE
JOIN  phm_star.dim_care_gap_bundle    dcgb  ON dcgb.bundle_key        = fpbd.bundle_key
JOIN  phm_star.dim_measure            dm    ON dm.measure_key         = fpbd.measure_key
LEFT JOIN phm_star.dim_provider       dprov ON dprov.provider_key     = fpb.provider_key   AND dprov.is_current = TRUE
WHERE fpbd.gap_status = 'Open'
  AND fpbd.dedup_applied = FALSE
ORDER BY fpbd.is_overdue DESC, fpbd.days_overdue DESC NULLS LAST
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_care_gap_worklist    ON phm_star.mv_care_gap_worklist(detail_key);
CREATE INDEX IF NOT EXISTS idx_mv_worklist_provider          ON phm_star.mv_care_gap_worklist(provider_key);
CREATE INDEX IF NOT EXISTS idx_mv_worklist_patient           ON phm_star.mv_care_gap_worklist(patient_key);
CREATE INDEX IF NOT EXISTS idx_mv_worklist_bundle            ON phm_star.mv_care_gap_worklist(bundle_key);
CREATE INDEX IF NOT EXISTS idx_mv_worklist_overdue           ON phm_star.mv_care_gap_worklist(is_overdue) WHERE is_overdue = TRUE;

-- 5. Population by condition — drives the Population Health Dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS phm_star.mv_population_by_condition AS
SELECT
    cb.bundle_key,
    cb.bundle_code,
    cb.bundle_name,
    cb.disease_category,
    COUNT(DISTINCT fpb.patient_key)                                         AS patient_count,
    ROUND(AVG(fpb.compliance_pct), 1)                                       AS avg_compliance_pct,
    SUM(fpb.measures_open)                                                  AS total_open_gaps,
    SUM(fpb.measures_met)                                                   AS total_closed_gaps,
    COUNT(DISTINCT fpb.patient_key) FILTER (WHERE fpb.risk_tier = 'Critical') AS critical_patients,
    COUNT(DISTINCT fpb.patient_key) FILTER (WHERE fpb.risk_tier = 'High')   AS high_risk_patients,
    NOW()                                                                   AS refreshed_at
FROM phm_star.fact_patient_bundle fpb
JOIN phm_star.dim_care_gap_bundle cb ON fpb.bundle_key = cb.bundle_key
WHERE fpb.is_active = TRUE
GROUP BY cb.bundle_key, cb.bundle_code, cb.bundle_name, cb.disease_category
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pop_bundle ON phm_star.mv_population_by_condition(bundle_key);

-- ─────────────────────────────────────────────────────────────────────

-- Provider scorecard — drives provider comparison screens
CREATE MATERIALIZED VIEW IF NOT EXISTS phm_star.mv_provider_scorecard AS
SELECT
    dp.provider_key,
    dp.provider_id,
    dp.first_name,
    dp.last_name,
    dp.specialty,
    COUNT(DISTINCT fpc.patient_key)                                         AS attributed_patients,
    ROUND(AVG(fpc.overall_compliance_pct), 1)                               AS avg_compliance_pct,
    ROUND(AVG(fpc.hcc_risk_score), 3)                                       AS avg_hcc_risk,
    SUM(fpc.total_measures_open)                                            AS total_open_gaps,
    SUM(fpc.total_measures_met)                                             AS total_closed_gaps,
    COUNT(DISTINCT fpc.patient_key) FILTER (WHERE fpc.risk_tier = 'Critical') AS critical_patients,
    COUNT(DISTINCT fpc.patient_key) FILTER (WHERE fpc.risk_tier = 'High')   AS high_risk_patients,
    ROUND(AVG(fpc.active_bundle_count), 1)                                  AS avg_bundle_count,
    NOW()                                                                   AS refreshed_at
FROM phm_star.fact_patient_composite fpc
JOIN phm_star.dim_provider dp ON fpc.provider_key = dp.provider_key
WHERE dp.is_current = TRUE
GROUP BY dp.provider_key, dp.provider_id, dp.first_name, dp.last_name, dp.specialty
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_scorecard_provider ON phm_star.mv_provider_scorecard(provider_key);

-- ─────────────────────────────────────────────────────────────────────

-- Patient risk tier summary — drives alert panels and priority queue
CREATE MATERIALIZED VIEW IF NOT EXISTS phm_star.mv_patient_risk_tier AS
SELECT
    fpc.provider_key,
    fpc.risk_tier,
    COUNT(*)                                                                AS patient_count,
    ROUND(AVG(fpc.overall_compliance_pct), 1)                               AS avg_compliance_pct,
    ROUND(AVG(fpc.total_measures_open), 1)                                  AS avg_open_gaps,
    ROUND(AVG(fpc.abigail_priority_score), 1)                               AS avg_priority_score,
    NOW()                                                                   AS refreshed_at
FROM phm_star.fact_patient_composite fpc
WHERE fpc.risk_tier IS NOT NULL
GROUP BY fpc.provider_key, fpc.risk_tier
WITH DATA;

CREATE INDEX IF NOT EXISTS idx_mv_risk_tier_provider ON phm_star.mv_patient_risk_tier(provider_key);

COMMENT ON TABLE phm_star.dim_care_gap_bundle    IS '45-disease bundle dimension for the Care Gap Bundle framework';
COMMENT ON TABLE phm_star.bridge_bundle_measure  IS 'Many-to-many bridge: bundle ↔ measure (with dedup domain)';
COMMENT ON TABLE phm_star.fact_patient_bundle    IS 'One row per patient per active disease bundle — compliance summary';
COMMENT ON TABLE phm_star.fact_patient_composite IS 'One row per patient — pre-aggregated dashboard summary fact';
COMMENT ON TABLE phm_star.fact_ai_risk_score     IS 'AI/ML risk scores per patient per model per run';
COMMENT ON TABLE phm_star.fact_immunization      IS 'Immunization events — incremental from phm_edw.immunization';
COMMENT ON TABLE phm_star.fact_patient_insurance IS 'Patient insurance coverage periods — UPSERT from phm_edw';
COMMENT ON TABLE phm_star.fact_sdoh              IS 'SDOH assessments — incremental from phm_edw.sdoh_assessment';
COMMENT ON MATERIALIZED VIEW phm_star.mv_patient_dashboard               IS 'Primary patient list for dashboard grid. Refreshed CONCURRENTLY each ETL.';
COMMENT ON MATERIALIZED VIEW phm_star.mv_bundle_compliance_by_provider   IS 'Provider scorecard by bundle with percentile rank.';
COMMENT ON MATERIALIZED VIEW phm_star.mv_population_overview             IS 'Org-level population health by date and bundle. Drives trend charts.';
COMMENT ON MATERIALIZED VIEW phm_star.mv_care_gap_worklist               IS 'Open care gaps for clinical worklist. Non-deduped gaps only.';
COMMENT ON MATERIALIZED VIEW phm_star.mv_population_by_condition         IS 'Population health dashboard: patients and compliance per bundle';
COMMENT ON MATERIALIZED VIEW phm_star.mv_provider_scorecard              IS 'Provider comparison scorecard aggregate';
