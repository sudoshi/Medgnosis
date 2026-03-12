-- =============================================================================
-- Migration 029: Solr CDC Triggers
-- Adds updated_at columns, auto-update triggers, and pg_notify triggers
-- for real-time Solr synchronization via CDC (Change Data Capture).
-- =============================================================================

SET search_path TO phm_edw, public;

-- ---------------------------------------------------------------------------
-- 1. Add updated_at columns (IF NOT EXISTS pattern via DO blocks)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _tables text[] := ARRAY[
    'patient',
    'care_gap',
    'encounter',
    'condition_diagnosis',
    'observation',
    'medication_order'
  ];
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY _tables
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'phm_edw'
        AND table_name = _tbl
        AND column_name = 'updated_at'
    ) THEN
      EXECUTE format(
        'ALTER TABLE phm_edw.%I ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()',
        _tbl
      );
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. set_updated_at() trigger function — stamps updated_at on every UPDATE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION phm_edw.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 3. Attach BEFORE UPDATE triggers for updated_at on all 6 tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _tables text[] := ARRAY[
    'patient',
    'care_gap',
    'encounter',
    'condition_diagnosis',
    'observation',
    'medication_order'
  ];
  _tbl text;
  _trigger_name text;
BEGIN
  FOREACH _tbl IN ARRAY _tables
  LOOP
    _trigger_name := 'trg_set_updated_at_' || _tbl;
    -- Drop if exists to make migration re-runnable
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON phm_edw.%I',
      _trigger_name, _tbl
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON phm_edw.%I '
      'FOR EACH ROW EXECUTE FUNCTION phm_edw.set_updated_at()',
      _trigger_name, _tbl
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. notify_solr_sync() — sends pg_notify with table, id, and operation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION phm_edw.notify_solr_sync()
RETURNS trigger AS $$
DECLARE
  _payload jsonb;
  _id bigint;
  _pk_col text;
BEGIN
  -- Determine the primary key column based on table name
  _pk_col := CASE TG_TABLE_NAME
    WHEN 'patient'              THEN 'patient_id'
    WHEN 'care_gap'             THEN 'care_gap_id'
    WHEN 'encounter'            THEN 'encounter_id'
    WHEN 'condition_diagnosis'  THEN 'condition_diagnosis_id'
    WHEN 'observation'          THEN 'observation_id'
    WHEN 'medication_order'     THEN 'medication_order_id'
  END;

  -- Get the row ID
  IF TG_OP = 'DELETE' THEN
    EXECUTE format('SELECT ($1).%I', _pk_col) INTO _id USING OLD;
  ELSE
    EXECUTE format('SELECT ($1).%I', _pk_col) INTO _id USING NEW;
  END IF;

  _payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'id',    _id,
    'op',    TG_OP
  );

  PERFORM pg_notify('solr_sync', _payload::text);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 5. Attach AFTER INSERT/UPDATE/DELETE triggers for CDC on all 6 tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _tables text[] := ARRAY[
    'patient',
    'care_gap',
    'encounter',
    'condition_diagnosis',
    'observation',
    'medication_order'
  ];
  _tbl text;
  _trigger_name text;
BEGIN
  FOREACH _tbl IN ARRAY _tables
  LOOP
    _trigger_name := 'trg_solr_sync_' || _tbl;
    -- Drop if exists to make migration re-runnable
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON phm_edw.%I',
      _trigger_name, _tbl
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON phm_edw.%I '
      'FOR EACH ROW EXECUTE FUNCTION phm_edw.notify_solr_sync()',
      _trigger_name, _tbl
    );
  END LOOP;
END
$$;
