-- =====================================================================
-- 021_demo_quality_billing.sql
-- Phase: Demo Account — Quality Scores, Billing, Care Plans, PROs
-- Set-based approach (no slow loops except small care plan loop)
-- Column names verified against actual schema
-- =====================================================================

DO $$
DECLARE
    v_prov_id    INT := 2816;
    v_org_id     INT;
    v_period_id  INT;
    v_pharm_id   INT;
    v_team_id    INT;
    v_team_mem_id INT;
    rec          RECORD;
    v_plan_id    INT;
BEGIN
    SELECT org_id INTO v_org_id FROM phm_edw.organization
    WHERE organization_name = 'Medgnosis Primary Care Associates' LIMIT 1;

    SELECT pharmacy_id INTO v_pharm_id FROM phm_edw.pharmacy
    WHERE pharmacy_name ILIKE '%CVS%' LIMIT 1;

    SELECT care_team_id INTO v_team_id FROM phm_edw.care_team
    WHERE lead_provider_id = v_prov_id LIMIT 1;

    SELECT member_id INTO v_team_mem_id FROM phm_edw.care_team_member
    WHERE care_team_id = v_team_id AND is_lead = FALSE LIMIT 1;

    -- ─────────────────────────────────────────────────────────────────
    -- PART A: Quality Reporting Periods
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.quality_reporting_period
        (period_name, period_type, start_date, end_date, reporting_year, reporting_quarter, program)
    VALUES
        ('CY2024',    'annual',    '2024-01-01', '2024-12-31', 2024, NULL, 'MIPS'),
        ('Q1 2024',   'quarterly', '2024-01-01', '2024-03-31', 2024, 1,    'HEDIS'),
        ('Q2 2024',   'quarterly', '2024-04-01', '2024-06-30', 2024, 2,    'HEDIS'),
        ('Q3 2024',   'quarterly', '2024-07-01', '2024-09-30', 2024, 3,    'HEDIS'),
        ('Q4 2024',   'quarterly', '2024-10-01', '2024-12-31', 2024, 4,    'HEDIS'),
        ('CY2025',    'annual',    '2025-01-01', '2025-12-31', 2025, NULL, 'MIPS'),
        ('Q1 2025',   'quarterly', '2025-01-01', '2025-03-31', 2025, 1,    'HEDIS'),
        ('Q2 2025',   'quarterly', '2025-04-01', '2025-06-30', 2025, 2,    'HEDIS'),
        ('Q3 2025',   'quarterly', '2025-07-01', '2025-09-30', 2025, 3,    'HEDIS'),
        ('Q4 2025',   'quarterly', '2025-10-01', '2025-12-31', 2025, 4,    'HEDIS')
    ON CONFLICT DO NOTHING;

    SELECT period_id INTO v_period_id FROM phm_edw.quality_reporting_period
    WHERE period_name = 'CY2024' LIMIT 1;

    -- ─────────────────────────────────────────────────────────────────
    -- PART B: Quality Scores — per bundle and per measure
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.quality_score (
        provider_id, period_id, bundle_id, measure_id,
        numerator_count, denominator_count, performance_rate,
        performance_score, benchmark_percentile, mips_points_earned
    )
    WITH bundle_patients AS (
        SELECT cb.bundle_id, cb.bundle_code, COUNT(DISTINCT p.patient_id)::INT AS total_patients
        FROM phm_edw.condition_bundle cb
        JOIN phm_edw.condition_diagnosis cd ON TRUE
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        JOIN phm_edw.patient p ON cd.patient_id = p.patient_id
        WHERE p.pcp_provider_id = v_prov_id AND p.active_ind = 'Y'
          AND cd.diagnosis_status = 'ACTIVE'
          AND cb.active_ind = 'Y'
          AND (
              (cb.bundle_code = 'DM'    AND c.condition_name ILIKE '%diabetes mellitus type 2%')
              OR (cb.bundle_code = 'T1D'  AND c.condition_name ILIKE '%diabetes mellitus type 1%')
              OR (cb.bundle_code = 'HTN'  AND c.condition_name ILIKE '%hypertension%')
              OR (cb.bundle_code = 'HF'   AND c.condition_name ILIKE '%heart failure%')
              OR (cb.bundle_code = 'CKD'  AND c.condition_name ILIKE '%chronic kidney disease%')
              OR (cb.bundle_code = 'COPD' AND c.condition_name ILIKE '%chronic obstructive%')
              OR (cb.bundle_code = 'AFIB' AND c.condition_name ILIKE '%atrial fibrillation%')
              OR (cb.bundle_code = 'MDD'  AND c.condition_name ILIKE '%depress%')
              OR (cb.bundle_code = 'LIPID' AND c.condition_name ILIKE '%hyperlipidemia%')
              OR (cb.bundle_code = 'ASTH' AND c.condition_name ILIKE '%asthma%')
              OR (cb.bundle_code = 'OB'   AND c.condition_name ILIKE '%obesity%')
              OR (cb.bundle_code = 'HYPO' AND c.condition_name ILIKE '%hypothyroid%')
          )
        GROUP BY cb.bundle_id, cb.bundle_code
    )
    SELECT
        v_prov_id,
        v_period_id,
        bp.bundle_id,
        NULL::INT,
        bp.total_patients,
        bp.total_patients,
        ROUND((0.55 + (bp.bundle_id % 30) * 0.01)::NUMERIC, 3),
        ROUND((55 + (bp.bundle_id % 30))::NUMERIC, 2),
        (50 + bp.bundle_id % 40)::SMALLINT,
        ROUND((3 + (bp.bundle_id % 8) * 0.5)::NUMERIC, 2)
    FROM bundle_patients bp
    WHERE bp.total_patients > 0
    ON CONFLICT DO NOTHING;

    -- Per-measure quality scores (top 30 measures)
    INSERT INTO phm_edw.quality_score (
        provider_id, period_id, bundle_id, measure_id,
        numerator_count, denominator_count, performance_rate,
        performance_score, benchmark_percentile, mips_points_earned
    )
    SELECT
        v_prov_id,
        v_period_id,
        NULL::INT,
        md.measure_id,
        closed_cnt.cnt,
        GREATEST(1, total_cnt.cnt),
        ROUND((0.50 + (md.measure_id % 35) * 0.01)::NUMERIC, 3),
        ROUND((50 + (md.measure_id % 35))::NUMERIC, 2),
        (45 + md.measure_id % 50)::SMALLINT,
        ROUND((3.5 + (md.measure_id % 6) * 0.5)::NUMERIC, 2)
    FROM phm_edw.measure_definition md
    CROSS JOIN LATERAL (
        SELECT COUNT(*)::INT AS cnt FROM phm_edw.care_gap cg
        JOIN phm_edw.patient p ON cg.patient_id = p.patient_id
        WHERE cg.measure_id = md.measure_id AND cg.gap_status = 'closed'
          AND p.pcp_provider_id = v_prov_id
    ) closed_cnt
    CROSS JOIN LATERAL (
        SELECT COUNT(*)::INT AS cnt FROM phm_edw.care_gap cg
        JOIN phm_edw.patient p ON cg.patient_id = p.patient_id
        WHERE cg.measure_id = md.measure_id AND p.pcp_provider_id = v_prov_id
    ) total_cnt
    WHERE md.active_ind = 'Y'
    LIMIT 30
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Part B: Quality scores seeded';

    -- ─────────────────────────────────────────────────────────────────
    -- PART C: CMS Benchmarks for top 20 measures
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.cms_benchmark (
        measure_id, reporting_year, program,
        benchmark_type, pct_25, pct_50, pct_75, pct_90, mean_rate, top_performer_rate
    )
    SELECT
        md.measure_id,
        2024, 'MIPS', 'national',
        ROUND((0.45 + (md.measure_id % 20) * 0.01)::NUMERIC, 3),
        ROUND((0.58 + (md.measure_id % 20) * 0.01)::NUMERIC, 3),
        ROUND((0.70 + (md.measure_id % 15) * 0.01)::NUMERIC, 3),
        ROUND((0.82 + (md.measure_id % 10) * 0.01)::NUMERIC, 3),
        ROUND((0.62 + (md.measure_id % 15) * 0.01)::NUMERIC, 3),
        ROUND((0.90 + (md.measure_id % 8)  * 0.01)::NUMERIC, 3)
    FROM phm_edw.measure_definition md
    WHERE md.active_ind = 'Y'
    LIMIT 20
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Part C: CMS benchmarks seeded';

    -- ─────────────────────────────────────────────────────────────────
    -- PART D: Provider Incentive for 2024
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.provider_incentive (
        provider_id, period_id, incentive_type,
        base_compensation, incentive_potential, incentive_earned,
        performance_rate, payment_date, notes
    ) VALUES (
        v_prov_id, v_period_id, 'mips_adjustment',
        285000.00, 28500.00, 21375.00,
        0.750,
        '2025-03-15',
        'MIPS 2024 performance adjustment. Final score 78.2 (75th percentile). Positive payment adjustment.'
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Part D: Provider incentive seeded';

END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART E: Billing Claims — set-based (with CTE for line items)
-- Correct column names: submission_date, total_charges, allowed_amount, paid_amount
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
        patient_id, encounter_id, provider_id, org_id, payer_id,
        submission_date, service_date, claim_status,
        total_charges, allowed_amount, paid_amount, patient_responsibility,
        claim_type, active_ind
    )
    SELECT
        ce.patient_id, ce.encounter_id, 2816,
        (SELECT org_id FROM phm_edw.organization WHERE organization_name = 'Medgnosis Primary Care Associates' LIMIT 1),
        ce.payer_id,
        ce.encounter_datetime::DATE + INTERVAL '3 days',
        ce.encounter_datetime::DATE,
        CASE ce.rn % 6
            WHEN 0 THEN 'Denied'
            WHEN 1 THEN 'Pending'
            ELSE        'Paid'
        END,
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
            WHEN 0 THEN '99213'
            WHEN 1 THEN '99214'
            ELSE        '99215'
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

DO $$ BEGIN RAISE NOTICE 'Part E: Billing claims and line items seeded'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART F: E-Prescriptions — link medication orders to pharmacy
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
    COALESCE(mo.sig, 'Take as directed'),
    COALESCE(mo.quantity_dispensed::TEXT, '30'),
    COALESCE(mo.days_supply, 30),
    COALESCE(mo.refills, 0),
    CASE WHEN m.medication_name ILIKE '%codeine%' OR m.medication_name ILIKE '%opioid%'
              OR m.medication_name ILIKE '%benzo%' OR m.medication_name ILIKE '%amphet%'
         THEN TRUE ELSE FALSE END,
    'Filled',
    mo.order_datetime + INTERVAL '1 hour',
    mo.order_datetime + INTERVAL '4 hours'
FROM phm_edw.medication_order mo
JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
JOIN phm_edw.patient p ON mo.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816
  AND mo.prescription_status = 'Active'
  AND mo.order_datetime >= '2024-01-01'
  AND NOT EXISTS (SELECT 1 FROM phm_edw.e_prescription ex WHERE ex.medication_order_id = mo.medication_order_id)
ORDER BY mo.medication_order_id
LIMIT 400;

DO $$ BEGIN RAISE NOTICE 'Part F: E-prescriptions seeded'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART G: Refill Requests — 12 pending portal refills
-- ─────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.refill_request (
    patient_id, medication_order_id, pharmacy_id, drug_name,
    requested_datetime, request_source, request_status, provider_id
)
SELECT
    mo.patient_id, mo.medication_order_id,
    (SELECT pharmacy_id FROM phm_edw.pharmacy WHERE pharmacy_name ILIKE '%CVS%' LIMIT 1),
    m.medication_name,
    NOW() - ((ROW_NUMBER() OVER (ORDER BY mo.medication_order_id) * 3) || ' hours')::INTERVAL,
    CASE ROW_NUMBER() OVER (ORDER BY mo.medication_order_id) % 3
        WHEN 0 THEN 'portal'
        WHEN 1 THEN 'phone'
        ELSE        'pharmacy'
    END,
    CASE ROW_NUMBER() OVER (ORDER BY mo.medication_order_id) % 4
        WHEN 0 THEN 'Approved'
        WHEN 1 THEN 'Completed'
        ELSE        'Pending'
    END,
    2816
FROM phm_edw.medication_order mo
JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
JOIN phm_edw.patient p ON mo.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816 AND mo.prescription_status = 'Active'
ORDER BY mo.medication_order_id DESC
LIMIT 12;

DO $$ BEGIN RAISE NOTICE 'Part G: Refill requests seeded'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART H: Care Plans — complex patients (small loop, RETURNING needed)
-- care_plan columns: patient_id, provider_id, plan_name, plan_type,
--   status, effective_date, review_date, goals, barriers, notes
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_prov_id    INT := 2816;
    v_team_id    INT;
    rec          RECORD;
    v_plan_id    INT;
BEGIN
    SELECT care_team_id INTO v_team_id FROM phm_edw.care_team
    WHERE lead_provider_id = v_prov_id LIMIT 1;

    FOR rec IN
        SELECT DISTINCT ON (p.patient_id)
               p.patient_id, p.first_name, p.last_name,
               c.condition_name,
               ROW_NUMBER() OVER (ORDER BY p.patient_id)::INT AS rn
        FROM phm_edw.patient p
        JOIN phm_edw.condition_diagnosis cd ON cd.patient_id = p.patient_id
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE p.pcp_provider_id = v_prov_id AND p.active_ind = 'Y'
          AND cd.diagnosis_status = 'ACTIVE'
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
                WHEN rec.condition_name ILIKE '%diabetes%' THEN 'Achieve HbA1c < 7.0% within 6 months. Medication adherence >90%. Regular follow-up visits.'
                WHEN rec.condition_name ILIKE '%heart failure%' THEN 'Maintain stable volume status, prevent rehospitalization. Daily weight monitoring. Low sodium diet.'
                WHEN rec.condition_name ILIKE '%kidney%' THEN 'Slow CKD progression, maintain eGFR > 30. BP control. Nephrology co-management.'
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

        -- Add care plan items (item columns: care_plan_id, patient_id, item_category, description, frequency, due_date, status, ordinal)
        INSERT INTO phm_edw.care_plan_item (
            care_plan_id, patient_id, item_category, description,
            frequency, due_date, status, ordinal, active_ind
        )
        VALUES
        (v_plan_id, rec.patient_id, 'lab',
         'HbA1c Monitoring: Quarterly per ADA guidelines.',
         'quarterly', CURRENT_DATE + INTERVAL '90 days', 'Pending', 1, 'Y'),
        (v_plan_id, rec.patient_id, 'education',
         'Diabetes Self-Management Education: Complete DSMES program — carbohydrate counting and glucose monitoring.',
         'one-time', CURRENT_DATE + INTERVAL '30 days', 'Pending', 2, 'Y'),
        (v_plan_id, rec.patient_id, 'referral',
         'Specialist Follow-Up: Annual specialist follow-up per condition-specific guidelines.',
         'annual', CURRENT_DATE + INTERVAL '180 days', 'Pending', 3, 'Y');
    END LOOP;

    RAISE NOTICE 'Part H: Care plans seeded';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART I: Patient Reported Outcomes — PHQ-9 and GAD-7
-- Columns: patient_id, encounter_id, instrument_name, instrument_version,
--          total_score, score_interpretation, responses, notes
-- (No provider_id, no score_date, no active_ind column)
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
            WHEN 0 THEN 'None'  WHEN 1 THEN 'None'  WHEN 2 THEN 'None'
            WHEN 3 THEN 'None'  WHEN 4 THEN 'None'  WHEN 5 THEN 'Mild'
            WHEN 6 THEN 'Mild'  WHEN 7 THEN 'Mild'  WHEN 8 THEN 'Mild'
            WHEN 9 THEN 'Mild'  WHEN 10 THEN 'Moderate' WHEN 11 THEN 'Moderate'
            WHEN 12 THEN 'Moderate' WHEN 13 THEN 'Moderate' WHEN 14 THEN 'Moderate'
            ELSE 'Moderately Severe'
        END
        ELSE CASE (p.patient_id % 14)
            WHEN 0 THEN 'None'  WHEN 1 THEN 'None'  WHEN 2 THEN 'None'
            WHEN 3 THEN 'None'  WHEN 4 THEN 'None'  WHEN 5 THEN 'Mild'
            WHEN 6 THEN 'Mild'  WHEN 7 THEN 'Mild'  WHEN 8 THEN 'Mild'
            WHEN 9 THEN 'Mild'  WHEN 10 THEN 'Moderate' WHEN 11 THEN 'Moderate'
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
  AND cd.diagnosis_status = 'ACTIVE'
  AND (c.condition_name ILIKE '%depress%' OR c.condition_name ILIKE '%anxiety%')
  AND NOT EXISTS (
      SELECT 1 FROM phm_edw.patient_reported_outcome pro
      WHERE pro.patient_id = p.patient_id
  )
ORDER BY p.patient_id
LIMIT 120;

DO $$ BEGIN RAISE NOTICE 'Part I: PROs seeded (PHQ-9 and GAD-7)'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART J: Care Team Tasks — 20 active tasks (set-based)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.care_team_task (
    care_team_id, patient_id, assigned_to_member, created_by_provider,
    task_title, task_description, task_category, priority,
    due_date, task_status, active_ind
)
SELECT
    (SELECT care_team_id FROM phm_edw.care_team WHERE lead_provider_id = 2816 LIMIT 1),
    p.patient_id,
    (SELECT member_id FROM phm_edw.care_team_member
     WHERE care_team_id = (SELECT care_team_id FROM phm_edw.care_team WHERE lead_provider_id = 2816 LIMIT 1)
       AND is_lead = FALSE LIMIT 1),
    2816,
    CASE rn % 5
        WHEN 0 THEN 'Outreach: Schedule overdue HbA1c'
        WHEN 1 THEN 'Prior authorization: GLP-1 medication'
        WHEN 2 THEN 'Care gap closure: Annual eye exam referral'
        WHEN 3 THEN 'Patient education: Hypertension management'
        ELSE        'Follow-up: Lab results pending review'
    END,
    CASE rn % 5
        WHEN 0 THEN 'Patient has not had HbA1c in >6 months. Call and schedule.'
        WHEN 1 THEN 'Insurance prior auth required for semaglutide. Submit PA request.'
        WHEN 2 THEN 'Annual diabetic eye exam overdue. Refer to ophthalmology.'
        WHEN 3 THEN 'Provide patient educational materials on DASH diet and sodium restriction.'
        ELSE        'Lab results from last visit pending provider sign-off.'
    END,
    CASE rn % 5
        WHEN 1 THEN 'prior_auth'
        WHEN 2 THEN 'care_coordination'
        WHEN 3 THEN 'care_coordination'
        ELSE        'clinical'
    END,
    CASE rn % 4
        WHEN 0 THEN 'urgent'
        WHEN 1 THEN 'high'
        ELSE        'normal'
    END,
    CURRENT_DATE + ((rn % 14) || ' days')::INTERVAL,
    CASE rn % 3
        WHEN 0 THEN 'In Progress'
        ELSE        'To-Do'
    END,
    'Y'
FROM (
    SELECT p.patient_id,
           ROW_NUMBER() OVER (ORDER BY p.patient_id DESC)::INT AS rn
    FROM phm_edw.patient p
    WHERE p.pcp_provider_id = 2816 AND p.active_ind = 'Y'
    ORDER BY p.patient_id DESC
    LIMIT 20
) p;

DO $$ BEGIN RAISE NOTICE 'Part J: Care team tasks seeded'; END $$;

-- Validation
SELECT COUNT(*) AS reporting_periods FROM phm_edw.quality_reporting_period;
SELECT COUNT(*) AS quality_scores FROM phm_edw.quality_score WHERE provider_id = 2816;
SELECT COUNT(*) AS billing_claims FROM phm_edw.billing_claim WHERE provider_id = 2816;
SELECT COUNT(*) AS care_plans FROM phm_edw.care_plan WHERE provider_id = 2816;
SELECT COUNT(*) AS pro_scores FROM phm_edw.patient_reported_outcome;
SELECT COUNT(*) AS e_rx FROM phm_edw.e_prescription WHERE prescriber_id = 2816;
SELECT COUNT(*) AS tasks FROM phm_edw.care_team_task WHERE created_by_provider = 2816;
