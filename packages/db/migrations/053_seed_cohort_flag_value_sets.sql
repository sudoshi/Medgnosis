-- =============================================================================
-- 053: Cohort safety flags bind to VSAC value sets (logic as data).
-- Replaces the hardcoded ACE/ARB name regex with the authoritative RxNorm
-- value set, and adds allergy/intolerance suppression sets the regex could
-- never express. OIDs resolved by exact value-set name at seed time.
--
-- Two OIDs exist per name (draft + published expansion) — we take the
-- lexically-first OID (LIMIT 1 ORDER BY value_set_oid) so a single
-- well-known OID is bound; both cover identical code sets.
-- =============================================================================

INSERT INTO phm_edw.clinical_rule (entity, attribute, value_text, source, notes)
SELECT 'COHORT_FLAGS', 'ACEARB_RXNORM_VALUE_SET_OID', vs.value_set_oid,
       'VSAC', 'ACE Inhibitor or ARB or ARNI — drives NEW_ACEARB_NO_BMP medication match'
FROM phm_edw.vsac_value_set vs
WHERE vs.name = 'ACE Inhibitor or ARB or ARNI'
ORDER BY vs.value_set_oid
LIMIT 1;

INSERT INTO phm_edw.clinical_rule (entity, attribute, value_text, source, notes)
SELECT 'COHORT_FLAGS', 'ACEARB_SUPPRESS_VALUE_SET_OID', vs.value_set_oid,
       'VSAC', vs.name || ' — suppresses NEW_ACEARB_NO_BMP when patient has documented allergy/intolerance'
FROM phm_edw.vsac_value_set vs
WHERE vs.name = 'Allergy to ACE Inhibitor or ARB'
ORDER BY vs.value_set_oid
LIMIT 1;

INSERT INTO phm_edw.clinical_rule (entity, attribute, value_text, source, notes)
SELECT 'COHORT_FLAGS', 'ACEARB_SUPPRESS_VALUE_SET_OID', vs.value_set_oid,
       'VSAC', vs.name || ' — suppresses NEW_ACEARB_NO_BMP when patient has documented allergy/intolerance'
FROM phm_edw.vsac_value_set vs
WHERE vs.name = 'Intolerance to ACE Inhibitor or ARB'
ORDER BY vs.value_set_oid
LIMIT 1;

-- Sanity gate, two distinct failure modes:
--   VSAC tables EMPTY  -> data simply not loaded yet (fresh env / CI): WARN and
--                         continue — the flag computation fails loudly at
--                         runtime until load-vsac.sh + a re-run of this seed.
--   VSAC tables LOADED -> but names didn't match: REAL drift, hard error.
DO $$
DECLARE
  seeded INT;
  vsac_rows INT;
BEGIN
  SELECT count(*) INTO seeded FROM phm_edw.clinical_rule
  WHERE entity='COHORT_FLAGS' AND attribute LIKE 'ACEARB%' AND active_ind='Y';
  IF seeded >= 3 THEN
    RETURN;
  END IF;
  SELECT count(*) INTO vsac_rows FROM phm_edw.vsac_value_set;
  IF vsac_rows = 0 THEN
    RAISE WARNING 'COHORT_FLAGS not seeded — VSAC data not loaded in this environment. Run packages/db/scripts/load-vsac.sh, then re-run the INSERTs in migration 053.';
  ELSE
    RAISE EXCEPTION 'COHORT_FLAGS seed incomplete — VSAC data is loaded (% value sets) but the ACE/ARB value-set names were not found: name drift in the VSAC release. Fix the names in migration 053.', vsac_rows;
  END IF;
END $$;
