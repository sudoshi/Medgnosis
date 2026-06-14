-- =============================================================================
-- 055: VSAC expansion cache (per value set + measurement period)
-- Pre-expanded code lists pinned to a reporting period so CQL execution and
-- $expand return a stable, versioned expansion across a reporting year.
-- Additive: creates one new table; touches no existing data.
-- =============================================================================

CREATE TABLE phm_edw.vsac_expansion_cache (
  id                 BIGSERIAL PRIMARY KEY,
  value_set_oid      VARCHAR(120) NOT NULL
                     REFERENCES phm_edw.vsac_value_set (value_set_oid) ON DELETE CASCADE,
  measurement_period VARCHAR(20)  NOT NULL,        -- e.g. '2025'
  expansion_version  VARCHAR(120),
  expansion          JSONB        NOT NULL,        -- [{system,code,display}, ...]
  code_count         INT          NOT NULL,
  expanded_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vsac_expansion UNIQUE (value_set_oid, measurement_period)
);

CREATE INDEX idx_vsac_expansion_oid ON phm_edw.vsac_expansion_cache (value_set_oid);

COMMENT ON TABLE phm_edw.vsac_expansion_cache IS
  'Period-pinned pre-expanded VSAC value sets. Read by $expand when measurementPeriod is supplied.';
