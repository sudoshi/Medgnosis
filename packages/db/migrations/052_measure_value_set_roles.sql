-- =============================================================================
-- 052: Population roles on the measure↔value-set bridge.
-- The 2026-06-12 adversarial review showed resolveMeasureCodes unioned
-- denominator with exclusion codes (82% contamination for CMS122) — a naive
-- consumer would flag hospice patients with false care gaps. Roles make the
-- bridge safe to consume. Heuristic-classified by value-set NAME (conservative:
-- anything ambiguous stays 'unclassified'); role_method records provenance so
-- manual curation from the eCQM specs can override.
--
-- CLINICAL SAFETY NOTE (2026-06-12):
-- The exclusion heuristic deliberately omits 'long.term care' and
-- 'nursing facility' because in this dataset those patterns match ONLY
-- qualifying-encounter types ('Nursing Facility Visit', 'Discharge Services
-- Nursing Facility', 'Care Services in Long Term Residential Facility') — all
-- qdm_category='Encounter' — NOT patient-status exclusion sets. Including them
-- in the exclusion regex would mislabel qualifying encounters for CMS128, CMS135,
-- CMS139, CMS142, CMS143, CMS144, CMS145, CMS149, CMS156 as exclusions.
-- =============================================================================

ALTER TABLE phm_edw.measure_value_set
  ADD COLUMN population_role VARCHAR(30) NOT NULL DEFAULT 'unclassified',
  ADD COLUMN role_method     VARCHAR(20) NOT NULL DEFAULT 'unclassified';

ALTER TABLE phm_edw.measure_value_set
  ADD CONSTRAINT chk_mvs_population_role CHECK (population_role IN
    ('initial_population','denominator','denominator_exclusion','numerator','supplemental','unclassified')),
  ADD CONSTRAINT chk_mvs_role_method CHECK (role_method IN
    ('name_heuristic','manual','unclassified'));

CREATE INDEX idx_mvs_role ON phm_edw.measure_value_set (population_role);

-- Exclusion family: the canonical eCQM denominator-exclusion value sets.
-- NOTE: 'long.term care' and 'nursing facility' are intentionally ABSENT —
-- those phrases match qualifying-encounter types in this dataset, not exclusion
-- status sets. If a future ingest adds a non-encounter set with those names,
-- reclassify via manual override (role_method='manual').
UPDATE phm_edw.measure_value_set mv SET population_role = 'denominator_exclusion', role_method = 'name_heuristic'
FROM phm_edw.vsac_value_set vs
WHERE vs.value_set_oid = mv.value_set_oid
  AND vs.name ~* '(hospice|palliative|advanced illness|frailty|dementia medications)';

-- Supplemental data elements (exact names per eCQM convention).
UPDATE phm_edw.measure_value_set mv SET population_role = 'supplemental', role_method = 'name_heuristic'
FROM phm_edw.vsac_value_set vs
WHERE vs.value_set_oid = mv.value_set_oid
  AND vs.name ~* '^(race|ethnicity|payer( type)?|onc administrative sex|sex)$';

-- Qualifying-encounter sets → initial population.
-- Guard: mv.population_role = 'unclassified' prevents reclassifying
-- Hospice Encounter / Palliative Care Encounter / Frailty Encounter, which
-- were already correctly labeled denominator_exclusion above.
UPDATE phm_edw.measure_value_set mv SET population_role = 'initial_population', role_method = 'name_heuristic'
FROM phm_edw.vsac_value_set vs
WHERE vs.value_set_oid = mv.value_set_oid
  AND mv.population_role = 'unclassified'
  AND vs.name ~* '(office visit|outpatient consultation|encounter|wellness visit|telephone visit|virtual|home healthcare services|preventive care services|annual wellness|nursing facility visit|discharge services nursing facility|care services in long.term residential facility)';

COMMENT ON COLUMN phm_edw.measure_value_set.population_role IS
  'eCQM population role. name_heuristic rows are conservative auto-classification; authoritative roles come from the measure''s CQL data criteria (manual). unclassified is NEVER served as a denominator.';
