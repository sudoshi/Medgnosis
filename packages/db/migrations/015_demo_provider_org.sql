-- =====================================================================
-- 015_demo_provider_org.sql
-- Phase: Demo Account — Provider, Org, Care Team, Order Sets, Preferences
-- =====================================================================

DO $$
DECLARE
    v_health_system_org_id  INT;
    v_clinic_org_id         INT;
    v_care_team_id          INT;
    v_lead_member_id        INT;
    v_resource_id           INT;
    v_prov_id               INT := 2816;
BEGIN

-- ─────────────────────────────────────────────────────────────────────
-- 1. Organization Hierarchy
-- ─────────────────────────────────────────────────────────────────────

-- Parent: Medgnosis Health System
INSERT INTO phm_edw.organization (organization_name, organization_type, primary_phone, email, website)
VALUES ('Medgnosis Health System', 'Health System', '(408) 555-0100', 'info@medgnosis.app', 'https://medgnosis.app')
ON CONFLICT DO NOTHING
RETURNING org_id INTO v_health_system_org_id;

-- If already exists, fetch it
IF v_health_system_org_id IS NULL THEN
    SELECT org_id INTO v_health_system_org_id FROM phm_edw.organization
    WHERE organization_name = 'Medgnosis Health System' LIMIT 1;
END IF;

-- Child: Medgnosis Primary Care Associates (clinic)
INSERT INTO phm_edw.organization
    (organization_name, organization_type, parent_org_id, primary_phone, fax, email)
VALUES
    ('Medgnosis Primary Care Associates', 'Ambulatory Clinic',
     v_health_system_org_id,
     '(408) 555-0200', '(408) 555-0201', 'primarycare@medgnosis.app')
ON CONFLICT DO NOTHING
RETURNING org_id INTO v_clinic_org_id;

IF v_clinic_org_id IS NULL THEN
    SELECT org_id INTO v_clinic_org_id FROM phm_edw.organization
    WHERE organization_name = 'Medgnosis Primary Care Associates' LIMIT 1;
END IF;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Update Provider Record
-- ─────────────────────────────────────────────────────────────────────
UPDATE phm_edw.provider SET
    display_name    = 'Dr. Sanjay Udoshi, MD, FACP',
    middle_name     = 'M',
    npi_number      = '1234567890',
    license_number  = 'A123456',
    license_state   = 'CA',
    provider_type   = 'MD',
    specialty       = 'Internal Medicine',
    org_id          = v_clinic_org_id,
    primary_phone   = '(408) 555-0210'
WHERE provider_id = v_prov_id;

-- Update the app_users org link
UPDATE public.app_users SET org_id = v_clinic_org_id
WHERE email = 'dr.udoshi@medgnosis.app';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Clinic Resources (Exam Rooms + Telehealth)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.clinic_resource (org_id, resource_name, resource_type, capacity)
SELECT v_clinic_org_id, r.name, r.rtype, 1
FROM (VALUES
    ('Exam Room 1',        'exam_room'),
    ('Exam Room 2',        'exam_room'),
    ('Exam Room 3',        'exam_room'),
    ('Exam Room 4',        'exam_room'),
    ('Exam Room 5',        'exam_room'),
    ('Telehealth Suite A', 'telehealth'),
    ('Telehealth Suite B', 'telehealth'),
    ('Procedure Room 1',   'procedure_room'),
    ('Admin Office',       'admin')
) AS r(name, rtype)
ON CONFLICT DO NOTHING;

SELECT resource_id INTO v_resource_id FROM phm_edw.clinic_resource
WHERE org_id = v_clinic_org_id AND resource_name = 'Exam Room 1' LIMIT 1;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Provider Schedule Template
-- ─────────────────────────────────────────────────────────────────────
-- Mon–Fri clinic: 8:00–12:00 and 13:00–17:00 (1hr lunch break)
INSERT INTO phm_edw.provider_schedule
    (provider_id, org_id, day_of_week, start_time, end_time, slot_duration_min, schedule_type)
SELECT
    v_prov_id, v_clinic_org_id, dow, start_t::TIME, end_t::TIME, 30, stype
FROM (VALUES
    (1, '08:00', '12:00', 'clinic'),  -- Mon AM
    (1, '13:00', '17:00', 'clinic'),  -- Mon PM
    (2, '08:00', '12:00', 'clinic'),  -- Tue AM
    (2, '13:00', '15:00', 'clinic'),  -- Tue PM (before telehealth)
    (2, '15:00', '17:00', 'telehealth'),-- Tue telehealth
    (3, '08:00', '12:00', 'clinic'),  -- Wed AM
    (3, '13:00', '17:00', 'clinic'),  -- Wed PM
    (4, '08:00', '12:00', 'clinic'),  -- Thu AM
    (4, '13:00', '15:00', 'clinic'),  -- Thu PM
    (4, '15:00', '17:00', 'telehealth'),-- Thu telehealth
    (5, '08:00', '12:00', 'clinic'),  -- Fri AM
    (5, '13:00', '16:00', 'clinic')   -- Fri PM (shorter)
) AS s(dow, start_t, end_t, stype)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Specialist Directory (12 specialties)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.specialist_directory
    (org_id, practice_name, specialty, contact_name, npi_number, phone, fax, city, state, zip, avg_wait_days, quality_rating)
VALUES
    (v_clinic_org_id, 'El Camino Cardiology Group',         'Cardiology',        'Dr. Aisha Patel',       '1122334455', '(408) 555-1001', '(408) 555-1002', 'Mountain View',    'CA', '94040', 7,  4.8),
    (v_clinic_org_id, 'Valley Nephrology Associates',       'Nephrology',        'Dr. James Park',        '2233445566', '(408) 555-1101', '(408) 555-1102', 'San Jose',         'CA', '95126', 10, 4.6),
    (v_clinic_org_id, 'Bay Area Endocrinology',             'Endocrinology',     'Dr. Priya Mehta',       '3344556677', '(408) 555-1201', '(408) 555-1202', 'San Jose',         'CA', '95128', 14, 4.7),
    (v_clinic_org_id, 'Silicon Valley Pulmonology',         'Pulmonology',       'Dr. Robert Chen',       '4455667788', '(408) 555-1301', '(408) 555-1302', 'Sunnyvale',        'CA', '94087', 9,  4.5),
    (v_clinic_org_id, 'Bay Gastroenterology Institute',     'Gastroenterology',  'Dr. Maria Santos',      '5566778899', '(408) 555-1401', '(408) 555-1402', 'Santa Clara',      'CA', '95054', 21, 4.4),
    (v_clinic_org_id, 'Stanford Rheumatology Clinic',       'Rheumatology',      'Dr. Linda Nguyen',      '6677889900', '(650) 555-1501', '(650) 555-1502', 'Palo Alto',        'CA', '94304', 28, 4.9),
    (v_clinic_org_id, 'Bay Area Neurology Center',          'Neurology',         'Dr. Samuel Okafor',     '7788990011', '(408) 555-1601', '(408) 555-1602', 'San Jose',         'CA', '95112', 18, 4.6),
    (v_clinic_org_id, 'Valley Orthopedics & Sports Med',    'Orthopedics',       'Dr. Kevin Liu',         '8899001122', '(408) 555-1701', '(408) 555-1702', 'Campbell',         'CA', '95008', 12, 4.5),
    (v_clinic_org_id, 'Bay Hematology & Oncology',          'Oncology',          'Dr. Rachel Kim',        '9900112233', '(408) 555-1801', '(408) 555-1802', 'San Jose',         'CA', '95116', 5,  4.9),
    (v_clinic_org_id, 'Peninsula Psychiatry Associates',    'Psychiatry',        'Dr. David Torres',      '1011121314', '(650) 555-1901', '(650) 555-1902', 'San Mateo',        'CA', '94402', 21, 4.3),
    (v_clinic_org_id, 'Bay Area Ophthalmology',             'Ophthalmology',     'Dr. Susan Wang',        '1112131415', '(408) 555-2001', '(408) 555-2002', 'Cupertino',        'CA', '95014', 14, 4.7),
    (v_clinic_org_id, 'Valley Dermatology Group',           'Dermatology',       'Dr. Raj Krishnamurthy', '1213141516', '(408) 555-2101', '(408) 555-2102', 'Los Gatos',        'CA', '95030', 30, 4.4)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Care Team
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.care_team (team_name, org_id, lead_provider_id, team_type, description)
VALUES ('Dr. Udoshi Primary Care Team', v_clinic_org_id, v_prov_id, 'primary_care',
        'Interdisciplinary care team supporting Dr. Udoshi''s panel of 1,288 patients')
ON CONFLICT DO NOTHING
RETURNING care_team_id INTO v_care_team_id;

IF v_care_team_id IS NULL THEN
    SELECT care_team_id INTO v_care_team_id FROM phm_edw.care_team
    WHERE lead_provider_id = v_prov_id LIMIT 1;
END IF;

-- Care team members
INSERT INTO phm_edw.care_team_member (care_team_id, member_name, role, specialty, email, phone, provider_id, is_lead, joined_date)
VALUES
    (v_care_team_id, 'Dr. Sanjay Udoshi, MD, FACP', 'Lead Physician',     'Internal Medicine',       'dr.udoshi@medgnosis.app',       '(408) 555-0210', v_prov_id, TRUE,  '2023-01-01'),
    (v_care_team_id, 'Maria Santos, RN',              'Nurse Manager',      'Nursing',                 'msantos@medgnosis.app',         '(408) 555-0211', NULL,      FALSE, '2023-01-01'),
    (v_care_team_id, 'James Chen, PA-C',              'Physician Assistant','Internal Medicine',       'jchen@medgnosis.app',           '(408) 555-0212', NULL,      FALSE, '2023-03-01'),
    (v_care_team_id, 'Priya Patel, MA',               'Medical Assistant',  'Clinical Support',        'ppatel@medgnosis.app',          '(408) 555-0213', NULL,      FALSE, '2023-01-01'),
    (v_care_team_id, 'Emily Rodriguez, RN',           'Care Coordinator',   'Care Management',         'erodriguez@medgnosis.app',      '(408) 555-0214', NULL,      FALSE, '2023-06-01'),
    (v_care_team_id, 'Sarah Kim, PharmD',             'Clinical Pharmacist','Pharmacy',                'skim@medgnosis.app',            '(408) 555-0215', NULL,      FALSE, '2023-01-01'),
    (v_care_team_id, 'David Okafor, LCSW',            'Social Worker',      'Behavioral Health',       'dokafor@medgnosis.app',         '(408) 555-0216', NULL,      FALSE, '2023-09-01')
ON CONFLICT DO NOTHING;

SELECT member_id INTO v_lead_member_id FROM phm_edw.care_team_member
WHERE care_team_id = v_care_team_id AND is_lead = TRUE LIMIT 1;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Order Sets (10 standard sets)
-- ─────────────────────────────────────────────────────────────────────
WITH sets AS (
    INSERT INTO phm_edw.order_set (set_name, set_type, specialty, description, org_id, created_by)
    VALUES
        ('Annual Wellness Visit (Adult)',         'preventive',  'Internal Medicine', 'Comprehensive adult AWV per CMS guidelines', v_clinic_org_id, v_prov_id),
        ('Diabetes Quarterly Follow-up',          'chronic',     'Internal Medicine', 'DM2 management: labs, meds review, foot exam, BP', v_clinic_org_id, v_prov_id),
        ('Heart Failure Follow-up',               'chronic',     'Cardiology',        'HF monitoring: BNP, electrolytes, diuretic review', v_clinic_org_id, v_prov_id),
        ('COPD Management',                       'chronic',     'Pulmonology',       'COPD: PFT, inhaler adherence, smoking cessation', v_clinic_org_id, v_prov_id),
        ('New Patient Workup',                    'clinical',    'Internal Medicine', 'New patient comprehensive workup', v_clinic_org_id, v_prov_id),
        ('Hypertension Follow-up',                'chronic',     'Internal Medicine', 'HTN management: BP, BMP, medication adjustment', v_clinic_org_id, v_prov_id),
        ('Pre-Operative Clearance',               'clinical',    'Internal Medicine', 'Pre-op evaluation: CBC, BMP, EKG, echo if indicated', v_clinic_org_id, v_prov_id),
        ('Depression Follow-up',                  'chronic',     'Behavioral Health', 'MDD management: PHQ-9, medication, therapy referral', v_clinic_org_id, v_prov_id),
        ('CKD Monitoring',                        'chronic',     'Nephrology',        'CKD: BMP, CBC, PTH, phosphorus, nephrology referral', v_clinic_org_id, v_prov_id),
        ('Anticoagulation Management',            'chronic',     'Internal Medicine', 'Anticoagulation: INR, bleeding risk, Coumadin clinic', v_clinic_org_id, v_prov_id)
    ON CONFLICT DO NOTHING
    RETURNING order_set_id, set_name
)
INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, frequency, default_priority, ordinal)
SELECT s.order_set_id, i.item_name, i.item_type, i.loinc_code, i.frequency, 'routine', i.ordinal
FROM sets s
JOIN (VALUES
    -- Annual Wellness Visit
    ('Annual Wellness Visit (Adult)', 'HbA1c',               'lab',         '4548-4',  'Annual',  1),
    ('Annual Wellness Visit (Adult)', 'Lipid Panel',          'lab',         '24331-1', 'Annual',  2),
    ('Annual Wellness Visit (Adult)', 'CBC',                  'lab',         '58410-2', 'Annual',  3),
    ('Annual Wellness Visit (Adult)', 'CMP',                  'lab',         '24323-8', 'Annual',  4),
    ('Annual Wellness Visit (Adult)', 'TSH',                  'lab',         '3016-3',  'Annual',  5),
    ('Annual Wellness Visit (Adult)', 'Colorectal Screening', 'procedure',   NULL,      'Annual',  6),
    -- Diabetes Quarterly
    ('Diabetes Quarterly Follow-up',  'HbA1c',               'lab',         '4548-4',  'Q3-6mo', 1),
    ('Diabetes Quarterly Follow-up',  'uACR',                 'lab',         '9318-7',  'Annual',  2),
    ('Diabetes Quarterly Follow-up',  'Lipid Panel',          'lab',         '24331-1', 'Annual',  3),
    ('Diabetes Quarterly Follow-up',  'CMP',                  'lab',         '24323-8', 'Q6mo',   4),
    ('Diabetes Quarterly Follow-up',  'Diabetic Eye Exam',    'referral',    NULL,      'Annual',  5),
    -- Heart Failure
    ('Heart Failure Follow-up',       'BNP',                  'lab',         '42637-9', 'Q3-6mo', 1),
    ('Heart Failure Follow-up',       'BMP',                  'lab',         '24320-4', 'Q3mo',   2),
    ('Heart Failure Follow-up',       'Echocardiogram',       'imaging',     NULL,      'Annual',  3),
    -- COPD
    ('COPD Management',               'Spirometry (PFT)',      'procedure',   NULL,      'Annual',  1),
    ('COPD Management',               'CBC',                  'lab',         '58410-2', 'Annual',  2),
    ('COPD Management',               'Influenza Vaccine',    'procedure',   NULL,      'Annual',  3),
    -- Hypertension
    ('Hypertension Follow-up',        'BMP',                  'lab',         '24320-4', 'Annual',  1),
    ('Hypertension Follow-up',        'Lipid Panel',          'lab',         '24331-1', 'Annual',  2),
    ('Hypertension Follow-up',        'UA',                   'lab',         '5767-9',  'Annual',  3),
    -- CKD
    ('CKD Monitoring',                'eGFR / Creatinine',    'lab',         '48642-3', 'Q3-6mo', 1),
    ('CKD Monitoring',                'BMP',                  'lab',         '24320-4', 'Q3-6mo', 2),
    ('CKD Monitoring',                'Phosphorus',           'lab',         '2777-1',  'Q6mo',   3),
    ('CKD Monitoring',                'PTH',                  'lab',         '2731-8',  'Annual',  4),
    ('CKD Monitoring',                'Nephrology Referral',  'referral',    NULL,      'PRN',     5),
    -- Depression
    ('Depression Follow-up',          'PHQ-9',                'lab',         '44249-1', 'Every visit', 1),
    ('Depression Follow-up',          'GAD-7',                'lab',         '69737-5', 'Every visit', 2),
    -- Anticoagulation
    ('Anticoagulation Management',     'INR (PT)',             'lab',         '6301-6',  'Monthly', 1),
    ('Anticoagulation Management',     'CBC',                  'lab',         '58410-2', 'Q3mo',   2)
) AS i(set_name, item_name, item_type, loinc_code, frequency, ordinal)
    ON s.set_name = i.set_name
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 8. Provider Preferences (Dr. Udoshi)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.provider_preference (provider_id, preference_key, preference_value, preference_category)
VALUES
    (v_prov_id, 'theme',                    'dark',                         'ui'),
    (v_prov_id, 'default_landing',          'practitioner_dashboard',       'ui'),
    (v_prov_id, 'ai_assistant',             'abigail',                      'ai'),
    (v_prov_id, 'abigail_enabled',          'true',                         'ai'),
    (v_prov_id, 'abigail_coding_assist',    'true',                         'ai'),
    (v_prov_id, 'abigail_care_gap_alerts',  'true',                         'ai'),
    (v_prov_id, 'abigail_scribe',           'true',                         'ai'),
    (v_prov_id, 'abigail_morning_briefing', 'true',                         'ai'),
    (v_prov_id, 'notification_critical_lab','true',                         'notifications'),
    (v_prov_id, 'notification_care_gap',    'true',                         'notifications'),
    (v_prov_id, 'notification_messages',    'true',                         'notifications'),
    (v_prov_id, 'dashboard_panel_size',     '50',                           'display'),
    (v_prov_id, 'patient_list_sort',        'risk_tier',                    'display'),
    (v_prov_id, 'show_compliance_pct',      'true',                         'display')
ON CONFLICT (provider_id, preference_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 9. Alert Rules (5 clinical alert rules)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.alert_rule (provider_id, org_id, rule_name, rule_category, trigger_condition, severity, is_enabled)
VALUES
    (v_prov_id, v_clinic_org_id, 'HbA1c Critical Elevation',      'lab',        'Most recent HbA1c > 9.0% for a DM patient',                'high',    TRUE),
    (v_prov_id, v_clinic_org_id, 'eGFR Rapid Decline',            'lab',        'eGFR decline > 20% in 6 months in a CKD patient',          'high',    TRUE),
    (v_prov_id, v_clinic_org_id, 'Hypertensive Crisis',           'vitals',     'BP systolic > 180 or diastolic > 110 mmHg',                'critical', TRUE),
    (v_prov_id, v_clinic_org_id, 'PHQ-9 Severe Depression',       'care_gap',   'PHQ-9 score >= 15 — evaluate for safety and treatment',    'high',    TRUE),
    (v_prov_id, v_clinic_org_id, 'INR Out of Therapeutic Range',  'lab',        'INR < 2.0 or > 3.0 for a patient on anticoagulation',      'high',    TRUE)
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Migration 015 complete: org %, clinic %, care_team %, resources seeded',
    v_health_system_org_id, v_clinic_org_id, v_care_team_id;
END $$;
