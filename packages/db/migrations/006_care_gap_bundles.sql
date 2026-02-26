-- =====================================================================
-- 006_care_gap_bundles.sql
-- Phase 10.6: Care Gap Bundle reference tables
-- Adds condition_bundle, bundle_measure, bundle_overlap_rule tables
-- and extends the existing care_gap table with bundle-aware columns.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TABLE 1: condition_bundle
-- Groups chronic conditions into care bundles.
-- Each row = one chronic condition with a defined quality measure bundle.
-- icd10_pattern stores comma-separated SQL LIKE patterns for matching.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phm_edw.condition_bundle (
    bundle_id            SERIAL        PRIMARY KEY,
    bundle_code          VARCHAR(30)   NOT NULL UNIQUE,
    condition_name       VARCHAR(255)  NOT NULL,
    icd10_pattern        VARCHAR(500)  NOT NULL,
    bundle_size          INT           NOT NULL DEFAULT 0,
    key_ecqm_refs        VARCHAR(500)  NULL,
    description          VARCHAR(2000) NULL,
    active_ind           CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date         TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date         TIMESTAMP     NULL
);

COMMENT ON TABLE phm_edw.condition_bundle
    IS 'Defines chronic condition bundles. Each bundle groups quality measures for one condition.';

CREATE INDEX IF NOT EXISTS idx_cb_code
    ON phm_edw.condition_bundle (bundle_code);
CREATE INDEX IF NOT EXISTS idx_cb_active
    ON phm_edw.condition_bundle (active_ind) WHERE active_ind = 'Y';

-- ---------------------------------------------------------------------
-- TABLE 2: bundle_measure
-- Junction table linking condition bundles to measure_definition.
-- ordinal controls display ordering within the bundle.
-- frequency and ecqm_reference are per-bundle-measure metadata.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phm_edw.bundle_measure (
    bundle_measure_id    SERIAL        PRIMARY KEY,
    bundle_id            INT           NOT NULL,
    measure_id           INT           NOT NULL,
    ordinal              INT           NOT NULL DEFAULT 0,
    frequency            VARCHAR(100)  NULL,
    ecqm_reference       VARCHAR(200)  NULL,
    active_ind           CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date         TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date         TIMESTAMP     NULL,

    CONSTRAINT fk_bm_bundle
        FOREIGN KEY (bundle_id)
        REFERENCES phm_edw.condition_bundle(bundle_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_bm_measure
        FOREIGN KEY (measure_id)
        REFERENCES phm_edw.measure_definition(measure_id)
        ON DELETE CASCADE,

    CONSTRAINT uq_bundle_measure UNIQUE (bundle_id, measure_id)
);

COMMENT ON TABLE phm_edw.bundle_measure
    IS 'Junction table linking condition bundles to quality measures with ordering and frequency.';

CREATE INDEX IF NOT EXISTS idx_bm_bundle
    ON phm_edw.bundle_measure (bundle_id);
CREATE INDEX IF NOT EXISTS idx_bm_measure
    ON phm_edw.bundle_measure (measure_id);

-- ---------------------------------------------------------------------
-- TABLE 3: bundle_overlap_rule
-- Deduplication rules for measures shared across multiple conditions.
-- applicable_bundles is a CSV of bundle_codes for filtering.
-- canonical_measure_code identifies which measure to keep.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phm_edw.bundle_overlap_rule (
    overlap_rule_id      SERIAL        PRIMARY KEY,
    rule_code            VARCHAR(50)   NOT NULL UNIQUE,
    shared_domain        VARCHAR(100)  NOT NULL,
    applicable_bundles   VARCHAR(500)  NOT NULL,
    canonical_measure_code VARCHAR(50) NULL,
    dedup_rule           VARCHAR(500)  NOT NULL,
    active_ind           CHAR(1)       NOT NULL DEFAULT 'Y',
    created_date         TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_date         TIMESTAMP     NULL
);

COMMENT ON TABLE phm_edw.bundle_overlap_rule
    IS 'Deduplication rules for measures shared across multiple condition bundles.';

-- ---------------------------------------------------------------------
-- ALTER: Extend existing care_gap table with bundle-aware columns
-- All new columns are nullable to preserve backward compatibility.
-- ---------------------------------------------------------------------
ALTER TABLE phm_edw.care_gap
    ADD COLUMN IF NOT EXISTS bundle_id INT NULL
        REFERENCES phm_edw.condition_bundle(bundle_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS due_date DATE NULL,
    ADD COLUMN IF NOT EXISTS gap_priority VARCHAR(20) NULL;

CREATE INDEX IF NOT EXISTS idx_cg_bundle
    ON phm_edw.care_gap (bundle_id);
CREATE INDEX IF NOT EXISTS idx_cg_due_date
    ON phm_edw.care_gap (due_date) WHERE active_ind = 'Y';

COMMENT ON COLUMN phm_edw.care_gap.bundle_id IS 'FK to condition_bundle — which bundle this gap belongs to';
COMMENT ON COLUMN phm_edw.care_gap.due_date IS 'When this measure is next due for the patient';
COMMENT ON COLUMN phm_edw.care_gap.gap_priority IS 'Priority level: high, medium, low';
