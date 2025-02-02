-- CMS157v12: Oncology: Medical and Radiation - Pain Intensity Quantified
-- Using the Kimball star schema (phm_star)

WITH date_ranges AS (
    SELECT 
        date_key,
        full_date
    FROM phm_star.dim_date
    WHERE full_date BETWEEN '2024-01-01' AND '2024-12-31' -- Measurement period
),

-- Population 1: Chemotherapy Patients
chemo_encounters AS (
    SELECT DISTINCT
        fe.encounter_key,
        fe.patient_key,
        fe.provider_key,
        fe.date_key_encounter,
        dp.patient_id,
        dd.full_date as encounter_date
    FROM phm_star.fact_encounter fe
    JOIN phm_star.dim_patient dp ON fe.patient_key = dp.patient_key
    JOIN phm_star.dim_date dd ON fe.date_key_encounter = dd.date_key
    -- Join to get cancer diagnosis
    JOIN phm_star.fact_diagnosis fd ON fe.patient_key = fd.patient_key
    JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    -- Join to get chemotherapy orders/administration
    JOIN phm_star.fact_procedure fp ON fe.patient_key = fp.patient_key
    JOIN phm_star.dim_procedure dpr ON fp.procedure_key = dpr.procedure_key
    WHERE 
        -- Cancer diagnosis
        dc.icd10_code LIKE 'C%'
        AND fd.diagnosis_status = 'ACTIVE'
        -- Encounter is face-to-face or telehealth
        AND fe.encounter_type IN ('OFFICE_VISIT', 'TELEHEALTH')
        -- Chemotherapy procedure codes (you would add actual codes here)
        AND dpr.procedure_code IN ('96413', '96415', '96416')
        -- Ensure chemo is within 30 days before or after encounter
        AND EXISTS (
            SELECT 1 
            FROM phm_star.fact_procedure fp2
            JOIN phm_star.dim_date dd2 ON fp2.date_key_procedure = dd2.date_key
            WHERE fp2.patient_key = fe.patient_key
            AND dd2.full_date BETWEEN dd.full_date - INTERVAL '30 days' 
                                 AND dd.full_date + INTERVAL '30 days'
        )
),

-- Population 2: Radiation Therapy Patients
radiation_encounters AS (
    SELECT DISTINCT
        fe.encounter_key,
        fe.patient_key,
        fe.provider_key,
        fe.date_key_encounter,
        dp.patient_id,
        dd.full_date as encounter_date
    FROM phm_star.fact_encounter fe
    JOIN phm_star.dim_patient dp ON fe.patient_key = dp.patient_key
    JOIN phm_star.dim_date dd ON fe.date_key_encounter = dd.date_key
    -- Join to get cancer diagnosis
    JOIN phm_star.fact_diagnosis fd ON fe.patient_key = fd.patient_key
    JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    -- Join to get radiation therapy procedures
    JOIN phm_star.fact_procedure fp ON fe.patient_key = fp.patient_key
    JOIN phm_star.dim_procedure dpr ON fp.procedure_key = dpr.procedure_key
    WHERE 
        -- Cancer diagnosis
        dc.icd10_code LIKE 'C%'
        AND fd.diagnosis_status = 'ACTIVE'
        -- Radiation therapy management codes
        AND dpr.procedure_code IN ('77427', '77431', '77432', '77435')
),

-- Pain Intensity Observations
pain_scores AS (
    SELECT 
        fo.patient_key,
        fo.encounter_key,
        fo.date_key_obs,
        dd.full_date as observation_date,
        fo.value_numeric as pain_score
    FROM phm_star.fact_observation fo
    JOIN phm_star.dim_date dd ON fo.date_key_obs = dd.date_key
    WHERE 
        -- Pain score LOINC codes (you would add actual codes here)
        fo.observation_code IN ('72514-3', '38208-5')
        AND fo.value_numeric IS NOT NULL
),

-- Calculate numerators and denominators
measure_calc AS (
    -- Chemotherapy Population (Population 1)
    SELECT 
        COUNT(DISTINCT ce.encounter_key) as denominator_1,
        COUNT(DISTINCT CASE 
            WHEN ps.pain_score IS NOT NULL THEN ce.encounter_key 
        END) as numerator_1
    FROM chemo_encounters ce
    LEFT JOIN pain_scores ps ON ce.encounter_key = ps.encounter_key

    UNION ALL

    -- Radiation Therapy Population (Population 2)
    SELECT 
        COUNT(DISTINCT re.encounter_key) as denominator_2,
        COUNT(DISTINCT CASE 
            WHEN ps.pain_score IS NOT NULL 
            OR EXISTS (
                SELECT 1 FROM pain_scores ps2
                WHERE ps2.patient_key = re.patient_key
                AND ps2.observation_date BETWEEN 
                    re.encounter_date - INTERVAL '6 days' AND re.encounter_date
            ) THEN re.encounter_key
        END) as numerator_2
    FROM radiation_encounters re
    LEFT JOIN pain_scores ps ON re.encounter_key = ps.encounter_key
)

-- Calculate final measure rate
SELECT 
    SUM(numerator_1 + numerator_2) as total_numerator,
    SUM(denominator_1 + denominator_2) as total_denominator,
    ROUND(
        CAST(SUM(numerator_1 + numerator_2) AS DECIMAL) / 
        NULLIF(SUM(denominator_1 + denominator_2), 0) * 100, 
        1
    ) as measure_rate
FROM measure_calc;
