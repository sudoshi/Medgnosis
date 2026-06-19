-- =============================================================================
-- 087: Patient identity / EMPI foundation (Phase 0)
--
-- Introduces an OMOP-aligned enterprise identity model so that the same human
-- arriving from multiple tenants/sources (SMART launch, bulk export, aggregator,
-- QHIN) resolves to one `person` instead of minting duplicate phm_edw.patient
-- rows. Additive and non-destructive: existing phm_edw.patient rows are
-- preserved and linked via phm_edw.patient_link.
--
-- Matching tiers (see resolvePatientIdentity.ts):
--   1. strong identifier (system + value)        -> phm_edw.patient_identifier
--   2. demographic floor key (name + DOB + sex)   -> phm_edw.person.demographic_match_key
-- Demographic-only matches never auto-merge; they enqueue a steward review.
-- =============================================================================

-- The enterprise/golden identity. Maps conceptually to OMOP `person`.
CREATE TABLE phm_edw.person (
  person_id             BIGSERIAL PRIMARY KEY,
  first_name            VARCHAR(100) NOT NULL,
  last_name             VARCHAR(100) NOT NULL,
  date_of_birth         DATE NOT NULL,
  sex                   VARCHAR(50),
  -- Lowercased "last|first|dob|sex" floor key (HL7 Identity Matching IG minimum
  -- data set). One current key per person; used for the demographic match tier.
  demographic_match_key VARCHAR(400),
  -- active | provisional (demographic-only match awaiting review) | merged
  status                VARCHAR(20) NOT NULL DEFAULT 'active',
  -- When status = 'merged', the surviving person this record was merged into.
  merged_into_person_id BIGINT REFERENCES phm_edw.person(person_id),
  source_system         VARCHAR(80),
  origin_ehr_tenant_id  BIGINT REFERENCES phm_edw.ehr_tenant(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_person_status CHECK (status IN ('active', 'provisional', 'merged')),
  CONSTRAINT ck_person_first_name CHECK (length(trim(first_name)) > 0),
  CONSTRAINT ck_person_last_name CHECK (length(trim(last_name)) > 0)
);

CREATE INDEX idx_person_demographic_match_key
  ON phm_edw.person (demographic_match_key)
  WHERE status <> 'merged';

CREATE INDEX idx_person_merged_into
  ON phm_edw.person (merged_into_person_id)
  WHERE merged_into_person_id IS NOT NULL;

COMMENT ON TABLE phm_edw.person IS
  'Enterprise (golden) patient identity. The single resolved identity that multiple source-system patient records map to. Aligns with OMOP person.';
COMMENT ON COLUMN phm_edw.person.demographic_match_key IS
  'Lowercased name+DOB+sex floor key for the deterministic demographic match tier.';
COMMENT ON COLUMN phm_edw.person.status IS
  'active | provisional (demographic-only match pending steward review) | merged.';

-- Cross-source identifiers. One assigning-authority (system,value) identifies
-- exactly one person globally; weak (system-less) identifiers are not stored
-- here because they cannot be safely compared across sources.
CREATE TABLE phm_edw.patient_identifier (
  id            BIGSERIAL PRIMARY KEY,
  person_id     BIGINT NOT NULL REFERENCES phm_edw.person(person_id),
  system        VARCHAR(300) NOT NULL,
  value         VARCHAR(300) NOT NULL,
  -- For SSN / strong PII identifiers, store a hash here and redact `value`
  -- (HIPAA minimization). Cleartext only for low-sensitivity assigning IDs.
  value_hash    VARCHAR(128),
  type_code     VARCHAR(20),
  source_system VARCHAR(80),
  ehr_tenant_id BIGINT REFERENCES phm_edw.ehr_tenant(id),
  active        BOOLEAN NOT NULL DEFAULT true,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_patient_identifier_system CHECK (length(trim(system)) > 0),
  CONSTRAINT ck_patient_identifier_value CHECK (length(trim(value)) > 0),
  CONSTRAINT uq_patient_identifier_system_value UNIQUE (system, value)
);

CREATE INDEX idx_patient_identifier_person ON phm_edw.patient_identifier (person_id);

COMMENT ON TABLE phm_edw.patient_identifier IS
  'Multi-source identifiers (MRNs, national IDs, QHIN-resolved IDs) for a person. UNIQUE(system,value) enforces one assigning-authority identifier per person.';

-- Links the legacy/source-scoped phm_edw.patient row to its enterprise person.
-- Preserves all existing patient_id-keyed analytics (dim_patient, fact_*).
CREATE TABLE phm_edw.patient_link (
  patient_id    INTEGER PRIMARY KEY REFERENCES phm_edw.patient(patient_id),
  person_id     BIGINT NOT NULL REFERENCES phm_edw.person(person_id),
  ehr_tenant_id BIGINT REFERENCES phm_edw.ehr_tenant(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patient_link_person ON phm_edw.patient_link (person_id);

COMMENT ON TABLE phm_edw.patient_link IS
  'Maps a legacy source-scoped phm_edw.patient to its resolved enterprise person. Additive; existing patient rows are never destroyed.';

-- Append-only audit of identity actions: provisional creation, review enqueue,
-- merge, and (reversible) un-merge. Never updated in place.
CREATE TABLE phm_edw.patient_merge_log (
  id               BIGSERIAL PRIMARY KEY,
  action           VARCHAR(30) NOT NULL,
  source_person_id BIGINT,
  target_person_id BIGINT,
  reason           TEXT,
  performed_by     VARCHAR(120) NOT NULL DEFAULT 'system',
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_patient_merge_log_action
    CHECK (action IN ('provisional_created', 'review_enqueued', 'merge', 'unmerge', 'identifier_attached')),
  CONSTRAINT ck_patient_merge_log_details CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX idx_patient_merge_log_target ON phm_edw.patient_merge_log (target_person_id, created_at DESC);

COMMENT ON TABLE phm_edw.patient_merge_log IS
  'Append-only audit trail of identity-resolution actions, supporting steward review and reversal of merges/overlays.';

-- Steward work queue for matches that must not auto-merge.
CREATE TABLE phm_edw.identity_review_queue (
  id                   BIGSERIAL PRIMARY KEY,
  person_id            BIGINT NOT NULL REFERENCES phm_edw.person(person_id),
  candidate_person_ids BIGINT[] NOT NULL DEFAULT '{}',
  reason               VARCHAR(40) NOT NULL,
  ehr_tenant_id        BIGINT REFERENCES phm_edw.ehr_tenant(id),
  source_system        VARCHAR(80),
  demographic_key      VARCHAR(400),
  status               VARCHAR(20) NOT NULL DEFAULT 'open',
  resolved_by          VARCHAR(120),
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_identity_review_reason
    CHECK (reason IN ('demographic_only_match', 'identifier_conflict')),
  CONSTRAINT ck_identity_review_status
    CHECK (status IN ('open', 'merged', 'dismissed'))
);

CREATE INDEX idx_identity_review_queue_open
  ON phm_edw.identity_review_queue (status, created_at)
  WHERE status = 'open';

COMMENT ON TABLE phm_edw.identity_review_queue IS
  'Open queue of possible matches (demographic-only or identifier conflict) for data-steward adjudication. Resolution writes phm_edw.patient_merge_log.';
