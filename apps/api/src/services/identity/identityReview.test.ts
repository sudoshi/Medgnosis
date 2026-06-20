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

import { mergeReview, dismissReview } from './identityReview.js';

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
