-- =====================================================================
-- 013_star_schema_enhancement.sql
-- Phase: Demo Account — Star Schema Enhancement
-- Adds new dimensions, bridge tables, and fact tables to phm_star
-- Implements Medgnosis_Claude_Code_Prompt.md / BACKEND_UPDATE_v2.md
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- NEW DIMENSIONS
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
-- NEW FACT TABLES
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
-- MATERIALIZED VIEWS
-- ─────────────────────────────────────────────────────────────────────

-- Population by condition — drives the Population Health Dashboard
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

COMMENT ON TABLE phm_star.dim_care_gap_bundle   IS '45-disease bundle dimension for the Care Gap Bundle framework';
COMMENT ON TABLE phm_star.bridge_bundle_measure IS 'Many-to-many bridge: bundle ↔ measure (with dedup domain)';
COMMENT ON TABLE phm_star.fact_patient_bundle   IS 'One row per patient per active disease bundle — compliance summary';
COMMENT ON TABLE phm_star.fact_patient_composite IS 'One row per patient — pre-aggregated dashboard summary fact';
COMMENT ON TABLE phm_star.fact_ai_risk_score    IS 'AI/ML risk scores per patient per model per run';
COMMENT ON MATERIALIZED VIEW phm_star.mv_population_by_condition IS 'Population health dashboard: patients and compliance per bundle';
COMMENT ON MATERIALIZED VIEW phm_star.mv_provider_scorecard      IS 'Provider comparison scorecard aggregate';
