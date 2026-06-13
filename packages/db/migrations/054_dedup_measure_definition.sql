-- =============================================================================
-- 054_dedup_measure_definition.sql
-- Fix duplicate quality-measure rows.
--
-- The CDS measure catalog is seeded by 007_seed_bundles_v1 / 008_seed_bundles_v2,
-- whose measure_definition INSERTs overlap on measure_code and carry no
-- ON CONFLICT guard. Combined with _migrations tracking gaps, this left ~354
-- measures duplicated in phm_edw.measure_definition (a second copy with new ids).
-- Since GET /measures is a plain `WHERE active_ind='Y'` select, the duplicates
-- surfaced everywhere measures are listed (Measures page, Bundles, palette, ...).
--
-- This migration deactivates the duplicate copies (keeping the lowest measure_id
-- per code — the one the VSAC value sets, care gaps, and results all reference)
-- and adds a partial unique index so an active duplicate can never recur.
--
-- Idempotent & non-destructive: rows are soft-deactivated (active_ind='N'),
-- nothing is deleted, and it is safe to run repeatedly.
-- =============================================================================

-- 1. Deactivate duplicate active measure rows — keep the lowest id per code.
WITH ranked AS (
  SELECT measure_id,
         row_number() OVER (PARTITION BY measure_code ORDER BY measure_id) AS rn
  FROM phm_edw.measure_definition
  WHERE active_ind = 'Y'
)
UPDATE phm_edw.measure_definition md
SET active_ind = 'N'
FROM ranked r
WHERE md.measure_id = r.measure_id
  AND r.rn > 1;

-- 2. Deactivate bundle_measure links that now point at a deactivated measure
--    (the seed re-run duplicated these links too).
UPDATE phm_edw.bundle_measure bm
SET active_ind = 'N'
WHERE bm.active_ind = 'Y'
  AND NOT EXISTS (
    SELECT 1
    FROM phm_edw.measure_definition md
    WHERE md.measure_id = bm.measure_id
      AND md.active_ind = 'Y'
  );

-- 3. Guard: at most one ACTIVE row per measure_code, forever.
CREATE UNIQUE INDEX IF NOT EXISTS measure_definition_code_active_uniq
  ON phm_edw.measure_definition (measure_code)
  WHERE active_ind = 'Y';
