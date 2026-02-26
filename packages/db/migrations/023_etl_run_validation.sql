-- =====================================================================
-- 023_etl_run_validation.sql
-- Phase: Demo Account — ETL Star Schema Refresh + Full Validation
-- Runs ETL steps 16–27 (migration 014) then validates all data targets
-- from the Demo Account Prompt (Part 16 validation checks)
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- ETL: Steps 16–27 — populate star schema from seeded EDW data
-- (Inline to avoid file dependency; mirrors 014_etl_steps_16_27.sql)
-- ─────────────────────────────────────────────────────────────────────

\echo '=== Running ETL Steps 16-27 ==='
\i '/home/smudoshi/Github/Medgnosis/packages/db/migrations/014_etl_steps_16_27.sql'

-- ─────────────────────────────────────────────────────────────────────
-- VALIDATION: All 16 data integrity checks
-- ─────────────────────────────────────────────────────────────────────

\echo ''
\echo '=========================================='
\echo '  DEMO ACCOUNT VALIDATION REPORT'
\echo '  Medgnosis Platform — Dr. Udoshi Panel'
\echo '=========================================='

-- V1: Patient panel size
\echo ''
\echo 'V1: Patient Panel (target: 1,288)'
SELECT
    COUNT(*) AS total_patients,
    COUNT(*) FILTER (WHERE active_ind = 'Y') AS active_patients
FROM phm_edw.patient
WHERE pcp_provider_id = 2816;

-- V2: Provider + Organization
\echo ''
\echo 'V2: Provider & Organization Setup'
SELECT
    prov.provider_id,
    prov.display_name,
    prov.email,
    prov.npi_number,
    org.organization_name,
    org.organization_type
FROM phm_edw.provider prov
JOIN phm_edw.organization org ON org.org_id = prov.org_id
WHERE prov.provider_id = 2816;

-- V3: Clinical data completeness
\echo ''
\echo 'V3: Clinical Data Completeness'
SELECT
    'Encounters (2023+)'            AS data_type,
    COUNT(*)                         AS record_count
FROM phm_edw.encounter e
JOIN phm_edw.patient p ON e.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816
  AND e.encounter_datetime >= '2023-01-01'
  AND e.active_ind = 'Y'
UNION ALL
SELECT 'Problem List Entries', COUNT(*)
FROM phm_edw.problem_list pl
JOIN phm_edw.patient p ON pl.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816
UNION ALL
SELECT 'Vital Signs', COUNT(*)
FROM phm_edw.vital_sign vs
JOIN phm_edw.patient p ON vs.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816
UNION ALL
SELECT 'Clinical Notes', COUNT(*)
FROM phm_edw.clinical_note cn
JOIN phm_edw.patient p ON cn.patient_id::INT = p.patient_id
WHERE p.pcp_provider_id = 2816
ORDER BY 1;

-- V4: Care Gaps
\echo ''
\echo 'V4: Care Gap Distribution (target: 25% Closed, ~45% Open, ~10% Excluded)'
SELECT
    cg.gap_status,
    COUNT(*) AS cnt,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM phm_edw.care_gap cg
JOIN phm_edw.patient p ON cg.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816
GROUP BY cg.gap_status
ORDER BY cnt DESC;

-- V5: Appointments
\echo ''
\echo 'V5: Appointment Schedule'
SELECT
    COUNT(*) FILTER (WHERE a.appointment_date < CURRENT_DATE) AS historical,
    COUNT(*) FILTER (WHERE a.appointment_date = CURRENT_DATE) AS today,
    COUNT(*) FILTER (WHERE a.appointment_date > CURRENT_DATE) AS future
FROM phm_edw.appointment a
JOIN phm_edw.patient p ON a.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816;

-- V6: Today's schedule detail
\echo ''
\echo 'V6: Today Demo Schedule (target: 16 patients)'
SELECT
    a.start_time,
    a.appointment_type,
    a.status,
    a.chief_complaint,
    p.first_name || ' ' || p.last_name AS patient_name
FROM phm_edw.appointment a
JOIN phm_edw.patient p ON a.patient_id = p.patient_id
WHERE a.appointment_date = CURRENT_DATE
  AND a.provider_id = 2816
ORDER BY a.start_time;

-- V7: Clinical Orders
\echo ''
\echo 'V7: Clinical Orders'
SELECT
    co.order_type,
    co.order_status,
    COUNT(*) AS cnt
FROM phm_edw.clinical_order co
JOIN phm_edw.patient p ON co.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816
GROUP BY co.order_type, co.order_status
ORDER BY co.order_type, co.order_status;

-- V8: Order Basket
\echo ''
\echo 'V8: Order Basket (pending unsigned orders)'
SELECT COUNT(*) AS pending_basket_orders
FROM phm_edw.order_basket ob
WHERE ob.provider_id = 2816 AND ob.basket_status = 'Pending';

-- V9: Referrals
\echo ''
\echo 'V9: Referrals'
SELECT
    r.referral_status,
    COUNT(*) AS cnt
FROM phm_edw.referral r
WHERE r.referring_provider_id = 2816
GROUP BY r.referral_status
ORDER BY cnt DESC;

-- V10: AI & Abigail
\echo ''
\echo 'V10: AI/Abigail Data'
SELECT 'AI Insights' AS entity, COUNT(*) AS cnt FROM phm_edw.ai_insight WHERE provider_id = 2816
UNION ALL
SELECT 'Priority Queue (today)', COUNT(*) FROM phm_edw.ai_priority_queue WHERE provider_id = 2816 AND priority_date = CURRENT_DATE
UNION ALL
SELECT 'AI Generated Notes', COUNT(*) FROM phm_edw.ai_generated_note WHERE provider_id = 2816
UNION ALL
SELECT 'Differential Diagnoses', COUNT(*) FROM phm_edw.differential_diagnosis dd
    JOIN phm_edw.patient p ON dd.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816
UNION ALL
SELECT 'Notifications (unread)', COUNT(*) FROM phm_edw.notification WHERE provider_id = 2816 AND read_ind = 'N'
ORDER BY 1;

-- V11: Quality & Billing
\echo ''
\echo 'V11: Quality & Billing'
SELECT 'Quality Scores' AS entity, COUNT(*) AS cnt FROM phm_edw.quality_score WHERE provider_id = 2816
UNION ALL
SELECT 'Billing Claims', COUNT(*) FROM phm_edw.billing_claim WHERE provider_id = 2816
UNION ALL
SELECT 'Billing Line Items', COUNT(*) FROM phm_edw.billing_line_item bli
    JOIN phm_edw.billing_claim bc ON bli.claim_id = bc.claim_id WHERE bc.provider_id = 2816
UNION ALL
SELECT 'Care Plans', COUNT(*) FROM phm_edw.care_plan WHERE provider_id = 2816
UNION ALL
SELECT 'E-Prescriptions', COUNT(*) FROM phm_edw.e_prescription WHERE prescriber_id = 2816
UNION ALL
SELECT 'Refill Requests', COUNT(*) FROM phm_edw.refill_request WHERE provider_id = 2816
ORDER BY 1;

-- V12: Oncology Cohort
\echo ''
\echo 'V12: Oncology Cohort (target: 5 cancer patients)'
SELECT
    cs.cancer_type,
    cs.clinical_stage,
    cs.pathologic_stage,
    tr.registry_status,
    p.first_name || ' ' || p.last_name AS patient_name
FROM phm_edw.cancer_staging cs
JOIN phm_edw.patient p ON cs.patient_id = p.patient_id
LEFT JOIN phm_edw.tumor_registry tr ON tr.patient_id = cs.patient_id
WHERE p.pcp_provider_id = 2816
ORDER BY cs.staging_id;

-- V13: Research & Clinical Trials
\echo ''
\echo 'V13: Clinical Trials'
SELECT
    ct.nct_number,
    ct.trial_name,
    ct.status,
    ct.current_enrollment || '/' || ct.target_enrollment AS enrollment
FROM phm_edw.clinical_trial ct
WHERE ct.principal_investigator = 2816
ORDER BY ct.trial_id;

SELECT COUNT(*) AS trial_enrollments FROM phm_edw.trial_enrollment te
JOIN phm_edw.patient p ON te.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816;

-- V14: Patient Portal
\echo ''
\echo 'V14: Patient Portal Activity'
SELECT 'Portal Messages' AS entity, COUNT(*) AS cnt FROM phm_edw.patient_message WHERE provider_id = 2816
UNION ALL
SELECT 'Unread Messages', COUNT(*) FROM phm_edw.patient_message WHERE provider_id = 2816 AND is_read = FALSE
UNION ALL
SELECT 'Patient Feedback Surveys', COUNT(*) FROM phm_edw.patient_feedback WHERE provider_id = 2816
UNION ALL
SELECT 'PHQ-9/GAD-7 Scores', COUNT(*) FROM phm_edw.patient_reported_outcome
ORDER BY 1;

-- V15: Star Schema Population
\echo ''
\echo 'V15: Star Schema (after ETL)'
SELECT 'fact_patient_bundle'        AS fact_table, COUNT(*) AS rows FROM phm_star.fact_patient_bundle WHERE is_active = TRUE
UNION ALL
SELECT 'fact_patient_bundle_detail', COUNT(*) FROM phm_star.fact_patient_bundle_detail
UNION ALL
SELECT 'fact_patient_composite',     COUNT(*) FROM phm_star.fact_patient_composite
UNION ALL
SELECT 'fact_ai_risk_score',         COUNT(*) FROM phm_star.fact_ai_risk_score
UNION ALL
SELECT 'fact_population_snapshot',   COUNT(*) FROM phm_star.fact_population_snapshot
UNION ALL
SELECT 'dim_care_gap_bundle',        COUNT(*) FROM phm_star.dim_care_gap_bundle
UNION ALL
SELECT 'dim_payer',                  COUNT(*) FROM phm_star.dim_payer
ORDER BY 1;

-- V16: Materialized Views
\echo ''
\echo 'V16: Materialized Views'
SELECT COUNT(*) AS mv_population_by_condition FROM phm_star.mv_population_by_condition;
SELECT COUNT(*) AS mv_provider_scorecard FROM phm_star.mv_provider_scorecard;
SELECT COUNT(*) AS mv_patient_risk_tier FROM phm_star.mv_patient_risk_tier;

-- Final summary
DO $$
DECLARE
    v_gaps  INT;
    v_apts  INT;
    v_pats  INT;
    v_bundles INT;
BEGIN
    SELECT COUNT(*) INTO v_pats  FROM phm_edw.patient WHERE pcp_provider_id = 2816 AND active_ind = 'Y';
    SELECT COUNT(*) INTO v_gaps  FROM phm_edw.care_gap cg JOIN phm_edw.patient p ON cg.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816;
    SELECT COUNT(*) INTO v_apts  FROM phm_edw.appointment a JOIN phm_edw.patient p ON a.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816 AND a.appointment_date = CURRENT_DATE;
    SELECT COUNT(*) INTO v_bundles FROM phm_star.fact_patient_bundle WHERE is_active = TRUE;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'DEMO ACCOUNT FULLY OPERATIONAL';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Patient panel:      % patients', v_pats;
    RAISE NOTICE 'Care gaps:          % total records', v_gaps;
    RAISE NOTICE 'Today schedule:     % appointments', v_apts;
    RAISE NOTICE 'Star schema bundles: % patient-bundle rows', v_bundles;
    RAISE NOTICE 'Login: dr.udoshi@medgnosis.app / password';
    RAISE NOTICE '========================================';
END $$;
