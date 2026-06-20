-- =============================================================================
-- 088: Add 'probabilistic_match' to the identity review reason vocabulary.
--
-- MPI (probabilistic) reviews previously reused the 'demographic_only_match'
-- bucket; give them a distinct reason so stewards see provenance. Widening a
-- CHECK is additive — every existing row still satisfies the new constraint.
-- =============================================================================

ALTER TABLE phm_edw.identity_review_queue DROP CONSTRAINT ck_identity_review_reason;

ALTER TABLE phm_edw.identity_review_queue ADD CONSTRAINT ck_identity_review_reason
  CHECK (reason IN ('demographic_only_match', 'identifier_conflict', 'probabilistic_match'));
