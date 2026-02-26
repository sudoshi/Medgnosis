-- =====================================================================
-- 021b_demo_quality_billing_patch.sql
-- Fix: billing_claim (no org_id), medication_order (no sig/quantity/days_supply),
--      care_plan + PRO (remove diagnosis_status = 'ACTIVE' filter — NULL in Synthea)
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────
-- PART E (retry): Billing Claims — set-based with corrected columns
-- billing_claim has no org_id column
-- ─────────────────────────────────────────────────────────────────
WITH candidate_encounters AS (
    SELECT
        e.encounter_id, e.patient_id, e.encounter_datetime, e.encounter_type,
        pic.payer_id,
        ROW_NUMBER() OVER (ORDER BY e.encounter_id)::INT AS rn
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    LEFT JOIN phm_edw.patient_insurance_coverage pic ON pic.patient_id = p.patient_id
        AND pic.effective_start_date <= e.encounter_datetime::DATE
        AND (pic.effective_end_date IS NULL OR pic.effective_end_date >= e.encounter_datetime::DATE)
    WHERE p.pcp_provider_id = 2816
      AND e.encounter_datetime >= '2024-01-01'
      AND e.encounter_datetime < CURRENT_DATE
      AND e.active_ind = 'Y'
      AND e.encounter_type IN ('ambulatory','wellness','outpatient')
    ORDER BY e.encounter_id
    LIMIT 600
),
inserted_claims AS (
    INSERT INTO phm_edw.billing_claim (
        patient_id, encounter_id, provider_id, payer_id,
        submission_date, service_date, claim_status,
        total_charges, allowed_amount, paid_amount, patient_responsibility,
        claim_type, active_ind
    )
    SELECT
        ce.patient_id, ce.encounter_id, 2816, ce.payer_id,
        ce.encounter_datetime::DATE + INTERVAL '3 days',
        ce.encounter_datetime::DATE,
        CASE ce.rn % 6 WHEN 0 THEN 'Denied' WHEN 1 THEN 'Pending' ELSE 'Paid' END,
        CASE ce.encounter_type
            WHEN 'wellness' THEN 350.00
            ELSE ROUND((150 + (ce.encounter_id % 200))::NUMERIC, 2)
        END,
        CASE ce.encounter_type
            WHEN 'wellness' THEN 280.00
            ELSE ROUND((120 + (ce.encounter_id % 150))::NUMERIC, 2)
        END,
        CASE WHEN ce.rn % 6 IN (0,1) THEN 0
             ELSE ROUND((110 + (ce.encounter_id % 130))::NUMERIC, 2) END,
        CASE WHEN ce.rn % 6 IN (0,1) THEN 0 ELSE 25.00 END,
        CASE ce.encounter_type WHEN 'wellness' THEN 'preventive' ELSE 'professional' END,
        'Y'
    FROM candidate_encounters ce
    WHERE NOT EXISTS (
        SELECT 1 FROM phm_edw.billing_claim bc WHERE bc.encounter_id = ce.encounter_id
    )
    RETURNING claim_id, patient_id, encounter_id
)
INSERT INTO phm_edw.billing_line_item (
    claim_id, cpt_code, cpt_description,
    units, charge_amount, allowed_amount, paid_amount,
    icd10_pointer_1, line_status, active_ind
)
SELECT
    ic.claim_id,
    CASE ce.encounter_type
        WHEN 'wellness' THEN 'G0439'
        ELSE CASE ce.rn % 3
            WHEN 0 THEN '99213' WHEN 1 THEN '99214' ELSE '99215'
        END
    END,
    CASE ce.encounter_type
        WHEN 'wellness' THEN 'Annual Wellness Visit'
        ELSE CASE ce.rn % 3
            WHEN 0 THEN 'Established Patient Office Visit — Low Complexity'
            WHEN 1 THEN 'Established Patient Office Visit — Moderate Complexity'
            ELSE        'Established Patient Office Visit — High Complexity'
        END
    END,
    1,
    CASE ce.encounter_type WHEN 'wellness' THEN 350.00 ELSE ROUND((150 + ce.encounter_id % 200)::NUMERIC, 2) END,
    CASE ce.encounter_type WHEN 'wellness' THEN 280.00 ELSE ROUND((120 + ce.encounter_id % 150)::NUMERIC, 2) END,
    CASE WHEN ce.rn % 6 IN (0,1) THEN 0 ELSE ROUND((110 + ce.encounter_id % 130)::NUMERIC, 2) END,
    CASE ce.encounter_type
        WHEN 'wellness' THEN 'Z00.00'
        ELSE CASE ce.rn % 7
            WHEN 0 THEN 'E11.65' WHEN 1 THEN 'I10' WHEN 2 THEN 'N18.3'
            WHEN 3 THEN 'I50.9'  WHEN 4 THEN 'J44.1' WHEN 5 THEN 'E78.5'
            ELSE 'Z71.89'
        END
    END,
    CASE ce.rn % 6 WHEN 0 THEN 'Denied' WHEN 1 THEN 'Pending' ELSE 'Paid' END,
    'Y'
FROM inserted_claims ic
JOIN candidate_encounters ce ON ce.encounter_id = ic.encounter_id;

DO $$ BEGIN RAISE NOTICE 'Billing claims + line items inserted'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART F (retry): E-Prescriptions — fixed medication_order columns
-- medication_order has: dosage (not sig), refill_count (not refills)
-- No quantity_dispensed or days_supply columns — use literals
-- ─────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.e_prescription (
    medication_order_id, patient_id, prescriber_id, pharmacy_id,
    drug_name, sig, quantity, days_supply, refills_authorized,
    is_controlled, transmission_status, sent_datetime, filled_datetime
)
SELECT
    mo.medication_order_id,
    mo.patient_id,
    2816,
    (SELECT pharmacy_id FROM phm_edw.pharmacy WHERE pharmacy_name ILIKE '%CVS%' LIMIT 1),
    m.medication_name,
    COALESCE(mo.dosage, 'Take as directed'),
    '30',
    30,
    COALESCE(mo.refill_count, 0),
    CASE WHEN m.medication_name ILIKE '%codeine%' OR m.medication_name ILIKE '%opioid%'
              OR m.medication_name ILIKE '%benzo%' OR m.medication_name ILIKE '%amphet%'
         THEN TRUE ELSE FALSE END,
    'Filled',
    mo.start_datetime + INTERVAL '1 hour',
    mo.start_datetime + INTERVAL '4 hours'
FROM phm_edw.medication_order mo
JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
JOIN phm_edw.patient p ON mo.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816
  AND mo.prescription_status = 'Active'
  AND mo.start_datetime >= '2024-01-01'
  AND NOT EXISTS (SELECT 1 FROM phm_edw.e_prescription ex WHERE ex.medication_order_id = mo.medication_order_id)
ORDER BY mo.medication_order_id
LIMIT 400;

DO $$ BEGIN RAISE NOTICE 'E-prescriptions inserted'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART H (retry): Care Plans — removed diagnosis_status filter
-- Synthea data has NULL diagnosis_status — filter removed
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_prov_id INT := 2816;
    rec       RECORD;
    v_plan_id INT;
BEGIN
    FOR rec IN
        SELECT DISTINCT ON (p.patient_id)
               p.patient_id, p.first_name, p.last_name,
               c.condition_name,
               ROW_NUMBER() OVER (ORDER BY p.patient_id)::INT AS rn
        FROM phm_edw.patient p
        JOIN phm_edw.condition_diagnosis cd ON cd.patient_id = p.patient_id
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE p.pcp_provider_id = v_prov_id AND p.active_ind = 'Y'
          AND (
              c.condition_name ILIKE '%diabetes mellitus type 2%'
              OR c.condition_name ILIKE '%heart failure%'
              OR c.condition_name ILIKE '%chronic kidney disease%'
              OR c.condition_name ILIKE '%chronic obstructive%'
          )
          AND NOT EXISTS (SELECT 1 FROM phm_edw.care_plan cp WHERE cp.patient_id = p.patient_id)
        ORDER BY p.patient_id
        LIMIT 40
    LOOP
        INSERT INTO phm_edw.care_plan (
            patient_id, provider_id,
            plan_name, plan_type, status,
            effective_date, review_date,
            goals, barriers, notes, active_ind
        ) VALUES (
            rec.patient_id, v_prov_id,
            FORMAT('Chronic Disease Care Plan — %s %s', rec.first_name, rec.last_name),
            'chronic_disease',
            CASE rec.rn % 3
                WHEN 0 THEN 'Active'
                WHEN 1 THEN 'Active'
                ELSE        'Under Review'
            END,
            CURRENT_DATE - ((rec.rn * 7) || ' days')::INTERVAL,
            CURRENT_DATE + ((90 - rec.rn % 60) || ' days')::INTERVAL,
            CASE
                WHEN rec.condition_name ILIKE '%diabetes%'    THEN 'Achieve HbA1c < 7.0% within 6 months. Medication adherence >90%. Regular follow-up visits.'
                WHEN rec.condition_name ILIKE '%heart failure%' THEN 'Maintain stable volume status, prevent rehospitalization. Daily weight monitoring. Low sodium diet.'
                WHEN rec.condition_name ILIKE '%kidney%'      THEN 'Slow CKD progression, maintain eGFR > 30. BP control. Nephrology co-management.'
                ELSE 'Reduce exacerbation frequency, improve FEV1. Inhaler technique optimization. Smoking cessation.'
            END,
            CASE rec.rn % 4
                WHEN 0 THEN 'Financial barriers to medication adherence'
                WHEN 1 THEN 'Limited health literacy'
                WHEN 2 THEN 'Transportation challenges to appointments'
                ELSE        'Complex polypharmacy'
            END,
            'Comprehensive care plan coordinated with care team. Annual review scheduled.',
            'Y'
        ) RETURNING care_plan_id INTO v_plan_id;

        INSERT INTO phm_edw.care_plan_item (
            care_plan_id, patient_id, item_category, description,
            frequency, due_date, status, ordinal, active_ind
        ) VALUES
        (v_plan_id, rec.patient_id, 'lab',
         'HbA1c Monitoring: Quarterly per ADA guidelines.',
         'quarterly', CURRENT_DATE + INTERVAL '90 days', 'Pending', 1, 'Y'),
        (v_plan_id, rec.patient_id, 'education',
         'Self-Management Education: Complete disease-specific DSMES/self-management program.',
         'one-time', CURRENT_DATE + INTERVAL '30 days', 'Pending', 2, 'Y'),
        (v_plan_id, rec.patient_id, 'referral',
         'Specialist Follow-Up: Annual specialist follow-up per condition-specific guidelines.',
         'annual', CURRENT_DATE + INTERVAL '180 days', 'Pending', 3, 'Y');
    END LOOP;

    RAISE NOTICE 'Care plans inserted: %', (SELECT COUNT(*) FROM phm_edw.care_plan WHERE provider_id = v_prov_id);
END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART I (retry): Patient Reported Outcomes — removed diagnosis_status filter
-- ─────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.patient_reported_outcome (
    patient_id, encounter_id,
    instrument_name, instrument_version,
    total_score, score_interpretation,
    responses, notes
)
SELECT
    p.patient_id,
    last_enc.encounter_id,
    CASE (p.patient_id % 2) WHEN 0 THEN 'PHQ-9' ELSE 'GAD-7' END,
    '1.0',
    CASE (p.patient_id % 2)
        WHEN 0 THEN (p.patient_id % 18)::SMALLINT
        ELSE        (p.patient_id % 14)::SMALLINT
    END,
    CASE (p.patient_id % 2)
        WHEN 0 THEN CASE (p.patient_id % 18)
            WHEN 0 THEN 'None'    WHEN 1 THEN 'None'    WHEN 2 THEN 'None'
            WHEN 3 THEN 'None'    WHEN 4 THEN 'None'    WHEN 5 THEN 'Mild'
            WHEN 6 THEN 'Mild'    WHEN 7 THEN 'Mild'    WHEN 8 THEN 'Mild'
            WHEN 9 THEN 'Mild'    WHEN 10 THEN 'Moderate' WHEN 11 THEN 'Moderate'
            WHEN 12 THEN 'Moderate' WHEN 13 THEN 'Moderate' WHEN 14 THEN 'Moderate'
            ELSE 'Moderately Severe'
        END
        ELSE CASE (p.patient_id % 14)
            WHEN 0 THEN 'None'    WHEN 1 THEN 'None'    WHEN 2 THEN 'None'
            WHEN 3 THEN 'None'    WHEN 4 THEN 'None'    WHEN 5 THEN 'Mild'
            WHEN 6 THEN 'Mild'    WHEN 7 THEN 'Mild'    WHEN 8 THEN 'Mild'
            WHEN 9 THEN 'Mild'    WHEN 10 THEN 'Moderate' WHEN 11 THEN 'Moderate'
            WHEN 12 THEN 'Moderate'
            ELSE 'Severe'
        END
    END,
    NULL,
    FORMAT('Administered at visit %s days ago.', (p.patient_id % 60))
FROM phm_edw.patient p
JOIN phm_edw.condition_diagnosis cd ON cd.patient_id = p.patient_id
JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
CROSS JOIN LATERAL (
    SELECT encounter_id FROM phm_edw.encounter
    WHERE patient_id = p.patient_id AND active_ind = 'Y'
    ORDER BY encounter_datetime DESC LIMIT 1
) last_enc
WHERE p.pcp_provider_id = 2816 AND p.active_ind = 'Y'
  AND (c.condition_name ILIKE '%depress%' OR c.condition_name ILIKE '%anxiety%')
  AND NOT EXISTS (
      SELECT 1 FROM phm_edw.patient_reported_outcome pro
      WHERE pro.patient_id = p.patient_id
  )
ORDER BY p.patient_id
LIMIT 120;

DO $$ BEGIN RAISE NOTICE 'PROs inserted'; END $$;

-- Validation
SELECT COUNT(*) AS billing_claims  FROM phm_edw.billing_claim  WHERE provider_id = 2816;
SELECT COUNT(*) AS billing_lines   FROM phm_edw.billing_line_item bli
    JOIN phm_edw.billing_claim bc ON bli.claim_id = bc.claim_id WHERE bc.provider_id = 2816;
SELECT COUNT(*) AS e_rx            FROM phm_edw.e_prescription   WHERE prescriber_id = 2816;
SELECT COUNT(*) AS care_plans      FROM phm_edw.care_plan         WHERE provider_id = 2816;
SELECT COUNT(*) AS pro_scores      FROM phm_edw.patient_reported_outcome;
