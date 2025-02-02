-- CMS130v12 Colorectal Cancer Screening Measure
-- Using Inmon-style EDW schema (phm_edw)

WITH patient_age AS (
    -- Calculate patient age at end of measurement period
    SELECT 
        p.patient_id,
        DATE_PART('year', AGE('2024-12-31', p.date_of_birth)) as age_at_period_end
    FROM phm_edw.patient p
),

initial_population AS (
    -- Patients 46-75 with eligible encounter
    SELECT DISTINCT 
        p.patient_id,
        pa.age_at_period_end
    FROM phm_edw.patient p
    JOIN patient_age pa ON p.patient_id = pa.patient_id
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    WHERE pa.age_at_period_end BETWEEN 46 AND 75
    AND e.encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
),

denominator_exclusions AS (
    -- Combine all exclusion criteria
    SELECT DISTINCT p.patient_id
    FROM initial_population p
    LEFT JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
    LEFT JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE 
        -- Hospice care
        EXISTS (
            SELECT 1 
            FROM phm_edw.encounter e
            WHERE e.patient_id = p.patient_id
            AND e.encounter_type = 'HOSPICE'
            AND e.encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
        )
        -- Total colectomy or colorectal cancer
        OR EXISTS (
            SELECT 1
            FROM phm_edw.condition_diagnosis cd2
            JOIN phm_edw.condition c2 ON cd2.condition_id = c2.condition_id
            WHERE cd2.patient_id = p.patient_id
            AND (
                c2.condition_code IN ('Z90.49', 'C18.%', 'C19', 'C20') -- ICD-10 codes for colectomy/colorectal cancer
                OR cd2.diagnosis_status = 'ACTIVE'
            )
            AND cd2.onset_date <= '2024-12-31'
        )
        -- Age 66+ in long-term nursing home
        OR (
            p.age_at_period_end >= 66
            AND EXISTS (
                SELECT 1
                FROM phm_edw.encounter e
                WHERE e.patient_id = p.patient_id
                AND e.encounter_type = 'NURSING_HOME'
                AND e.encounter_datetime <= '2024-12-31'
            )
        )
        -- Age 66+ with advanced illness and frailty
        OR (
            p.age_at_period_end >= 66
            AND EXISTS (
                SELECT 1
                FROM phm_edw.condition_diagnosis cd3
                WHERE cd3.patient_id = p.patient_id
                AND cd3.diagnosis_type = 'CHRONIC'
                AND cd3.diagnosis_status = 'ACTIVE'
            )
        )
),

numerator_screenings AS (
    -- Combine all screening criteria
    SELECT DISTINCT p.patient_id
    FROM initial_population p
    WHERE 
        -- FOBT during measurement period
        EXISTS (
            SELECT 1
            FROM phm_edw.procedure_performed pp
            JOIN phm_edw.procedure pr ON pp.procedure_id = pr.procedure_id
            WHERE pp.patient_id = p.patient_id
            AND pr.procedure_code IN ('82274', 'G0328') -- CPT/HCPCS for FOBT
            AND pp.procedure_datetime BETWEEN '2024-01-01' AND '2024-12-31'
        )
        -- FIT-DNA within 2 years
        OR EXISTS (
            SELECT 1
            FROM phm_edw.procedure_performed pp
            JOIN phm_edw.procedure pr ON pp.procedure_id = pr.procedure_id
            WHERE pp.patient_id = p.patient_id
            AND pr.procedure_code = '81528' -- CPT for FIT-DNA
            AND pp.procedure_datetime BETWEEN '2022-01-01' AND '2024-12-31'
        )
        -- Flexible sigmoidoscopy within 4 years
        OR EXISTS (
            SELECT 1
            FROM phm_edw.procedure_performed pp
            JOIN phm_edw.procedure pr ON pp.procedure_id = pr.procedure_id
            WHERE pp.patient_id = p.patient_id
            AND pr.procedure_code IN ('45330', '45331', '45332') -- CPT for flex sig
            AND pp.procedure_datetime BETWEEN '2020-01-01' AND '2024-12-31'
        )
        -- CT colonography within 4 years
        OR EXISTS (
            SELECT 1
            FROM phm_edw.procedure_performed pp
            JOIN phm_edw.procedure pr ON pp.procedure_id = pr.procedure_id
            WHERE pp.patient_id = p.patient_id
            AND pr.procedure_code = '74263' -- CPT for CT colonography
            AND pp.procedure_datetime BETWEEN '2020-01-01' AND '2024-12-31'
        )
        -- Colonoscopy within 9 years
        OR EXISTS (
            SELECT 1
            FROM phm_edw.procedure_performed pp
            JOIN phm_edw.procedure pr ON pp.procedure_id = pr.procedure_id
            WHERE pp.patient_id = p.patient_id
            AND pr.procedure_code IN ('45378', '45380', '45381', '45382', '45384', '45385') -- CPT for colonoscopy
            AND pp.procedure_datetime BETWEEN '2015-01-01' AND '2024-12-31'
        )
)

-- Final measure calculation
SELECT 
    'Overall' as population_group,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT ip.patient_id) - COUNT(DISTINCT de.patient_id) as denominator,
    COUNT(DISTINCT ns.patient_id) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT ns.patient_id) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT ip.patient_id) - COUNT(DISTINCT de.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN numerator_screenings ns ON ip.patient_id = ns.patient_id
WHERE de.patient_id IS NULL

UNION ALL

-- Stratification 1 (46-49)
SELECT 
    'Age 46-49' as population_group,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT ip.patient_id) - COUNT(DISTINCT de.patient_id) as denominator,
    COUNT(DISTINCT ns.patient_id) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT ns.patient_id) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT ip.patient_id) - COUNT(DISTINCT de.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN numerator_screenings ns ON ip.patient_id = ns.patient_id
WHERE ip.age_at_period_end BETWEEN 46 AND 49
AND de.patient_id IS NULL

UNION ALL

-- Stratification 2 (50-75)
SELECT 
    'Age 50-75' as population_group,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT ip.patient_id) - COUNT(DISTINCT de.patient_id) as denominator,
    COUNT(DISTINCT ns.patient_id) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT ns.patient_id) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT ip.patient_id) - COUNT(DISTINCT de.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN numerator_screenings ns ON ip.patient_id = ns.patient_id
WHERE ip.age_at_period_end BETWEEN 50 AND 75
AND de.patient_id IS NULL;
