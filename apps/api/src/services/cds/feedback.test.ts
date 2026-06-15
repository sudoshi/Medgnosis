// =============================================================================
// Unit tests — CDS Hooks 2.0.1 feedback store
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { recordFeedback, serviceBurden } from './feedback.js';

beforeEach(() => vi.clearAllMocks());

describe('recordFeedback', () => {
  it('persists each feedback item with its outcome + override reason', async () => {
    mockSql.mockResolvedValue([{ id: 1 }]);

    const n = await recordFeedback('medgnosis-care-gaps', {
      feedback: [
        {
          card: 'c1',
          outcome: 'overridden',
          outcomeTimestamp: '2026-06-14T00:00:00Z',
          overrideReason: { reason: { code: 'not-applicable', display: 'Not applicable' }, userComment: 'n/a here' },
        },
        {
          card: 'c2',
          outcome: 'accepted',
          outcomeTimestamp: '2026-06-14T00:01:00Z',
          acceptedSuggestions: [{ id: 's1' }],
        },
      ],
    });

    expect(n).toBe(2);
    expect(mockSql).toHaveBeenCalledTimes(2);
    const first = mockSql.mock.calls[0]!.slice(1);
    expect(first).toContain('medgnosis-care-gaps');
    expect(first).toContain('overridden');
    expect(first).toContain('Not applicable');
    expect(first).toContain('n/a here');
    const second = mockSql.mock.calls[1]!.slice(1);
    expect(second).toContain('accepted');
    expect(second).toContain('s1');
  });

  it('rejects an invalid outcome', async () => {
    await expect(
      recordFeedback('x', { feedback: [{ card: 'c', outcome: 'maybe', outcomeTimestamp: 't' }] }),
    ).rejects.toThrow();
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('rejects a payload without a feedback array', async () => {
    await expect(recordFeedback('x', {})).rejects.toThrow();
    await expect(recordFeedback('x', { feedback: 'nope' })).rejects.toThrow();
  });
});

describe('serviceBurden', () => {
  it('aggregates accepted/overridden counts + an override-reason histogram', async () => {
    mockSql.mockResolvedValueOnce([
      { outcome: 'accepted', override_reason_display: null, n: 7 },
      { outcome: 'overridden', override_reason_display: 'Not applicable', n: 3 },
      { outcome: 'overridden', override_reason_display: 'Already addressed', n: 2 },
    ]);

    const b = await serviceBurden('medgnosis-care-gaps');

    expect(b.accepted).toBe(7);
    expect(b.overridden).toBe(5);
    expect(b.total).toBe(12);
    expect(b.overrideRate).toBeCloseTo(5 / 12, 3);
    expect(b.overrideReasons['Not applicable']).toBe(3);
    expect(b.overrideReasons['Already addressed']).toBe(2);
  });
});
