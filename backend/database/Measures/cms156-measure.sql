-- CMS156v12: Use of High-Risk Medications in Older Adults
-- Using PHM EDW Schema

WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Common base population (used for all three populations)
base_population AS (
    SELECT DISTINCT
        p.patient_id,
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) as age_at_end
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Age 65+ at end of measurement period
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) >= 65
        -- Encounter during measurement period
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
),

-- Common exclusions (used for all three populations)
common_exclusions AS (
    SELECT DISTINCT bp.patient_id
    FROM base_population bp
    WHERE EXISTS (
        -- Hospice care
        SELECT 1
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE cd.patient_id = bp.patient_id
        AND c.condition_code = 'Z51.5'  -- Hospice care code
    )
    OR EXISTS (
        -- Palliative care
        SELECT 1
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE cd.patient_id = bp.patient_id
        AND c.condition_code = 'Z51.11'  -- Palliative care code
    )
),

-- Numerator 1: All high-risk medications
numerator1_medications AS (
    SELECT DISTINCT 
        mo.patient_id,
        m.medication_name as drug_class,
        mo.start_datetime,
        mo.end_datetime,
        COALESCE(
            EXTRACT(DAY FROM (mo.end_datetime - mo.start_datetime)), 
            0
        ) as days_supply
    FROM base_population bp
    JOIN phm_edw.medication_order mo ON bp.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE m.medication_code IN (
        'select high-risk medication codes'
    )
),

-- Numerator 1: Two orders same class, >90 days or exceeding dose
numerator1 AS (
    SELECT DISTINCT patient_id
    FROM numerator1_medications n1
    WHERE EXISTS (
        SELECT 1
        FROM numerator1_medications n2
        WHERE n1.patient_id = n2.patient_id
        AND n1.drug_class = n2.drug_class
        AND n1.start_datetime < n2.start_datetime
        AND (
            -- Criterion 1: At least two orders
            1=1
            -- Criterion 2: >90 days supply
            OR (n1.days_supply + n2.days_supply) > 90
            -- Criterion 3: Exceeding dose (would need specific criteria)
        )
    )
),

-- Numerator 2: Inappropriate antipsychotics/benzos
numerator2_antipsychotics AS (
    SELECT DISTINCT 
        mo.patient_id
    FROM base_population bp
    JOIN phm_edw.medication_order mo ON bp.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE m.medication_code IN (
        'select antipsychotic codes'
    )
    AND NOT EXISTS (
        -- Exclude appropriate diagnoses
        SELECT 1
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE cd.patient_id = mo.patient_id
        AND c.condition_code IN (
            'F20', -- Schizophrenia
            'F25', -- Schizoaffective
            'F31'  -- Bipolar
        )
        AND cd.onset_date BETWEEN 
            DATE((SELECT start_date FROM measurement_period) - INTERVAL '1 year')
            AND mo.start_datetime
    )
),

numerator2_benzos AS (
    SELECT DISTINCT 
        mo.patient_id
    FROM base_population bp
    JOIN phm_edw.medication_order mo ON bp.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE m.medication_code IN (
        'select benzodiazepine codes'
    )
    AND NOT EXISTS (
        -- Exclude appropriate diagnoses
        SELECT 1
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE cd.patient_id = mo.patient_id
        AND c.condition_code IN (
            'select seizure, REM sleep, withdrawal, anxiety codes'
        )
        AND cd.onset_date BETWEEN 
            DATE((SELECT start_date FROM measurement_period) - INTERVAL '1 year')
            AND mo.start_datetime
    )
),

numerator2 AS (
    SELECT patient_id FROM numerator2_antipsychotics
    UNION
    SELECT patient_id FROM numerator2_benzos
),

-- Numerator 3: Combined high-risk meds (union of Numerator 1 and 2)
numerator3 AS (
    SELECT patient_id FROM numerator1
    UNION
    SELECT patient_id FROM numerator2
),

-- Calculate performance rates for each population
results AS (
    SELECT 
        'Population 1' as population,
        COUNT(DISTINCT bp.patient_id) as initial_population,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL THEN bp.patient_id END) 
            as denominator_after_exclusions,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND n1.patient_id IS NOT NULL 
            THEN bp.patient_id END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND n1.patient_id IS NOT NULL 
                THEN bp.patient_id END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL 
                THEN bp.patient_id END), 0)
            * 100, 2
        ) as performance_rate
    FROM base_population bp
    LEFT JOIN common_exclusions ce ON bp.patient_id = ce.patient_id
    LEFT JOIN numerator1 n1 ON bp.patient_id = n1.patient_id

    UNION ALL

    SELECT 
        'Population 2' as population,
        COUNT(DISTINCT bp.patient_id) as initial_population,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL THEN bp.patient_id END) 
            as denominator_after_exclusions,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND n2.patient_id IS NOT NULL 
            THEN bp.patient_id END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND n2.patient_id IS NOT NULL 
                THEN bp.patient_id END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL 
                THEN bp.patient_id END), 0)
            * 100, 2
        ) as performance_rate
    FROM base_population bp
    LEFT JOIN common_exclusions ce ON bp.patient_id = ce.patient_id
    LEFT JOIN numerator2 n2 ON bp.patient_id = n2.patient_id

    UNION ALL

    SELECT 
        'Population 3 (Total)' as population,
        COUNT(DISTINCT bp.patient_id) as initial_population,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL THEN bp.patient_id END) 
            as denominator_after_exclusions,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND n3.patient_id IS NOT NULL 
            THEN bp.patient_id END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND n3.patient_id IS NOT NULL 
                THEN bp.patient_id END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL 
                THEN bp.patient_id END), 0)
            * 100, 2
        ) as performance_rate
    FROM base_population bp
    LEFT JOIN common_exclusions ce ON bp.patient_id = ce.patient_id
    LEFT JOIN numerator3 n3 ON bp.patient_id = n3.patient_id
)

SELECT * FROM results;

-- Note: This SQL needs actual codes for:
-- 1. High-risk medication codes by class
-- 2. Antipsychotic medication codes
-- 3. Benzodiazepine medication codes
-- 4. Appropriate diagnosis codes for exclusions
-- 5. Dose criteria for high-risk medications