// =============================================================================
// Probabilistic match decision — pure score-band policy.
//
// Given MPI candidates (sorted desc by score) and the configured thresholds,
// decide whether to auto-attach to the top master, route the band to a steward
// review, or treat as no match. Both thresholds are inclusive.
// =============================================================================

import type { MpiCandidate } from './mpiClient.js';

export interface ProbabilisticThresholds {
  autoThreshold: number;
  reviewThreshold: number;
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
  if (best.score >= thresholds.autoThreshold) {
    return { action: 'attach', candidate: best };
  }
  return {
    action: 'review',
    candidate: best,
    reviewCandidates: ranked.filter((candidate) => candidate.score >= thresholds.reviewThreshold),
  };
}
