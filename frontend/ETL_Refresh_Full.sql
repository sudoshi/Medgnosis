-- =====================================================================
-- ETL_Refresh_Full.sql
-- Populates the Kimball star schema (phm_star) from the Inmon 3NF EDW (phm_edw)
-- Schedules: Run 8 times a day for near-real-time analytics
-- Inline comments only, no explanations beyond them
-- =====================================================================

BEGIN;

-------------------------------------------------------------------------------
-- STEP 1: Refresh DimDate
-- Assumes a pre-populated calendar in phm_edw.date_lookup or similar
-------------------------------------------------------------------------------
-- Truncate or stage approach depends on your preference. Example: incremental insert.
-- Below is a simple replace strategy (not SCD) for DimDate
TRUNCATE TABLE phm_star.dim_date;

INSERT INTO phm_star.dim_date (
    date_key,
    full_date,
    day,
    month,
    year,
    quarter,
    week_of_year,
    day_of_week,
    day_name,
    month_name,
    fiscal_year,
    fiscal_quarter
)
SELECT
    d.date_key,
    d.full_date,
    d.day,
    d.month,
    d.year,
    d.quarter,
    d.week_of_year,
    d.day_of_week,
    d.day_name,
    d.month_name,
    d.fiscal_year,
    d.fiscal_quarter
FROM phm_edw.date_lookup d
-- Optionally filter or join if partial refresh is needed
;

-------------------------------------------------------------------------------
-- STEP 2: Refresh DimOrganization (SCD Type 2)
-------------------------------------------------------------------------------
-- Uses a common upsert pattern in PostgreSQL for Type 2
-- old rows closed out, new rows inserted if changes are detected
-- This snippet relies on hsh comparison of scd columns

WITH source_data AS (
    SELECT
        org_id,
        organization_name,
        organization_type,
        parent_org_key_candidate,  -- hypothetical if you map parent from EDW
        CURRENT_DATE AS load_date
    FROM phm_edw.organization
    WHERE active_ind = 'Y'
),
matched AS (
    SELECT
        d.org_key,
        d.org_id,
        d.organization_name AS dim_name,
        s.organization_name AS src_name,
        d.organization_type AS dim_type,
        s.organization_type AS src_type
    FROM phm_star.dim_organization d
    JOIN source_data s ON d.org_id = s.org_id
    WHERE d.is_current = TRUE
)
UPDATE phm_star.dim_organization
SET
    effective_end_date = matched.load_date - 1,
    is_current = FALSE,
    updated_at = NOW()
FROM matched
WHERE phm_star.dim_organization.org_key = matched.org_key
  AND (
       (matched.dim_name IS DISTINCT FROM matched.src_name)
       OR (matched.dim_type IS DISTINCT FROM matched.src_type)
      );

INSERT INTO phm_star.dim_organization (
    org_id,
    organization_name,
    organization_type,
    parent_org_key,
    effective_start_date,
    effective_end_date,
    is_current,
    created_at
)
SELECT
    s.org_id,
    s.organization_name,
    s.organization_type,
    NULL,                 -- or map s.parent_org_key_candidate
    s.load_date,
    '9999-12-31',
    TRUE,
    NOW()
FROM source_data s
LEFT JOIN phm_star.dim_organization d ON s.org_id = d.org_id AND d.is_current = TRUE
WHERE d.org_id IS NULL
      OR (
         d.org_id IS NOT NULL
         AND (
             d.organization_name IS DISTINCT FROM s.organization_name
             OR d.organization_type IS DISTINCT FROM s.organization_type
            )
         AND d.is_current = FALSE
      );

-------------------------------------------------------------------------------
-- STEP 3: Refresh DimProvider (SCD Type 2)
-------------------------------------------------------------------------------
WITH source_data AS (
    SELECT
        p.provider_id,
        p.first_name,
        p.last_name,
        p.npi_number,
        p.specialty,
        p.provider_type,
        CURRENT_DATE AS load_date
    FROM phm_edw.provider p
    WHERE p.active_ind = 'Y'
),
matched AS (
    SELECT
        dim.provider_key,
        dim.provider_id,
        dim.first_name AS dim_first,
        src.first_name AS src_first,
        dim.last_name  AS dim_last,
        src.last_name  AS src_last
    FROM phm_star.dim_provider dim
    JOIN source_data src ON dim.provider_id = src.provider_id
    WHERE dim.is_current = TRUE
)
UPDATE phm_star.dim_provider
SET
    effective_end_date = matched.load_date - 1,
    is_current = FALSE,
    updated_at = NOW()
FROM matched
WHERE phm_star.dim_provider.provider_key = matched.provider_key
  AND (
       (matched.dim_first IS DISTINCT FROM matched.src_first)
       OR (matched.dim_last  IS DISTINCT FROM matched.src_last)
      );

INSERT INTO phm_star.dim_provider (
    provider_id,
    first_name,
    last_name,
    npi_number,
    specialty,
    provider_type,
    org_key,
    effective_start_date,
    effective_end_date,
    is_current,
    created_at
)
SELECT
    s.provider_id,
    s.first_name,
    s.last_name,
    s.npi_number,
    s.specialty,
    s.provider_type,
    NULL,         -- map org_key if needed
    s.load_date,
    '9999-12-31',
    TRUE,
    NOW()
FROM source_data s
LEFT JOIN phm_star.dim_provider d ON s.provider_id = d.provider_id AND d.is_current = TRUE
WHERE d.provider_id IS NULL
      OR (
         d.provider_id IS NOT NULL
         AND (
             d.first_name IS DISTINCT FROM s.first_name
             OR d.last_name  IS DISTINCT FROM s.last_name
             OR d.specialty  IS DISTINCT FROM s.specialty
         )
         AND d.is_current = FALSE
      );

-------------------------------------------------------------------------------
-- STEP 4: Refresh DimPatient (SCD Type 2)
-------------------------------------------------------------------------------
WITH source_data AS (
    SELECT
        pat.patient_id,
        pat.first_name,
        pat.last_name,
        pat.date_of_birth,
        pat.gender,
        CURRENT_DATE AS load_date
    FROM phm_edw.patient pat
    WHERE pat.active_ind = 'Y'
),
matched AS (
    SELECT
        dim.patient_key,
        dim.patient_id,
        dim.first_name  AS dim_first,
        src.first_name  AS src_first,
        dim.last_name   AS dim_last,
        src.last_name   AS src_last
    FROM phm_star.dim_patient dim
    JOIN source_data src ON dim.patient_id = src.patient_id
    WHERE dim.is_current = TRUE
)
UPDATE phm_star.dim_patient
SET
    effective_end_date = matched.load_date - 1,
    is_current = FALSE,
    updated_at = NOW()
FROM matched
WHERE phm_star.dim_patient.patient_key = matched.patient_key
  AND (
       (matched.dim_first IS DISTINCT FROM matched.src_first)
       OR (matched.dim_last  IS DISTINCT FROM matched.src_last)
      );

INSERT INTO phm_star.dim_patient (
    patient_id,
    first_name,
    last_name,
    date_of_birth,
    gender,
    effective_start_date,
    effective_end_date,
    is_current,
    created_at
)
SELECT
    s.patient_id,
    s.first_name,
    s.last_name,
    s.date_of_birth,
    s.gender,
    s.load_date,
    '9999-12-31',
    TRUE,
    NOW()
FROM source_data s
LEFT JOIN phm_star.dim_patient d ON s.patient_id = d.patient_id AND d.is_current = TRUE
WHERE d.patient_id IS NULL
      OR (
         d.patient_id IS NOT NULL
         AND (
             d.first_name IS DISTINCT FROM s.first_name
             OR d.last_name  IS DISTINCT FROM s.last_name
         )
         AND d.is_current = FALSE
      );

-------------------------------------------------------------------------------
-- STEP 5: Refresh DimCondition (Type 1 example)
-------------------------------------------------------------------------------
TRUNCATE TABLE phm_star.dim_condition RESTART IDENTITY;

INSERT INTO phm_star.dim_condition (
    condition_id,
    icd10_code,
    condition_name,
    code_system,
    created_at
)
SELECT
    c.condition_id,
    c.condition_code,
    c.condition_name,
    c.code_system,
    NOW()
FROM phm_edw.condition c
WHERE c.active_ind = 'Y'
;

-------------------------------------------------------------------------------
-- STEP 6: Refresh DimProcedure (Type 1 example)
-------------------------------------------------------------------------------
TRUNCATE TABLE phm_star.dim_procedure RESTART IDENTITY;

INSERT INTO phm_star.dim_procedure (
    procedure_id,
    procedure_code,
    procedure_desc,
    code_system,
    created_at
)
SELECT
    p.procedure_id,
    p.procedure_code,
    p.procedure_desc,
    p.code_system,
    NOW()
FROM phm_edw.procedure p
WHERE p.active_ind = 'Y'
;

-------------------------------------------------------------------------------
-- STEP 7: Refresh DimMedication (Type 1 example)
-------------------------------------------------------------------------------
TRUNCATE TABLE phm_star.dim_medication RESTART IDENTITY;

INSERT INTO phm_star.dim_medication (
    medication_id,
    medication_code,
    medication_name,
    code_system,
    form,
    strength,
    created_at
)
SELECT
    m.medication_id,
    m.medication_code,
    m.medication_name,
    m.code_system,
    m.form,
    m.strength,
    NOW()
FROM phm_edw.medication m
WHERE m.active_ind = 'Y'
;

-------------------------------------------------------------------------------
-- STEP 8: Refresh DimMeasure (Type 1 example)
-------------------------------------------------------------------------------
TRUNCATE TABLE phm_star.dim_measure RESTART IDENTITY;

INSERT INTO phm_star.dim_measure (
    measure_id,
    measure_code,
    measure_name,
    measure_type,
    description,
    created_at
)
SELECT
    md.measure_id,
    md.measure_code,
    md.measure_name,
    md.measure_type,
    md.description,
    NOW()
FROM phm_edw.measure_definition md
WHERE md.active_ind = 'Y'
;

-------------------------------------------------------------------------------
-- STEP 9: Refresh FactEncounter (Incremental insert example)
-------------------------------------------------------------------------------
-- Might store a last-run timestamp. For simplicity, we do an upsert by encounter_id.
-- Using a basic approach. If existing rows exist, do nothing. If new, insert.

INSERT INTO phm_star.fact_encounter (
    encounter_id,
    patient_key,
    provider_key,
    org_key,
    date_key_encounter,
    encounter_type,
    encounter_status,
    count_encounter
)
SELECT
    e.encounter_id,
    dp.patient_key,
    dprov.provider_key,
    dorg.org_key,
    TO_CHAR(COALESCE(e.encounter_datetime, e.admission_datetime), 'YYYYMMDD')::int,
    e.encounter_type,
    e.status,
    1
FROM phm_edw.encounter e
JOIN phm_star.dim_patient dp
    ON dp.patient_id = e.patient_id AND dp.is_current = TRUE
LEFT JOIN phm_star.dim_provider dprov
    ON dprov.provider_id = e.provider_id AND dprov.is_current = TRUE
LEFT JOIN phm_star.dim_organization dorg
    ON dorg.org_id = e.org_id AND dorg.is_current = TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM phm_star.fact_encounter fe
    WHERE fe.encounter_id = e.encounter_id
)
;

-------------------------------------------------------------------------------
-- STEP 10: Refresh FactDiagnosis (Incremental insert example)
-------------------------------------------------------------------------------
INSERT INTO phm_star.fact_diagnosis (
    patient_key,
    encounter_key,
    provider_key,
    condition_key,
    date_key_onset,
    diagnosis_type,
    diagnosis_status,
    primary_indicator,
    count_diagnosis
)
SELECT
    dp.patient_key,
    fe.encounter_key,
    dprov.provider_key,
    dc.condition_key,
    TO_CHAR(cd.onset_date,'YYYYMMDD')::int,
    cd.diagnosis_type,
    cd.diagnosis_status,
    CASE WHEN cd.primary_indicator = 'Y' THEN TRUE ELSE FALSE END,
    1
FROM phm_edw.condition_diagnosis cd
JOIN phm_star.dim_patient dp
    ON dp.patient_id = cd.patient_id AND dp.is_current = TRUE
LEFT JOIN phm_star.dim_provider dprov
    ON dprov.provider_id = cd.provider_id AND dprov.is_current = TRUE
JOIN phm_star.dim_condition dc
    ON dc.condition_id = cd.condition_id
LEFT JOIN phm_star.fact_encounter fe
    ON fe.encounter_id = cd.encounter_id
WHERE NOT EXISTS (
    SELECT 1
    FROM phm_star.fact_diagnosis fd
    JOIN phm_star.fact_encounter fe2 ON fd.encounter_key = fe2.encounter_key
    WHERE fe2.encounter_id = cd.encounter_id
      AND fd.condition_key = dc.condition_key
      AND fd.patient_key = dp.patient_key
);

-------------------------------------------------------------------------------
-- STEP 11: Refresh FactProcedure, FactMedicationOrder, FactObservation, FactCareGap, etc.
-- Omitted here for brevity, but similar pattern:
-- - Join to dimension keys
-- - Insert new records if not existing
-------------------------------------------------------------------------------

COMMIT;

-- =====================================================================
-- End of ETL_Refresh_Full.sql
-- =====================================================================
