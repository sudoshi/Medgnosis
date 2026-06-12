-- =============================================================================
-- 039: Real-time surveillance lane (CDS parity Phase 5: D12)
-- The compendium's hot partition. Synthetic streamer writes here today; a real
-- MLLP/HL7v2 ORU/ADT source would write vital_stream/glucose_stream directly.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS phm_rt;

-- Synthetic inpatient census (real patients, simulated admission/unit/bed)
CREATE TABLE IF NOT EXISTS phm_rt.admission (
  admission_id   SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  unit           VARCHAR(20) NOT NULL,
  bed            VARCHAR(10) NOT NULL,
  admit_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
  admitting_dx   VARCHAR(200),
  status         VARCHAR(20) NOT NULL DEFAULT 'admitted', -- admitted | discharged
  created_date   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_admission_status ON phm_rt.admission (status, unit);

-- Hot partition: streamed vitals (HL7 ORU equivalent)
CREATE TABLE IF NOT EXISTS phm_rt.vital_stream (
  reading_id        SERIAL PRIMARY KEY,
  admission_id      INT NOT NULL REFERENCES phm_rt.admission(admission_id),
  patient_id        INT NOT NULL,
  recorded_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
  temp_c            NUMERIC,
  heart_rate        SMALLINT,
  systolic_bp       SMALLINT,
  resp_rate         SMALLINT,
  spo2              SMALLINT,
  on_oxygen         BOOLEAN NOT NULL DEFAULT FALSE,
  consciousness     VARCHAR(4) NOT NULL DEFAULT 'A',  -- ACVPU: A|C|V|P|U
  gcs               SMALLINT NOT NULL DEFAULT 15
);
CREATE INDEX IF NOT EXISTS idx_rt_vital_adm ON phm_rt.vital_stream (admission_id, recorded_datetime DESC);

-- Hot partition: streamed glucose + insulin ledger
CREATE TABLE IF NOT EXISTS phm_rt.glucose_stream (
  reading_id        SERIAL PRIMARY KEY,
  admission_id      INT NOT NULL REFERENCES phm_rt.admission(admission_id),
  patient_id        INT NOT NULL,
  reading_datetime  TIMESTAMP NOT NULL DEFAULT NOW(),
  glucose_mgdl      SMALLINT NOT NULL,
  source            VARCHAR(20) NOT NULL DEFAULT 'fingerstick'
);
CREATE INDEX IF NOT EXISTS idx_rt_glucose_adm ON phm_rt.glucose_stream (admission_id, reading_datetime DESC);

CREATE TABLE IF NOT EXISTS phm_rt.insulin_admin (
  admin_id       SERIAL PRIMARY KEY,
  admission_id   INT NOT NULL REFERENCES phm_rt.admission(admission_id),
  patient_id     INT NOT NULL,
  admin_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
  dose_units     SMALLINT NOT NULL,
  product        VARCHAR(120) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rt_insulin_adm ON phm_rt.insulin_admin (admission_id, admin_datetime DESC);

-- Computed early-warning scores (one row per scoring event)
CREATE TABLE IF NOT EXISTS phm_rt.ews_score (
  score_id          SERIAL PRIMARY KEY,
  admission_id      INT NOT NULL REFERENCES phm_rt.admission(admission_id),
  patient_id        INT NOT NULL,
  score_type        VARCHAR(10) NOT NULL,  -- MEWS | NEWS2
  score             SMALLINT NOT NULL,
  band              VARCHAR(40) NOT NULL,  -- action/trigger label
  action            VARCHAR(200),
  components        JSONB NOT NULL,
  reading_id        INT,
  computed_datetime TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_ews_adm ON phm_rt.ews_score (admission_id, score_type, computed_datetime DESC);

COMMENT ON SCHEMA phm_rt IS
  'Real-time surveillance hot partition. Synthetic streamer today; a real MLLP/HL7v2 source would write vital_stream/glucose_stream directly.';
