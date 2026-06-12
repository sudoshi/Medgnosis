-- =============================================================================
-- 033: Problem List Analytics & Population Identification (CDS parity Phase 2)
-- The CKD playbook: name -> find -> act. Curation provenance + audit, the
-- two-pass population-finder review queue, and respectful-CDS dismissals.
-- =============================================================================

-- D4: provenance on the existing problem_list (additive; table is ~12k rows)
ALTER TABLE phm_edw.problem_list
  ADD COLUMN IF NOT EXISTS provenance VARCHAR(40) NOT NULL DEFAULT 'clinician';
-- values: clinician | auto_load | recommendation_accepted | import
ALTER TABLE phm_edw.problem_list
  ADD COLUMN IF NOT EXISTS ontology_id INT REFERENCES phm_edw.dx_ontology(ontology_id);

-- D4: per-chart audit of every problem-list mutation (bulk-load utility writes here)
CREATE TABLE IF NOT EXISTS phm_edw.problem_list_audit (
  audit_id      SERIAL PRIMARY KEY,
  problem_id    INT,                       -- null allowed: row may be created by this action
  patient_id    INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  action        VARCHAR(40) NOT NULL,      -- add | resolve | move_to_history | restage
  icd10_code    VARCHAR(20),
  problem_name  VARCHAR(255),
  old_status    VARCHAR(30),
  new_status    VARCHAR(30),
  source        VARCHAR(60) NOT NULL,      -- bulk_load | finder_accept | manual | api
  actor         VARCHAR(100) NOT NULL,     -- user id/email or 'system'
  detail        JSONB,
  created_date  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pl_audit_patient
  ON phm_edw.problem_list_audit (patient_id, created_date DESC);

-- D5: population-finder candidates (clinician review queue)
CREATE TABLE IF NOT EXISTS phm_edw.population_finder_candidate (
  candidate_id       SERIAL PRIMARY KEY,
  patient_id         INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  pass               SMALLINT NOT NULL,            -- 1 = restage generic, 2 = find unlabeled
  finding_type       VARCHAR(60) NOT NULL,         -- ckd_restage | ckd_unlabeled | obesity_unlabeled
  current_problem_id INT,                          -- pass 1: the generic entry being re-staged
  current_icd10      VARCHAR(20),
  suggested_icd10    VARCHAR(20) NOT NULL,
  suggested_name     VARCHAR(255) NOT NULL,
  ontology_id        INT REFERENCES phm_edw.dx_ontology(ontology_id),
  evidence           JSONB NOT NULL,               -- {egfr, observed_at, bmi, ...}
  confidence         VARCHAR(20) NOT NULL DEFAULT 'high',
  status             VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|accepted|rejected|superseded
  resolved_by        VARCHAR(100),
  resolved_at        TIMESTAMP,
  created_date       TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_finder_candidate UNIQUE (patient_id, finding_type, suggested_icd10)
);
CREATE INDEX IF NOT EXISTS idx_finder_status
  ON phm_edw.population_finder_candidate (status, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_finder_patient
  ON phm_edw.population_finder_candidate (patient_id);

-- D6: recommendation dismissals ("does not have X" + 12-month snooze)
CREATE TABLE IF NOT EXISTS phm_edw.recommendation_dismissal (
  dismissal_id    SERIAL PRIMARY KEY,
  patient_id      INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  finding_key     VARCHAR(120) NOT NULL,     -- "{finding_type}:{suggested_icd10}"
  reason          VARCHAR(40) NOT NULL,      -- does_not_have | snooze
  dismissed_until DATE,                       -- null = permanent ("does not have")
  dismissed_by    VARCHAR(100) NOT NULL,
  created_date    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dismissal_lookup
  ON phm_edw.recommendation_dismissal (patient_id, finding_key);

COMMENT ON TABLE phm_edw.population_finder_candidate IS
  'Two-pass population finder output; clinician review queue. Accepted rows route through the bulk-load utility.';
