-- =============================================================================
-- 037: Auto-Orders + AMP + Auto-Referral (CDS parity Phase 4: D7+D8+D9)
-- Care that happens before the visit. All additive.
-- =============================================================================

-- ─── D7: Auto-Orders ─────────────────────────────────────────────────────────
-- A protocol bundles recurring orderable items; enrollment is physician-
-- co-signed and standing until dis-enrolled (physician holds both keys).
CREATE TABLE IF NOT EXISTS phm_edw.order_protocol (
  protocol_id   SERIAL PRIMARY KEY,
  protocol_code VARCHAR(60) NOT NULL UNIQUE,
  protocol_name VARCHAR(200) NOT NULL,
  description   TEXT,
  active_ind    CHAR(1) NOT NULL DEFAULT 'Y',
  created_date  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phm_edw.order_protocol_item (
  protocol_item_id SERIAL PRIMARY KEY,
  protocol_id   INT NOT NULL REFERENCES phm_edw.order_protocol(protocol_id),
  item_id       INT NOT NULL REFERENCES phm_edw.order_set_item(item_id),
  interval_days INT NOT NULL,            -- generation cadence
  active_ind    CHAR(1) NOT NULL DEFAULT 'Y',
  CONSTRAINT uq_protocol_item UNIQUE (protocol_id, item_id)
);

CREATE TABLE IF NOT EXISTS phm_edw.protocol_enrollment (
  enrollment_id SERIAL PRIMARY KEY,
  patient_id    INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  protocol_id   INT NOT NULL REFERENCES phm_edw.order_protocol(protocol_id),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | active | denied | disenrolled
  enrolled_by   VARCHAR(100),            -- co-signing provider (actor)
  enrolled_at   TIMESTAMP,
  expires_at    DATE,                    -- 5-year standing
  created_date  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_enrollment UNIQUE (patient_id, protocol_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollment_status ON phm_edw.protocol_enrollment (status);

-- ─── D8: AMP outreach disposition ledger (declined is a COUNTED outcome) ─────
CREATE TABLE IF NOT EXISTS phm_edw.amp_outreach (
  outreach_id    SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  care_gap_id    INT REFERENCES phm_edw.care_gap(care_gap_id),
  amp_tier       SMALLINT NOT NULL,      -- 1=pre-visit 2=not-seen-1yr 3=not-seen-2yr 4=point-of-care
  appointment_id INT REFERENCES phm_edw.appointment(appointment_id),
  disposition    VARCHAR(40) NOT NULL DEFAULT 'pending', -- labs_completed|procedure|reminder|declined|education|referral|pending
  net_revenue    NUMERIC,                -- captured at disposition time
  contacted_at   TIMESTAMP,
  outreach_by    VARCHAR(100),
  notes          TEXT,
  created_date   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_amp_outreach UNIQUE (patient_id, care_gap_id, amp_tier)
);
CREATE INDEX IF NOT EXISTS idx_amp_tier ON phm_edw.amp_outreach (amp_tier, disposition);
CREATE INDEX IF NOT EXISTS idx_amp_patient ON phm_edw.amp_outreach (patient_id);

-- D8: per-gap net revenue for the ROI capture model
ALTER TABLE phm_edw.measure_definition ADD COLUMN IF NOT EXISTS net_revenue NUMERIC;

-- ─── D9: MTM auto-referral state machine over the existing referral table ────
CREATE TABLE IF NOT EXISTS phm_edw.mtm_referral (
  mtm_id         SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  referral_id    INT REFERENCES phm_edw.referral(referral_id),
  condition      VARCHAR(40) NOT NULL,   -- diabetes | hypertension | hyperlipidemia
  trigger_value  NUMERIC NOT NULL,       -- the uncontrolled measurement
  trigger_code   VARCHAR(20) NOT NULL,   -- LOINC / 'SBP'
  mtm_status     VARCHAR(20) NOT NULL DEFAULT 'referred', -- referred | managed | at_goal | repatriated
  referred_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  goal_at        DATE,
  repatriated_at DATE,
  active_ind     CHAR(1) NOT NULL DEFAULT 'Y',
  created_date   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mtm_open UNIQUE (patient_id, condition)
);
CREATE INDEX IF NOT EXISTS idx_mtm_status ON phm_edw.mtm_referral (mtm_status);

COMMENT ON TABLE phm_edw.protocol_enrollment IS
  'Auto-Orders enrollment — physician co-signs once (status active), 5-year standing, dis-enroll any time. The automation is an offer, not a mandate.';
COMMENT ON TABLE phm_edw.amp_outreach IS
  'AMP disposition ledger. Every outreach ends in a counted state — declined and unable-to-reach included.';
