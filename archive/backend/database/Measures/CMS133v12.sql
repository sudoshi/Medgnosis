-- CMS133v12 Cataracts: 20/40 or Better Visual Acuity within 90 Days Following Cataract Surgery
-- Using Inmon-style EDW schema (phm_edw)

WITH patient_age AS (
    -- Calculate patient age at time of surgery
    SELECT 
        p.patient_id,
        pp.procedure_performed_id,
        pp.procedure_datetime,
        DATE_PART('year', AGE(pp.procedure_datetime, p.date_of_birth)) as age_at_surgery
    FROM phm_edw.patient p
    JOIN phm_edw.procedure_performed pp ON p.patient_id = pp.patient_id
    JOIN phm_edw.procedure pr ON pp.procedure_id = pr.procedure_id
    WHERE pr.procedure_code IN ('66982', '66984') -- CPT codes for cataract surgery
),

cataract_surgeries AS (
    -- Identify qualifying cataract surgeries
    SELECT 
        pp.procedure_performed_id,
        pp.patient_id,
        pp.procedure_datetime,
        pa.age_at_surgery,
        pp.encounter_id
    FROM phm_edw.procedure_performed pp
    JOIN phm_edw.procedure pr ON pp.procedure_id = pr.procedure_id
    JOIN patient_age pa ON pp.procedure_performed_id = pa.procedure_performed_id
    WHERE pr.procedure_code IN ('66982', '66984')
    AND pp.procedure_datetime BETWEEN '2024-01-01' AND '2024-09-30' -- January through September
    AND pa.age_at_surgery >= 18
),

denominator_exclusions AS (
    -- Identify surgeries with excluding ocular conditions
    SELECT DISTINCT cs.procedure_performed_id
    FROM cataract_surgeries cs
    WHERE EXISTS (
        -- Check for significant ocular conditions
        SELECT 1
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE cd.patient_id = cs.patient_id
        AND cd.diagnosis_status = 'ACTIVE'
        AND c.condition_code IN (
            'H43.1',  -- Vitreous hemorrhage
            'H33.0',  -- Retinal detachment
            'H40.1',  -- Open-angle glaucoma
            'H30.0'   -- Focal chorioretinal inflammation
            -- Add additional exclusion codes as needed
        )
        AND cd.onset_date <= cs.procedure_datetime
    )
),

visual_acuity_measurements AS (
    -- Track post-surgery visual acuity results
    SELECT 
        cs.procedure_performed_id,
        cs.patient_id,
        cs.procedure_datetime,
        o.observation_datetime,
        o.value_numeric,
        o.value_text,
        -- Calculate days since surgery
        DATE_PART('day', o.observation_datetime - cs.procedure_datetime) as days_post_surgery,
        -- Determine if measurement meets 20/40 or better criteria
        CASE 
            WHEN o.value_numeric <= 0.30 THEN true  -- LogMAR equivalent of 20/40
            WHEN o.value_text LIKE '%20/20%' OR 
                 o.value_text LIKE '%20/25%' OR 
                 o.value_text LIKE '%20/30%' OR 
                 o.value_text LIKE '%20/40%' THEN true
            ELSE false
        END as meets_vision_criteria
    FROM cataract_surgeries cs
    JOIN phm_edw.observation o ON cs.patient_id = o.patient_id
    WHERE o.observation_code IN (
        '62354-8',  -- LOINC for visual acuity testing
        '62355-5'   -- Add additional visual acuity test codes
    )
    AND o.observation_datetime BETWEEN cs.procedure_datetime 
        AND cs.procedure_datetime + INTERVAL '90 days'
),

best_visual_acuity AS (
    -- Get best visual acuity measurement within 90 days for each surgery
    SELECT 
        procedure_performed_id,
        BOOL_OR(meets_vision_criteria) as achieved_target_vision
    FROM visual_acuity_measurements
    GROUP BY procedure_performed_id
)

-- Final measure calculation
SELECT 
    'Overall' as measure_group,
    COUNT(DISTINCT cs.procedure_performed_id) as initial_population,
    COUNT(DISTINCT cs.procedure_performed_id) - 
        COUNT(DISTINCT de.procedure_performed_id) as denominator,
    COUNT(DISTINCT CASE 
        WHEN bva.achieved_target_vision = true 
        AND de.procedure_performed_id IS NULL 
        THEN cs.procedure_performed_id 
    END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE 
            WHEN bva.achieved_target_vision = true 
            AND de.procedure_performed_id IS NULL 
            THEN cs.procedure_performed_id 
        END) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT cs.procedure_performed_id) - 
                COUNT(DISTINCT de.procedure_performed_id)), 0) * 100,
        2
    ) as performance_rate
FROM cataract_surgeries cs
LEFT JOIN denominator_exclusions de ON cs.procedure_performed_id = de.procedure_performed_id
LEFT JOIN best_visual_acuity bva ON cs.procedure_performed_id = bva.procedure_performed_id

UNION ALL

-- Detailed results for review/validation
SELECT 
    'Detail' as measure_group,
    COUNT(DISTINCT cs.procedure_performed_id) as initial_population,
    COUNT(DISTINCT CASE WHEN de.procedure_performed_id IS NULL THEN cs.procedure_performed_id END) as denominator,
    COUNT(DISTINCT CASE 
        WHEN bva.achieved_target_vision = true 
        AND de.procedure_performed_id IS NULL 
        THEN cs.procedure_performed_id 
    END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE 
            WHEN bva.achieved_target_vision = true 
            AND de.procedure_performed_id IS NULL 
            THEN cs.procedure_performed_id 
        END) AS DECIMAL) / 
        NULLIF(COUNT(DISTINCT CASE 
            WHEN de.procedure_performed_id IS NULL 
            THEN cs.procedure_performed_id 
        END), 0) * 100,
        2
    ) as performance_rate
FROM cataract_surgeries cs
LEFT JOIN denominator_exclusions de ON cs.procedure_performed_id = de.procedure_performed_id
LEFT JOIN best_visual_acuity bva ON cs.procedure_performed_id = bva.procedure_performed_id;
