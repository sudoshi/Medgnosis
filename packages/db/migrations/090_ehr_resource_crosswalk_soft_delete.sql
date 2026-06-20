-- =============================================================================
-- 090: Soft-delete audit on ehr_resource_crosswalk
--
-- Records when/why a source resource was deleted or marked entered-in-error so
-- the EDW row (active_ind='N') retains an auditable provenance link. Additive
-- and non-destructive.
-- =============================================================================

ALTER TABLE phm_edw.ehr_resource_crosswalk
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_reason  VARCHAR(50);
