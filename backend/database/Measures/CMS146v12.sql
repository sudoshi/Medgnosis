-- CMS146v12: Appropriate Testing for Pharyngitis
-- Using PHM EDW Schema

WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-28' as end_date
),

-- Initial Population: Encounters with pharyngitis diagnosis and antibiotic order
initial_population AS (
    SELECT DISTINCT
        e.encounter_id,
        e.patient_id,
        e.encounter_datetime,
        p.date_of_birth,
        -- Calculate age at start of measurement period
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) as age_at_period_start
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    JOIN phm_edw.condition_diagnosis cd ON e.encounter_id = cd.encounter_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.medication_order mo ON e.patient_id = mo.patient_id
    JOIN measurement_period mp ON 1=1
    WHERE 
        -- Encounter within measurement period
        e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        -- Pharyngitis diagnosis (would need actual ICD-10 codes)
        AND c.condition_code IN ('J02.0', 'J02.9', 'J03.00', 'J03.90')  
        -- Antibiotic ordered within 3 days
        AND mo.start_datetime BETWEEN e.encounter_datetime 
            AND e.encounter_datetime + INTERVAL '3 days'
        -- Patient 3 years or older
        AND DATE_PART('year', AGE(e.encounter_datetime, p.date_of_birth)) >= 3
),

-- Denominator Exclusions
denominator_exclusions AS (
    SELECT DISTINCT i.encounter_id
    FROM initial_population i
    LEFT JOIN phm_edw.condition_diagnosis cd 
        ON i.patient_id = cd.patient_id
    LEFT JOIN phm_edw.medication_order mo 
        ON i.patient_id = mo.patient_id
    WHERE 
        -- Exclude if hospice care (would need actual codes)
        EXISTS (
            SELECT 1 
            FROM phm_edw.condition_diagnosis cd2
            JOIN phm_edw.condition c ON cd2.condition_id = c.condition_id
            WHERE cd2.patient_id = i.patient_id
            AND c.condition_code IN ('Z51.5')  -- Hospice care
        )
        -- Exclude if comorbid condition in prior 12 months
        OR EXISTS (
            SELECT 1
            FROM phm_edw.condition_diagnosis cd3
            JOIN phm_edw.condition c ON cd3.condition_id = c.condition_id
            WHERE cd3.patient_id = i.patient_id
            AND c.condition_code IN ('select comorbid condition codes')
            AND cd3.onset_date BETWEEN 
                i.encounter_datetime - INTERVAL '12 months'
                AND i.encounter_datetime
        )
        -- Exclude if antibiotics in prior 30 days
        OR EXISTS (
            SELECT 1
            FROM phm_edw.medication_order mo2
            WHERE mo2.patient_id = i.patient_id
            AND mo2.start_datetime BETWEEN 
                i.encounter_datetime - INTERVAL '30 days'
                AND i.encounter_datetime
        )
        -- Exclude if competing diagnosis within 3 days
        OR EXISTS (
            SELECT 1
            FROM phm_edw.condition_diagnosis cd4
            JOIN phm_edw.condition c ON cd4.condition_id = c.condition_id
            WHERE cd4.patient_id = i.patient_id
            AND c.condition_code IN ('select competing diagnosis codes')
            AND cd4.onset_date BETWEEN 
                i.encounter_datetime
                AND i.encounter_datetime + INTERVAL '3 days'
        )
),

-- Numerator: Group A strep test performed
numerator AS (
    SELECT DISTINCT i.encounter_id
    FROM initial_population i
    JOIN phm_edw.observation o ON i.patient_id = o.patient_id
    WHERE 
        -- Group A strep test (would need actual LOINC codes)
        o.observation_code IN ('select strep test LOINC codes')
        -- Test within 7-day window (-3 to +3 days from encounter)
        AND o.observation_datetime BETWEEN 
            i.encounter_datetime - INTERVAL '3 days'
            AND i.encounter_datetime + INTERVAL '3 days'
),

-- Calculate measure for each stratification
final_results AS (
    SELECT
        CASE 
            WHEN age_at_period_start BETWEEN 3 AND 17 THEN '3-17'
            WHEN age_at_period_start BETWEEN 18 AND 64 THEN '18-64'
            WHEN age_at_period_start >= 65 THEN '65+'
        END as age_strata,
        COUNT(DISTINCT i.encounter_id) as denominator,
        COUNT(DISTINCT CASE WHEN de.encounter_id IS NULL THEN i.encounter_id END) 
            as denominator_after_exclusions,
        COUNT(DISTINCT CASE WHEN de.encounter_id IS NULL AND n.encounter_id IS NOT NULL 
            THEN i.encounter_id END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE WHEN de.encounter_id IS NULL AND n.encounter_id IS NOT NULL 
                THEN i.encounter_id END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE WHEN de.encounter_id IS NULL THEN i.encounter_id END), 0)
            * 100, 2) as performance_rate
    FROM initial_population i
    LEFT JOIN denominator_exclusions de ON i.encounter_id = de.encounter_id
    LEFT JOIN numerator n ON i.encounter_id = n.encounter_id
    GROUP BY 
        CASE 
            WHEN age_at_period_start BETWEEN 3 AND 17 THEN '3-17'
            WHEN age_at_period_start BETWEEN 18 AND 64 THEN '18-64'
            WHEN age_at_period_start >= 65 THEN '65+'
        END
    ORDER BY age_strata
)

SELECT * FROM final_results;

-- Note: This SQL needs actual codes for:
-- 1. Pharyngitis/tonsillitis ICD-10 codes
-- 2. Antibiotic medication codes
-- 3. Hospice care codes
-- 4. Comorbid condition codes
-- 5. Competing diagnosis codes
-- 6. Group A strep test LOINC codes
