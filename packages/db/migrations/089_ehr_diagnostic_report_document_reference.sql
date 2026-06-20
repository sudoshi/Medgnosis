-- =============================================================================
-- 089: DiagnosticReport + DocumentReference EDW landing tables
--
-- FHIR DiagnosticReport and DocumentReference have no faithful home in the
-- existing phm_edw clinical model (clinical_note requires author_user_id, an
-- app-user FK that bulk/SMART FHIR ingestion cannot supply). These additive,
-- non-destructive tables give the hydrator a lossless target and let the
-- ehr_resource_crosswalk point at a real local row. Mirrors the column idiom of
-- phm_edw.observation (code/desc/status/datetime + active_ind + audit dates).
-- BIGINT identity PKs fit ehr_resource_crosswalk.local_id (bigint); INTEGER FKs
-- match phm_edw.patient.patient_id / phm_edw.encounter.encounter_id (integer).
-- =============================================================================

CREATE TABLE phm_edw.diagnostic_report (
  report_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id           INTEGER NOT NULL REFERENCES phm_edw.patient(patient_id),
  encounter_id         INTEGER REFERENCES phm_edw.encounter(encounter_id),
  report_code          VARCHAR(50) NOT NULL,
  report_name          VARCHAR(255),
  code_system          VARCHAR(20),
  category             VARCHAR(100),
  status               VARCHAR(50),
  effective_datetime   TIMESTAMP,
  issued_datetime      TIMESTAMP,
  performer            VARCHAR(255),
  conclusion           TEXT,
  active_ind           CHAR(1) NOT NULL DEFAULT 'Y',
  created_date         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_diagnostic_report_patient ON phm_edw.diagnostic_report(patient_id);
CREATE INDEX ix_diagnostic_report_encounter ON phm_edw.diagnostic_report(encounter_id);

CREATE TABLE phm_edw.document_reference (
  document_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id           INTEGER NOT NULL REFERENCES phm_edw.patient(patient_id),
  encounter_id         INTEGER REFERENCES phm_edw.encounter(encounter_id),
  doc_type_code        VARCHAR(50),
  doc_type_name        VARCHAR(255),
  code_system          VARCHAR(20),
  category             VARCHAR(100),
  status               VARCHAR(50),
  doc_status           VARCHAR(50),
  content_type         VARCHAR(100),
  content_url          TEXT,
  content_title        VARCHAR(255),
  author_display       VARCHAR(255),
  document_datetime    TIMESTAMP,
  active_ind           CHAR(1) NOT NULL DEFAULT 'Y',
  created_date         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_document_reference_patient ON phm_edw.document_reference(patient_id);
CREATE INDEX ix_document_reference_encounter ON phm_edw.document_reference(encounter_id);
