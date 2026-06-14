-- =============================================================================
-- 058: Retarget the CMS122v12 binding to CY2024 (the data's latest full year)
-- Medgnosis demo observations/encounters span through 2025-03; there is no 2026
-- data, so evaluating the seeded 2026 reporting period yields an empty
-- population. Retarget the binding to CY2024 so the clinical-reasoning engine
-- evaluates CMS122 against a period that actually has cohort data. Additive
-- UPDATE of one reference row (the unique key is (measure_code, period_start)).
-- =============================================================================

UPDATE phm_edw.measure_artifact
SET reporting_period_start = '2024-01-01',
    reporting_period_end   = '2024-12-31'
WHERE measure_code = 'CMS122v12';
