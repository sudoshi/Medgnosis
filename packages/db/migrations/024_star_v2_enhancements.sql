-- =====================================================================
-- 024_star_v2_enhancements.sql
-- Star Schema v2 Enhancements
-- Adds missing columns, fact tables, indexes, and materialized views
-- that were part of the consolidated star schema design but not yet
-- applied to the database.
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

-- fact_care_gap — add bundle attribution and lifecycle columns
ALTER TABLE phm_star.fact_care_gap
    ADD COLUMN IF NOT EXISTS bundle_key    INT  NULL,
    ADD COLUMN IF NOT EXISTS provider_key  INT  NULL,
    ADD COLUMN IF NOT EXISTS org_key       INT  NULL,
    ADD COLUMN IF NOT EXISTS days_open     INT  NULL;

-- Deferred FK constraints (dim_care_gap_bundle already exists)
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
-- SECTION 2: NEW FACT TABLES
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
-- SECTION 3: PERFORMANCE INDEXES
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
-- SECTION 4: NEW MATERIALIZED VIEWS
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

-- 3. Population overview — org-level population health
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

-- ─────────────────────────────────────────────────────────────────────
-- COMMENTS
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE phm_star.fact_immunization      IS 'Immunization events — incremental from phm_edw.immunization';
COMMENT ON TABLE phm_star.fact_patient_insurance IS 'Patient insurance coverage periods — UPSERT from phm_edw';
COMMENT ON TABLE phm_star.fact_sdoh              IS 'SDOH assessments — incremental from phm_edw.sdoh_assessment';
COMMENT ON MATERIALIZED VIEW phm_star.mv_patient_dashboard             IS 'Primary patient list for dashboard grid. Refreshed CONCURRENTLY each ETL.';
COMMENT ON MATERIALIZED VIEW phm_star.mv_bundle_compliance_by_provider IS 'Provider scorecard by bundle with percentile rank.';
COMMENT ON MATERIALIZED VIEW phm_star.mv_population_overview           IS 'Org-level population health by date and bundle. Drives trend charts.';
COMMENT ON MATERIALIZED VIEW phm_star.mv_care_gap_worklist             IS 'Open care gaps for clinical worklist. Non-deduped gaps only.';
