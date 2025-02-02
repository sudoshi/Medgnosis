-- CMS347v7: Statin Therapy for Prevention and Treatment of Cardiovascular Disease
-- Using the Inmon-style EDW schema (phm_edw)

-- Common date parameters for measurement period
WITH measurement_period AS (
  SELECT 
    '2024-01-01'::date as period_start,
    '2024-12-31'::date as period_end
),

-- Initial Population 1: Patients with ASCVD
initial_pop_1 AS (
  SELECT DISTINCT p.patient_id
  FROM phm_edw.patient p
  JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
  JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  WHERE 
    -- Active ASCVD diagnosis
    c.condition_code LIKE 'I%' -- ICD-10 codes for ASCVD
    AND cd.diagnosis_status = 'ACTIVE'
    AND cd.active_ind = 'Y'
    AND p.active_ind = 'Y'
),

-- Denominator Exclusions (common across all populations)
denominator_exclusions AS (
  SELECT DISTINCT cd.patient_id
  FROM phm_edw.condition_diagnosis cd
  JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  JOIN measurement_period mp ON true
  WHERE
    -- Breastfeeding
    (c.condition_code IN ('Z39.1') -- ICD-10 code for breastfeeding
    AND cd.diagnosis_status = 'ACTIVE'
    AND cd.active_ind = 'Y')
    OR
    -- Rhabdomyolysis
    (c.condition_code IN ('M62.82') -- ICD-10 code for rhabdomyolysis
    AND cd.diagnosis_status = 'ACTIVE'
    AND cd.active_ind = 'Y')
),

-- Initial Population 2: Patients with LDL >= 190 or familial hypercholesterolemia
initial_pop_2 AS (
  SELECT DISTINCT p.patient_id
  FROM phm_edw.patient p
  JOIN measurement_period mp ON true
  LEFT JOIN phm_edw.observation o ON p.patient_id = o.patient_id
  LEFT JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
  JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  WHERE 
    -- Age 20-75 during measurement period
    EXTRACT(YEAR FROM age(mp.period_start, p.date_of_birth)) BETWEEN 20 AND 75
    AND (
      -- LDL >= 190
      (o.observation_code = '13457-7' -- LOINC code for LDL-C
      AND o.value_numeric >= 190)
      OR
      -- Familial hypercholesterolemia diagnosis
      (c.condition_code = 'E78.01' -- ICD-10 code for familial hypercholesterolemia
      AND cd.diagnosis_status = 'ACTIVE'
      AND cd.active_ind = 'Y')
    )
    AND p.active_ind = 'Y'
),

-- Initial Population 3: Diabetic patients aged 40-75
initial_pop_3 AS (
  SELECT DISTINCT p.patient_id
  FROM phm_edw.patient p
  JOIN measurement_period mp ON true
  JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
  JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  WHERE
    -- Age 40-75 during measurement period
    EXTRACT(YEAR FROM age(mp.period_start, p.date_of_birth)) BETWEEN 40 AND 75
    -- Diabetes diagnosis
    AND c.condition_code IN ('E10%', 'E11%') -- ICD-10 codes for Type 1 and Type 2 diabetes
    AND cd.diagnosis_status = 'ACTIVE'
    AND cd.active_ind = 'Y'
    AND p.active_ind = 'Y'
),

-- Initial Population 4: Patients aged 40-75 with ASCVD risk score >= 20%
initial_pop_4 AS (
  SELECT DISTINCT p.patient_id
  FROM phm_edw.patient p
  JOIN measurement_period mp ON true
  JOIN phm_edw.observation o ON p.patient_id = o.patient_id
  WHERE
    -- Age 40-75 during measurement period
    EXTRACT(YEAR FROM age(mp.period_start, p.date_of_birth)) BETWEEN 40 AND 75
    -- ASCVD risk score >= 20%
    AND o.observation_code = '79423-0' -- LOINC code for ASCVD risk score
    AND o.value_numeric >= 20
    AND p.active_ind = 'Y'
),

-- Numerator: Patients on statin therapy
numerator AS (
  SELECT DISTINCT p.patient_id
  FROM phm_edw.patient p
  JOIN measurement_period mp ON true
  LEFT JOIN phm_edw.medication_order mo ON p.patient_id = mo.patient_id
  JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
  WHERE
    -- Active statin medication
    m.medication_code LIKE 'C10AA%' -- ATC code for statins
    AND mo.prescription_status = 'ACTIVE'
    AND mo.active_ind = 'Y'
    AND (
      mo.start_datetime <= mp.period_end
      AND (mo.end_datetime IS NULL OR mo.end_datetime > mp.period_start)
    )
),

-- Denominator Exceptions
denominator_exceptions AS (
  SELECT DISTINCT cd.patient_id
  FROM phm_edw.condition_diagnosis cd
  JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  JOIN measurement_period mp ON true
  WHERE
    -- Hepatitis A, B, liver disease
    (c.condition_code LIKE 'B15%' -- Hep A
    OR c.condition_code LIKE 'B16%' -- Hep B
    OR c.condition_code LIKE 'K7%') -- Liver disease
    AND cd.diagnosis_status = 'ACTIVE'
    AND cd.active_ind = 'Y'
    -- Add ESRD, palliative care, and statin allergy conditions
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
  ) * 100 as performance_rate
FROM (
  SELECT patient_id FROM initial_pop_1
  UNION
  SELECT patient_id FROM initial_pop_2
  UNION
  SELECT patient_id FROM initial_pop_3
  UNION
  SELECT patient_id FROM initial_pop_4
) p
LEFT JOIN numerator n ON p.patient_id = n.patient_id;
