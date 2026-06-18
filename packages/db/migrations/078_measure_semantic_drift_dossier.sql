-- =============================================================================
-- 078: Measure semantic drift dossier
-- Persists patient-level SQL-vs-CQL semantic drift classifications so local
-- care-gap surrogates can be audited without being treated as standards-
-- equivalent eCQM implementations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS phm_edw.measure_semantic_drift_dossier (
  id                     BIGSERIAL PRIMARY KEY,
  measure_code           VARCHAR(120) NOT NULL,
  source_measure_code    VARCHAR(120),
  reconciliation_run_id  BIGINT REFERENCES phm_edw.measure_reconciliation_run(id) ON DELETE SET NULL,
  measure_report_id      BIGINT REFERENCES phm_edw.measure_report(id) ON DELETE SET NULL,
  period_start           DATE NOT NULL,
  period_end             DATE NOT NULL,
  semantic_relationship  VARCHAR(80) NOT NULL DEFAULT 'surrogate_not_equivalent',
  authoritative_policy   JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary                JSONB NOT NULL DEFAULT '{}'::jsonb,
  classification_counts  JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendations        JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by           UUID,
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_msdd_measure_code CHECK (length(trim(measure_code)) > 0),
  CONSTRAINT ck_msdd_period CHECK (period_end >= period_start),
  CONSTRAINT ck_msdd_relationship CHECK (length(trim(semantic_relationship)) > 0),
  CONSTRAINT ck_msdd_policy_object CHECK (jsonb_typeof(authoritative_policy) = 'object'),
  CONSTRAINT ck_msdd_summary_object CHECK (jsonb_typeof(summary) = 'object'),
  CONSTRAINT ck_msdd_counts_object CHECK (jsonb_typeof(classification_counts) = 'object'),
  CONSTRAINT ck_msdd_recommendations_object CHECK (jsonb_typeof(recommendations) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_msdd_measure_generated
  ON phm_edw.measure_semantic_drift_dossier (measure_code, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_msdd_reconciliation_run
  ON phm_edw.measure_semantic_drift_dossier (reconciliation_run_id);

CREATE INDEX IF NOT EXISTS idx_msdd_measure_report
  ON phm_edw.measure_semantic_drift_dossier (measure_report_id);

COMMENT ON TABLE phm_edw.measure_semantic_drift_dossier IS
  'Auditable SQL-vs-CQL semantic drift dossier for measures whose SQL baseline may be a local surrogate rather than a standards-equivalent eCQM implementation.';
COMMENT ON COLUMN phm_edw.measure_semantic_drift_dossier.semantic_relationship IS
  'Relationship between the SQL baseline and target standards measure, for example surrogate_not_equivalent.';
COMMENT ON COLUMN phm_edw.measure_semantic_drift_dossier.authoritative_policy IS
  'Governance policy describing which source remains authoritative and which validation conditions are required before promotion.';

CREATE TABLE IF NOT EXISTS phm_edw.measure_semantic_drift_patient (
  id                     BIGSERIAL PRIMARY KEY,
  dossier_id             BIGINT NOT NULL REFERENCES phm_edw.measure_semantic_drift_dossier(id) ON DELETE CASCADE,
  patient_id             INT,
  patient_ref            VARCHAR(300),
  patient_key            INT,
  sql_denominator        BOOLEAN NOT NULL DEFAULT FALSE,
  sql_numerator          BOOLEAN NOT NULL DEFAULT FALSE,
  sql_exclusion          BOOLEAN NOT NULL DEFAULT FALSE,
  cql_denominator        BOOLEAN NOT NULL DEFAULT FALSE,
  cql_numerator          BOOLEAN NOT NULL DEFAULT FALSE,
  cql_exclusion          BOOLEAN NOT NULL DEFAULT FALSE,
  denominator_drift      VARCHAR(120) NOT NULL,
  numerator_drift        VARCHAR(120) NOT NULL,
  exclusion_drift        VARCHAR(120) NOT NULL,
  local_gap_status       VARCHAR(80),
  classification         JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_summary       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_msdp_patient_identity CHECK (patient_id IS NOT NULL OR patient_ref IS NOT NULL),
  CONSTRAINT ck_msdp_denominator_drift CHECK (length(trim(denominator_drift)) > 0),
  CONSTRAINT ck_msdp_numerator_drift CHECK (length(trim(numerator_drift)) > 0),
  CONSTRAINT ck_msdp_exclusion_drift CHECK (length(trim(exclusion_drift)) > 0),
  CONSTRAINT ck_msdp_classification_object CHECK (jsonb_typeof(classification) = 'object'),
  CONSTRAINT ck_msdp_evidence_summary_object CHECK (jsonb_typeof(evidence_summary) = 'object'),
  CONSTRAINT uq_msdp_dossier_patient UNIQUE NULLS NOT DISTINCT (dossier_id, patient_id, patient_ref)
);

CREATE INDEX IF NOT EXISTS idx_msdp_dossier
  ON phm_edw.measure_semantic_drift_patient (dossier_id);

CREATE INDEX IF NOT EXISTS idx_msdp_denominator_drift
  ON phm_edw.measure_semantic_drift_patient (denominator_drift);

CREATE INDEX IF NOT EXISTS idx_msdp_numerator_drift
  ON phm_edw.measure_semantic_drift_patient (numerator_drift);

COMMENT ON TABLE phm_edw.measure_semantic_drift_patient IS
  'Patient-level discrepancy rows for a semantic drift dossier. Stores identifiers and classification metadata, not raw FHIR resources or full subject reports.';
COMMENT ON COLUMN phm_edw.measure_semantic_drift_patient.denominator_drift IS
  'Named reason for SQL/CQL denominator disagreement or alignment.';
COMMENT ON COLUMN phm_edw.measure_semantic_drift_patient.numerator_drift IS
  'Named reason for SQL/CQL numerator disagreement or alignment.';

UPDATE phm_edw.measure_sql_baseline_alias
SET
  metadata = metadata || jsonb_build_object(
    'semanticRelationship', 'surrogate_not_equivalent',
    'localNumeratorMeaning', 'care_gap_closed_or_measure_satisfied',
    'targetNumeratorMeaning', 'CMS122 poor control, HbA1c or GMI greater than 9 percent, missing result, or not performed per published eCQM logic',
    'acceptedPractice', 'Keep the published eCQM CQL/QDM/QI-Core artifact authoritative for standards reporting; keep the SQL surrogate as a local operational baseline until patient-level drift is reconciled and validation passes.',
    'promotionPolicy', 'Do not auto-promote this target from surrogate agreement. Promotion requires full-population accepted CQL reconciliation linked to a persisted MeasureReport and validation evidence.'
  ),
  updated_at = NOW()
WHERE target_measure_code = 'CMS122v12'
  AND source_measure_code = 'DM-02';
