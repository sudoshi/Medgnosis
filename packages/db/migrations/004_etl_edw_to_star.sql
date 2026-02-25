-- =====================================================================
-- ETL_Refresh_Full.sql
-- Populates the Kimball star schema (phm_star) from the Inmon 3NF EDW (phm_edw)
-- Schedules: Run 8 times a day for near-real-time analytics
-- Inline comments only, no explanations beyond them
-- =====================================================================

BEGIN;

-- STEP 1: Refresh DimDate (REMOVED - Assumes phm_star.dim_date is populated independently)

-------------------------------------------------------------------------------
-- STEP 2: Refresh DimOrganization (SCD Type 2)
-------------------------------------------------------------------------------
-- Uses a common upsert pattern in PostgreSQL for Type 2
-- old rows closed out, new rows inserted if changes are detected
-- This snippet relies on hsh comparison of scd columns

WITH source_data AS ( -- Select all relevant source columns
    SELECT
        o.org_id,
        o.organization_name,
        o.organization_type,
        o.parent_org_id,
        CURRENT_DATE AS load_date
    FROM phm_edw.organization o
    WHERE o.active_ind = 'Y'
),
matched AS ( -- Find current dimension records and compare relevant attributes
    SELECT
        d.org_key,
        d.org_id,
        s.load_date,
        -- Columns for comparison (matching target dim_organization schema)
        d.organization_name AS dim_name, s.organization_name AS src_name,
        d.organization_type AS dim_type, s.organization_type AS src_type,
        d.parent_org_key AS dim_parent_key, parent_dim.org_key AS src_parent_key -- Map parent ID to key
    FROM phm_star.dim_organization d
    JOIN source_data s ON d.org_id = s.org_id
    LEFT JOIN phm_star.dim_organization parent_dim -- Join to find the key of the parent org
        ON s.parent_org_id = parent_dim.org_id AND parent_dim.is_current = TRUE
    WHERE d.is_current = TRUE
)
UPDATE phm_star.dim_organization -- Close out old records where attributes have changed
SET
    effective_end_date = matched.load_date - INTERVAL '1 day',
    is_current = FALSE,
    updated_at = NOW()
FROM matched
WHERE phm_star.dim_organization.org_key = matched.org_key
  AND ( -- Check if any SCD attribute changed
       matched.dim_name IS DISTINCT FROM matched.src_name
    OR matched.dim_type IS DISTINCT FROM matched.src_type
    OR matched.dim_parent_key IS DISTINCT FROM matched.src_parent_key
  );

-- Insert new records or new versions of existing records
INSERT INTO phm_star.dim_organization (
    org_id,
    organization_name,
    organization_type,
    parent_org_key,
    effective_start_date,
    effective_end_date,
    is_current,
    created_at,
    updated_at
)
SELECT
    edw_org.org_id,
    edw_org.organization_name,
    edw_org.organization_type,
    parent_dim.org_key, -- Map parent ID to key
    CURRENT_DATE,       -- Use current date as start date
    '9999-12-31',
    TRUE,
    NOW(),
    NOW()
FROM phm_edw.organization edw_org -- Select directly from source
LEFT JOIN phm_star.dim_organization parent_dim -- Join to get parent key
    ON edw_org.parent_org_id = parent_dim.org_id AND parent_dim.is_current = TRUE
WHERE edw_org.active_ind = 'Y'
  AND NOT EXISTS ( -- Check if a current record already exists in the dimension
    SELECT 1
    FROM phm_star.dim_organization existing_dim
    WHERE existing_dim.org_id = edw_org.org_id
      AND existing_dim.is_current = TRUE
  );

-------------------------------------------------------------------------------
-- STEP 3: Refresh DimProvider (SCD Type 2)
-------------------------------------------------------------------------------
WITH source_data AS ( -- Select all relevant source columns
    SELECT
        p.provider_id,
        p.first_name,
        p.last_name,
        p.npi_number,
        p.specialty,
        p.provider_type,
        p.org_id, -- Needed to link to dim_organization
        CURRENT_DATE AS load_date
    FROM phm_edw.provider p
    WHERE p.active_ind = 'Y'
),
matched AS ( -- Find current dimension records and compare relevant attributes
    SELECT
        dim.provider_key,
        dim.provider_id,
        src.load_date,
        -- Columns for comparison (matching target dim_provider schema)
        dim.first_name AS dim_first, src.first_name AS src_first,
        dim.last_name AS dim_last, src.last_name AS src_last,
        dim.npi_number AS dim_npi, src.npi_number AS src_npi,
        dim.specialty AS dim_specialty, src.specialty AS src_specialty,
        dim.provider_type AS dim_prov_type, src.provider_type AS src_prov_type,
        dim.org_key AS dim_org_key, org_dim.org_key AS src_org_key -- Map org ID to key
    FROM phm_star.dim_provider dim
    JOIN source_data src ON dim.provider_id = src.provider_id
    LEFT JOIN phm_star.dim_organization org_dim -- Join to find the key of the org
        ON src.org_id = org_dim.org_id AND org_dim.is_current = TRUE
    WHERE dim.is_current = TRUE
)
UPDATE phm_star.dim_provider -- Close out old records where attributes have changed
SET
    effective_end_date = matched.load_date - INTERVAL '1 day',
    is_current = FALSE,
    updated_at = NOW()
FROM matched
WHERE phm_star.dim_provider.provider_key = matched.provider_key
  AND ( -- Check if any SCD attribute changed
       matched.dim_first IS DISTINCT FROM matched.src_first
    OR matched.dim_last IS DISTINCT FROM matched.src_last
    OR matched.dim_npi IS DISTINCT FROM matched.src_npi
    OR matched.dim_specialty IS DISTINCT FROM matched.src_specialty
    OR matched.dim_prov_type IS DISTINCT FROM matched.src_prov_type
    OR matched.dim_org_key IS DISTINCT FROM matched.src_org_key
  );

-- Insert new records or new versions of existing records
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
    created_at,
    updated_at
)
SELECT
    edw_prov.provider_id,
    edw_prov.first_name,
    edw_prov.last_name,
    LEFT(edw_prov.npi_number, 15), -- Truncate NPI to 15 chars
    edw_prov.specialty,
    edw_prov.provider_type,
    org_dim.org_key, -- Map org ID to key
    CURRENT_DATE,    -- Use current date as start date
    '9999-12-31',
    TRUE,
    NOW(),
    NOW()
FROM phm_edw.provider edw_prov -- Select directly from source
LEFT JOIN phm_star.dim_organization org_dim -- Join to get org key
    ON edw_prov.org_id = org_dim.org_id AND org_dim.is_current = TRUE
WHERE edw_prov.active_ind = 'Y'
  AND NOT EXISTS ( -- Check if a current record already exists in the dimension
    SELECT 1
    FROM phm_star.dim_provider existing_dim
    WHERE existing_dim.provider_id = edw_prov.provider_id
      AND existing_dim.is_current = TRUE
  );

-------------------------------------------------------------------------------
-- STEP 4: Refresh DimPatient (SCD Type 2)
-------------------------------------------------------------------------------
WITH source_data AS ( -- Select all relevant source columns
    SELECT
        pat.patient_id,
        pat.first_name,
        pat.last_name,
        pat.date_of_birth,
        pat.gender,
        pat.race,
        pat.ethnicity,
        pat.marital_status,
        pat.primary_language,
        pat.pcp_provider_id, -- Needed to link to dim_provider
        CURRENT_DATE AS load_date
    FROM phm_edw.patient pat
    WHERE pat.active_ind = 'Y'
),
matched AS ( -- Find current dimension records and compare relevant attributes
    SELECT
        dim.patient_key,
        dim.patient_id,
        src.load_date,
        -- Columns for comparison (matching target dim_patient schema)
        dim.first_name AS dim_first, src.first_name AS src_first,
        dim.last_name AS dim_last, src.last_name AS src_last,
        dim.date_of_birth AS dim_dob, src.date_of_birth AS src_dob,
        dim.gender AS dim_gender, src.gender AS src_gender,
        dim.race AS dim_race, src.race AS src_race,
        dim.ethnicity AS dim_ethnicity, src.ethnicity AS src_ethnicity,
        dim.marital_status AS dim_marital, src.marital_status AS src_marital,
        dim.primary_language AS dim_language, src.primary_language AS src_language,
        dim.pcp_provider_key AS dim_pcp_key, pcp_dim.provider_key AS src_pcp_key -- Map PCP ID to key
    FROM phm_star.dim_patient dim
    JOIN source_data src ON dim.patient_id = src.patient_id
    LEFT JOIN phm_star.dim_provider pcp_dim -- Join to find the key of the PCP
        ON src.pcp_provider_id = pcp_dim.provider_id AND pcp_dim.is_current = TRUE
    WHERE dim.is_current = TRUE
)
UPDATE phm_star.dim_patient -- Close out old records where attributes have changed
SET
    effective_end_date = matched.load_date - INTERVAL '1 day',
    is_current = FALSE,
    updated_at = NOW()
FROM matched
WHERE phm_star.dim_patient.patient_key = matched.patient_key
  AND ( -- Check if any SCD attribute changed
       matched.dim_first IS DISTINCT FROM matched.src_first
    OR matched.dim_last IS DISTINCT FROM matched.src_last
    OR matched.dim_dob IS DISTINCT FROM matched.src_dob
    OR matched.dim_gender IS DISTINCT FROM matched.src_gender
    OR matched.dim_race IS DISTINCT FROM matched.src_race
    OR matched.dim_ethnicity IS DISTINCT FROM matched.src_ethnicity
    OR matched.dim_marital IS DISTINCT FROM matched.src_marital
    OR matched.dim_language IS DISTINCT FROM matched.src_language
    OR matched.dim_pcp_key IS DISTINCT FROM matched.src_pcp_key
  );

-- Insert new records or new versions of existing records
INSERT INTO phm_star.dim_patient (
    patient_id,
    first_name,
    last_name,
    date_of_birth,
    gender,
    race,
    ethnicity,
    marital_status,
    primary_language,
    pcp_provider_key,
    effective_start_date,
    effective_end_date,
    is_current,
    created_at,
    updated_at
)
SELECT
    edw_pat.patient_id,
    edw_pat.first_name,
    edw_pat.last_name,
    edw_pat.date_of_birth,
    edw_pat.gender,
    edw_pat.race,
    edw_pat.ethnicity,
    edw_pat.marital_status,
    edw_pat.primary_language,
    pcp_dim.provider_key, -- Map PCP ID to key
    CURRENT_DATE,         -- Use current date as start date
    '9999-12-31',
    TRUE,
    NOW(),
    NOW()
FROM phm_edw.patient edw_pat -- Select directly from source
LEFT JOIN phm_star.dim_provider pcp_dim -- Join to get PCP key
    ON edw_pat.pcp_provider_id = pcp_dim.provider_id AND pcp_dim.is_current = TRUE
WHERE edw_pat.active_ind = 'Y'
  AND NOT EXISTS ( -- Check if a current record already exists in the dimension
    SELECT 1
    FROM phm_star.dim_patient existing_dim
    WHERE existing_dim.patient_id = edw_pat.patient_id
      AND existing_dim.is_current = TRUE
  );

-------------------------------------------------------------------------------
-- STEP 5: Refresh DimCondition (Type 1 example)
-------------------------------------------------------------------------------
TRUNCATE TABLE phm_star.dim_condition CASCADE; -- Added CASCADE

INSERT INTO phm_star.dim_condition (
    condition_id,
    icd10_code,
    condition_name,
    code_system,
    created_at,
    updated_at -- Reverted, but keeping updated_at
)
SELECT
    c.condition_id,
    c.condition_code,
    c.condition_name,
    c.code_system,
    NOW(),
    NOW()
FROM phm_edw.condition c
WHERE c.active_ind = 'Y'
;

-------------------------------------------------------------------------------
-- STEP 6: Refresh DimProcedure (Type 1 example)
-------------------------------------------------------------------------------
TRUNCATE TABLE phm_star.dim_procedure CASCADE; -- Added CASCADE

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
TRUNCATE TABLE phm_star.dim_medication CASCADE; -- Added CASCADE

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
TRUNCATE TABLE phm_star.dim_measure CASCADE; -- Added CASCADE

INSERT INTO phm_star.dim_measure (
    measure_id,
    measure_code,
    measure_name,
    measure_type,
    description,
    created_at,
    updated_at -- Reverted, but keeping updated_at
)
SELECT
    md.measure_id,
    md.measure_code,
    md.measure_name,
    md.measure_type,
    md.description,
    NOW(),
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
    length_of_stay, -- Keeping LOS as it exists in target
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
    -- Calculate length of stay in days (handle NULLs and cap at 999.99)
    CASE
        WHEN e.admission_datetime IS NOT NULL AND e.discharge_datetime IS NOT NULL THEN
            LEAST(DATE_PART('day', e.discharge_datetime - e.admission_datetime), 999.99) -- Cap value
        ELSE NULL
    END,
    1
FROM phm_edw.encounter e
JOIN phm_star.dim_patient dp
    ON dp.patient_id = e.patient_id AND dp.is_current = TRUE
LEFT JOIN phm_star.dim_provider dprov
    ON dprov.provider_id = e.provider_id AND dprov.is_current = TRUE
LEFT JOIN phm_star.dim_organization dorg
    ON dorg.org_id = e.org_id AND dorg.is_current = TRUE
JOIN phm_star.dim_date dd -- Ensure the encounter date exists in dim_date
    ON dd.date_key = TO_CHAR(COALESCE(e.encounter_datetime, e.admission_datetime), 'YYYYMMDD')::int
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
    -- date_key_resolution, -- Removed as it's not in target schema
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
    -- TO_CHAR(cd.resolution_date,'YYYYMMDD')::int, -- Removed
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
-- STEP 11: Refresh FactProcedure (Incremental insert example)
-------------------------------------------------------------------------------
INSERT INTO phm_star.fact_procedure (
    patient_key,
    encounter_key,
    provider_key,
    procedure_key,
    date_key_procedure,
    count_procedure
)
SELECT
    dp.patient_key,
    fe.encounter_key,
    dprov.provider_key,
    dproc.procedure_key,
    TO_CHAR(pp.procedure_datetime, 'YYYYMMDD')::int,
    1
FROM phm_edw.procedure_performed pp
JOIN phm_star.dim_patient dp
    ON dp.patient_id = pp.patient_id AND dp.is_current = TRUE
JOIN phm_star.dim_procedure dproc
    ON dproc.procedure_id = pp.procedure_id
LEFT JOIN phm_star.fact_encounter fe -- Use LEFT JOIN if encounter might not exist yet or is optional
    ON fe.encounter_id = pp.encounter_id
LEFT JOIN phm_star.dim_provider dprov -- Use LEFT JOIN if provider might not exist yet or is optional
    ON dprov.provider_id = pp.provider_id AND dprov.is_current = TRUE
WHERE pp.active_ind = 'Y' -- Assuming only active procedures should be loaded
  AND NOT EXISTS ( -- Check if this specific procedure instance already exists
    SELECT 1
    FROM phm_star.fact_procedure fp
    WHERE fp.patient_key = dp.patient_key
      AND fp.procedure_key = dproc.procedure_key
      AND fp.date_key_procedure = TO_CHAR(pp.procedure_datetime, 'YYYYMMDD')::int
      AND COALESCE(fp.encounter_key, -1) = COALESCE(fe.encounter_key, -1) -- Handle potential NULL encounter keys
      AND COALESCE(fp.provider_key, -1) = COALESCE(dprov.provider_key, -1) -- Handle potential NULL provider keys
);

-------------------------------------------------------------------------------
-- STEP 12: Refresh FactMedicationOrder (Incremental insert example)
-------------------------------------------------------------------------------
INSERT INTO phm_star.fact_medication_order (
    patient_key,
    encounter_key,
    provider_key,
    medication_key,
    date_key_start,
    date_key_end,
    frequency,
    route,
    refill_count,
    prescription_status,
    count_med_order
)
SELECT
    dp.patient_key,
    fe.encounter_key,
    dprov.provider_key,
    dmed.medication_key,
    TO_CHAR(mo.start_datetime, 'YYYYMMDD')::int,
    TO_CHAR(mo.end_datetime, 'YYYYMMDD')::int,
    mo.frequency,
    mo.route,
    mo.refill_count,
    mo.prescription_status,
    1
FROM phm_edw.medication_order mo
JOIN phm_star.dim_patient dp
    ON dp.patient_id = mo.patient_id AND dp.is_current = TRUE
JOIN phm_star.dim_medication dmed
    ON dmed.medication_id = mo.medication_id
LEFT JOIN phm_star.fact_encounter fe
    ON fe.encounter_id = mo.encounter_id
LEFT JOIN phm_star.dim_provider dprov
    ON dprov.provider_id = mo.provider_id AND dprov.is_current = TRUE
WHERE mo.active_ind = 'Y' -- Assuming only active orders should be loaded
  AND NOT EXISTS ( -- Check if this specific medication order instance already exists
    SELECT 1
    FROM phm_star.fact_medication_order fmo
    WHERE fmo.patient_key = dp.patient_key
      AND fmo.medication_key = dmed.medication_key
      AND fmo.date_key_start = TO_CHAR(mo.start_datetime, 'YYYYMMDD')::int
      AND COALESCE(fmo.encounter_key, -1) = COALESCE(fe.encounter_key, -1)
      AND COALESCE(fmo.provider_key, -1) = COALESCE(dprov.provider_key, -1)
      -- Add more columns to the uniqueness check if necessary (e.g., dosage, status)
);

-------------------------------------------------------------------------------
-- STEP 13: Refresh FactObservation (Incremental insert example)
-------------------------------------------------------------------------------
INSERT INTO phm_star.fact_observation (
    patient_key,
    encounter_key,
    provider_key,
    date_key_obs,
    observation_code,
    observation_desc,
    value_numeric,
    value_text,
    units,
    abnormal_flag,
    count_observation
)
SELECT
    dp.patient_key,
    fe.encounter_key,
    dprov.provider_key,
    TO_CHAR(obs.observation_datetime, 'YYYYMMDD')::int,
    obs.observation_code,
    obs.observation_desc,
    obs.value_numeric,
    obs.value_text,
    obs.units,
    obs.abnormal_flag,
    1
FROM phm_edw.observation obs
JOIN phm_star.dim_patient dp
    ON dp.patient_id = obs.patient_id AND dp.is_current = TRUE
LEFT JOIN phm_star.fact_encounter fe
    ON fe.encounter_id = obs.encounter_id
LEFT JOIN phm_star.dim_provider dprov
    ON dprov.provider_id = obs.provider_id AND dprov.is_current = TRUE
WHERE obs.active_ind = 'Y' -- Assuming only active observations
  AND NOT EXISTS ( -- Check if this specific observation instance already exists
    SELECT 1
    FROM phm_star.fact_observation fo
    WHERE fo.patient_key = dp.patient_key
      AND fo.observation_code = obs.observation_code -- Use code for uniqueness
      AND fo.date_key_obs = TO_CHAR(obs.observation_datetime, 'YYYYMMDD')::int
      AND COALESCE(fo.encounter_key, -1) = COALESCE(fe.encounter_key, -1)
      AND COALESCE(fo.provider_key, -1) = COALESCE(dprov.provider_key, -1)
      -- Consider adding value_numeric/value_text to uniqueness if needed
);

-------------------------------------------------------------------------------
-- STEP 14: Refresh FactCareGap (Incremental insert example)
-------------------------------------------------------------------------------
INSERT INTO phm_star.fact_care_gap (
    patient_key,
    measure_key,
    date_key_identified,
    date_key_resolved,
    gap_status,
    count_care_gap
)
SELECT
    dp.patient_key,
    dm.measure_key,
    TO_CHAR(cg.identified_date, 'YYYYMMDD')::int,
    TO_CHAR(cg.resolved_date, 'YYYYMMDD')::int,
    cg.gap_status,
    1
FROM phm_edw.care_gap cg
JOIN phm_star.dim_patient dp
    ON dp.patient_id = cg.patient_id AND dp.is_current = TRUE
JOIN phm_star.dim_measure dm
    ON dm.measure_id = cg.measure_id
WHERE cg.active_ind = 'Y' -- Assuming only active care gaps
  AND NOT EXISTS ( -- Check if this specific care gap instance already exists
    SELECT 1
    FROM phm_star.fact_care_gap fcg
    WHERE fcg.patient_key = dp.patient_key
      AND fcg.measure_key = dm.measure_key
      AND fcg.date_key_identified = TO_CHAR(cg.identified_date, 'YYYYMMDD')::int
      -- Add gap_status to uniqueness check if a patient can have multiple gaps for the same measure identified on the same day but with different statuses over time?
      -- AND fcg.gap_status = cg.gap_status
);

-------------------------------------------------------------------------------
-- STEP 15: Add other fact tables if needed
-------------------------------------------------------------------------------

COMMIT;

-- =====================================================================
-- End of ETL_Refresh_Full.sql
-- =====================================================================
