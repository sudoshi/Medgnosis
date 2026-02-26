-- =====================================================================
-- 019_demo_orders_referrals.sql
-- Phase: Demo Account — Clinical Orders, Referrals, Consult Notes, E-Rx
-- =====================================================================

DO $$
DECLARE
    v_prov_id    INT := 2816;
    v_clinic_org INT;
    rec          RECORD;
    v_order_id   INT;
    v_spec_id    INT;
    v_ref_id     INT;
    v_pharm_id   INT;
    v_ord_set_id INT;
    v_basket_count INT := 0;
BEGIN
    SELECT org_id INTO v_clinic_org FROM phm_edw.organization
    WHERE organization_name = 'Medgnosis Primary Care Associates' LIMIT 1;

    -- ─────────────────────────────────────────────────────────────────
    -- PART A: Pharmacies (local pharmacies for e-prescriptions)
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.pharmacy (pharmacy_name, ncpdp_id, address, city, state, zip, phone, pharmacy_type)
    VALUES
        ('CVS Pharmacy #4521',         'CVS4521', '1420 Blossom Hill Rd',    'San Jose',     'CA', '95118', '(408) 555-3001', 'retail'),
        ('Walgreens #8802',            'WAG8802', '2500 Stevens Creek Blvd', 'San Jose',     'CA', '95128', '(408) 555-3002', 'retail'),
        ('Kaiser Permanente Pharmacy', 'KP1234',  '6600 Camden Ave',         'San Jose',     'CA', '95120', '(408) 555-3003', 'hospital'),
        ('Costco Pharmacy #674',       'CC0674',  '900 Blossom Hill Rd',     'San Jose',     'CA', '95123', '(408) 555-3004', 'retail'),
        ('Medgnosis Specialty Rx',     'MGSPX1',  '2200 Medical Center Dr',  'San Jose',     'CA', '95128', '(408) 555-3005', 'specialty')
    ON CONFLICT DO NOTHING;

    SELECT pharmacy_id INTO v_pharm_id FROM phm_edw.pharmacy WHERE pharmacy_name = 'CVS Pharmacy #4521' LIMIT 1;

    -- ─────────────────────────────────────────────────────────────────
    -- PART B: Clinical Orders — Lab, Imaging, Referral, Procedure
    -- Generate ~3,000 orders from encounters 2023+
    -- ─────────────────────────────────────────────────────────────────
    FOR rec IN
        SELECT e.encounter_id, e.patient_id, e.encounter_datetime,
               e.encounter_type,
               (e.patient_id + e.encounter_id) % 10 AS order_variant
        FROM phm_edw.encounter e
        JOIN phm_edw.patient p ON e.patient_id = p.patient_id
        WHERE p.pcp_provider_id = v_prov_id
          AND e.encounter_datetime >= '2023-01-01'
          AND e.encounter_datetime < CURRENT_DATE
          AND e.active_ind = 'Y'
          AND e.encounter_type IN ('ambulatory','wellness','outpatient')
          AND NOT EXISTS (
              SELECT 1 FROM phm_edw.clinical_order co
              WHERE co.encounter_id = e.encounter_id AND co.order_type = 'lab'
          )
        ORDER BY e.encounter_id
        LIMIT 2500
    LOOP
        -- Always add a primary lab order for this encounter
        INSERT INTO phm_edw.clinical_order (
            patient_id, encounter_id, ordering_provider_id,
            order_type, order_name, loinc_code, cpt_code,
            priority, order_datetime, order_status, fasting_required
        ) VALUES (
            rec.patient_id, rec.encounter_id, v_prov_id,
            'lab',
            CASE rec.order_variant % 6
                WHEN 0 THEN 'HbA1c'
                WHEN 1 THEN 'Comprehensive Metabolic Panel'
                WHEN 2 THEN 'Lipid Panel'
                WHEN 3 THEN 'CBC'
                WHEN 4 THEN 'TSH'
                ELSE        'BMP + Creatinine'
            END,
            CASE rec.order_variant % 6
                WHEN 0 THEN '4548-4'
                WHEN 1 THEN '24323-8'
                WHEN 2 THEN '24331-1'
                WHEN 3 THEN '58410-2'
                WHEN 4 THEN '3016-3'
                ELSE        '24320-4'
            END,
            CASE rec.order_variant % 6
                WHEN 0 THEN '83036'
                WHEN 1 THEN '80053'
                WHEN 2 THEN '80061'
                WHEN 3 THEN '85025'
                WHEN 4 THEN '84443'
                ELSE        '80048'
            END,
            'routine',
            rec.encounter_datetime,
            'Resulted',
            rec.order_variant % 3 = 0
        ) RETURNING order_id INTO v_order_id;

        -- Add order result
        INSERT INTO phm_edw.order_result (
            order_id, patient_id, result_datetime, result_status,
            result_value, result_unit, reference_range, abnormal_flag, critical_flag, performing_lab
        ) VALUES (
            v_order_id, rec.patient_id,
            rec.encounter_datetime + INTERVAL '2 days',
            'Final',
            CASE rec.order_variant % 6
                WHEN 0 THEN ROUND((6.5 + (rec.patient_id % 55) * 0.1)::NUMERIC, 1)::TEXT
                WHEN 1 THEN 'See panel results'
                WHEN 2 THEN ROUND((150 + (rec.patient_id % 100))::NUMERIC, 0)::TEXT
                WHEN 3 THEN 'See CBC differential'
                WHEN 4 THEN ROUND((1.5 + (rec.patient_id % 30) * 0.1)::NUMERIC, 2)::TEXT
                ELSE        ROUND((0.8 + (rec.patient_id % 15) * 0.1)::NUMERIC, 2)::TEXT
            END,
            CASE rec.order_variant % 6
                WHEN 0 THEN '%'
                WHEN 2 THEN 'mg/dL'
                WHEN 4 THEN 'mIU/L'
                ELSE        'mg/dL'
            END,
            CASE rec.order_variant % 6
                WHEN 0 THEN '4.0–5.6%'
                WHEN 2 THEN '<200 mg/dL'
                WHEN 4 THEN '0.4–4.0 mIU/L'
                ELSE        NULL
            END,
            CASE WHEN rec.order_variant % 6 = 0 AND (rec.patient_id % 10) > 6 THEN 'H' ELSE NULL END,
            FALSE,
            'Quest Diagnostics'
        );

        -- Add imaging order for 15% of encounters
        IF rec.order_variant % 7 = 0 THEN
            INSERT INTO phm_edw.clinical_order (
                patient_id, encounter_id, ordering_provider_id,
                order_type, order_name, cpt_code,
                priority, order_datetime, order_status
            ) VALUES (
                rec.patient_id, rec.encounter_id, v_prov_id,
                'imaging',
                CASE rec.order_variant % 3
                    WHEN 0 THEN 'Chest X-ray (PA & Lateral)'
                    WHEN 1 THEN 'DEXA Scan (Bone Density)'
                    ELSE        'Echocardiogram (TTE)'
                END,
                CASE rec.order_variant % 3
                    WHEN 0 THEN '71046'
                    WHEN 1 THEN '77080'
                    ELSE        '93306'
                END,
                'routine',
                rec.encounter_datetime,
                'Completed'
            );
        END IF;
    END LOOP;

    -- ─────────────────────────────────────────────────────────────────
    -- PART C: Pending orders for Order Basket (15–20 unsigned orders)
    -- ─────────────────────────────────────────────────────────────────
    FOR rec IN
        SELECT p.patient_id
        FROM phm_edw.patient p
        WHERE p.pcp_provider_id = v_prov_id AND p.active_ind = 'Y'
        ORDER BY p.patient_id DESC
        LIMIT 18
    LOOP
        INSERT INTO phm_edw.clinical_order (
            patient_id, ordering_provider_id,
            order_type, order_name, loinc_code, cpt_code,
            priority, order_datetime, order_status
        ) VALUES (
            rec.patient_id, v_prov_id,
            CASE v_basket_count % 3
                WHEN 0 THEN 'lab'
                WHEN 1 THEN 'imaging'
                ELSE        'referral'
            END,
            CASE v_basket_count % 3
                WHEN 0 THEN 'HbA1c (standing order)'
                WHEN 1 THEN 'Renal Ultrasound'
                ELSE        'Nephrology Referral'
            END,
            CASE v_basket_count % 3 WHEN 0 THEN '4548-4' ELSE NULL END,
            CASE v_basket_count % 3
                WHEN 0 THEN '83036'
                WHEN 1 THEN '76770'
                ELSE        NULL
            END,
            'routine',
            NOW() - INTERVAL '2 hours',
            'Pending'
        ) RETURNING order_id INTO v_order_id;

        INSERT INTO phm_edw.order_basket (
            provider_id, patient_id, order_id, basket_status, added_datetime
        ) VALUES (
            v_prov_id, rec.patient_id, v_order_id, 'Pending', NOW() - INTERVAL '2 hours'
        ) ON CONFLICT DO NOTHING;

        v_basket_count := v_basket_count + 1;
    END LOOP;

    -- ─────────────────────────────────────────────────────────────────
    -- PART D: Specialist Referrals (50–80 referrals across 12 specialties)
    -- ─────────────────────────────────────────────────────────────────
    FOR rec IN
        SELECT p.patient_id,
               (ROW_NUMBER() OVER (ORDER BY p.patient_id)) AS rn
        FROM phm_edw.patient p
        WHERE p.pcp_provider_id = v_prov_id AND p.active_ind = 'Y'
        ORDER BY p.patient_id
        LIMIT 65
    LOOP
        -- Pick a specialist
        SELECT specialist_id INTO v_spec_id
        FROM phm_edw.specialist_directory
        ORDER BY (rec.patient_id * 13 + rec.rn::INT) % 12, specialist_id
        LIMIT 1;

        INSERT INTO phm_edw.referral (
            patient_id, referring_provider_id, specialist_id,
            specialty, referral_reason, urgency,
            referral_date, referral_status,
            scheduled_date, completed_date, report_received_date
        )
        SELECT
            rec.patient_id,
            v_prov_id,
            v_spec_id,
            sd.specialty,
            'Evaluation and management for ' || LOWER(sd.specialty) || ' related condition',
            CASE rec.rn % 5 WHEN 0 THEN 'Urgent' ELSE 'Routine' END,
            CURRENT_DATE - ((rec.rn % 180) || ' days')::INTERVAL,
            CASE rec.rn % 5
                WHEN 0 THEN 'Sent'
                WHEN 1 THEN 'Scheduled'
                WHEN 2 THEN 'Completed'
                WHEN 3 THEN 'Report Received'
                ELSE        'Closed'
            END,
            CASE WHEN rec.rn % 5 IN (1,2,3,4)
                 THEN CURRENT_DATE - ((rec.rn % 120) || ' days')::INTERVAL ELSE NULL END,
            CASE WHEN rec.rn % 5 IN (2,3,4)
                 THEN CURRENT_DATE - ((rec.rn % 60) || ' days')::INTERVAL  ELSE NULL END,
            CASE WHEN rec.rn % 5 IN (3,4)
                 THEN CURRENT_DATE - ((rec.rn % 30) || ' days')::INTERVAL  ELSE NULL END
        FROM phm_edw.specialist_directory sd WHERE sd.specialist_id = v_spec_id
        RETURNING referral_id INTO v_ref_id;

        -- Consult notes for completed referrals
        IF rec.rn % 5 IN (3, 4) AND v_ref_id IS NOT NULL THEN
            INSERT INTO phm_edw.consult_note (
                referral_id, patient_id, specialist_id, note_datetime,
                note_type, summary, findings, recommendations, follow_up_plan
            )
            SELECT
                v_ref_id, rec.patient_id, v_spec_id,
                CURRENT_DATE - ((rec.rn % 25) || ' days')::INTERVAL,
                'initial_consult',
                'Patient seen and evaluated for ' || LOWER(sd.specialty) || ' concerns.',
                'Physical exam and relevant testing performed. Findings consistent with referring diagnosis.',
                'Recommend continuation of current management. Specific adjustments noted in plan.',
                'Follow-up in 3–6 months. Will communicate findings to referring physician.'
            FROM phm_edw.specialist_directory sd WHERE sd.specialist_id = v_spec_id;
        END IF;
    END LOOP;

    -- ─────────────────────────────────────────────────────────────────
    -- PART E: Drug interaction alerts (for patients on warfarin + interactants)
    -- ─────────────────────────────────────────────────────────────────
    FOR rec IN
        SELECT DISTINCT p.patient_id
        FROM phm_edw.patient p
        JOIN phm_edw.medication_order mo ON mo.patient_id = p.patient_id
        JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
        WHERE p.pcp_provider_id = v_prov_id
          AND m.medication_name ILIKE '%warfarin%'
          AND p.active_ind = 'Y'
        LIMIT 8
    LOOP
        INSERT INTO phm_edw.drug_interaction_alert (
            patient_id, drug_1_name, drug_2_name, interaction_type,
            description, clinical_significance, management,
            triggered_datetime
        ) VALUES (
            rec.patient_id,
            'Warfarin',
            CASE rec.patient_id % 3
                WHEN 0 THEN 'Fluconazole'
                WHEN 1 THEN 'Amiodarone'
                ELSE        'Metronidazole'
            END,
            'major',
            'Potential major drug interaction: enhanced anticoagulant effect',
            'This combination may significantly increase INR and bleeding risk',
            'Monitor INR closely. Consider dose adjustment. Avoid combination if possible.',
            NOW() - (rec.patient_id % 30 || ' days')::INTERVAL
        ) ON CONFLICT DO NOTHING;
    END LOOP;

    RAISE NOTICE 'Orders/referrals migration complete. Basket orders: %', v_basket_count;
END $$;

-- Validation
SELECT
    order_type,
    order_status,
    COUNT(*) AS cnt
FROM phm_edw.clinical_order co
JOIN phm_edw.patient p ON co.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816
GROUP BY order_type, order_status
ORDER BY order_type, order_status;
