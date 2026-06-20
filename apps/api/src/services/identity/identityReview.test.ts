// =============================================================================
// Unit tests - identity steward review (merge / dismiss)
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  type SqlMock = typeof fn & {
    json: (v: unknown) => unknown;
    unsafe: (query: string, params?: readonly unknown[]) => Promise<unknown>;
    begin: <T>(cb: (tx: SqlMock) => Promise<T>) => Promise<T>;
  };
  const sqlMock = fn as SqlMock;
  sqlMock.json = (v) => v;
  sqlMock.unsafe = async (query, params = []) => fn([query] as unknown as TemplateStringsArray, ...params);
  sqlMock.begin = async (cb) => cb(sqlMock);
  return { mockSql: sqlMock };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { mergeReview, dismissReview, unmergeMerge, listRecentMerges } from './identityReview.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.unsafe = async (query: string, params: readonly unknown[] = []) =>
    mockSql([query] as unknown as TemplateStringsArray, ...params);
  mockSql.begin = async (cb: (tx: typeof mockSql) => Promise<unknown>) => cb(mockSql);
});

function openReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, person_id: 10, candidate_person_ids: [20], reason: 'demographic_only_match',
    source_system: 'epic', demographic_key: 'k', status: 'open', ...overrides,
  };
}

function queriesFor(predicate: (text: string) => boolean) {
  return mockSql.mock.calls
    .map((c) => ({ text: (c[0] as TemplateStringsArray).join(''), params: c.slice(1) }))
    .filter((q) => predicate(q.text));
}

describe('mergeReview', () => {
  it('merges the non-survivor persons into the survivor, repoints links, tombstones, audits, resolves', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.identity_review_queue') && text.includes('WHERE id')) {
        return Promise.resolve([openReview()]);
      }
      if (text.includes('UPDATE phm_edw.patient_link')) {
        return Promise.resolve([{ patient_id: 101 }, { patient_id: 102 }]);
      }
      return Promise.resolve([]);
    });

    const result = await mergeReview({ reviewId: 1, survivorPersonId: 10, performedBy: 'admin@x' });

    expect(result).toEqual({ survivorPersonId: 10, mergedPersonIds: [20], movedPatientLinks: 2 });

    // patient_link repointed loser(20) -> survivor(10)
    const link = queriesFor((t) => t.includes('UPDATE phm_edw.patient_link'))[0]!;
    expect(link.params).toEqual([10, 20]);
    // loser tombstoned as merged into survivor
    const tomb = queriesFor((t) => t.includes("SET status = 'merged'") && t.includes('merged_into_person_id'))[0]!;
    expect(tomb.params).toEqual([10, 20]);
    // audit row written with action 'merge'
    expect(queriesFor((t) => t.includes("INSERT INTO phm_edw.patient_merge_log") && t.includes("'merge'"))).toHaveLength(1);
    // queue resolved as merged
    const resolved = queriesFor((t) => t.includes('identity_review_queue') && t.includes("SET status = 'merged'"))[0]!;
    expect(resolved.params).toEqual(['admin@x', 1]);
  });

  it('rejects a survivor that is not part of the review', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('identity_review_queue') && text.includes('WHERE id')) return Promise.resolve([openReview()]);
      return Promise.resolve([]);
    });
    await expect(mergeReview({ reviewId: 1, survivorPersonId: 999, performedBy: 'a' })).rejects.toThrow(/survivor/i);
  });

  it('refuses to merge an already-resolved review', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('identity_review_queue') && text.includes('WHERE id')) {
        return Promise.resolve([openReview({ status: 'merged' })]);
      }
      return Promise.resolve([]);
    });
    await expect(mergeReview({ reviewId: 1, survivorPersonId: 10, performedBy: 'a' })).rejects.toThrow(/already merged/i);
  });
});

describe('dismissReview', () => {
  it('marks an open review dismissed', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('identity_review_queue') && text.includes('WHERE id') && !text.includes('SET')) {
        return Promise.resolve([openReview()]);
      }
      return Promise.resolve([]);
    });
    await dismissReview(1, 'admin@x');
    expect(queriesFor((t) => t.includes("SET status = 'dismissed'"))).toHaveLength(1);
  });

  it('refuses to dismiss a resolved review', async () => {
    mockSql.mockImplementation(() => Promise.resolve([openReview({ status: 'dismissed' })]));
    await expect(dismissReview(1, 'a')).rejects.toThrow(/already dismissed/i);
  });
});

function mergeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7, source_person_id: 20, target_person_id: 10, reason: 'demographic_only_match',
    performed_by: 'admin@x', created_at: 'now',
    details: { movedPatientIds: [101], movedIdentifiers: [{ system: 'urn:mpi', value: 'M1' }] },
    ...overrides,
  };
}

describe('unmergeMerge', () => {
  it('reverses a merge: repoints links + identifiers back, reactivates the source, audits', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const t = strings.join('');
      if (t.includes('FROM phm_edw.patient_merge_log') && t.includes("action = 'merge'") && !t.includes('count(')) {
        return Promise.resolve([mergeLogRow()]);
      }
      if (t.includes('count(*)') && t.includes("action = 'unmerge'")) return Promise.resolve([{ count: 0 }]);
      return Promise.resolve([]);
    });

    const result = await unmergeMerge(7, 'admin@x');
    expect(result).toEqual({ restoredPersonId: 20 });

    // links repointed target(10) -> source(20) for the recorded patient ids
    const link = queriesFor((t) => t.includes('UPDATE phm_edw.patient_link') && t.includes('ANY'))[0]!;
    expect(link.params).toEqual([20, 10, [101]]);
    // identifier repointed back
    expect(queriesFor((t) => t.includes('UPDATE phm_edw.patient_identifier'))[0]!.params).toEqual([20, 10, 'urn:mpi', 'M1']);
    // source reactivated
    expect(queriesFor((t) => t.includes("SET status = 'active'") && t.includes('merged_into_person_id = NULL'))).toHaveLength(1);
    // unmerge audit written
    expect(queriesFor((t) => t.includes('INSERT INTO phm_edw.patient_merge_log') && t.includes("'unmerge'"))).toHaveLength(1);
  });

  it('refuses to un-merge a merge that was already reversed', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const t = strings.join('');
      if (t.includes('FROM phm_edw.patient_merge_log') && t.includes("action = 'merge'") && !t.includes('count(')) {
        return Promise.resolve([mergeLogRow()]);
      }
      if (t.includes('count(*)') && t.includes("action = 'unmerge'")) return Promise.resolve([{ count: 1 }]);
      return Promise.resolve([]);
    });
    await expect(unmergeMerge(7, 'a')).rejects.toThrow(/already been un-merged/i);
  });

  it('throws when the merge log row is missing', async () => {
    mockSql.mockImplementation(() => Promise.resolve([]));
    await expect(unmergeMerge(99, 'a')).rejects.toThrow(/not found/i);
  });
});

describe('listRecentMerges', () => {
  it('maps merge rows with a reverted flag', async () => {
    mockSql.mockImplementation(() => Promise.resolve([
      { id: 7, source_person_id: 20, target_person_id: 10, reason: 'demographic_only_match', performed_by: 'admin@x', created_at: 'now', reverted: false },
    ]));
    const merges = await listRecentMerges();
    expect(merges[0]).toEqual({
      id: 7, sourcePersonId: 20, targetPersonId: 10, reason: 'demographic_only_match',
      performedBy: 'admin@x', createdAt: 'now', reverted: false,
    });
  });
});
