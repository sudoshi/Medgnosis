-- CMS249v6: DXA Scan Use in Women Under 65 Years
WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Initial Population: Female patients 50-63 years with encounter
initial_population AS (
    SELECT DISTINCT
        p.patient_id,
        p.date_of_birth,
        e.encounter_id,
        e.encounter_datetime,
        -- Calculate age at start of measurement period
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) as age_at_start
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Female patients
        p.gender = 'F'
        -- Age 50-63 at start of measurement period
        AND DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) BETWEEN 50 AND 63
        -- Visit during measurement period
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
),

-- Get first BMI in measurement period
first_bmi AS (
    SELECT DISTINCT ON (i.patient_id)
        i.patient_id,
        o.value_numeric as bmi_value,
        o.observation_datetime
    FROM initial_population i
    JOIN phm_edw.observation o ON i.patient_id = o.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code IN ('39156-5')  -- BMI LOINC code
        AND o.observation_datetime BETWEEN mp.start_date AND mp.end_date
    ORDER BY i.patient_id, o.observation_datetime
),

-- Get alcohol consumption
alcohol_use AS (
    SELECT DISTINCT
        i.patient_id,
        o.value_numeric as alcohol_units
    FROM initial_population i
    JOIN phm_edw.observation o ON i.patient_id = o.patient_id
    WHERE 
        o.observation_code IN ('11331-6')  -- Alcohol use LOINC
        AND o.value_numeric > 2  -- More than 2 units per day
),

-- Historical risk factors (before measurement period)
historical_risk AS (
    SELECT DISTINCT i.patient_id
    FROM initial_population i
    JOIN phm_edw.condition_diagnosis cd ON i.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        cd.onset_date < mp.start_date
        AND c.condition_code IN (
            'M81.0',  -- Osteoporosis
            'M89.9',  -- Osteopenia
            'Z98.84', -- Bariatric surgery
            'Z80.51'  -- Family history of hip fracture
        )
),

-- Current risk factors during measurement period
current_risk AS (
    SELECT DISTINCT i.patient_id 
    FROM initial_population i
    JOIN phm_edw.condition_diagnosis cd ON i.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        cd.onset_date BETWEEN mp.start_date - INTERVAL '90 days' AND mp.end_date
        AND c.condition_code IN (
            'M05%',     -- Rheumatoid arthritis
            'E05%',     -- Hyperthyroidism
            'E10%',     -- Type 1 diabetes
            'N18.6',    -- End stage renal disease
            'Q78.0',    -- Osteogenesis imperfecta
            'M45%',     -- Ankylosing spondylitis
            'L40.5%',   -- Psoriatic arthritis
            'Q79.6',    -- Ehlers-Danlos syndrome
            'E24%',     -- Cushing's syndrome
            'E21%',     -- Hyperparathyroidism
            'Q87.4',    -- Marfan syndrome
            'M32%',     -- Lupus
            'C90.0%',   -- Multiple myeloma
            'E28.3',    -- Primary ovarian failure
            'F50%',     -- Eating disorders
            'N91.1',    -- Secondary amenorrhea
            'Z94%'      -- Organ transplant
        )
),

-- Get glucocorticoid use >= 90 days
steroid_use AS (
    SELECT DISTINCT i.patient_id
    FROM initial_population i
    JOIN phm_edw.medication_order mo ON i.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE 
        m.medication_code IN (
            -- Add glucocorticoid RxNorm codes
            '8640',  -- Prednisone
            '8738'   -- Methylprednisolone
        )
        AND mo.end_datetime - mo.start_datetime >= INTERVAL '90 days'
),

-- DXA orders during measurement period
dxa_orders AS (
    SELECT DISTINCT
        i.patient_id,
        pp.procedure_datetime as order_date
    FROM initial_population i
    JOIN phm_edw.procedure_performed pp ON i.patient_id = pp.patient_id
    JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
    CROSS JOIN measurement_period mp
    WHERE 
        p.procedure_code IN ('77080', '77081', '77085')  -- DXA CPT codes
        AND pp.procedure_datetime BETWEEN mp.start_date AND mp.end_date
),

-- Get risk assessment scores
risk_scores AS (
    SELECT DISTINCT
        i.patient_id,
        o.observation_code,
        o.value_numeric
    FROM initial_population i
    JOIN dxa_orders d ON i.patient_id = d.patient_id
    JOIN phm_edw.observation o ON i.patient_id = o.patient_id
    WHERE 
        o.observation_datetime <= d.order_date
        AND (
            (o.observation_code = 'FRAX_SCORE' AND o.value_numeric >= 8.4) OR
            (o.observation_code = 'ORAI_SCORE' AND o.value_numeric >= 9) OR
            (o.observation_code = 'OSIRIS_SCORE' AND o.value_numeric < 1) OR
            (o.observation_code = 'OST_SCORE' AND o.value_numeric < 2)
        )
),

-- Final measure calculation
measure_calc AS (
    SELECT 
        i.patient_id,
        i.age_at_start,
        -- Denominator exclusions
        CASE WHEN 
            b.bmi_value <= 20
            OR a.patient_id IS NOT NULL  -- Alcohol use > 2 units/day
            OR h.patient_id IS NOT NULL  -- Historical risk factors
            OR c.patient_id IS NOT NULL  -- Current risk factors
            OR s.patient_id IS NOT NULL  -- Steroid use >= 90 days
        THEN 0 ELSE 1 END as denominator,
        -- Numerator (DXA ordered)
        CASE WHEN d.patient_id IS NOT NULL THEN 1 ELSE 0 END as numerator,
        -- Numerator exclusions (risk assessment scores)
        CASE WHEN r.patient_id IS NOT NULL THEN 1 ELSE 0 END as numerator_exclusion
    FROM initial_population i
    LEFT JOIN first_bmi b ON i.patient_id = b.patient_id
    LEFT JOIN alcohol_use a ON i.patient_id = a.patient_id
    LEFT JOIN historical_risk h ON i.patient_id = h.patient_id
    LEFT JOIN current_risk c ON i.patient_id = c.patient_id
    LEFT JOIN steroid_use s ON i.patient_id = s.patient_id
    LEFT JOIN dxa_orders d ON i.patient_id = d.patient_id
    LEFT JOIN risk_scores r ON i.patient_id = r.patient_id
)

-- Output results
SELECT 
    'Overall' as population,
    COUNT(*) as initial_population,
    SUM(denominator) as denominator_after_exclusions,
    SUM(CASE WHEN denominator = 1 AND numerator = 1 THEN 1 ELSE 0 END) as numerator_before_exclusions,
    SUM(CASE WHEN denominator = 1 AND numerator = 1 AND numerator_exclusion = 0 THEN 1 ELSE 0 END) as numerator_after_exclusions,
    ROUND(
        CAST(SUM(CASE WHEN denominator = 1 AND numerator = 1 AND numerator_exclusion = 0 THEN 1 ELSE 0 END) AS DECIMAL) / 
        NULLIF(SUM(denominator), 0) * 100,
        1
    ) as performance_rate
FROM measure_calc;