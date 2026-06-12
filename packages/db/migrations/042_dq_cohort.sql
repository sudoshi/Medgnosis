-- =============================================================================
-- 042: Data Quality Discovery + Cohort Manager (CDS parity Phase 7: D17+D18)
-- All additive.
-- =============================================================================

-- ─── D17: Data Quality ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phm_edw.dq_finding (
  finding_id    SERIAL PRIMARY KEY,
  detector      VARCHAR(60) NOT NULL,        -- impossible_height | impossible_temp | weight_jump | provider_trailing_space | ...
  entity_table  VARCHAR(60) NOT NULL,
  entity_id     INT,
  patient_id    INT,
  field         VARCHAR(60),
  observed      TEXT,                          -- the offending value
  severity      VARCHAR(20) NOT NULL DEFAULT 'warning', -- info | warning | critical
  detail        JSONB,
  status        VARCHAR(20) NOT NULL DEFAULT 'open',     -- open | confirmed | dismissed
  is_regression BOOLEAN NOT NULL DEFAULT FALSE,          -- confirmed anomaly -> standing check
  resolved_by   VARCHAR(100),
  resolved_at   TIMESTAMP,
  created_date  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dq_finding UNIQUE (detector, entity_table, entity_id, field)
);
CREATE INDEX IF NOT EXISTS idx_dq_status ON phm_edw.dq_finding (status, detector);

-- The five tests per feed (accurate/timely/complete/understood/trusted) + freshness
CREATE TABLE IF NOT EXISTS phm_edw.dq_feed (
  feed_id        SERIAL PRIMARY KEY,
  feed_name      VARCHAR(80) NOT NULL UNIQUE,
  source         VARCHAR(120),
  accurate       BOOLEAN,
  timely         BOOLEAN,
  complete       BOOLEAN,
  understood     BOOLEAN,
  trusted        BOOLEAN,
  latency        VARCHAR(40),                  -- 'real-time' | 'nightly' | ...
  last_refreshed TIMESTAMP,
  notes          TEXT
);

-- ─── D18: Cohort Manager ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phm_edw.cohort_definition (
  cohort_id     SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  description   TEXT,
  criteria      JSONB NOT NULL,                -- {conditions:[icd10 prefixes], flags:[...], gfr_max, ...}
  created_by    VARCHAR(100),
  active_ind    CHAR(1) NOT NULL DEFAULT 'Y',
  created_date  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Continuously-computed high-risk flags per patient
CREATE TABLE IF NOT EXISTS phm_edw.patient_flag (
  flag_id       SERIAL PRIMARY KEY,
  patient_id    INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  flag_key      VARCHAR(60) NOT NULL,          -- HYPERKALEMIA | GFR_LOW | NEW_ACEARB_NO_BMP | ...
  value_text    VARCHAR(120),
  computed_date TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_patient_flag UNIQUE (patient_id, flag_key)
);
CREATE INDEX IF NOT EXISTS idx_patient_flag_key ON phm_edw.patient_flag (flag_key);

-- Structured closed-loop messaging specialist -> PCP
CREATE TABLE IF NOT EXISTS phm_edw.cohort_message (
  message_id     SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  from_user      VARCHAR(100) NOT NULL,
  to_provider_id INT REFERENCES phm_edw.provider(provider_id),
  subject        VARCHAR(200) NOT NULL,
  body           TEXT,
  required_disposition VARCHAR(80),            -- what the PCP must do
  status         VARCHAR(20) NOT NULL DEFAULT 'sent', -- sent | acknowledged | resolved
  disposition    TEXT,
  resolved_by    VARCHAR(100),
  resolved_at    TIMESTAMP,
  created_date   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cohort_msg_status ON phm_edw.cohort_message (status, created_date DESC);

COMMENT ON TABLE phm_edw.dq_finding IS
  'Anomaly gallery. A data-quality problem is a process-control problem; a confirmed finding (is_regression) becomes a standing check.';
COMMENT ON TABLE phm_edw.cohort_message IS
  'Structured closed-loop specialist->PCP message — not a curbside; every message requires a documented disposition.';
