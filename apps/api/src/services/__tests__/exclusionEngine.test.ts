// =============================================================================
// Unit tests — clinical exclusion engine
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUnsafe, mockBegin } = vi.hoisted(() => {
  const mockUnsafe = vi.fn(async () => ({ count: 0 }));
  const mockBegin = vi.fn(async (cb: (tx: { unsafe: typeof mockUnsafe }) => Promise<unknown>) =>
    cb({ unsafe: mockUnsafe }),
  );
  return { mockUnsafe, mockBegin };
});

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(vi.fn(), { begin: mockBegin, unsafe: mockUnsafe }),
}));

import { recomputeClinicalExclusions } from '../exclusionEngine.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockUnsafe.mockResolvedValue({ count: 0 });
});

describe('recomputeClinicalExclusions', () => {
  it('runs exclude + revert + star-sync statements in ONE transaction', async () => {
    mockUnsafe
      .mockResolvedValueOnce({ count: 12 }) // newly excluded (care_gap)
      .mockResolvedValueOnce({ count: 2677 }) // reverted to open (care_gap)
      .mockResolvedValueOnce({ count: 9999 }); // bundle_detail sync
    const result = await recomputeClinicalExclusions();
    expect(mockBegin).toHaveBeenCalledOnce();
    expect(mockUnsafe.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.newlyExcluded).toBe(12);
    expect(result.revertedToOpen).toBe(2677);
  });
});
