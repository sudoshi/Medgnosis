-- CMS349v6: HIV Screening
-- Using the Inmon-style EDW schema (phm_edw)

-- Common date parameters for measurement period
WITH measurement_period AS (
  SELECT 
    '2024-01-01'::date as period_start,
    '2024-12-31'::date as period_end
),

-- Initial Population: Patients 15-65 with eligible encounter
initial_population AS (
  SELECT DISTINCT 
    p.patient_id
  FROM phm_edw.patient p
  JOIN measurement_period mp ON true
  JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
  WHERE 
    -- Age 15-65 at start of measurement period
    EXTRACT(YEAR FROM age(mp.period_start, p.date_of_birth)) BETWEEN 15 AND 65
    -- Eligible outpatient encounter during measurement period
    AND e.encounter_type = 'OUTPATIENT'
    AND e.encounter_datetime BETWEEN mp.period_start AND mp.period_end
    AND e.active_ind = 'Y'
    AND p.active_ind = 'Y'
),

-- Denominator Exclusions: Prior HIV diagnosis
denominator_exclusions AS (
  SELECT DISTINCT 
    cd.patient_id
  FROM phm_edw.condition_diagnosis cd
  JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  JOIN measurement_period mp ON true
  WHERE 
    -- HIV diagnosis codes (using ICD-10)
    c.condition_code LIKE 'B20%' -- HIV disease
    OR c.condition_code = 'Z21' -- Asymptomatic HIV
    -- Prior to measurement period
    AND cd.onset_date < mp.period_start
    AND cd.active_ind = 'Y'
),

-- Numerator: HIV test performed
numerator AS (
  SELECT DISTINCT 
    o.patient_id
  FROM phm_edw.observation o
  JOIN phm_edw.patient p ON o.patient_id = p.patient_id
  WHERE 
    -- HIV test LOINC codes
    o.observation_code IN (
      '75622-1',    -- HIV 1+2 Ag+Ab panel
      '92371-5',    -- HIV 1+2 Ab rapid
      '18126-9'     -- HIV 1 Ag+Ab
    )
    -- Test performed between ages 15-65
    AND o.observation_datetime >= p.date_of_birth + INTERVAL '15 years'
    AND o.observation_datetime <= p.date_of_birth + INTERVAL '66 years'
    AND o.active_ind = 'Y'
),

-- Denominator Exceptions: Deceased patients
denominator_exceptions AS (
  SELECT DISTINCT 
    cd.patient_id
  FROM phm_edw.condition_diagnosis cd
  JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  JOIN measurement_period mp ON true
  WHERE 
    -- Deceased status
    c.condition_code = 'Z76.82'  -- Awaiting organ transplant status
    AND cd.onset_date <= mp.period_end
    AND cd.active_ind = 'Y'
)

-- Final measure calculation
SELECT 
  COUNT(DISTINCT n.patient_id)::FLOAT / 
  NULLIF(
    COUNT(DISTINCT 
      CASE WHEN p.patient_id NOT IN (
        SELECT patient_id FROM denominator_exclusions
        UNION
        SELECT patient_id FROM denominator_exceptions
      ) THEN p.patient_id END
    ), 0
  ) * 100 as performance_rate,
  COUNT(DISTINCT p.patient_id) as initial_population,
  COUNT(DISTINCT CASE WHEN p.patient_id NOT IN 
    (SELECT patient_id FROM denominator_exclusions) 
    THEN p.patient_id END) as denominator,
  COUNT(DISTINCT n.patient_id) as numerator,
  COUNT(DISTINCT CASE WHEN p.patient_id IN 
    (SELECT patient_id FROM denominator_exclusions)
    THEN p.patient_id END) as denominator_exclusions,
  COUNT(DISTINCT CASE WHEN p.patient_id IN 
    (SELECT patient_id FROM denominator_exceptions)
    THEN p.patient_id END) as denominator_exceptions
FROM initial_population p
LEFT JOIN numerator n ON p.patient_id = n.patient_id;
