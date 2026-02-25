-- CMS645v7: Bone Density Evaluation for Prostate Cancer ADT Patients
-- Using the Inmon-style EDW schema (phm_edw)

-- Common date parameters for measurement period
WITH measurement_period AS (
  SELECT 
    '2024-01-01'::date as period_start,
    '2024-12-31'::date as period_end
),

-- Initial Population: Male patients with prostate cancer on ADT
initial_population AS (
  SELECT DISTINCT 
    p.patient_id,
    cd.onset_date as cancer_diagnosis_date,
    mo.start_datetime as adt_start_date
  FROM phm_edw.patient p
  JOIN measurement_period mp ON true
  -- Prostate Cancer Diagnosis
  JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
  JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  -- ADT Therapy
  JOIN phm_edw.medication_order mo ON p.patient_id = mo.patient_id
  JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
  -- Encounter during measurement period
  JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
  WHERE 
    -- Male patients
    p.gender = 'M'
    -- Prostate cancer diagnosis (ICD-10 code)
    AND c.condition_code LIKE 'C61%'
    AND cd.diagnosis_status = 'ACTIVE'
    -- ADT medication
    AND m.medication_code IN (
      'L02AE%',  -- GnRH agonists
      'L02BB%'   -- Anti-androgens
    )
    -- Initial ADT order or active medication
    AND mo.start_datetime >= cd.onset_date
    AND mo.prescription_status = 'ACTIVE'
    -- Treatment intended for >= 12 months
    AND (mo.end_datetime IS NULL OR 
         mo.end_datetime >= mo.start_datetime + INTERVAL '12 months')
    -- Encounter during measurement period
    AND e.encounter_datetime BETWEEN mp.period_start AND mp.period_end
    AND e.active_ind = 'Y'
    AND p.active_ind = 'Y'
    AND cd.active_ind = 'Y'
    AND mo.active_ind = 'Y'
),

-- Numerator: Bone density evaluation
numerator AS (
  SELECT DISTINCT i.patient_id
  FROM initial_population i
  JOIN phm_edw.observation o ON i.patient_id = o.patient_id
  WHERE 
    -- DEXA scan (using LOINC codes)
    o.observation_code IN (
      '38269-7',  -- DXA scan - AP spine
      '38265-5',  -- DXA scan - Left Hip
      '38266-3'   -- DXA scan - Right Hip
    )
    -- Timing: Within 2 years before or 3 months after ADT start
    AND o.observation_datetime BETWEEN 
      i.adt_start_date - INTERVAL '2 years' 
      AND i.adt_start_date + INTERVAL '3 months'
    AND o.active_ind = 'Y'
),

-- Denominator Exceptions: Declined or not performed
denominator_exceptions AS (
  SELECT DISTINCT i.patient_id
  FROM initial_population i
  LEFT JOIN phm_edw.observation o ON i.patient_id = o.patient_id
  WHERE 
    -- Patient declined (using SNOMED codes)
    o.observation_code IN (
      '105480006',  -- Refusal of treatment
      '183944003'   -- Procedure declined
    )
    -- Within the evaluation window
    AND o.observation_datetime BETWEEN 
      i.adt_start_date - INTERVAL '2 years' 
      AND i.adt_start_date + INTERVAL '3 months'
    AND o.active_ind = 'Y'
)

-- Final measure calculation
SELECT 
  COUNT(DISTINCT n.patient_id)::FLOAT / 
  NULLIF(COUNT(DISTINCT 
    CASE WHEN i.patient_id NOT IN (
      SELECT patient_id FROM denominator_exceptions
    ) THEN i.patient_id END
  ), 0) * 100 as performance_rate,
  COUNT(DISTINCT i.patient_id) as initial_population,
  COUNT(DISTINCT CASE WHEN i.patient_id NOT IN 
    (SELECT patient_id FROM denominator_exceptions) 
    THEN i.patient_id END) as denominator,
  COUNT(DISTINCT n.patient_id) as numerator,
  COUNT(DISTINCT CASE WHEN i.patient_id IN 
    (SELECT patient_id FROM denominator_exceptions)
    THEN i.patient_id END) as denominator_exceptions
FROM initial_population i
LEFT JOIN numerator n ON i.patient_id = n.patient_id;

-- Detailed patient-level results for analysis
SELECT 
  p.patient_id,
  p.first_name,
  p.last_name,
  i.cancer_diagnosis_date,
  i.adt_start_date,
  CASE WHEN n.patient_id IS NOT NULL 
    THEN 'Yes' 
    ELSE 'No' 
  END as bone_density_completed,
  CASE WHEN e.patient_id IS NOT NULL 
    THEN 'Yes' 
    ELSE 'No' 
  END as exception_applied
FROM initial_population i
JOIN phm_edw.patient p ON i.patient_id = p.patient_id
LEFT JOIN numerator n ON i.patient_id = n.patient_id
LEFT JOIN denominator_exceptions e ON i.patient_id = e.patient_id
ORDER BY p.last_name, p.first_name;
