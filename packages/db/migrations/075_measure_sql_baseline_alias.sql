-- =============================================================================
-- 075: SQL measure baseline aliases
-- Makes local care-gap surrogate measures explicit when they serve as a SQL
-- baseline for a standards measure during SQL-vs-CQL reconciliation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS phm_edw.measure_sql_baseline_alias (
  target_measure_code VARCHAR(120) NOT NULL,
  source_measure_code VARCHAR(120) NOT NULL,
  mapping_method      VARCHAR(40) NOT NULL DEFAULT 'manual',
  active_ind          BOOLEAN NOT NULL DEFAULT TRUE,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (target_measure_code, source_measure_code),
  CONSTRAINT ck_msba_distinct_codes CHECK (target_measure_code <> source_measure_code),
  CONSTRAINT ck_msba_target_code CHECK (length(trim(target_measure_code)) > 0),
  CONSTRAINT ck_msba_source_code CHECK (length(trim(source_measure_code)) > 0),
  CONSTRAINT ck_msba_mapping_method CHECK (length(trim(mapping_method)) > 0),
  CONSTRAINT ck_msba_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_msba_source_active
  ON phm_edw.measure_sql_baseline_alias (source_measure_code)
  WHERE active_ind = TRUE;

COMMENT ON TABLE phm_edw.measure_sql_baseline_alias IS
  'Explicit source->target measure aliases used only for SQL baseline projection. This does not make the source a clinically complete SQL implementation of the target standard measure.';
COMMENT ON COLUMN phm_edw.measure_sql_baseline_alias.mapping_method IS
  'Provenance for the alias, for example local_care_gap_surrogate or manual.';

INSERT INTO phm_edw.measure_sql_baseline_alias (
  target_measure_code,
  source_measure_code,
  mapping_method,
  active_ind,
  metadata
)
VALUES (
  'CMS122v12',
  'DM-02',
  'local_care_gap_surrogate',
  TRUE,
  jsonb_build_object(
    'reason', 'DM-02 is the local HbA1c poor-control care-gap surrogate seeded with ecqm_reference CMS122v12 / NQF 0059',
    'sqlBaselineOnly', TRUE,
    'notACompleteCms122SqlEvaluator', TRUE
  )
)
ON CONFLICT (target_measure_code, source_measure_code)
DO UPDATE SET
  mapping_method = EXCLUDED.mapping_method,
  active_ind = EXCLUDED.active_ind,
  metadata = phm_edw.measure_sql_baseline_alias.metadata || EXCLUDED.metadata,
  updated_at = NOW();
