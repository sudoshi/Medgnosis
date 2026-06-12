-- =============================================================================
-- 031: Clinical rules engine + diagnosis ontology (CDS parity Phase 1: D1+D2)
-- Logic as data: EAV rows with effective/expiration dating → one update
-- propagates to every consumer; any past result reproducible via as-of query.
-- =============================================================================

CREATE TABLE phm_edw.clinical_rule (
  rule_id         SERIAL PRIMARY KEY,
  entity          VARCHAR(100) NOT NULL,
  attribute       VARCHAR(100) NOT NULL,
  value_text      TEXT,
  value_numeric   NUMERIC,
  value_jsonb     JSONB,
  unit            VARCHAR(50),
  display_order   INT NOT NULL DEFAULT 0,
  effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE,
  source          VARCHAR(255),
  notes           TEXT,
  created_by      VARCHAR(100) NOT NULL DEFAULT 'system',
  active_ind      CHAR(1) NOT NULL DEFAULT 'Y',
  created_date    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date    TIMESTAMP,
  CONSTRAINT chk_clinical_rule_dates
    CHECK (expiration_date IS NULL OR expiration_date > effective_date),
  CONSTRAINT chk_clinical_rule_value
    CHECK (value_text IS NOT NULL OR value_numeric IS NOT NULL OR value_jsonb IS NOT NULL)
);

CREATE INDEX idx_clinical_rule_lookup
  ON phm_edw.clinical_rule (entity, attribute, effective_date);
CREATE INDEX idx_clinical_rule_current
  ON phm_edw.clinical_rule (entity, attribute)
  WHERE expiration_date IS NULL AND active_ind = 'Y';

COMMENT ON TABLE phm_edw.clinical_rule IS
  'Versioned clinical logic as data (Geisinger EAV pattern). Query with as-of date for time travel.';

CREATE TABLE phm_edw.dx_ontology (
  ontology_id     SERIAL PRIMARY KEY,
  icd10_code      VARCHAR(20),
  snomed_code     VARCHAR(20),
  dx_name         VARCHAR(255) NOT NULL,
  disease_process VARCHAR(100) NOT NULL,
  organ_system    VARCHAR(100) NOT NULL,
  generate_plan   BOOLEAN NOT NULL DEFAULT TRUE,
  stage_label     VARCHAR(50),
  stage_criteria  JSONB,
  specialty_lists TEXT[] NOT NULL DEFAULT '{}',
  notes           TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  active_ind      CHAR(1) NOT NULL DEFAULT 'Y',
  created_date    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date    TIMESTAMP
);
-- NB: no unique constraint on icd10_code — one code maps to MULTIPLE disease
-- processes by design ("DM type 2 causing CKD stage 3" → Nephrology + Endocrine).
CREATE INDEX idx_dx_ontology_icd10   ON phm_edw.dx_ontology (icd10_code);
CREATE INDEX idx_dx_ontology_process ON phm_edw.dx_ontology (disease_process);

COMMENT ON TABLE phm_edw.dx_ontology IS
  'Diagnosis ontology: code → disease process → organ system → generate_plan. One code may map to multiple processes.';
