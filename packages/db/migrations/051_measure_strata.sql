-- =============================================================================
-- 051: Measure stratification facts (CDS parity — calculator hardening)
-- Populated by measureCalculatorV2 in the same transaction as
-- fact_measure_result, via single-pass GROUPING SETS (one scan -> headline
-- 'all' row + age_band strata + gender strata per measure).
-- =============================================================================

CREATE TABLE phm_star.fact_measure_strata (
  strata_key      SERIAL PRIMARY KEY,
  measure_key     INT NOT NULL
                  REFERENCES phm_star.dim_measure (measure_key) ON DELETE RESTRICT,
  date_key_period INT,
  dimension       VARCHAR(20) NOT NULL,  -- 'all' | 'age_band' | 'gender'
  stratum         VARCHAR(50) NOT NULL,  -- 'all' | '<18' | '18-39' | '40-64' | '65+' | gender values
  denominator     INT NOT NULL DEFAULT 0,
  numerator       INT NOT NULL DEFAULT 0,
  excluded        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fms_measure ON phm_star.fact_measure_strata (measure_key, dimension);

COMMENT ON TABLE phm_star.fact_measure_strata IS
  'Per-measure strata (eCQM accounting: excluded removed from denominator AND numerator). Rebuilt with fact_measure_result each refresh.';
