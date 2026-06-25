-- =============================================================================
-- 091: MedicationDispense + MedicationAdministration EDW landing tables
--
-- medication_order captures prescriptions/orders. FHIR MedicationDispense and
-- MedicationAdministration are fulfillment/administration events, so they need
-- distinct additive targets for tenant sync and crosswalk lineage.
-- =============================================================================

CREATE TABLE phm_edw.medication_dispense (
  medication_dispense_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id             INTEGER NOT NULL REFERENCES phm_edw.patient(patient_id),
  encounter_id           INTEGER REFERENCES phm_edw.encounter(encounter_id),
  medication_id          INTEGER NOT NULL REFERENCES phm_edw.medication(medication_id),
  medication_order_id    INTEGER REFERENCES phm_edw.medication_order(medication_order_id),
  status                 VARCHAR(50),
  dispense_datetime      TIMESTAMP,
  prepared_datetime      TIMESTAMP,
  handed_over_datetime   TIMESTAMP,
  quantity_value         NUMERIC,
  quantity_unit          VARCHAR(50),
  days_supply_value      NUMERIC,
  days_supply_unit       VARCHAR(50),
  dosage_text            VARCHAR(500),
  performer_display      VARCHAR(255),
  active_ind             CHAR(1) NOT NULL DEFAULT 'Y',
  created_date           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date           TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_medication_dispense_patient ON phm_edw.medication_dispense(patient_id);
CREATE INDEX ix_medication_dispense_medication ON phm_edw.medication_dispense(medication_id);
CREATE INDEX ix_medication_dispense_order ON phm_edw.medication_dispense(medication_order_id);

CREATE TABLE phm_edw.medication_administration (
  medication_administration_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id                   INTEGER NOT NULL REFERENCES phm_edw.patient(patient_id),
  encounter_id                 INTEGER REFERENCES phm_edw.encounter(encounter_id),
  medication_id                INTEGER NOT NULL REFERENCES phm_edw.medication(medication_id),
  medication_order_id          INTEGER REFERENCES phm_edw.medication_order(medication_order_id),
  status                       VARCHAR(50),
  effective_start_datetime     TIMESTAMP,
  effective_end_datetime       TIMESTAMP,
  dosage_text                  VARCHAR(500),
  dose_value                   NUMERIC,
  dose_unit                    VARCHAR(50),
  route                        VARCHAR(100),
  performer_display            VARCHAR(255),
  reason_text                  VARCHAR(500),
  active_ind                   CHAR(1) NOT NULL DEFAULT 'Y',
  created_date                 TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date                 TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_medication_administration_patient ON phm_edw.medication_administration(patient_id);
CREATE INDEX ix_medication_administration_medication ON phm_edw.medication_administration(medication_id);
CREATE INDEX ix_medication_administration_order ON phm_edw.medication_administration(medication_order_id);
