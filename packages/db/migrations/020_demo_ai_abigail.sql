-- =====================================================================
-- 020_demo_ai_abigail.sql
-- Phase: Demo Account — AI/Abigail Data
-- Populates: ai_insight, ai_priority_queue, ai_generated_note,
--            differential_diagnosis, notification
-- Set-based (no PL/pgSQL loops) for performance
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────
-- PART A: AI Insights — set-based INSERT
-- Generates care_gap_alert, risk_escalation, coding_suggestion
-- ─────────────────────────────────────────────────────────────────
WITH patient_metrics AS (
    SELECT
        p.patient_id,
        p.first_name,
        p.last_name,
        ROW_NUMBER() OVER (ORDER BY p.patient_id) AS rn,
        COUNT(cg.care_gap_id) FILTER (WHERE cg.gap_status = 'open') AS open_gap_count,
        COALESCE(MAX(e.encounter_datetime::DATE), CURRENT_DATE - 365) AS last_enc_date,
        (CURRENT_DATE - COALESCE(MAX(e.encounter_datetime::DATE), CURRENT_DATE - 365))::INT AS days_ago,
        MAX(e.encounter_id) AS last_enc_id
    FROM phm_edw.patient p
    LEFT JOIN phm_edw.care_gap cg ON cg.patient_id = p.patient_id
    LEFT JOIN phm_edw.encounter e ON e.patient_id = p.patient_id AND e.active_ind = 'Y'
    WHERE p.pcp_provider_id = 2816 AND p.active_ind = 'Y'
    GROUP BY p.patient_id, p.first_name, p.last_name
    ORDER BY COUNT(cg.care_gap_id) FILTER (WHERE cg.gap_status = 'open') DESC,
             (CURRENT_DATE - COALESCE(MAX(e.encounter_datetime::DATE), CURRENT_DATE - 365)) DESC
    LIMIT 80
),
-- Insight type 1: care_gap_alert (patients with 3+ open gaps)
care_gap_insights AS (
    SELECT
        patient_id, last_enc_id, open_gap_count, days_ago,
        'care_gap_alert'::VARCHAR AS insight_type,
        CASE WHEN open_gap_count >= 8 THEN 'critical'
             WHEN open_gap_count >= 5 THEN 'high'
             ELSE 'normal' END AS priority,
        FORMAT('%s open care gaps require attention', open_gap_count) AS title,
        FORMAT('Patient has %s open care gaps across active disease bundles. '
               'Multiple overdue quality measures may affect MIPS performance.',
               open_gap_count) AS description,
        FORMAT('Open gaps: %s. Last seen %s days ago.', open_gap_count, days_ago) AS evidence_summary,
        CASE WHEN open_gap_count >= 5
             THEN 'Schedule urgent care gap closure visit. Prioritize HbA1c, BP control, and preventive screenings.'
             ELSE 'Review and close outstanding care gaps at next scheduled visit.' END AS recommended_action,
        NULL::VARCHAR AS icd10_suggestion,
        ROUND((0.70 + (patient_id % 25) * 0.01)::NUMERIC, 3) AS confidence_score,
        NOW() - ((patient_id % 14 + 1) || ' days')::INTERVAL AS generated_datetime
    FROM patient_metrics
    WHERE open_gap_count >= 3
),
-- Insight type 2: risk_escalation (not seen in 90+ days)
risk_insights AS (
    SELECT
        patient_id, last_enc_id, open_gap_count, days_ago,
        'risk_escalation'::VARCHAR AS insight_type,
        CASE WHEN days_ago >= 180 THEN 'high' ELSE 'normal' END AS priority,
        FORMAT('Patient not seen in %s days', days_ago) AS title,
        FORMAT('Patient with multiple chronic conditions has not been seen in %s days. '
               'Risk of condition deterioration and care gap accumulation is elevated.',
               days_ago) AS description,
        FORMAT('Last visit: %s days ago. Open gaps: %s.', days_ago, open_gap_count) AS evidence_summary,
        'Outreach patient for overdue follow-up visit. '
        'Consider care management enrollment if barriers to access are identified.' AS recommended_action,
        NULL::VARCHAR AS icd10_suggestion,
        ROUND((0.65 + (patient_id % 20) * 0.01)::NUMERIC, 3) AS confidence_score,
        NOW() - ((patient_id % 7 + 1) || ' days')::INTERVAL AS generated_datetime
    FROM patient_metrics
    WHERE days_ago >= 90
),
-- Insight type 3: coding_suggestion (every 3rd patient by rn)
coding_insights AS (
    SELECT
        patient_id, last_enc_id, open_gap_count, days_ago,
        'coding_suggestion'::VARCHAR AS insight_type,
        'normal'::VARCHAR AS priority,
        'Undocumented chronic condition suspected' AS title,
        'Based on recent lab values and medication profile, an additional chronic '
        'condition may be present that is not currently documented in the problem list.' AS description,
        'Lab trends and current medications suggest possible condition not yet formally diagnosed.' AS evidence_summary,
        'Review lab history and medication list. Consider formal diagnosis and documentation '
        'at next encounter to ensure accurate risk adjustment and quality reporting.' AS recommended_action,
        CASE rn % 7
            WHEN 0 THEN 'E11.65'
            WHEN 1 THEN 'I10'
            WHEN 2 THEN 'N18.3'
            WHEN 3 THEN 'E78.5'
            WHEN 4 THEN 'J44.1'
            WHEN 5 THEN 'F32.1'
            ELSE        'E03.9'
        END AS icd10_suggestion,
        ROUND((0.72 + (patient_id % 18) * 0.01)::NUMERIC, 3) AS confidence_score,
        NOW() - ((patient_id % 10) || ' days')::INTERVAL AS generated_datetime
    FROM patient_metrics
    WHERE rn % 3 = 0
),
all_insights AS (
    SELECT * FROM care_gap_insights
    UNION ALL
    SELECT * FROM risk_insights
    UNION ALL
    SELECT * FROM coding_insights
)
INSERT INTO phm_edw.ai_insight (
    patient_id, provider_id, encounter_id,
    insight_type, priority, title, description,
    evidence_summary, recommended_action, icd10_suggestion,
    confidence_score, generated_datetime, active_ind
)
SELECT
    patient_id, 2816, last_enc_id,
    insight_type, priority, title, description,
    evidence_summary, recommended_action, icd10_suggestion,
    confidence_score, generated_datetime, 'Y'
FROM all_insights;

DO $$ BEGIN RAISE NOTICE 'Part A: AI Insights inserted'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART B: AI Priority Queue — Top 50 patients for today
-- ─────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.ai_priority_queue (
    patient_id, provider_id, priority_date, priority_rank,
    priority_score, primary_reason, reason_detail, risk_tier,
    open_care_gaps, critical_labs, last_encounter_days, active_ind
)
WITH patient_gaps AS (
    SELECT patient_id, COUNT(*) AS open_gaps
    FROM phm_edw.care_gap
    WHERE gap_status = 'open'
    GROUP BY patient_id
),
patient_labs AS (
    SELECT co.patient_id, COUNT(*) AS critical_labs
    FROM phm_edw.order_result orr
    JOIN phm_edw.clinical_order co ON co.order_id = orr.order_id
    WHERE orr.abnormal_flag = 'H'
      AND orr.result_datetime >= NOW() - INTERVAL '30 days'
    GROUP BY co.patient_id
),
patient_enc AS (
    SELECT patient_id,
           (CURRENT_DATE - MAX(encounter_datetime::DATE))::INT AS days_ago
    FROM phm_edw.encounter
    WHERE active_ind = 'Y'
    GROUP BY patient_id
),
scored AS (
    SELECT
        p.patient_id,
        COALESCE(pg.open_gaps, 0) AS open_gaps,
        COALESCE(pl.critical_labs, 0) AS critical_labs,
        COALESCE(pe.days_ago, 999) AS days_ago,
        LEAST(100,
            COALESCE(pg.open_gaps, 0) * 8
            + COALESCE(pl.critical_labs, 0) * 15
            + CASE WHEN COALESCE(pe.days_ago, 999) > 180 THEN 20
                   WHEN COALESCE(pe.days_ago, 999) > 90  THEN 10
                   ELSE 0 END
            + (p.patient_id % 20)
        )::NUMERIC AS priority_score,
        CASE
            WHEN COALESCE(pl.critical_labs, 0) > 0      THEN 'critical_lab'
            WHEN COALESCE(pg.open_gaps, 0) >= 8         THEN 'overdue_care_gap'
            WHEN COALESCE(pe.days_ago, 999) > 180       THEN 'high_risk_score'
            WHEN COALESCE(pg.open_gaps, 0) >= 5         THEN 'overdue_care_gap'
            ELSE                                              'documentation_opportunity'
        END AS primary_reason
    FROM phm_edw.patient p
    LEFT JOIN patient_gaps pg ON pg.patient_id = p.patient_id
    LEFT JOIN patient_labs pl ON pl.patient_id = p.patient_id
    LEFT JOIN patient_enc pe ON pe.patient_id = p.patient_id
    WHERE p.pcp_provider_id = 2816 AND p.active_ind = 'Y'
    ORDER BY priority_score DESC
    LIMIT 50
)
SELECT
    patient_id,
    2816,
    CURRENT_DATE,
    ROW_NUMBER() OVER (ORDER BY priority_score DESC)::SMALLINT,
    ROUND(priority_score, 2),
    primary_reason,
    FORMAT('%s open gaps, %s critical labs, last seen %s days ago',
           open_gaps, critical_labs, days_ago),
    CASE
        WHEN priority_score >= 80 THEN 'Critical'
        WHEN priority_score >= 60 THEN 'High'
        WHEN priority_score >= 40 THEN 'Medium'
        ELSE 'Low'
    END,
    open_gaps::SMALLINT,
    critical_labs::SMALLINT,
    days_ago,
    'Y'
FROM scored;

DO $$ BEGIN RAISE NOTICE 'Part B: AI Priority Queue populated'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART C: AI Generated Notes — SOAP notes for today's appointments
-- ─────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.ai_generated_note (
    patient_id, encounter_id, provider_id,
    generated_datetime, note_type,
    subjective, objective, assessment, plan,
    icd10_suggestions, cpt_suggestion,
    status, active_ind
)
SELECT
    a.patient_id,
    last_enc.encounter_id,
    2816,
    NOW(),
    'soap',
    FORMAT('Patient presents for %s. Reports %s. No acute distress.',
           COALESCE(a.chief_complaint, 'follow-up'),
           CASE a.appointment_type
               WHEN 'urgent'          THEN 'acute symptoms onset 1-2 days ago'
               WHEN 'annual_wellness' THEN 'overall good health, no significant new complaints'
               WHEN 'telehealth'      THEN 'stable symptoms, requesting medication refill'
               ELSE                        'ongoing chronic condition management concerns'
           END),
    'Vitals: BP within target range, HR regular, SpO2 98%. '
    'Physical exam: Alert and oriented x3. No acute findings. '
    'Recent labs reviewed — see care gap dashboard for outstanding items.',
    CASE a.appointment_type
        WHEN 'urgent'          THEN 'Acute presentation — differential includes infection, inflammatory process. Workup ordered.'
        WHEN 'annual_wellness' THEN 'Annual wellness visit — preventive screenings reviewed and updated.'
        WHEN 'telehealth'      THEN 'Chronic disease management — stable. Medication refill appropriate.'
        ELSE                        'Chronic disease management — ongoing monitoring. Care gaps reviewed.'
    END,
    'Plan: '
    '1) Review and address outstanding care gaps identified by Abigail. '
    '2) Medication reconciliation performed — no changes needed at this time. '
    '3) Appropriate referrals/orders placed as indicated. '
    '4) Follow-up in 3 months or sooner if symptoms worsen. '
    '5) Patient education provided regarding medication adherence and lifestyle modifications.',
    '[{"code":"Z00.00","description":"Encounter for general adult medical exam","confidence":0.85},
      {"code":"Z71.89","description":"Other specified counseling","confidence":0.72}]'::JSONB,
    CASE a.appointment_type
        WHEN 'annual_wellness' THEN 'G0439'
        ELSE                        '99214'
    END,
    CASE WHEN a.patient_id % 4 = 0 THEN 'Accepted'
         WHEN a.patient_id % 4 = 1 THEN 'Edited & Accepted'
         ELSE                           'Pending Review' END,
    'Y'
FROM phm_edw.appointment a
CROSS JOIN LATERAL (
    SELECT encounter_id
    FROM phm_edw.encounter
    WHERE patient_id = a.patient_id AND active_ind = 'Y'
    ORDER BY encounter_datetime DESC
    LIMIT 1
) last_enc
WHERE a.appointment_date = CURRENT_DATE
  AND a.provider_id = 2816;

DO $$ BEGIN RAISE NOTICE 'Part C: AI Generated Notes created'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART D: Differential Diagnoses — urgent visits today
-- ─────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.differential_diagnosis (
    patient_id, encounter_id, generated_datetime,
    chief_complaint, diagnosis_rank, diagnosis_name, icd10_code,
    probability_pct, supporting_evidence, against_evidence,
    recommended_workup, status, active_ind
)
SELECT
    a.patient_id,
    last_enc.encounter_id,
    NOW(),
    COALESCE(a.chief_complaint, 'Urgent complaint'),
    d.diagnosis_rank,
    d.diagnosis_name,
    d.icd10_code,
    d.probability_pct,
    d.supporting_evidence,
    d.against_evidence,
    d.recommended_workup,
    'Active',
    'Y'
FROM phm_edw.appointment a
CROSS JOIN LATERAL (
    SELECT encounter_id
    FROM phm_edw.encounter
    WHERE patient_id = a.patient_id AND active_ind = 'Y'
    ORDER BY encounter_datetime DESC
    LIMIT 1
) last_enc
CROSS JOIN (VALUES
    (1, 'Viral Upper Respiratory Infection', 'J06.9', 55,
     'Acute onset, fever, myalgia — consistent with viral syndrome.',
     'No focal findings on exam to suggest bacterial etiology.',
     'CBC, rapid strep, influenza swab if indicated.'),
    (2, 'Bacterial Sinusitis', 'J01.90', 25,
     'Facial pressure, purulent discharge if present.',
     'Short duration may not support bacterial cause.',
     'Clinical assessment — consider antibiotics if >10 days or worsening.'),
    (3, 'Influenza A', 'J09.X1', 20,
     'Season-appropriate, rapid onset, high fever.',
     'Vaccination status may lower probability.',
     'Rapid influenza test. Consider oseltamivir within 48h if positive.')
) AS d(diagnosis_rank, diagnosis_name, icd10_code, probability_pct,
       supporting_evidence, against_evidence, recommended_workup)
WHERE a.appointment_date = CURRENT_DATE
  AND a.provider_id = 2816
  AND a.appointment_type = 'urgent';

DO $$ BEGIN RAISE NOTICE 'Part D: Differential diagnoses created'; END $$;

-- ─────────────────────────────────────────────────────────────────
-- PART E: Notifications — 28 for Dr. Udoshi
-- ─────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.notification (
    provider_id, patient_id, notification_type, priority,
    title, body, action_label, source_entity_type,
    created_datetime, read_ind, dismissed_ind, active_ind
)
SELECT
    2816,
    p.patient_id,
    CASE rn % 5
        WHEN 0 THEN 'critical_lab'
        WHEN 1 THEN 'care_gap_alert'
        WHEN 2 THEN 'referral_report'
        WHEN 3 THEN 'patient_message'
        ELSE        'task'
    END,
    CASE rn % 5
        WHEN 0 THEN 'critical'
        WHEN 1 THEN 'high'
        ELSE        'normal'
    END,
    CASE rn % 5
        WHEN 0 THEN FORMAT('Critical Lab: %s %s needs attention', p.first_name, p.last_name)
        WHEN 1 THEN FORMAT('Care Gap Alert: %s %s has overdue measures', p.first_name, p.last_name)
        WHEN 2 THEN FORMAT('Referral Report: %s %s consult note received', p.first_name, p.last_name)
        WHEN 3 THEN FORMAT('New Message from %s %s', p.first_name, p.last_name)
        ELSE        FORMAT('Task Due: Follow up on %s %s', p.first_name, p.last_name)
    END,
    CASE rn % 5
        WHEN 0 THEN 'Lab result requires immediate review and possible intervention.'
        WHEN 1 THEN 'Patient has 3+ overdue care gap measures. Schedule close-out visit.'
        WHEN 2 THEN 'Specialist consult note has been received and is ready for review.'
        WHEN 3 THEN 'Patient sent a message via the portal. Please review and respond.'
        ELSE        'Follow-up task is due. Please complete or reassign.'
    END,
    CASE rn % 5
        WHEN 0 THEN 'View Lab Result'
        WHEN 1 THEN 'View Care Gaps'
        WHEN 2 THEN 'View Referral'
        WHEN 3 THEN 'Read Message'
        ELSE        'View Task'
    END,
    CASE rn % 5
        WHEN 0 THEN 'order_result'
        WHEN 1 THEN 'care_gap'
        WHEN 2 THEN 'referral'
        WHEN 3 THEN 'message'
        ELSE        'task'
    END,
    NOW() - ((rn % 5 + 1) || ' hours')::INTERVAL,
    CASE WHEN rn > 20 THEN 'Y' ELSE 'N' END,
    'N',
    'Y'
FROM (
    SELECT p.patient_id, p.first_name, p.last_name,
           ROW_NUMBER() OVER (ORDER BY p.patient_id DESC)::INT AS rn
    FROM phm_edw.patient p
    WHERE p.pcp_provider_id = 2816 AND p.active_ind = 'Y'
    ORDER BY p.patient_id DESC
    LIMIT 28
) p;

DO $$ BEGIN RAISE NOTICE 'Part E: Notifications inserted'; END $$;

-- Validation
SELECT insight_type, priority, COUNT(*) AS cnt
FROM phm_edw.ai_insight WHERE provider_id = 2816
GROUP BY insight_type, priority ORDER BY insight_type, priority;

SELECT COUNT(*) AS priority_queue_entries
FROM phm_edw.ai_priority_queue WHERE provider_id = 2816 AND priority_date = CURRENT_DATE;

SELECT COUNT(*) AS ai_notes FROM phm_edw.ai_generated_note WHERE provider_id = 2816;

SELECT COUNT(*) AS notifications,
       COUNT(*) FILTER (WHERE read_ind = 'N') AS unread
FROM phm_edw.notification WHERE provider_id = 2816;
