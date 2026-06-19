// =============================================================================
// Unit tests - probabilistic match decision (pure score-band policy)
// =============================================================================

import { describe, expect, it } from 'vitest';
import { decideProbabilisticMatch } from './probabilisticMatch.js';
import type { MpiCandidate } from './mpiClient.js';

const thresholds = { autoThreshold: 0.9, reviewThreshold: 0.6 };
function candidate(value: string, score: number): MpiCandidate {
  return { masterIdentifier: { system: 'urn:mpi', value }, score, grade: null };
}

describe('decideProbabilisticMatch', () => {
  it('returns none when there are no candidates', () => {
    expect(decideProbabilisticMatch([], thresholds)).toEqual({ action: 'none' });
  });

  it('attaches to the top candidate at or above the auto threshold', () => {
    const result = decideProbabilisticMatch([candidate('M1', 0.95), candidate('M2', 0.7)], thresholds);
    expect(result).toEqual({ action: 'attach', candidate: candidate('M1', 0.95) });
  });

  it('routes to review when the best score is in the [review, auto) band', () => {
    const result = decideProbabilisticMatch([candidate('M2', 0.72), candidate('M3', 0.61)], thresholds);
    expect(result.action).toBe('review');
    if (result.action === 'review') {
      expect(result.candidate).toEqual(candidate('M2', 0.72));
      expect(result.reviewCandidates.map((c) => c.masterIdentifier.value)).toEqual(['M2', 'M3']);
    }
  });

  it('returns none when the best score is below the review threshold', () => {
    expect(decideProbabilisticMatch([candidate('M4', 0.4)], thresholds)).toEqual({ action: 'none' });
  });

  it('treats the auto threshold as inclusive and review as inclusive', () => {
    expect(decideProbabilisticMatch([candidate('M', 0.9)], thresholds).action).toBe('attach');
    expect(decideProbabilisticMatch([candidate('M', 0.6)], thresholds).action).toBe('review');
  });
});
