-- =============================================================================
-- 041: SuperNote — note_coded_diagnosis (CDS parity Phase 6: D15)
-- The diagnoses an A&P codes as a side effect of writing the plan. Feeds the
-- HCC capture analytics (Phase 8).
-- =============================================================================

CREATE TABLE IF NOT EXISTS phm_edw.note_coded_diagnosis (
  coded_id        SERIAL PRIMARY KEY,
  note_id         UUID NOT NULL REFERENCES phm_edw.clinical_note(note_id),
  patient_id      INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  icd10_code      VARCHAR(20) NOT NULL,
  diagnosis_name  VARCHAR(255),
  ontology_id     INT REFERENCES phm_edw.dx_ontology(ontology_id),
  disease_process VARCHAR(100),
  hcc_relevant    BOOLEAN NOT NULL DEFAULT FALSE,
  source          VARCHAR(40) NOT NULL DEFAULT 'supernote',
  created_date    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coded_dx_note ON phm_edw.note_coded_diagnosis (note_id);
CREATE INDEX IF NOT EXISTS idx_coded_dx_patient ON phm_edw.note_coded_diagnosis (patient_id, created_date DESC);

COMMENT ON TABLE phm_edw.note_coded_diagnosis IS
  'Diagnoses coded as a side effect of writing the SuperNote A&P. One row per addressed problem; feeds HCC capture (Phase 8).';
