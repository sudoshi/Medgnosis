-- =============================================================================
-- 072: Measure promotion governance + reconciliation ledger
-- Adds explicit per-measure promotion controls and an append-only SQL-vs-CQL
-- reconciliation run ledger. Defaults preserve existing SQL-authoritative
-- behavior until a measure is deliberately promoted.
-- =============================================================================

CREATE TABLE IF NOT EXISTS phm_edw.measure_promotion_config (
  measure_code                     VARCHAR(120) PRIMARY KEY,
  measure_artifact_id              BIGINT REFERENCES phm_edw.measure_artifact(id) ON DELETE SET NULL,
  promotion_mode                   VARCHAR(30) NOT NULL DEFAULT 'sql_only',
  tolerance                        INTEGER NOT NULL DEFAULT 0,
  evaluator_source                 VARCHAR(30) NOT NULL DEFAULT 'qdm-cql',
  authoritative_source             VARCHAR(30) NOT NULL DEFAULT 'sql_bundle',
  require_reconciliation_agreement BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_at                       TIMESTAMPTZ,
  metadata                         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_mpc_measure_code CHECK (length(trim(measure_code)) > 0),
  CONSTRAINT ck_mpc_promotion_mode CHECK (promotion_mode IN (
    'sql_only',
    'cql_shadow',
    'cql_authoritative',
    'manual_hold'
  )),
  CONSTRAINT ck_mpc_tolerance CHECK (tolerance >= 0),
  CONSTRAINT ck_mpc_evaluator_source CHECK (length(trim(evaluator_source)) > 0),
  CONSTRAINT ck_mpc_authoritative_source CHECK (length(trim(authoritative_source)) > 0),
  CONSTRAINT ck_mpc_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_mpc_mode
  ON phm_edw.measure_promotion_config (promotion_mode);

CREATE INDEX IF NOT EXISTS idx_mpc_artifact
  ON phm_edw.measure_promotion_config (measure_artifact_id);

COMMENT ON TABLE phm_edw.measure_promotion_config IS
  'Per-measure gate for SQL-only, CQL shadow, CQL authoritative, or manual hold promotion. SQL remains the default authoritative source.';
COMMENT ON COLUMN phm_edw.measure_promotion_config.promotion_mode IS
  'sql_only keeps current SQL analytics authoritative; cql_shadow permits shadow rows; cql_authoritative allows promotion after accepted reconciliation; manual_hold blocks automation.';

INSERT INTO phm_edw.measure_promotion_config (
  measure_code,
  measure_artifact_id,
  promotion_mode,
  tolerance,
  evaluator_source,
  authoritative_source,
  metadata
)
SELECT DISTINCT ON (ma.measure_code)
  ma.measure_code,
  ma.id,
  'sql_only',
  0,
  'qdm-cql',
  'sql_bundle',
  jsonb_build_object(
    'seededFrom', 'measure_artifact',
    'ecqmId', ma.ecqm_id,
    'ecqmVersion', ma.ecqm_version
  )
FROM phm_edw.measure_artifact ma
ORDER BY ma.measure_code, ma.reporting_period_start DESC NULLS LAST, ma.id DESC
ON CONFLICT (measure_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS phm_edw.measure_reconciliation_run (
  id                  BIGSERIAL PRIMARY KEY,
  measure_code        VARCHAR(120) NOT NULL,
  measure_artifact_id BIGINT REFERENCES phm_edw.measure_artifact(id) ON DELETE SET NULL,
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  engine_measure_id   VARCHAR(200),
  engine_url          TEXT,
  promotion_mode      VARCHAR(30) NOT NULL DEFAULT 'sql_only',
  tolerance           INTEGER NOT NULL DEFAULT 0,
  agree               BOOLEAN NOT NULL,
  status              VARCHAR(40) NOT NULL,
  sql_denominator     INTEGER NOT NULL DEFAULT 0,
  sql_numerator       INTEGER NOT NULL DEFAULT 0,
  sql_exclusion       INTEGER NOT NULL DEFAULT 0,
  cql_denominator     INTEGER NOT NULL DEFAULT 0,
  cql_numerator       INTEGER NOT NULL DEFAULT 0,
  cql_exclusion       INTEGER NOT NULL DEFAULT 0,
  delta_denominator   INTEGER NOT NULL DEFAULT 0,
  delta_numerator     INTEGER NOT NULL DEFAULT 0,
  delta_exclusion     INTEGER NOT NULL DEFAULT 0,
  sql_counts          JSONB NOT NULL DEFAULT '{}'::jsonb,
  cql_counts          JSONB NOT NULL DEFAULT '{}'::jsonb,
  deltas              JSONB NOT NULL DEFAULT '{}'::jsonb,
  fhir_measure_report JSONB,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_mrr_measure_code CHECK (length(trim(measure_code)) > 0),
  CONSTRAINT ck_mrr_period CHECK (period_end >= period_start),
  CONSTRAINT ck_mrr_promotion_mode CHECK (promotion_mode IN (
    'sql_only',
    'cql_shadow',
    'cql_authoritative',
    'manual_hold'
  )),
  CONSTRAINT ck_mrr_tolerance CHECK (tolerance >= 0),
  CONSTRAINT ck_mrr_status CHECK (status IN (
    'agree',
    'drift',
    'error',
    'skipped'
  )),
  CONSTRAINT ck_mrr_sql_counts_object CHECK (jsonb_typeof(sql_counts) = 'object'),
  CONSTRAINT ck_mrr_cql_counts_object CHECK (jsonb_typeof(cql_counts) = 'object'),
  CONSTRAINT ck_mrr_deltas_object CHECK (jsonb_typeof(deltas) = 'object'),
  CONSTRAINT ck_mrr_fhir_report_object CHECK (
    fhir_measure_report IS NULL
    OR jsonb_typeof(fhir_measure_report) = 'object'
  ),
  CONSTRAINT ck_mrr_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_mrr_measure_period
  ON phm_edw.measure_reconciliation_run (measure_code, period_start, period_end, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrr_status
  ON phm_edw.measure_reconciliation_run (status, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrr_artifact
  ON phm_edw.measure_reconciliation_run (measure_artifact_id, computed_at DESC);

COMMENT ON TABLE phm_edw.measure_reconciliation_run IS
  'Append-only SQL-vs-CQL reconciliation ledger recording counts, deltas, tolerance, promotion mode, and optional FHIR MeasureReport payload.';
COMMENT ON COLUMN phm_edw.measure_reconciliation_run.status IS
  'agree when all deltas are within tolerance; drift when any delta exceeds tolerance; error/skipped reserved for operational runs that cannot complete.';
