// =============================================================================
// Unit tests - probabilistic match decision (score band + match-grade gate)
// =============================================================================

import { describe, expect, it } from 'vitest';
import { decideProbabilisticMatch } from './probabilisticMatch.js';
import type { MatchGradeCode, MpiCandidate } from './mpiClient.js';

const thresholds = { autoThreshold: 0.9, reviewThreshold: 0.6 };
function candidate(value: string, score: number, grade: MatchGradeCode | null = 'certain'): MpiCandidate {
  return { masterIdentifier: { system: 'urn:mpi', value }, score, grade };
}

describe('decideProbabilisticMatch', () => {
  it('returns none when there are no candidates', () => {
    expect(decideProbabilisticMatch([], thresholds)).toEqual({ action: 'none' });
  });

  it('auto-attaches when score >= auto AND the MPI grades it certain', () => {
    const result = decideProbabilisticMatch([candidate('M1', 0.95, 'certain'), candidate('M2', 0.7)], thresholds);
    expect(result).toEqual({ action: 'attach', candidate: candidate('M1', 0.95, 'certain') });
  });

  it('routes a high score to REVIEW (not auto-merge) when the grade is not certain (overlay safety)', () => {
    const result = decideProbabilisticMatch([candidate('M1', 0.97, 'probable')], thresholds);
    expect(result.action).toBe('review');
  });

  it('auto-attaches on score alone when requireCertainGradeForAuto is disabled', () => {
    const result = decideProbabilisticMatch(
      [candidate('M1', 0.95, 'probable')],
      { ...thresholds, requireCertainGradeForAuto: false },
    );
    expect(result.action).toBe('attach');
  });

  it('routes to review when the best score is in the [review, auto) band', () => {
    const result = decideProbabilisticMatch([candidate('M2', 0.72), candidate('M3', 0.61)], thresholds);
    expect(result.action).toBe('review');
    if (result.action === 'review') {
      expect(result.candidate.masterIdentifier.value).toBe('M2');
      expect(result.reviewCandidates.map((c) => c.masterIdentifier.value)).toEqual(['M2', 'M3']);
    }
  });

  it('returns none when the best score is below the review threshold', () => {
    expect(decideProbabilisticMatch([candidate('M4', 0.4)], thresholds)).toEqual({ action: 'none' });
  });

  it('treats the auto threshold as inclusive (with a certain grade) and review as inclusive', () => {
    expect(decideProbabilisticMatch([candidate('M', 0.9, 'certain')], thresholds).action).toBe('attach');
    expect(decideProbabilisticMatch([candidate('M', 0.6)], thresholds).action).toBe('review');
  });
});
