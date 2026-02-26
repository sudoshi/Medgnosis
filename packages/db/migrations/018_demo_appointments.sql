-- =====================================================================
-- 018_demo_appointments.sql
-- Phase: Demo Account — Appointments
-- Generates historical appointments (linked to encounters) + future schedule
-- + today's 16-patient demo schedule
-- =====================================================================

DO $$
DECLARE
    v_clinic_org_id INT;
    v_prov_id       INT := 2816;
    v_today         DATE := CURRENT_DATE;
    rec             RECORD;
    v_resource_id   INT;
    v_appt_id       INT;
    -- Today's demo patients (selected from panel for story-driven demo)
    v_patients      INT[];
    v_pat_id        INT;
    v_slot_time     TIME;
    i               INT;
BEGIN
    SELECT org_id INTO v_clinic_org_id FROM phm_edw.organization
    WHERE organization_name = 'Medgnosis Primary Care Associates' LIMIT 1;

    SELECT resource_id INTO v_resource_id FROM phm_edw.clinic_resource
    WHERE resource_name = 'Exam Room 1' AND org_id = v_clinic_org_id LIMIT 1;

    -- ─────────────────────────────────────────────────────────────────
    -- PART A: Historical appointments — link to existing completed encounters (2023+)
    -- ─────────────────────────────────────────────────────────────────
    FOR rec IN
        SELECT e.encounter_id, e.patient_id, e.encounter_datetime, e.encounter_type
        FROM phm_edw.encounter e
        JOIN phm_edw.patient p ON e.patient_id = p.patient_id
        WHERE p.pcp_provider_id = v_prov_id
          AND e.encounter_datetime >= '2023-01-01'
          AND e.encounter_datetime < v_today
          AND e.active_ind = 'Y'
          AND e.encounter_type IN ('ambulatory', 'wellness', 'outpatient', 'urgentcare', 'virtual')
        ORDER BY e.encounter_id
    LOOP
        IF NOT EXISTS (SELECT 1 FROM phm_edw.appointment WHERE encounter_id = rec.encounter_id) THEN
            INSERT INTO phm_edw.appointment (
                patient_id, provider_id, org_id, encounter_id, resource_id,
                appointment_date, start_time, end_time,
                appointment_type, status,
                check_in_time, visit_start_time, visit_end_time,
                is_telehealth
            ) VALUES (
                rec.patient_id, v_prov_id, v_clinic_org_id, rec.encounter_id,
                v_resource_id,
                rec.encounter_datetime::DATE,
                rec.encounter_datetime::TIME,
                (rec.encounter_datetime + INTERVAL '30 minutes')::TIME,
                CASE rec.encounter_type
                    WHEN 'wellness'    THEN 'annual_wellness'
                    WHEN 'urgentcare'  THEN 'urgent'
                    WHEN 'virtual'     THEN 'telehealth'
                    ELSE 'office_visit'
                END,
                'Completed',
                rec.encounter_datetime - INTERVAL '15 minutes',
                rec.encounter_datetime,
                rec.encounter_datetime + INTERVAL '28 minutes',
                rec.encounter_type = 'virtual'
            );
        END IF;
    END LOOP;

    -- ─────────────────────────────────────────────────────────────────
    -- PART B: Future appointments — next 30 days (excluding today)
    -- Select ~80 patients for future appointments
    -- ─────────────────────────────────────────────────────────────────
    FOR rec IN
        SELECT p.patient_id,
               p.first_name, p.last_name,
               -- Schedule offset: 1–30 days from today
               v_today + (((ROW_NUMBER() OVER (ORDER BY p.patient_id) - 1) % 20 + 1))::INT AS appt_date,
               CASE (ROW_NUMBER() OVER (ORDER BY p.patient_id) % 7)
                   WHEN 0 THEN 'telehealth'
                   WHEN 1 THEN 'annual_wellness'
                   WHEN 2 THEN 'urgent'
                   ELSE        'office_visit'
               END AS appt_type,
               -- AM slots: 8:00, 8:30, 9:00, ... 11:30 (8 slots)
               -- PM slots: 1:00, 1:30, ... 4:30 (8 slots)
               CASE ((ROW_NUMBER() OVER (ORDER BY p.patient_id) - 1) % 16)
                   WHEN 0  THEN TIME '08:00'
                   WHEN 1  THEN TIME '08:30'
                   WHEN 2  THEN TIME '09:00'
                   WHEN 3  THEN TIME '09:30'
                   WHEN 4  THEN TIME '10:00'
                   WHEN 5  THEN TIME '10:30'
                   WHEN 6  THEN TIME '11:00'
                   WHEN 7  THEN TIME '11:30'
                   WHEN 8  THEN TIME '13:00'
                   WHEN 9  THEN TIME '13:30'
                   WHEN 10 THEN TIME '14:00'
                   WHEN 11 THEN TIME '14:30'
                   WHEN 12 THEN TIME '15:00'
                   WHEN 13 THEN TIME '15:30'
                   WHEN 14 THEN TIME '16:00'
                   ELSE        TIME '16:30'
               END AS slot_time
        FROM phm_edw.patient p
        WHERE p.pcp_provider_id = v_prov_id
          AND p.active_ind = 'Y'
        ORDER BY p.patient_id
        LIMIT 80
    LOOP
        INSERT INTO phm_edw.appointment (
            patient_id, provider_id, org_id, resource_id,
            appointment_date, start_time, end_time,
            appointment_type, status, is_telehealth,
            chief_complaint
        ) VALUES (
            rec.patient_id, v_prov_id, v_clinic_org_id, v_resource_id,
            rec.appt_date, rec.slot_time, rec.slot_time + INTERVAL '30 minutes',
            rec.appt_type,
            CASE
                WHEN rec.appt_date = v_today + 1 THEN 'Confirmed'
                ELSE 'Scheduled'
            END,
            rec.appt_type = 'telehealth',
            CASE rec.appt_type
                WHEN 'annual_wellness' THEN 'Annual wellness visit'
                WHEN 'telehealth'      THEN 'Telehealth follow-up — medication management'
                WHEN 'urgent'          THEN 'Urgent visit — acute complaint'
                ELSE                        'Chronic disease follow-up'
            END
        )
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- ─────────────────────────────────────────────────────────────────
    -- PART C: TODAY'S DEMO SCHEDULE — 16 specific patients
    -- Carefully chosen to demonstrate platform features
    -- ─────────────────────────────────────────────────────────────────

    -- Select 16 patients with specific clinical profiles for the demo
    -- Slot times: 08:00–11:30 (AM, 8 slots) and 13:00–16:30 (PM, 8 slots)
    i := 0;
    FOR rec IN
        WITH ranked_patients AS (
            SELECT DISTINCT ON (profile.profile_label)
                p.patient_id,
                p.first_name,
                p.last_name,
                profile.profile_label,
                profile.appt_type,
                profile.chief_complaint,
                profile.slot_rank
            FROM phm_edw.patient p
            JOIN phm_edw.condition_diagnosis cd ON cd.patient_id = p.patient_id
            JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
            CROSS JOIN LATERAL (
                SELECT label, atype, cc, sr FROM (VALUES
                    -- 1: DM2 + CKD complex patient
                    ('dm_ckd',         'office_visit', 'Diabetes and kidney disease follow-up', 1),
                    -- 2: New patient chest pain
                    ('chest_pain',     'urgent',       'New patient — chest pain evaluation', 2),
                    -- 3: Depression/anxiety
                    ('mdd',            'office_visit', 'Depression follow-up — PHQ-9 review', 3),
                    -- 4: COPD exacerbation follow-up
                    ('copd',           'office_visit', 'COPD exacerbation follow-up', 4),
                    -- 5: Heart failure monitoring
                    ('hf',             'office_visit', 'Heart failure management — weight gain', 5),
                    -- 6: Telehealth med refill
                    ('telehealth',     'telehealth',   'Telehealth — medication refill', 6),
                    -- 7: Annual wellness
                    ('wellness',       'annual_wellness','Annual wellness visit', 7),
                    -- 8: Hypertension
                    ('htn',            'office_visit', 'Hypertension follow-up — BP management', 8),
                    -- 9: CKD monitoring
                    ('ckd',            'office_visit', 'CKD Stage 3 — quarterly monitoring', 9),
                    -- 10: Elderly multi-morbid
                    ('elderly',        'office_visit', 'Complex elderly — polypharmacy review', 10),
                    -- 11: Hyperlipidemia
                    ('lipid',          'office_visit', 'Hyperlipidemia — statin therapy follow-up', 11),
                    -- 12: Anxiety
                    ('anxiety',        'office_visit', 'Anxiety disorder — GAD-7 assessment', 12),
                    -- 13: Obesity
                    ('obesity',        'office_visit', 'Weight management — GLP-1 review', 13),
                    -- 14: Hypothyroid
                    ('hypo',           'office_visit', 'Hypothyroidism — TSH recheck', 14),
                    -- 15: Post-referral follow-up
                    ('referral',       'office_visit', 'Post-cardiology follow-up', 15),
                    -- 16: Urgent same-day
                    ('urgent',         'urgent',       'Same-day urgent — fever and fatigue', 16)
                ) AS t(label, atype, cc, sr)
            ) profile(profile_label, appt_type, chief_complaint, slot_rank)
            WHERE p.pcp_provider_id = v_prov_id
              AND p.active_ind = 'Y'
              -- Profile-specific patient filter
              AND CASE profile.profile_label
                    WHEN 'dm_ckd'    THEN c.condition_name ILIKE '%diabetes mellitus type 2%'
                    WHEN 'mdd'       THEN c.condition_name ILIKE '%depress%'
                    WHEN 'copd'      THEN c.condition_name ILIKE '%copd%'
                    WHEN 'hf'        THEN c.condition_name ILIKE '%heart failure%'
                    WHEN 'htn'       THEN c.condition_name ILIKE '%hypertension%'
                    WHEN 'ckd'       THEN c.condition_name ILIKE '%chronic kidney disease%'
                    WHEN 'lipid'     THEN c.condition_name ILIKE '%hyperlipidemia%'
                    WHEN 'anxiety'   THEN c.condition_name ILIKE '%anxiety%'
                    WHEN 'obesity'   THEN c.condition_name ILIKE '%obesity%'
                    WHEN 'hypo'      THEN c.condition_name ILIKE '%hypothyroid%'
                    WHEN 'elderly'   THEN DATE_PART('year', AGE(p.date_of_birth)) > 72
                    ELSE TRUE
                  END
              -- No existing appointment today
              AND NOT EXISTS (
                  SELECT 1 FROM phm_edw.appointment a
                  WHERE a.patient_id = p.patient_id AND a.appointment_date = v_today
              )
            ORDER BY profile.profile_label, p.patient_id
        )
        SELECT * FROM ranked_patients ORDER BY slot_rank
    LOOP
        i := i + 1;
        -- Assign time slot
        v_slot_time := CASE i
            WHEN 1  THEN TIME '08:00'
            WHEN 2  THEN TIME '08:30'
            WHEN 3  THEN TIME '09:00'
            WHEN 4  THEN TIME '09:30'
            WHEN 5  THEN TIME '10:00'
            WHEN 6  THEN TIME '10:30'
            WHEN 7  THEN TIME '11:00'
            WHEN 8  THEN TIME '11:30'
            WHEN 9  THEN TIME '13:00'
            WHEN 10 THEN TIME '13:30'
            WHEN 11 THEN TIME '14:00'
            WHEN 12 THEN TIME '14:30'
            WHEN 13 THEN TIME '15:00'
            WHEN 14 THEN TIME '15:30'
            WHEN 15 THEN TIME '16:00'
            ELSE        TIME '16:30'
        END;

        INSERT INTO phm_edw.appointment (
            patient_id, provider_id, org_id, resource_id,
            appointment_date, start_time, end_time,
            appointment_type, status,
            chief_complaint, is_telehealth
        ) VALUES (
            rec.patient_id, v_prov_id, v_clinic_org_id, v_resource_id,
            v_today, v_slot_time, v_slot_time + INTERVAL '30 minutes',
            rec.appt_type,
            CASE WHEN i <= 2 THEN 'Checked-In' ELSE 'Confirmed' END,
            rec.chief_complaint,
            rec.appt_type = 'telehealth'
        )
        ON CONFLICT DO NOTHING
        RETURNING appointment_id INTO v_appt_id;
    END LOOP;

    RAISE NOTICE 'Today''s schedule slots created: %', i;

    -- ─────────────────────────────────────────────────────────────────
    -- PART D: Patient check-in records for today's first 2 patients
    -- ─────────────────────────────────────────────────────────────────
    FOR rec IN
        SELECT a.appointment_id, a.patient_id
        FROM phm_edw.appointment a
        WHERE a.appointment_date = v_today
          AND a.provider_id = v_prov_id
          AND a.status = 'Checked-In'
        ORDER BY a.start_time
        LIMIT 2
    LOOP
        INSERT INTO phm_edw.patient_check_in (
            appointment_id, patient_id, check_in_method,
            copay_amount, copay_collected, insurance_verified, id_verified
        ) VALUES (
            rec.appointment_id, rec.patient_id, 'kiosk',
            25.00, TRUE, TRUE, TRUE
        ) ON CONFLICT DO NOTHING;
    END LOOP;

    RAISE NOTICE 'Appointments migration complete';
END $$;

-- Quick validation
SELECT
    COUNT(*) FILTER (WHERE a.appointment_date < CURRENT_DATE) AS historical,
    COUNT(*) FILTER (WHERE a.appointment_date = CURRENT_DATE) AS today,
    COUNT(*) FILTER (WHERE a.appointment_date > CURRENT_DATE) AS future
FROM phm_edw.appointment a
JOIN phm_edw.patient p ON a.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816;
