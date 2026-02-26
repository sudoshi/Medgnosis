# Claude Code Prompt: Medgnosis Star Schema & ETL Enhancement

## Context

You are working on **Medgnosis**, an AI-powered ambulatory Population Health Management (PHM) EHR platform. The platform has three database layers:

1. **phm_edw** — An Inmon-style 3NF Enterprise Data Warehouse (source of truth)
2. **phm_star** — A Kimball star schema for analytic dashboards (what you are updating)
3. **Nightly ETL** — SQL that refreshes phm_star from phm_edw (what you are updating)

The application serves 40+ screens including clinical dashboards, population health views, quality reporting (MIPS/MACRA), provider scorecards, care coordination, and an AI Physician Assistant named "Abigail." The dashboard must be fast — sub-second for most widgets.

---

## Your Task

Update the **phm_star** DDL and the **ETL SQL** to accomplish three goals:

1. **Speed up dashboard queries** for all application modules
2. **Incorporate the 45-disease / 350-measure care gap bundle framework** (described below)
3. **Add tables for AI-based analysis** of care gaps, patient risk, and population trends

---

## Attached Files

- `phm-edw-ddl.sql` — The 3NF EDW DDL (19 tables, PostgreSQL). This is the SOURCE. Do NOT modify this file.
- `phm-star-ddl.sql` — The current Kimball star schema DDL (8 dimensions, 7 fact tables). You WILL modify this.
- `ETL_edw_to_star.sql` — The current ETL (15-step refresh inside a transaction). You WILL modify this.

---

## Part 1: New Dimensions to Add to phm_star

### 1.1 dim_payer
The EDW has `payer` and `patient_insurance_coverage` tables but the star schema has no payer dimension. Add:
```sql
-- dim_payer: One row per payer (Medicare, Medicaid, commercial, etc.)
-- Columns: payer_key (PK SERIAL), payer_id (NK from EDW), payer_name, payer_type, is_current, effective dates, timestamps
```

### 1.2 dim_allergy
The EDW has `allergy` and `patient_allergy` but the star has nothing. Add:
```sql
-- dim_allergy: One row per allergy definition
-- Columns: allergy_key (PK SERIAL), allergy_id (NK), allergy_code, allergy_name, code_system, category, timestamps
```

### 1.3 dim_care_gap_bundle (NEW — does not exist in EDW)
This is the critical new dimension. It represents the 45 chronic disease bundles we have defined. Each bundle maps a chronic disease to its required set of eCQM-based care gap measures.

```sql
-- dim_care_gap_bundle: One row per disease bundle
-- Columns:
--   bundle_key         SERIAL PRIMARY KEY
--   bundle_code        VARCHAR(20) NOT NULL    -- e.g., 'DM2', 'HTN', 'CAD', 'HF', 'COPD'
--   bundle_name        VARCHAR(200) NOT NULL   -- e.g., 'Type 2 Diabetes Mellitus'
--   disease_category   VARCHAR(100) NULL       -- e.g., 'Endocrine', 'Cardiovascular', 'Respiratory'
--   icd10_codes        TEXT NOT NULL           -- Comma-separated ICD-10 codes that qualify a patient for this bundle
--                                              -- e.g., 'E11.0,E11.1,E11.2,E11.3,E11.4,E11.5,E11.6,E11.8,E11.9'
--   bundle_size        SMALLINT NOT NULL       -- Number of measures in the bundle (e.g., 8 for DM2)
--   total_diseases     SMALLINT DEFAULT 45     -- Constant: total diseases in the library
--   is_active          BOOLEAN DEFAULT TRUE
--   created_at         TIMESTAMP DEFAULT NOW()
--   updated_at         TIMESTAMP
```

### 1.4 bridge_bundle_measure (NEW — bridge table)
Maps each bundle to its constituent measures. This is a many-to-many bridge between dim_care_gap_bundle and dim_measure.

```sql
-- bridge_bundle_measure: One row per bundle-measure combination
-- Columns:
--   bridge_key         SERIAL PRIMARY KEY
--   bundle_key         INT NOT NULL REFERENCES dim_care_gap_bundle(bundle_key)
--   measure_key        INT NOT NULL REFERENCES dim_measure(measure_key)
--   measure_sequence   SMALLINT NULL           -- Order within the bundle (1-N)
--   frequency          VARCHAR(50) NULL        -- e.g., 'Annual', 'Every 6 months', 'Every visit'
--   is_shared_measure  BOOLEAN DEFAULT FALSE   -- TRUE if this measure appears in multiple bundles
--   dedup_domain       VARCHAR(100) NULL       -- e.g., 'Blood Pressure Control', 'Statin Therapy'
--                                              -- Used for cross-bundle deduplication
--   UNIQUE(bundle_key, measure_key)
```

### 1.5 dim_risk_model (NEW — for AI)
```sql
-- dim_risk_model: Defines AI/ML models used for scoring
-- Columns:
--   risk_model_key     SERIAL PRIMARY KEY
--   model_code         VARCHAR(50) NOT NULL    -- e.g., 'HCC_V28', 'READMIT_30D', 'ED_RISK', 'ABIGAIL_COMPOSITE'
--   model_name         VARCHAR(200) NOT NULL
--   model_version      VARCHAR(20) NOT NULL
--   model_type         VARCHAR(50) NULL        -- e.g., 'Risk Adjustment', 'Predictive', 'Classification'
--   description        TEXT NULL
--   is_active          BOOLEAN DEFAULT TRUE
--   effective_start    DATE NOT NULL
--   effective_end      DATE DEFAULT '9999-12-31'
--   created_at         TIMESTAMP DEFAULT NOW()
```

---

## Part 2: New Fact Tables to Add to phm_star

### 2.1 fact_patient_bundle (NEW — core table for care gap bundles)
This is the most important new fact table. It represents the assignment of a patient to a disease bundle, with their current compliance status. One row per patient per active bundle.

```sql
-- fact_patient_bundle: One row per patient per active disease bundle
-- Grain: patient_key + bundle_key (one active row per combination)
-- Columns:
--   patient_bundle_key    BIGSERIAL PRIMARY KEY
--   patient_key           INT NOT NULL REFERENCES dim_patient(patient_key)
--   bundle_key            INT NOT NULL REFERENCES dim_care_gap_bundle(bundle_key)
--   provider_key          INT NULL REFERENCES dim_provider(provider_key)   -- Attributed PCP
--   org_key               INT NULL REFERENCES dim_organization(org_key)
--   date_key_assigned     INT NOT NULL REFERENCES dim_date(date_key)      -- When patient qualified
--   date_key_last_eval    INT NULL REFERENCES dim_date(date_key)          -- Last evaluation date
--   total_measures        SMALLINT NOT NULL                                -- Bundle size (e.g., 8)
--   measures_met          SMALLINT NOT NULL DEFAULT 0                     -- How many are satisfied
--   measures_open         SMALLINT NOT NULL DEFAULT 0                     -- How many are open gaps
--   compliance_pct        DECIMAL(5,2) NULL                               -- measures_met / total_measures * 100
--   risk_tier             VARCHAR(20) NULL                                -- 'High', 'Medium', 'Low'
--   is_active             BOOLEAN DEFAULT TRUE
--   UNIQUE(patient_key, bundle_key) WHERE is_active = TRUE               -- Partial unique index
```

### 2.2 fact_patient_bundle_detail (NEW — per-measure detail within a bundle)
```sql
-- fact_patient_bundle_detail: One row per patient per measure within each bundle
-- Grain: patient_key + bundle_key + measure_key
-- Columns:
--   detail_key             BIGSERIAL PRIMARY KEY
--   patient_bundle_key     BIGINT NOT NULL REFERENCES fact_patient_bundle(patient_bundle_key)
--   patient_key            INT NOT NULL REFERENCES dim_patient(patient_key)
--   bundle_key             INT NOT NULL REFERENCES dim_care_gap_bundle(bundle_key)
--   measure_key            INT NOT NULL REFERENCES dim_measure(measure_key)
--   date_key_last_action   INT NULL REFERENCES dim_date(date_key)
--   gap_status             VARCHAR(50) NOT NULL DEFAULT 'Open'  -- 'Open', 'Closed', 'Excluded'
--   is_overdue             BOOLEAN DEFAULT FALSE
--   days_since_last_action INT NULL
--   dedup_applied          BOOLEAN DEFAULT FALSE   -- TRUE if satisfied by another bundle's measure
--   dedup_source_bundle    INT NULL                -- bundle_key of the bundle that satisfied this
--   UNIQUE(patient_key, bundle_key, measure_key)
```

### 2.3 fact_patient_composite (NEW — single-row-per-patient summary for dashboard)
This is the primary table the dashboard will query for the patient list/grid. It's a wide, pre-aggregated fact that supports fast filtering and sorting.

```sql
-- fact_patient_composite: One row per active patient — the "dashboard row"
-- Grain: patient_key (one row per current patient)
-- Columns:
--   composite_key          BIGSERIAL PRIMARY KEY
--   patient_key            INT NOT NULL UNIQUE REFERENCES dim_patient(patient_key)
--   provider_key           INT NULL REFERENCES dim_provider(provider_key)
--   org_key                INT NULL REFERENCES dim_organization(org_key)
--   payer_key              INT NULL REFERENCES dim_payer(payer_key)
--
--   -- Demographics snapshot
--   age                    SMALLINT NULL
--   gender                 VARCHAR(10) NULL
--   race                   VARCHAR(50) NULL
--   primary_language       VARCHAR(50) NULL
--
--   -- Bundle summary
--   active_bundle_count    SMALLINT DEFAULT 0      -- How many disease bundles apply (e.g., 3 for DM+COPD+CKD)
--   total_measures_due     SMALLINT DEFAULT 0      -- Sum of all measures across all active bundles (after dedup)
--   total_measures_met     SMALLINT DEFAULT 0      -- Sum of satisfied measures
--   total_measures_open    SMALLINT DEFAULT 0      -- Sum of open gaps
--   overall_compliance_pct DECIMAL(5,2) NULL       -- total_measures_met / total_measures_due * 100
--   worst_bundle_code      VARCHAR(20) NULL        -- Bundle with lowest compliance
--   worst_bundle_pct       DECIMAL(5,2) NULL
--
--   -- Clinical flags (for quick filters)
--   has_diabetes           BOOLEAN DEFAULT FALSE
--   has_hypertension       BOOLEAN DEFAULT FALSE
--   has_cad                BOOLEAN DEFAULT FALSE
--   has_heart_failure      BOOLEAN DEFAULT FALSE
--   has_copd               BOOLEAN DEFAULT FALSE
--   has_ckd                BOOLEAN DEFAULT FALSE
--   has_depression         BOOLEAN DEFAULT FALSE
--   chronic_condition_count SMALLINT DEFAULT 0     -- Total active chronic diagnoses
--
--   -- Risk scores (AI-populated)
--   hcc_risk_score         DECIMAL(6,3) NULL
--   readmission_risk       DECIMAL(5,4) NULL       -- 0.0000 to 1.0000
--   ed_utilization_risk    DECIMAL(5,4) NULL
--   abigail_priority_score DECIMAL(5,2) NULL       -- Abigail AI composite priority (0-100)
--   risk_tier              VARCHAR(20) NULL         -- 'Critical', 'High', 'Medium', 'Low'
--
--   -- Utilization summary
--   encounters_last_12mo   SMALLINT DEFAULT 0
--   ed_visits_last_12mo    SMALLINT DEFAULT 0
--   inpatient_last_12mo    SMALLINT DEFAULT 0
--   last_encounter_date_key INT NULL
--   days_since_last_visit  INT NULL
--
--   -- SDOH flags
--   food_insecurity        BOOLEAN DEFAULT FALSE
--   housing_instability    BOOLEAN DEFAULT FALSE
--   transportation_barrier BOOLEAN DEFAULT FALSE
--   social_isolation_score SMALLINT NULL
--
--   -- Quality
--   mips_eligible          BOOLEAN DEFAULT FALSE
--
--   -- Metadata
--   date_key_snapshot      INT NOT NULL REFERENCES dim_date(date_key)
--   etl_refreshed_at       TIMESTAMP NOT NULL DEFAULT NOW()
```

### 2.4 fact_provider_quality (NEW — provider scorecard)
```sql
-- fact_provider_quality: One row per provider per reporting period per bundle
-- Grain: provider_key + bundle_key + date_key_period
-- Columns:
--   quality_key            BIGSERIAL PRIMARY KEY
--   provider_key           INT NOT NULL REFERENCES dim_provider(provider_key)
--   org_key                INT NULL REFERENCES dim_organization(org_key)
--   bundle_key             INT NULL REFERENCES dim_care_gap_bundle(bundle_key)  -- NULL = overall
--   date_key_period        INT NOT NULL REFERENCES dim_date(date_key)
--   attributed_patients    INT DEFAULT 0
--   patients_with_bundle   INT DEFAULT 0
--   total_gaps_open        INT DEFAULT 0
--   total_gaps_closed      INT DEFAULT 0
--   compliance_rate        DECIMAL(5,2) NULL
--   mips_quality_score     DECIMAL(5,2) NULL
--   percentile_rank        DECIMAL(5,2) NULL       -- Provider's rank vs peers (0-100)
```

### 2.5 fact_ai_risk_score (NEW — AI scoring history)
```sql
-- fact_ai_risk_score: One row per patient per model per scoring run
-- Grain: patient_key + risk_model_key + date_key_scored
-- Columns:
--   risk_score_key         BIGSERIAL PRIMARY KEY
--   patient_key            INT NOT NULL REFERENCES dim_patient(patient_key)
--   risk_model_key         INT NOT NULL REFERENCES dim_risk_model(risk_model_key)
--   date_key_scored        INT NOT NULL REFERENCES dim_date(date_key)
--   score_value            DECIMAL(10,4) NOT NULL
--   score_percentile       DECIMAL(5,2) NULL
--   risk_tier              VARCHAR(20) NULL
--   contributing_factors   JSONB NULL              -- Top factors as JSON array
--                                                  -- e.g., [{"factor":"A1C_elevated","weight":0.35},...]
--   model_version          VARCHAR(20) NULL
--   confidence             DECIMAL(5,4) NULL       -- Model confidence (0-1)
```

### 2.6 fact_population_snapshot (NEW — aggregate table for population dashboards)
```sql
-- fact_population_snapshot: Pre-aggregated daily/weekly population metrics
-- Grain: org_key + date_key_snapshot + bundle_key (bundle_key NULL = org-wide)
-- Columns:
--   snapshot_key           BIGSERIAL PRIMARY KEY
--   org_key                INT NOT NULL REFERENCES dim_organization(org_key)
--   date_key_snapshot      INT NOT NULL REFERENCES dim_date(date_key)
--   bundle_key             INT NULL REFERENCES dim_care_gap_bundle(bundle_key)
--   total_patients         INT DEFAULT 0
--   patients_with_bundle   INT DEFAULT 0
--   avg_compliance_pct     DECIMAL(5,2) NULL
--   median_compliance_pct  DECIMAL(5,2) NULL
--   open_gaps_total        INT DEFAULT 0
--   closed_gaps_total      INT DEFAULT 0
--   high_risk_patients     INT DEFAULT 0
--   critical_risk_patients INT DEFAULT 0
--   avg_hcc_score          DECIMAL(6,3) NULL
--   avg_chronic_conditions DECIMAL(4,1) NULL
--   sdoh_flagged_patients  INT DEFAULT 0
```

### 2.7 fact_immunization (NEW — from EDW immunization table)
```sql
-- fact_immunization: One row per immunization event
-- Columns: immunization_key, patient_key, provider_key, date_key_administered,
--          vaccine_code, vaccine_name, status, count_immunization
```

### 2.8 fact_patient_insurance (NEW — from EDW coverage table)
```sql
-- fact_patient_insurance: One row per patient-payer coverage period
-- Columns: coverage_key, patient_key, payer_key, date_key_start, date_key_end,
--          primary_indicator, is_active
```

### 2.9 fact_sdoh (NEW — from EDW sdoh_assessment table)
```sql
-- fact_sdoh: One row per SDOH assessment
-- Columns: sdoh_key, patient_key, date_key_assessment, housing_status,
--          food_insecurity, transportation_barrier, social_isolation_score
```

---

## Part 3: Update Existing fact_care_gap

The current `fact_care_gap` only inserts new gaps and never updates them. Fix this:

1. **Add an UPSERT pattern** — When a care gap's `gap_status` changes in the EDW (e.g., from 'Open' to 'Closed'), update the existing row in fact_care_gap:
   - Set `date_key_resolved`
   - Update `gap_status`
2. **Add columns to fact_care_gap:**
   - `bundle_key INT NULL REFERENCES dim_care_gap_bundle(bundle_key)` — which bundle this gap belongs to
   - `provider_key INT NULL REFERENCES dim_provider(provider_key)` — attributed provider
   - `org_key INT NULL REFERENCES dim_organization(org_key)`
   - `days_open INT NULL` — calculated: date_key_resolved (or today) minus date_key_identified

---

## Part 4: Update dim_measure

Add columns to `dim_measure` for bundle integration:

```sql
-- Add to dim_measure:
--   frequency            VARCHAR(50) NULL    -- 'Annual', 'Every 6 months', 'Every visit', 'Once'
--   guideline_source     VARCHAR(200) NULL   -- 'ADA 2024', 'ACC/AHA 2023', 'KDIGO 2024', etc.
--   loinc_code           VARCHAR(50) NULL    -- Relevant LOINC code for observation matching
--   cpt_codes            TEXT NULL           -- Comma-separated CPT codes that satisfy this measure
--   target_value_low     DECIMAL(10,2) NULL  -- e.g., A1C target < 7.0 → low=0
--   target_value_high    DECIMAL(10,2) NULL  -- e.g., A1C target < 7.0 → high=7.0
--   target_text          VARCHAR(200) NULL   -- Human-readable target: "A1C < 7.0%"
```

---

## Part 5: Indexes for Dashboard Performance

Create indexes to support the primary dashboard access patterns:

```sql
-- Patient list/grid (most common query)
CREATE INDEX idx_composite_provider ON phm_star.fact_patient_composite(provider_key);
CREATE INDEX idx_composite_org ON phm_star.fact_patient_composite(org_key);
CREATE INDEX idx_composite_risk ON phm_star.fact_patient_composite(risk_tier, abigail_priority_score DESC);
CREATE INDEX idx_composite_compliance ON phm_star.fact_patient_composite(overall_compliance_pct);
CREATE INDEX idx_composite_bundles ON phm_star.fact_patient_composite(active_bundle_count);
CREATE INDEX idx_composite_conditions ON phm_star.fact_patient_composite
    (has_diabetes, has_hypertension, has_cad, has_heart_failure, has_copd, has_ckd, has_depression);

-- Care gap bundle queries
CREATE INDEX idx_patient_bundle_patient ON phm_star.fact_patient_bundle(patient_key) WHERE is_active = TRUE;
CREATE INDEX idx_patient_bundle_bundle ON phm_star.fact_patient_bundle(bundle_key) WHERE is_active = TRUE;
CREATE INDEX idx_patient_bundle_compliance ON phm_star.fact_patient_bundle(compliance_pct);
CREATE INDEX idx_patient_bundle_provider ON phm_star.fact_patient_bundle(provider_key);

-- Bundle detail for drill-down
CREATE INDEX idx_bundle_detail_patient ON phm_star.fact_patient_bundle_detail(patient_key);
CREATE INDEX idx_bundle_detail_status ON phm_star.fact_patient_bundle_detail(gap_status);
CREATE INDEX idx_bundle_detail_overdue ON phm_star.fact_patient_bundle_detail(is_overdue) WHERE is_overdue = TRUE;

-- Existing fact tables
CREATE INDEX idx_care_gap_status ON phm_star.fact_care_gap(gap_status);
CREATE INDEX idx_care_gap_patient_measure ON phm_star.fact_care_gap(patient_key, measure_key);
CREATE INDEX idx_care_gap_bundle ON phm_star.fact_care_gap(bundle_key);
CREATE INDEX idx_encounter_date ON phm_star.fact_encounter(date_key_encounter);
CREATE INDEX idx_encounter_patient ON phm_star.fact_encounter(patient_key);
CREATE INDEX idx_diagnosis_patient ON phm_star.fact_diagnosis(patient_key);
CREATE INDEX idx_diagnosis_condition ON phm_star.fact_diagnosis(condition_key);
CREATE INDEX idx_observation_patient_code ON phm_star.fact_observation(patient_key, observation_code);
CREATE INDEX idx_observation_date ON phm_star.fact_observation(date_key_obs);
CREATE INDEX idx_med_order_patient ON phm_star.fact_medication_order(patient_key);

-- AI risk scores
CREATE INDEX idx_risk_score_patient ON phm_star.fact_ai_risk_score(patient_key);
CREATE INDEX idx_risk_score_model_date ON phm_star.fact_ai_risk_score(risk_model_key, date_key_scored);

-- Provider quality
CREATE INDEX idx_provider_quality_provider ON phm_star.fact_provider_quality(provider_key, date_key_period);
CREATE INDEX idx_provider_quality_bundle ON phm_star.fact_provider_quality(bundle_key, date_key_period);

-- Population snapshot
CREATE INDEX idx_pop_snapshot_org_date ON phm_star.fact_population_snapshot(org_key, date_key_snapshot);
CREATE INDEX idx_pop_snapshot_bundle ON phm_star.fact_population_snapshot(bundle_key, date_key_snapshot);
```

---

## Part 6: Materialized Views for Sub-Second Dashboard Queries

Create materialized views that the application queries directly. Refresh them at the end of each ETL run.

### 6.1 mv_patient_dashboard
```sql
-- Materialized view the main patient list/grid reads from
-- SELECT * FROM phm_star.mv_patient_dashboard WHERE provider_key = ? AND risk_tier = 'High'
-- Joins fact_patient_composite with dim_patient, dim_provider, dim_organization, dim_payer
-- Includes: patient name, age, gender, PCP name, org name, payer name,
--           active_bundle_count, overall_compliance_pct, risk_tier, abigail_priority_score,
--           chronic_condition_count, encounters_last_12mo, SDOH flags
-- ORDER BY abigail_priority_score DESC
```

### 6.2 mv_bundle_compliance_by_provider
```sql
-- Provider scorecard view
-- Aggregates fact_patient_bundle by provider_key and bundle_key
-- Shows: provider name, bundle name, patient count, avg compliance, gaps open/closed, percentile rank
```

### 6.3 mv_population_overview
```sql
-- Organization-level population health dashboard
-- Aggregates from fact_population_snapshot for the current period
-- Shows: total patients, bundle breakdown, risk distribution, top open gaps, trend vs prior period
```

### 6.4 mv_care_gap_worklist
```sql
-- The care gap worklist for clinical staff
-- Joins fact_patient_bundle_detail (WHERE gap_status = 'Open') with dim_patient, dim_measure, dim_care_gap_bundle
-- Shows: patient name, bundle name, measure name, days overdue, frequency, action required
-- ORDER BY is_overdue DESC, days_since_last_action DESC
```

**IMPORTANT:** Add `REFRESH MATERIALIZED VIEW CONCURRENTLY` for each view at the END of the ETL, after all fact tables are loaded. Use `CONCURRENTLY` so the dashboard remains queryable during refresh. This requires a UNIQUE INDEX on each materialized view.

---

## Part 7: ETL Additions

Add the following ETL steps to `ETL_edw_to_star.sql`, after the existing 15 steps:

### STEP 16: Load dim_payer (Type 1 — truncate/reload)
Same pattern as dim_condition. Source: `phm_edw.payer WHERE active_ind = 'Y'`.

### STEP 17: Load dim_allergy (Type 1)
Same pattern. Source: `phm_edw.allergy WHERE active_ind = 'Y'`.

### STEP 18: Load dim_care_gap_bundle (Type 1)
This is a reference table. Seed it from a VALUES clause or a reference table you create in the EDW. The 45 bundles are:

| bundle_code | bundle_name | disease_category | bundle_size |
|---|---|---|---|
| DM2 | Type 2 Diabetes Mellitus | Endocrine | 8 |
| HTN | Hypertension | Cardiovascular | 6 |
| CAD | Coronary Artery Disease | Cardiovascular | 8 |
| HF | Heart Failure | Cardiovascular | 7 |
| COPD | Chronic Obstructive Pulmonary Disease | Respiratory | 8 |
| ASTHMA | Persistent Asthma | Respiratory | 7 |
| CKD | Chronic Kidney Disease | Renal | 9 |
| AFIB | Atrial Fibrillation | Cardiovascular | 6 |
| MDD | Major Depressive Disorder | Behavioral Health | 7 |
| OSTEO | Osteoporosis | Musculoskeletal | 6 |
| OBESITY | Obesity | Endocrine | 6 |
| NAFLD | Chronic Liver Disease / NAFLD | Hepatic | 7 |
| RA | Rheumatoid Arthritis | Musculoskeletal | 8 |
| PAD | Peripheral Artery Disease | Cardiovascular | 7 |
| HYPO | Hypothyroidism | Endocrine | 6 |
| ALZ | Alzheimer's / Dementia | Neurological | 9 |
| STROKE | Stroke / CVA | Neurological | 8 |
| PAIN | Chronic Pain / Opioid Management | Pain/Substance Use | 9 |
| OA | Osteoarthritis | Musculoskeletal | 7 |
| GERD | GERD / Chronic Acid Reflux | Gastrointestinal | 7 |
| BPH | Benign Prostatic Hyperplasia | Urological | 6 |
| MIGRAINE | Chronic Migraine | Neurological | 7 |
| EPILEPSY | Epilepsy / Seizure Disorder | Neurological | 8 |
| HIV | HIV/AIDS | Infectious Disease | 10 |
| HCV | Hepatitis C | Infectious Disease | 8 |
| SCD | Sickle Cell Disease | Hematological | 8 |
| SLE | Systemic Lupus Erythematosus | Autoimmune | 9 |
| GOUT | Gout | Musculoskeletal | 7 |
| OSA | Obstructive Sleep Apnea | Respiratory | 7 |
| GAD | Generalized Anxiety Disorder | Behavioral Health | 8 |
| DM1 | Type 1 Diabetes Mellitus | Endocrine | 12 |
| IBD | Inflammatory Bowel Disease | Gastrointestinal | 9 |
| MS | Multiple Sclerosis | Neurological | 9 |
| PARK | Parkinson's Disease | Neurological | 10 |
| PSO | Psoriasis / Psoriatic Arthritis | Dermatological | 8 |
| HBV | Hepatitis B | Infectious Disease | 9 |
| PAH | Pulmonary Arterial Hypertension | Cardiovascular | 8 |
| ANEMIA | Chronic Anemia | Hematological | 7 |
| HLD | Hyperlipidemia | Cardiovascular | 9 |
| PTSD | Post-Traumatic Stress Disorder | Behavioral Health | 8 |
| BIPOLAR | Bipolar Disorder | Behavioral Health | 9 |
| TOBACCO | Tobacco Use Disorder | Substance Use | 7 |
| AUD | Alcohol Use Disorder | Substance Use | 8 |
| VTE | Venous Thromboembolism | Hematological | 8 |
| WOUNDS | Chronic Wounds | Dermatological | 9 |

Total: 45 bundles, 350 individual measures.

### STEP 19: Load bridge_bundle_measure
Seed from a reference table or VALUES clause mapping each bundle to its measures. Each of the 350 measures maps to at least one bundle, and some shared measures (like BP control, statin therapy, PHQ-9 screening, BMI assessment) map to multiple bundles.

### STEP 20: Update fact_care_gap (UPSERT — handle gap closures)
```sql
-- Update existing care gaps where gap_status changed in the EDW
UPDATE phm_star.fact_care_gap fcg
SET gap_status = cg.gap_status,
    date_key_resolved = TO_CHAR(cg.resolved_date, 'YYYYMMDD')::int,
    days_open = ...calculated...
FROM phm_edw.care_gap cg
JOIN phm_star.dim_patient dp ON dp.patient_id = cg.patient_id AND dp.is_current = TRUE
JOIN phm_star.dim_measure dm ON dm.measure_id = cg.measure_id
WHERE fcg.patient_key = dp.patient_key
  AND fcg.measure_key = dm.measure_key
  AND fcg.gap_status <> cg.gap_status;
```

### STEP 21: Populate fact_patient_bundle
```sql
-- For each active patient, determine which bundles apply based on their active diagnoses
-- A patient qualifies for a bundle if they have an active CHRONIC diagnosis with an ICD-10 code
-- that appears in dim_care_gap_bundle.icd10_codes
-- Insert one row per patient-bundle combination
-- Calculate measures_met and measures_open by joining to fact_care_gap
```

### STEP 22: Populate fact_patient_bundle_detail
```sql
-- For each row in fact_patient_bundle, expand to one row per measure in that bundle
-- Join bridge_bundle_measure to get all measures for the bundle
-- Join fact_care_gap to get current gap_status for each measure
-- Apply deduplication: if a measure appears in multiple bundles for the same patient,
--   mark dedup_applied = TRUE on the duplicate rows and set dedup_source_bundle
--   (The measure only needs to be satisfied ONCE — use the strictest target)
-- Calculate days_since_last_action from fact_observation or fact_procedure
-- Set is_overdue based on frequency vs days_since_last_action
```

### STEP 23: Populate fact_patient_composite
```sql
-- This is a full rebuild each ETL run (TRUNCATE + INSERT)
-- For each active patient in dim_patient (is_current = TRUE):
--   1. Join to fact_patient_bundle to get bundle counts, compliance
--   2. Join to fact_diagnosis to get chronic condition flags
--   3. Join to fact_encounter to get utilization counts (last 12 months)
--   4. Join to fact_ai_risk_score to get latest risk scores per model
--   5. Join to fact_sdoh to get latest SDOH flags
--   6. Join to dim_provider and dim_organization for attribution
--   7. Join to fact_patient_insurance + dim_payer for payer info
--   8. Calculate age from dim_patient.date_of_birth
--   9. Determine risk_tier based on abigail_priority_score thresholds
--  10. Identify worst_bundle_code (lowest compliance_pct)
```

### STEP 24: Populate fact_provider_quality
```sql
-- Aggregate from fact_patient_bundle grouped by provider_key and bundle_key
-- For the current reporting period (month or quarter):
--   attributed_patients = COUNT(DISTINCT patient_key) per provider
--   patients_with_bundle = COUNT where bundle applies
--   compliance_rate = AVG(compliance_pct) across patients
--   total_gaps_open/closed = SUM of measures_open/measures_met
--   percentile_rank = PERCENT_RANK() OVER (PARTITION BY bundle_key ORDER BY compliance_rate)
```

### STEP 25: Populate fact_population_snapshot
```sql
-- Aggregate from fact_patient_composite grouped by org_key
-- Insert one row per org (with bundle_key = NULL for org-wide)
-- Plus one row per org per bundle
-- Include: total patients, avg/median compliance, risk distribution, SDOH counts
```

### STEP 26: Populate fact_immunization, fact_patient_insurance, fact_sdoh
Standard incremental inserts from EDW source tables, same pattern as existing fact ETL.

### STEP 27: Refresh Materialized Views
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_patient_dashboard;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_bundle_compliance_by_provider;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_population_overview;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_care_gap_worklist;
```

---

## Part 8: AI Analysis Support

The "Abigail" AI Physician Assistant needs the following capabilities, all driven by queries against the star schema:

### 8.1 Patient-Level AI Queries (Abigail uses these during a clinical encounter)
```sql
-- "What are this patient's open care gaps across all bundles?"
SELECT * FROM fact_patient_bundle_detail WHERE patient_key = ? AND gap_status = 'Open';

-- "What is this patient's risk trajectory?"
SELECT * FROM fact_ai_risk_score WHERE patient_key = ? ORDER BY date_key_scored;

-- "Generate a pre-visit summary"
-- Joins fact_patient_composite + fact_patient_bundle + fact_patient_bundle_detail + fact_observation
-- Returns: active bundles, open gaps, overdue items, recent lab trends, risk scores
```

### 8.2 Population-Level AI Queries (Abigail uses for population health management)
```sql
-- "Which patients have the most open care gaps and highest risk?"
SELECT * FROM mv_patient_dashboard WHERE risk_tier = 'Critical' ORDER BY total_measures_open DESC LIMIT 50;

-- "How is Provider X performing on diabetes bundles?"
SELECT * FROM mv_bundle_compliance_by_provider WHERE provider_key = ? AND bundle_key = (SELECT bundle_key FROM dim_care_gap_bundle WHERE bundle_code = 'DM2');

-- "Population trend for COPD compliance"
SELECT * FROM fact_population_snapshot WHERE bundle_key = ? ORDER BY date_key_snapshot;
```

### 8.3 JSONB Column for AI Feature Store
The `fact_ai_risk_score.contributing_factors` JSONB column acts as a lightweight feature store. Abigail can query it to explain risk scores to clinicians:
```sql
-- "Why is this patient high risk?"
SELECT contributing_factors FROM fact_ai_risk_score
WHERE patient_key = ? AND risk_model_key = (SELECT risk_model_key FROM dim_risk_model WHERE model_code = 'ABIGAIL_COMPOSITE')
ORDER BY date_key_scored DESC LIMIT 1;
-- Returns: [{"factor":"A1C > 9.0","weight":0.35},{"factor":"3 ED visits in 6mo","weight":0.25},...]
```

---

## Part 9: Implementation Notes

1. **Transaction Safety:** Keep the entire ETL in a single `BEGIN...COMMIT` transaction, as it is now. Add a `SAVEPOINT` before fact_patient_composite in case the composite build fails (it depends on everything else).

2. **ETL Ordering:** Dimensions MUST load before facts. Within facts, the order matters:
   - fact_encounter → fact_diagnosis → fact_procedure → fact_medication_order → fact_observation → fact_care_gap (with UPSERT) → fact_immunization → fact_sdoh → fact_patient_insurance → fact_patient_bundle → fact_patient_bundle_detail → fact_patient_composite → fact_provider_quality → fact_population_snapshot → REFRESH materialized views

3. **Performance:** The ETL currently runs 8× daily. The new composite and bundle tables should be designed for full truncate-reload each run (they are summary tables, not transactional). Only the core fact tables (encounter, diagnosis, procedure, etc.) use incremental inserts.

4. **Type 1 vs Type 2:** All new reference dimensions (payer, allergy, bundle, risk_model) are Type 1 (truncate/reload). The new fact tables use truncate/reload for summary tables and incremental for event-level tables.

5. **The 350 Measures:** The `dim_measure` table in the EDW (`phm_edw.measure_definition`) needs to be seeded with all 350 measures from the care gap bundle Excel workbooks. The `bridge_bundle_measure` table maps each measure to its bundle(s). Shared measures (e.g., "Blood Pressure Screening" appears in DM2, HTN, CAD, HF, CKD, AFIB, PAD, STROKE) should have `is_shared_measure = TRUE` and a `dedup_domain` value.

6. **Deduplication Logic:** When building fact_patient_bundle_detail, if a patient has DM2 + HTN + CKD and all three require BP control:
   - The first bundle encountered (alphabetical by bundle_code, or by bundle_key) "owns" the BP measure
   - The other two bundles get `dedup_applied = TRUE` and `dedup_source_bundle = <owning bundle_key>`
   - The owning bundle's row gets `gap_status` from fact_care_gap
   - The deduped rows inherit the same `gap_status` (satisfied once = satisfied everywhere)
   - BUT: use the **strictest target** across all bundles (e.g., BP < 130/80 for CKD even if DM2 allows < 140/90)

7. **The 19 Deduplication Domains** (from the overlap analysis):
   Blood Pressure Control, Statin/Lipid Therapy, A1C Monitoring, BMI Assessment, Depression Screening (PHQ-9), Tobacco Cessation, Fall Risk Assessment, Renal Function (eGFR/Cr), Hepatic Function (LFTs), CBC/Hematology, Thyroid Function, Bone Density (DEXA), Immunizations (Flu/Pneumo), Medication Reconciliation, Advance Care Planning, Pain Assessment, Cognitive Screening, Substance Use Screening, Nutritional Counseling

---

## Deliverables

Please produce:
1. **Updated `phm-star-ddl.sql`** with all new dimensions, facts, bridge tables, indexes, and materialized views
2. **Updated `ETL_edw_to_star.sql`** with all new ETL steps (Steps 16–27) integrated into the existing transaction
3. **A seed SQL file** (`seed_bundles.sql`) that populates dim_care_gap_bundle with the 45 bundles and bridge_bundle_measure with the measure mappings (you can use placeholder measure_keys and reference the measure codes from the Excel workbooks)

Test that the DDL compiles cleanly. Ensure FK references are valid and no circular dependencies exist.

---

---

# Implementation Plan & TODO

> **Author:** Claude Code | **Date:** 2026-02-25 | **Status:** ✅ IMPLEMENTATION COMPLETE (2026-02-25)

---

## Current State Analysis

### What Already Exists

| Layer | Status | Location |
|-------|--------|----------|
| `phm_edw` schema (19 tables) | ✅ Complete — legacy data restored | `001_phm_edw_schema.sql` |
| `phm_star` schema — 8 dims + 7 fact tables | ✅ Exists | `002_phm_star_schema.sql` |
| ETL Steps 1–15 (EDW → star) | ✅ Exists | `004_etl_edw_to_star.sql` |
| EDW: `condition_bundle`, `bundle_measure`, `bundle_overlap_rule` | ✅ Created | `006_care_gap_bundles.sql` |
| EDW: `care_gap` extended with `bundle_id`, `due_date`, `gap_priority` | ✅ Done | `006_care_gap_bundles.sql` |
| EDW: 45 condition bundles seeded + ~350 measures | ✅ Seeded | `007/008/009_seed_bundles_v*.sql` |

### What Is Missing (the gap this plan closes)

#### Star Schema — Dimensions
| Object | Status |
|--------|--------|
| `dim_payer` | ✅ Created — `010_star_schema_v2.sql` |
| `dim_allergy` | ✅ Created — `010_star_schema_v2.sql` |
| `dim_care_gap_bundle` | ✅ Created — `010_star_schema_v2.sql` |
| `bridge_bundle_measure` | ✅ Created — `010_star_schema_v2.sql` |
| `dim_risk_model` | ✅ Created — `010_star_schema_v2.sql` |
| `dim_measure` — new columns (`frequency`, `guideline_source`, `loinc_code`, `cpt_codes`, `target_value_*`, `target_text`) | ✅ Added — `010_star_schema_v2.sql` |

#### Star Schema — Fact Tables
| Object | Status |
|--------|--------|
| `fact_patient_bundle` | ✅ Created — `010_star_schema_v2.sql` |
| `fact_patient_bundle_detail` | ✅ Created — `010_star_schema_v2.sql` |
| `fact_patient_composite` | ✅ Created — `010_star_schema_v2.sql` |
| `fact_provider_quality` | ✅ Created — `010_star_schema_v2.sql` |
| `fact_ai_risk_score` | ✅ Created — `010_star_schema_v2.sql` |
| `fact_population_snapshot` | ✅ Created — `010_star_schema_v2.sql` |
| `fact_immunization` | ✅ Created — `010_star_schema_v2.sql` |
| `fact_patient_insurance` | ✅ Created — `010_star_schema_v2.sql` |
| `fact_sdoh` | ✅ Created — `010_star_schema_v2.sql` |
| `fact_care_gap` — new columns (`bundle_key`, `provider_key`, `org_key`, `days_open`) | ✅ Added — `010_star_schema_v2.sql` |

#### Star Schema — Performance Objects
| Object | Status |
|--------|--------|
| All indexes from Part 5 (27 indexes) | ✅ Created — `010_star_schema_v2.sql` |
| `mv_patient_dashboard` | ✅ Created — `010_star_schema_v2.sql` |
| `mv_bundle_compliance_by_provider` | ✅ Created — `010_star_schema_v2.sql` |
| `mv_population_overview` | ✅ Created — `010_star_schema_v2.sql` |
| `mv_care_gap_worklist` | ✅ Created — `010_star_schema_v2.sql` |

#### ETL
| Object | Status |
|--------|--------|
| Steps 16–27 (payer, allergy, bundles, bridge, UPSERT gaps, patient bundles, composite, provider quality, population snapshot, immunization/insurance/sdoh) | ✅ Written — `013_etl_star_v2.sql` |
| Step 27 (REFRESH MATERIALIZED VIEW CONCURRENTLY) | ✅ Written — `packages/db/scripts/refresh_star_views.sql` (outside tx) |

### Key Discrepancy to Resolve

The spec (Part 7, Step 18) lists bundle codes like `DM2`, `DM1`, etc. The actual EDW seed (007–009) uses `DM`, `T1D`. The star's `dim_care_gap_bundle` ETL (Step 18) should use **the EDW's actual `bundle_code` values** as natural keys, not the spec's renamed codes. The seed migration (011) will copy directly from `phm_edw.condition_bundle`.

`disease_category` is not present in the EDW `condition_bundle` table. It must be hard-coded in the seed SQL for each bundle.

---

## Implementation Plan — Three New Migrations

### Migration 010: `010_star_schema_v2.sql`
**DDL additions to `phm_star`**

1. `dim_payer` — new table, Type 1
2. `dim_allergy` — new table, Type 1
3. `dim_care_gap_bundle` — new table, Type 1 (natural key = `bundle_code` from EDW `condition_bundle`)
4. `bridge_bundle_measure` — new bridge table (links `dim_care_gap_bundle` → `dim_measure`)
5. `dim_risk_model` — new table, Type 1
6. `ALTER TABLE phm_star.dim_measure ADD COLUMN IF NOT EXISTS` (7 new columns)
7. `ALTER TABLE phm_star.fact_care_gap ADD COLUMN IF NOT EXISTS` (`bundle_key`, `provider_key`, `org_key`, `days_open`) + FK constraints
8. `fact_patient_bundle` — new fact table
9. `fact_patient_bundle_detail` — new fact table
10. `fact_patient_composite` — new fact table
11. `fact_provider_quality` — new fact table
12. `fact_ai_risk_score` — new fact table
13. `fact_population_snapshot` — new fact table
14. `fact_immunization` — new fact table
15. `fact_patient_insurance` — new fact table
16. `fact_sdoh` — new fact table
17. All 27 indexes from Part 5
18. Materialized views from Part 6 (created empty; `REFRESH` runs in ETL)
    - Requires UNIQUE indexes on each mat view for `CONCURRENTLY` refresh

**FK dependency order within this migration:**
```
dim_payer → dim_allergy → dim_care_gap_bundle →
  bridge_bundle_measure (needs dim_care_gap_bundle + dim_measure) →
  dim_risk_model →
  ALTER dim_measure + ALTER fact_care_gap →
  fact_patient_bundle (needs dim_patient, dim_care_gap_bundle, dim_provider, dim_organization, dim_date) →
  fact_patient_bundle_detail (needs fact_patient_bundle + dim_care_gap_bundle + dim_measure + dim_date) →
  fact_patient_composite (needs dim_patient, dim_provider, dim_organization, dim_payer, dim_date) →
  fact_provider_quality (needs dim_provider, dim_organization, dim_care_gap_bundle, dim_date) →
  fact_ai_risk_score (needs dim_patient, dim_risk_model, dim_date) →
  fact_population_snapshot (needs dim_organization, dim_date, dim_care_gap_bundle) →
  fact_immunization (needs dim_patient, dim_provider, dim_date) →
  fact_patient_insurance (needs dim_patient, dim_payer, dim_date) →
  fact_sdoh (needs dim_patient, dim_date) →
  indexes → materialized views
```

### Migration 011: `011_seed_star_bundles.sql`
**One-time data seed for `dim_care_gap_bundle` and `bridge_bundle_measure` in star schema**

1. INSERT into `phm_star.dim_care_gap_bundle` from `phm_edw.condition_bundle`
   - Map `disease_category` from a hard-coded VALUES list per bundle_code
   - Map `icd10_codes` from `icd10_pattern`
   - `total_diseases = 45` constant
2. INSERT into `phm_star.bridge_bundle_measure` from `phm_edw.bundle_measure`
   - JOIN to `phm_star.dim_care_gap_bundle` on `bundle_code`
   - JOIN to `phm_star.dim_measure` on `measure_code`
   - Set `is_shared_measure = TRUE` and `dedup_domain` for the 19 shared domains listed in Part 9

**Disease category mapping** (hard-coded per bundle_code for migration):
```
DM → Endocrine          HTN → Cardiovascular    CAD → Cardiovascular
HF → Cardiovascular     COPD → Respiratory      ASTHMA → Respiratory
CKD → Renal             AFIB → Cardiovascular    MDD → Behavioral Health
OSTEO → Musculoskeletal OBESITY → Endocrine      NAFLD → Hepatic
RA → Musculoskeletal    PAD → Cardiovascular     HYPO → Endocrine
ALZ → Neurological      STROKE → Neurological    PAIN → Pain/Substance Use
OA → Musculoskeletal    GERD → Gastrointestinal  BPH → Urological
MIGRAINE → Neurological EPILEPSY → Neurological  HIV → Infectious Disease
HCV → Infectious Disease SCD → Hematological     SLE → Autoimmune
GOUT → Musculoskeletal  OSA → Respiratory        GAD → Behavioral Health
T1D → Endocrine         IBD → Gastrointestinal   MS → Neurological
PARK → Neurological     PSO → Dermatological     HBV → Infectious Disease
PAH → Cardiovascular    ANEMIA → Hematological   HLD → Cardiovascular
PTSD → Behavioral Health BIPOLAR → Behavioral Health TOBACCO → Substance Use
AUD → Substance Use     VTE → Hematological      WOUNDS → Dermatological
```

### Migration 012: `012_etl_star_v2.sql`
**ETL Steps 16–27 for `phm_star`**

This migration creates a SQL function (or standalone script) that extends the ETL. It runs inside the same `BEGIN...COMMIT` block pattern as migration 004.

Steps:
- **16**: Load `dim_payer` — TRUNCATE + INSERT from `phm_edw.payer WHERE active_ind = 'Y'`
- **17**: Load `dim_allergy` — TRUNCATE + INSERT from `phm_edw.allergy WHERE active_ind = 'Y'`
- **18**: Load `dim_care_gap_bundle` — TRUNCATE + INSERT from `phm_edw.condition_bundle WHERE active_ind = 'Y'`
- **19**: Load `bridge_bundle_measure` — TRUNCATE + INSERT from `phm_edw.bundle_measure` joined to star dims
- **20**: UPSERT `fact_care_gap` — UPDATE rows where `gap_status` changed; add `bundle_key`, `provider_key`, `org_key`, `days_open`
- **21**: Populate `fact_patient_bundle` — TRUNCATE + INSERT; qualify patients via ICD-10 matches against `dim_care_gap_bundle.icd10_codes`; calculate `measures_met`, `measures_open`, `compliance_pct`, `risk_tier`
- **22**: Populate `fact_patient_bundle_detail` — TRUNCATE + INSERT; expand each patient-bundle to per-measure rows; apply cross-bundle dedup logic for 19 shared domains
- **23**: Populate `fact_patient_composite` — TRUNCATE + INSERT; wide pre-aggregated row per active patient; 10-step join sequence (bundles → diagnoses → encounters → risk scores → SDOH → provider → payer)
  - SAVEPOINT before this step per spec note
- **24**: Populate `fact_provider_quality` — TRUNCATE + INSERT; aggregate from `fact_patient_bundle` by provider+bundle; `PERCENT_RANK()` for percentile
- **25**: Populate `fact_population_snapshot` — TRUNCATE + INSERT; aggregate from `fact_patient_composite` by org; one org-wide row + one row per org+bundle
- **26**: Incremental INSERT into `fact_immunization`, `fact_patient_insurance`, `fact_sdoh` from EDW source tables
- **27**: `REFRESH MATERIALIZED VIEW CONCURRENTLY` for all 4 mat views

---

## Comprehensive TODO Checklist

### Phase A — Migration 010: Star Schema DDL

- [ ] **A1** Write `010_star_schema_v2.sql` — new dimensions
  - [ ] A1a `dim_payer` (payer_key PK, payer_id NK, payer_name, payer_type, is_current, effective dates, timestamps)
  - [ ] A1b `dim_allergy` (allergy_key PK, allergy_id NK, allergy_code, allergy_name, code_system, category, timestamps)
  - [ ] A1c `dim_care_gap_bundle` (bundle_key PK, bundle_code, bundle_name, disease_category, icd10_codes, bundle_size, total_diseases, is_active, timestamps)
  - [ ] A1d `bridge_bundle_measure` (bridge_key PK, bundle_key FK, measure_key FK, measure_sequence, frequency, is_shared_measure, dedup_domain, UNIQUE(bundle_key, measure_key))
  - [ ] A1e `dim_risk_model` (risk_model_key PK, model_code, model_name, model_version, model_type, description, is_active, effective dates, timestamps)
- [ ] **A2** Write `ALTER TABLE phm_star.dim_measure` (7 new columns: frequency, guideline_source, loinc_code, cpt_codes, target_value_low, target_value_high, target_text)
- [ ] **A3** Write `ALTER TABLE phm_star.fact_care_gap` (bundle_key, provider_key, org_key, days_open + FK constraints)
- [ ] **A4** Write new fact tables
  - [ ] A4a `fact_patient_bundle` (patient_bundle_key BIGSERIAL, patient_key, bundle_key, provider_key, org_key, date_key_assigned, date_key_last_eval, total_measures, measures_met, measures_open, compliance_pct, risk_tier, is_active, partial UNIQUE index)
  - [ ] A4b `fact_patient_bundle_detail` (detail_key BIGSERIAL, patient_bundle_key, patient_key, bundle_key, measure_key, date_key_last_action, gap_status, is_overdue, days_since_last_action, dedup_applied, dedup_source_bundle, UNIQUE(patient_key, bundle_key, measure_key))
  - [ ] A4c `fact_patient_composite` (composite_key BIGSERIAL, patient_key UNIQUE, provider_key, org_key, payer_key, demographics snapshot, bundle summary columns, clinical flags x7, AI risk columns x5, utilization columns x5, SDOH flags x4, mips_eligible, date_key_snapshot, etl_refreshed_at)
  - [ ] A4d `fact_provider_quality` (quality_key BIGSERIAL, provider_key, org_key, bundle_key, date_key_period, attributed_patients, patients_with_bundle, total_gaps_open, total_gaps_closed, compliance_rate, mips_quality_score, percentile_rank)
  - [ ] A4e `fact_ai_risk_score` (risk_score_key BIGSERIAL, patient_key, risk_model_key, date_key_scored, score_value, score_percentile, risk_tier, contributing_factors JSONB, model_version, confidence)
  - [ ] A4f `fact_population_snapshot` (snapshot_key BIGSERIAL, org_key, date_key_snapshot, bundle_key nullable, total_patients, patients_with_bundle, avg/median_compliance_pct, open/closed_gaps_total, high/critical_risk_patients, avg_hcc_score, avg_chronic_conditions, sdoh_flagged_patients)
  - [ ] A4g `fact_immunization` (immunization_key, patient_key, provider_key, date_key_administered, vaccine_code, vaccine_name, status, count_immunization)
  - [ ] A4h `fact_patient_insurance` (coverage_key, patient_key, payer_key, date_key_start, date_key_end, primary_indicator, is_active)
  - [ ] A4i `fact_sdoh` (sdoh_key, patient_key, date_key_assessment, housing_status, food_insecurity, transportation_barrier, social_isolation_score)
- [ ] **A5** Write all 27 indexes from Part 5
  - [ ] A5a fact_patient_composite indexes (6 + composite conditions index)
  - [ ] A5b fact_patient_bundle indexes (4, partial WHERE is_active)
  - [ ] A5c fact_patient_bundle_detail indexes (3, partial WHERE is_overdue)
  - [ ] A5d fact_care_gap indexes (3: gap_status, patient+measure, bundle_key)
  - [ ] A5e fact_encounter indexes (2: date, patient)
  - [ ] A5f fact_diagnosis indexes (2: patient, condition)
  - [ ] A5g fact_observation indexes (2: patient+code, date)
  - [ ] A5h fact_medication_order index (1: patient)
  - [ ] A5i fact_ai_risk_score indexes (2: patient, model+date)
  - [ ] A5j fact_provider_quality indexes (2: provider+period, bundle+period)
  - [ ] A5k fact_population_snapshot indexes (2: org+date, bundle+date)
- [ ] **A6** Write 4 materialized views from Part 6
  - [ ] A6a `mv_patient_dashboard` — joins fact_patient_composite + dim_patient + dim_provider + dim_organization + dim_payer; UNIQUE index on `composite_key` for CONCURRENTLY refresh
  - [ ] A6b `mv_bundle_compliance_by_provider` — aggregates fact_patient_bundle by provider+bundle; UNIQUE index on (provider_key, bundle_key)
  - [ ] A6c `mv_population_overview` — from fact_population_snapshot for current snapshot; UNIQUE index on (org_key, date_key_snapshot)
  - [ ] A6d `mv_care_gap_worklist` — from fact_patient_bundle_detail WHERE gap_status = 'Open' + joins; UNIQUE index on `detail_key`
- [ ] **A7** Register migration 010 in `packages/db/src/migrate.ts` (if manual registration required)

### Phase B — Migration 011: Seed Star Bundles

- [ ] **B1** Write `011_seed_star_bundles.sql`
  - [ ] B1a INSERT into `phm_star.dim_care_gap_bundle` — SELECT from `phm_edw.condition_bundle` with hard-coded `disease_category` CASE expression per `bundle_code`
  - [ ] B1b INSERT into `phm_star.bridge_bundle_measure` — SELECT from `phm_edw.bundle_measure` JOIN `phm_star.dim_care_gap_bundle` ON bundle_code JOIN `phm_star.dim_measure` ON measure_code
  - [ ] B1c Set `is_shared_measure = TRUE` and `dedup_domain` for all bridge rows matching the 19 shared deduplication domains (BP Control, Statin Therapy, A1C Monitoring, BMI Assessment, etc.)
  - [ ] B1d Verify count: 45 dim_care_gap_bundle rows, ~350 bridge_bundle_measure rows

### Phase C — Migration 012: ETL Steps 16–27

- [ ] **C1** Write `012_etl_star_v2.sql` — overall structure (BEGIN...SAVEPOINT...COMMIT)
- [ ] **C2** Step 16: `dim_payer` — TRUNCATE + INSERT from `phm_edw.payer`
- [ ] **C3** Step 17: `dim_allergy` — TRUNCATE + INSERT from `phm_edw.allergy`
- [ ] **C4** Step 18: `dim_care_gap_bundle` — TRUNCATE + INSERT from `phm_edw.condition_bundle`; hard-code `disease_category` mapping
- [ ] **C5** Step 19: `bridge_bundle_measure` — TRUNCATE + INSERT; resolve bundle_key + measure_key from dim lookups; set `is_shared_measure`/`dedup_domain` via overlap rules from `phm_edw.bundle_overlap_rule`
- [ ] **C6** Step 20: UPSERT `fact_care_gap` — UPDATE rows where gap_status changed; calculate `days_open`; set `bundle_key` via condition_bundle lookup; set `provider_key` via patient attribution; set `org_key`
- [x] **C7** Step 21: `fact_patient_bundle` — ICD-10 `unnest(string_to_array(...))` LIKE matching, gap counts from `fact_care_gap`, compliance_pct, risk_tier thresholds
- [x] **C8** Step 22: `fact_patient_bundle_detail` — dedup via `FIRST_VALUE() OVER (PARTITION BY patient_key, dedup_domain ORDER BY bundle_key)`, is_overdue based on frequency vs days, days_since_last_action from fact_observation/fact_procedure via loinc_code/cpt_codes joins
- [x] **C9** Step 23: `fact_patient_composite` — `SAVEPOINT before_composite`, 10-CTE join, risk_tier from abigail_priority_score thresholds (80/60/35), fallback to bundle compliance
- [x] **C10** Step 24: `fact_provider_quality` — `PERCENT_RANK() * 100` window function for percentile_rank
- [x] **C11** Step 25: `fact_population_snapshot` — `PERCENTILE_CONT(0.5)` for median, UNION of org-wide + per-bundle rows
- [x] **C12** Step 26: Incremental INSERTs — immunization (NOT EXISTS guard), patient_insurance (ON CONFLICT coverage_id DO UPDATE), sdoh (NOT EXISTS guard)
- [x] **C13** Step 27: Refresh materialized views — extracted to `packages/db/scripts/refresh_star_views.sql` (cannot run inside transaction)

### Phase D — Verification & Cleanup

- [ ] **D1** Run `010_star_schema_v2.sql` against local dev DB — confirm no DDL errors
- [ ] **D2** Run `011_seed_star_bundles.sql` — verify 45 dim_care_gap_bundle rows, ~350 bridge rows
- [ ] **D3** Run `013_etl_star_v2.sql` (manually execute the transaction) — verify tables populate
- [ ] **D4** Spot-check: `SELECT COUNT(*) FROM phm_star.fact_patient_composite` should be ~1M rows
- [ ] **D5** Test materialized view queries (mv_patient_dashboard, mv_care_gap_worklist)
- [ ] **D6** Verify FK integrity: no orphaned bundle_keys in fact_care_gap
- [ ] **D7** Run `EXPLAIN ANALYZE` on top 5 dashboard queries to confirm sub-second with new indexes
- [x] **D8** Update `docs/DESIGNLOG.md` with backend milestone entry ✓
- [ ] **D9** Apply migrations via `bun run db:migrate` (010, 011, 013 pending; 012_clinical_notes may also be pending)

---

## Notes & Risks

| Item | Note |
|------|------|
| Bundle code naming | EDW uses `DM`, `T1D`; spec uses `DM2`, `DM1`. Star schema will use EDW codes as natural keys. No renaming. |
| `disease_category` column | Not in EDW — must be hard-coded in migrations 011 and 012 (CASE expression). |
| `CONCURRENTLY` refresh | Requires UNIQUE indexes on each materialized view. Must be created before first `REFRESH`. |
| Partial UNIQUE index (fact_patient_bundle) | `UNIQUE(patient_key, bundle_key) WHERE is_active = TRUE` — PostgreSQL supports this. |
| ETL Step 22 dedup | Most complex step. Strategy: `ROW_NUMBER() OVER (PARTITION BY patient_key, dedup_domain ORDER BY bundle_key ASC)` — row 1 owns the measure, others get dedup_applied = TRUE. |
| Migrations 001–004 pre-registered | Do NOT modify them. Steps 16–26 in `013_etl_star_v2.sql`; Step 27 in `scripts/refresh_star_views.sql`. |
| ETL file naming conflict | An existing `012_clinical_notes.sql` was found. ETL became `013_etl_star_v2.sql`. |
| Migration runner transaction | `migrate.ts` wraps each file in `sql.begin()`. ETL file has no BEGIN/COMMIT. REFRESH extracted to separate script. |
| ICD-10 matching | EDW `icd10_pattern` uses comma-separated LIKE patterns (e.g., `'E11%'`). Star `dim_care_gap_bundle.icd10_codes` stores the same. ETL Step 21 should unnest and use LIKE matching against `fact_diagnosis → dim_condition.icd10_code`. |
| ETL runtime | Current 8×/day schedule. New composite/bundle tables are truncate-reload (fast). Estimate +2–5 min per ETL run. Monitor after first full run. |
