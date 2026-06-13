-- =============================================================================
-- 050: VSAC value sets + measure bridge (Parthenon eCQM handoff, steps 1-2)
-- CMS-versioned value sets replace hand-typed code lists. One OID carries
-- thousands of codes across code systems; re-ingesting a new VSAC release
-- updates every measure at once.
-- Source: NLM VSAC via Parthenon ingest (app.vsac_* on this host's parthenon DB).
-- Data loaded by packages/db/scripts/load-vsac.sh — NOT by this migration.
-- =============================================================================

CREATE TABLE phm_edw.vsac_value_set (
  value_set_oid          VARCHAR(120) PRIMARY KEY,
  name                   VARCHAR(500) NOT NULL,
  definition_version     VARCHAR(50),
  expansion_version      VARCHAR(120),
  expansion_id           VARCHAR(50),
  qdm_category           VARCHAR(120),
  purpose_clinical_focus TEXT,
  purpose_data_scope     TEXT,
  purpose_inclusion      TEXT,
  purpose_exclusion      TEXT,
  source_files           JSONB NOT NULL DEFAULT '[]'::jsonb,
  ingested_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vsac_vs_name ON phm_edw.vsac_value_set (name);

COMMENT ON TABLE phm_edw.vsac_value_set IS
  'NLM VSAC value sets (one row per OID). CMS-versioned, authoritative code groupings.';

CREATE TABLE phm_edw.vsac_value_set_code (
  id                  BIGSERIAL PRIMARY KEY,
  value_set_oid       VARCHAR(120) NOT NULL
                      REFERENCES phm_edw.vsac_value_set (value_set_oid) ON DELETE CASCADE,
  code                VARCHAR(100) NOT NULL,
  description         TEXT,
  code_system         VARCHAR(80) NOT NULL,
  code_system_oid     VARCHAR(120),
  code_system_version VARCHAR(50),
  CONSTRAINT uq_vsac_vsc_oid_code_sys UNIQUE (value_set_oid, code, code_system)
);

CREATE INDEX idx_vsac_vsc_oid      ON phm_edw.vsac_value_set_code (value_set_oid);
CREATE INDEX idx_vsac_vsc_sys_code ON phm_edw.vsac_value_set_code (code_system, code);

COMMENT ON TABLE phm_edw.vsac_value_set_code IS
  'Flattened VSAC expansions. code_system values: SNOMEDCT, ICD10CM, ICD10PCS, LOINC, RXNORM, CPT, HCPCS Level II, CVX, CDT, ... EDW joins: condition/procedure->SNOMEDCT, medication->RXNORM, observation->LOINC.';

CREATE TABLE phm_edw.vsac_measure (
  cms_id            VARCHAR(50) PRIMARY KEY,
  cbe_number        VARCHAR(50),
  program_candidate VARCHAR(50),
  title             VARCHAR(500),
  expansion_version VARCHAR(120),
  ingested_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE phm_edw.vsac_measure IS
  'CMS eCQM registry rows from the VSAC measure workbooks (e.g. CMS122v14).';

CREATE TABLE phm_edw.vsac_measure_value_set (
  cms_id        VARCHAR(50)  NOT NULL
                REFERENCES phm_edw.vsac_measure (cms_id) ON DELETE CASCADE,
  value_set_oid VARCHAR(120) NOT NULL
                REFERENCES phm_edw.vsac_value_set (value_set_oid) ON DELETE CASCADE,
  PRIMARY KEY (cms_id, value_set_oid)
);

CREATE INDEX idx_vsac_mvs_oid ON phm_edw.vsac_measure_value_set (value_set_oid);

-- Bridge: local measure definitions -> VSAC value sets.
-- vsac_cms_id records WHICH VSAC measure version supplied the mapping
-- (local CMS122v12 vs VSAC CMS122v14 — version drift is explicit, not hidden).
CREATE TABLE phm_edw.measure_value_set (
  measure_id     INT          NOT NULL
                 REFERENCES phm_edw.measure_definition (measure_id),
  value_set_oid  VARCHAR(120) NOT NULL
                 REFERENCES phm_edw.vsac_value_set (value_set_oid),
  vsac_cms_id    VARCHAR(50)  NOT NULL,
  mapping_method VARCHAR(30)  NOT NULL DEFAULT 'cms_base_auto',
  created_date   TIMESTAMP    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (measure_id, value_set_oid)
);

CREATE INDEX idx_mvs_oid ON phm_edw.measure_value_set (value_set_oid);

COMMENT ON TABLE phm_edw.measure_value_set IS
  'Bridge: measure_definition -> VSAC value-set OIDs, auto-matched on base CMS number (CMS122v12 ~ CMS122v14). mapping_method: cms_base_auto | manual.';
