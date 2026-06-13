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

-- Sanity: all three rows must exist (the SELECTs insert nothing if names drift)
DO $$
BEGIN
  IF (SELECT count(*) FROM phm_edw.clinical_rule
      WHERE entity='COHORT_FLAGS' AND attribute LIKE 'ACEARB%' AND active_ind='Y') < 3 THEN
    RAISE EXCEPTION 'COHORT_FLAGS seed incomplete — VSAC value-set names not found. Run packages/db/scripts/load-vsac.sh first.';
  END IF;
END $$;
