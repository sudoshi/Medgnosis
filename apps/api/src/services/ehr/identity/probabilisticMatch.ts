// =============================================================================
// Probabilistic match decision — pure score-band policy.
//
// Given MPI candidates (sorted desc by score) and the configured thresholds,
// decide whether to auto-attach to the top master, route the band to a steward
// review, or treat as no match. Both thresholds are inclusive.
//
// Overlay safety: auto-attach (auto-merge) requires BOTH a score >= auto AND the
// MPI itself grading the candidate `certain`. A merely-high demographic score
// never auto-merges — the certainty judgment is deferred to SanteMPI's
// configured matching (which only grades `certain` on strong, multi-attribute
// evidence). Set requireCertainGradeForAuto=false only with validated data.
// =============================================================================

import type { MpiCandidate } from './mpiClient.js';

export interface ProbabilisticThresholds {
  autoThreshold: number;
  reviewThreshold: number;
  /** Require match-grade 'certain' (not just score) to auto-merge. Default true. */
  requireCertainGradeForAuto?: boolean;
}

export type ProbabilisticDecision =
  | { action: 'attach'; candidate: MpiCandidate }
  | { action: 'review'; candidate: MpiCandidate; reviewCandidates: MpiCandidate[] }
  | { action: 'none' };

export function decideProbabilisticMatch(
  candidates: MpiCandidate[],
  thresholds: ProbabilisticThresholds,
): ProbabilisticDecision {
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < thresholds.reviewThreshold) {
    return { action: 'none' };
  }
  const gradeOk = thresholds.requireCertainGradeForAuto === false || best.grade === 'certain';
  if (best.score >= thresholds.autoThreshold && gradeOk) {
    return { action: 'attach', candidate: best };
  }
  return {
    action: 'review',
    candidate: best,
    reviewCandidates: ranked.filter((candidate) => candidate.score >= thresholds.reviewThreshold),
  };
}
