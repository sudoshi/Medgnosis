-- CMS56v12: Functional Status Assessment for Total Hip Replacement
-- Using the Inmon-style EDW schema (phm_edw)

-- Common date parameters for measurement period
WITH measurement_period AS (
  SELECT 
    '2024-01-01'::date as period_start,
    '2024-12-31'::date as period_end,
    '2023-11-01'::date as initial_procedure_start, -- November 2 years prior
    '2023-10-31'::date as initial_procedure_end,   -- October prior year
    '2023-11-01'::date as encounter_period_start   -- November prior year
),

-- Initial Population: Patients 19+ with primary THA
initial_population AS (
  SELECT DISTINCT 
    p.patient_id,
    pp.procedure_datetime as surgery_date,
    pr.provider_id as surgeon_id
  FROM phm_edw.patient p
  JOIN measurement_period mp ON true
  -- THA Procedure
  JOIN phm_edw.procedure_performed pp ON p.patient_id = pp.patient_id
  JOIN phm_edw.procedure pr ON pp.procedure_id = pr.procedure_id
  -- Outpatient encounter
  JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
  WHERE 
    -- Age 19+ at start of measurement period
    EXTRACT(YEAR FROM age(mp.period_start, p.date_of_birth)) >= 19
    -- Primary THA procedure
    AND pr.procedure_code IN ('27130') -- CPT code for primary total hip arthroplasty
    AND pp.procedure_datetime BETWEEN mp.initial_procedure_start AND mp.initial_procedure_end
    -- Outpatient encounter
    AND e.encounter_type = 'OUTPATIENT'
    AND e.encounter_datetime BETWEEN mp.encounter_period_start AND mp.period_end
    AND e.active_ind = 'Y'
    AND p.active_ind = 'Y'
    AND pp.active_ind = 'Y'
),

-- Denominator Exclusions
denominator_exclusions AS (
  SELECT DISTINCT i.patient_id
  FROM initial_population i
  LEFT JOIN phm_edw.condition_diagnosis cd ON i.patient_id = cd.patient_id
  LEFT JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  LEFT JOIN phm_edw.procedure_performed pp ON i.patient_id = pp.patient_id
  LEFT JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
  WHERE 
    -- Hospice care
    (c.condition_code = 'Z51.5' AND cd.active_ind = 'Y')
    -- Severe cognitive impairment
    OR (c.condition_code LIKE 'F0%' AND cd.active_ind = 'Y')
    -- Lower body fractures within 24 hours
    OR (c.condition_code LIKE 'S7%' 
        AND cd.onset_date BETWEEN i.surgery_date - INTERVAL '24 hours' AND i.surgery_date)
    -- Partial hip procedure same day
    OR (p.procedure_code = '27125' 
        AND pp.procedure_datetime::date = i.surgery_date::date)
    -- Revision procedures same day
    OR (p.procedure_code IN ('27134', '27137', '27138') 
        AND pp.procedure_datetime::date = i.surgery_date::date)
    -- Malignant neoplasm
    OR (c.condition_code LIKE 'C4%' 
        AND cd.diagnosis_status = 'ACTIVE' 
        AND cd.active_ind = 'Y')
    -- Second THA within 1 year
    OR EXISTS (
      SELECT 1 
      FROM phm_edw.procedure_performed pp2
      JOIN phm_edw.procedure p2 ON pp2.procedure_id = p2.procedure_id
      WHERE pp2.patient_id = i.patient_id
      AND p2.procedure_code = '27130'
      AND pp2.procedure_datetime BETWEEN i.surgery_date - INTERVAL '1 year' 
          AND i.surgery_date + INTERVAL '1 year'
      AND pp2.procedure_datetime != i.surgery_date
    )
),

-- Numerator: Functional status assessments
numerator AS (
  SELECT DISTINCT i.patient_id
  FROM initial_population i
  -- Pre-surgery assessment
  JOIN phm_edw.observation o_pre ON i.patient_id = o_pre.patient_id
  -- Post-surgery assessment
  JOIN phm_edw.observation o_post ON i.patient_id = o_post.patient_id
  WHERE 
    -- Pre-surgery assessment (90 days prior or day of)
    o_pre.observation_code IN (
      'HOOS',
      'HOOS_JR',
      'PROMIS10',
      'VR12_OBLIQUE',
      'VR12_ORTHOGONAL'
    )
    AND o_pre.observation_datetime BETWEEN i.surgery_date - INTERVAL '90 days' AND i.surgery_date
    AND o_pre.active_ind = 'Y'
    -- Post-surgery assessment (300-425 days after)
    AND o_post.observation_code = o_pre.observation_code -- Same tool
    AND o_post.observation_datetime BETWEEN i.surgery_date + INTERVAL '300 days' 
        AND i.surgery_date + INTERVAL '425 days'
    AND o_post.active_ind = 'Y'
)

-- Final measure calculation
SELECT 
  COUNT(DISTINCT n.patient_id)::FLOAT / 
  NULLIF(COUNT(DISTINCT 
    CASE WHEN i.patient_id NOT IN (
      SELECT patient_id FROM denominator_exclusions
    ) THEN i.patient_id END
  ), 0) * 100 as performance_rate,
  COUNT(DISTINCT i.patient_id) as initial_population,
  COUNT(DISTINCT CASE WHEN i.patient_id NOT IN 
    (SELECT patient_id FROM denominator_exclusions) 
    THEN i.patient_id END) as denominator,
  COUNT(DISTINCT n.patient_id) as numerator,
  COUNT(DISTINCT CASE WHEN i.patient_id IN 
    (SELECT patient_id FROM denominator_exclusions)
    THEN i.patient_id END) as denominator_exclusions
FROM initial_population i
LEFT JOIN numerator n ON i.patient_id = n.patient_id;
