-- =============================================================================
-- 036: Seed follow-up guideline matrices (CDS parity Phase 3: D10)
-- RESULT_FOLLOWUP is active (drives the abnormal-result loop engine now).
-- ASCCP_CYTOLOGY is ready content — activated when cervical cytology results
-- are ingested (none exist today). "Swap the guideline table, reuse the engine."
-- =============================================================================

-- ─── RESULT_FOLLOWUP: generic abnormal-result obligation by severity ─────────
INSERT INTO phm_edw.clinical_rule (entity, attribute, value_jsonb, display_order, source) VALUES
  ('RESULT_FOLLOWUP', 'WINDOW',
   '{"severity":"critical","obligation":"review_abnormal","window_days":1}'::jsonb, 1,
   'Institutional close-the-loop policy'),
  ('RESULT_FOLLOWUP', 'WINDOW',
   '{"severity":"high","obligation":"review_abnormal","window_days":14}'::jsonb, 2,
   'Institutional close-the-loop policy'),
  ('RESULT_FOLLOWUP', 'WINDOW',
   '{"severity":"routine","obligation":"review_abnormal","window_days":30}'::jsonb, 3,
   'Institutional close-the-loop policy');

-- ─── ASCCP_CYTOLOGY: 2019 risk-based cervical management (READY, not yet wired) ─
-- {age_min, age_max, result, hpv, action, window_days}. Severity sets the clock:
-- high-grade -> colposcopy within 14d; low-grade -> months.
INSERT INTO phm_edw.clinical_rule (entity, attribute, value_jsonb, display_order, source, notes) VALUES
  ('ASCCP_CYTOLOGY', 'RULE', '{"age_min":21,"age_max":120,"result":"HSIL","hpv":"any","action":"colposcopy","window_days":14}'::jsonb, 1, 'ASCCP 2019 risk-based management', 'ready: activate when cervical cytology results are ingested'),
  ('ASCCP_CYTOLOGY', 'RULE', '{"age_min":21,"age_max":120,"result":"ASC-H","hpv":"any","action":"colposcopy","window_days":14}'::jsonb, 2, 'ASCCP 2019 risk-based management', 'ready: activate when cervical cytology results are ingested'),
  ('ASCCP_CYTOLOGY', 'RULE', '{"age_min":21,"age_max":120,"result":"AGC","hpv":"any","action":"colposcopy_endocervical","window_days":14}'::jsonb, 3, 'ASCCP 2019 risk-based management', 'ready: activate when cervical cytology results are ingested'),
  ('ASCCP_CYTOLOGY', 'RULE', '{"age_min":25,"age_max":120,"result":"LSIL","hpv":"positive","action":"colposcopy","window_days":14}'::jsonb, 4, 'ASCCP 2019 risk-based management', 'ready: activate when cervical cytology results are ingested'),
  ('ASCCP_CYTOLOGY', 'RULE', '{"age_min":25,"age_max":120,"result":"ASC-US","hpv":"positive","action":"colposcopy","window_days":14}'::jsonb, 5, 'ASCCP 2019 risk-based management', 'ready: activate when cervical cytology results are ingested'),
  ('ASCCP_CYTOLOGY', 'RULE', '{"age_min":25,"age_max":120,"result":"ASC-US","hpv":"negative","action":"repeat_cotest","window_days":1095}'::jsonb, 6, 'ASCCP 2019 risk-based management', 'ready: activate when cervical cytology results are ingested'),
  ('ASCCP_CYTOLOGY', 'RULE', '{"age_min":30,"age_max":120,"result":"NILM","hpv":"positive","action":"repeat_cotest","window_days":365}'::jsonb, 7, 'ASCCP 2019 risk-based management', 'ready: activate when cervical cytology results are ingested'),
  ('ASCCP_CYTOLOGY', 'RULE', '{"age_min":21,"age_max":29,"result":"NILM","hpv":"na","action":"repeat_cytology","window_days":1095}'::jsonb, 8, 'ASCCP 2019 risk-based management', 'ready: activate when cervical cytology results are ingested');
