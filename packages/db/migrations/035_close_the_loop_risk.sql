-- =============================================================================
-- 035: Close the Loop + Population Risk (CDS parity Phase 3: D10+D11)
-- =============================================================================

-- D10: one tracked loop per abnormal result needing follow-up
CREATE TABLE IF NOT EXISTS phm_edw.result_loop (
  loop_id          SERIAL PRIMARY KEY,
  result_id        INT NOT NULL REFERENCES phm_edw.order_result(result_id),
  patient_id       INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  obligation       VARCHAR(80) NOT NULL,      -- review_abnormal | repeat_test | colposcopy | ...
  severity         VARCHAR(20) NOT NULL,      -- critical | high | routine
  identified_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE NOT NULL,             -- identified_date + window
  loop_status      VARCHAR(20) NOT NULL DEFAULT 'open', -- open | closed
  closure_type     VARCHAR(40),               -- reviewed | followup_order | appropriate_care | refused | unable_to_reach
  closure_evidence JSONB,
  resolved_by      VARCHAR(100),
  resolved_at      TIMESTAMP,
  created_date     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_result_loop UNIQUE (result_id)
);
CREATE INDEX IF NOT EXISTS idx_result_loop_status ON phm_edw.result_loop (loop_status, due_date);
CREATE INDEX IF NOT EXISTS idx_result_loop_patient ON phm_edw.result_loop (patient_id);

COMMENT ON TABLE phm_edw.result_loop IS
  'Close the Loop: every abnormal result tracked to a documented disposition. closure_type mirrors the four terminal states (appropriate_care / clinical resolution=reviewed / refused / unable_to_reach) plus followup_order.';

-- D11: population risk scores (one current row per patient+model)
CREATE TABLE IF NOT EXISTS phm_edw.population_risk_score (
  score_id       SERIAL PRIMARY KEY,
  patient_id     INT NOT NULL REFERENCES phm_edw.patient(patient_id),
  model_code     VARCHAR(40) NOT NULL,        -- CHA2DS2_VASC | GAIL_BCRA | ...
  score_numeric  NUMERIC,                     -- null when insufficient_data
  risk_category  VARCHAR(40) NOT NULL,        -- low | moderate | high | insufficient_data
  components     JSONB NOT NULL,              -- per-factor breakdown (transparency -> trust)
  care_gap       BOOLEAN NOT NULL DEFAULT FALSE, -- elevated risk + missing intervention
  computed_date  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_pop_risk UNIQUE (patient_id, model_code)
);
CREATE INDEX IF NOT EXISTS idx_pop_risk_model ON phm_edw.population_risk_score (model_code, care_gap);

-- Register the two new models in the existing star registry
INSERT INTO phm_star.dim_risk_model
  (model_code, model_name, model_version, model_type, description, is_active, effective_start, effective_end)
VALUES
  ('CHA2DS2_VASC', 'CHA2DS2-VASc Stroke Risk', '2010', 'Clinical Score',
   'Stroke risk in atrial fibrillation; guides anticoagulation. Inputs from problem list + demographics.',
   TRUE, CURRENT_DATE, '9999-12-31'),
  ('GAIL_BCRA', 'Gail Breast Cancer Risk (BCRA)', '2.0', 'Predictive',
   '5-year invasive breast cancer risk (7 factors). Requires reproductive + family-history inputs.',
   TRUE, CURRENT_DATE, '9999-12-31')
ON CONFLICT DO NOTHING;
