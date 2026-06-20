// =============================================================================
// Unit tests - admin identity review routes
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  type SqlMock = typeof fn & {
    json: (v: unknown) => unknown;
    unsafe: (q: string, p?: readonly unknown[]) => Promise<unknown>;
    begin: <T>(cb: (tx: SqlMock) => Promise<T>) => Promise<T>;
  };
  const m = fn as SqlMock;
  m.json = (v) => v;
  m.unsafe = async (q, p = []) => fn([q] as unknown as TemplateStringsArray, ...p);
  m.begin = async (cb) => cb(m);
  return { mockSql: m };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import identityReviewRoutes from './identityReview.js';

async function buildApp() {
  const app = Fastify();
  const auditLog = vi.fn();
  app.decorateRequest('user', null);
  app.decorateRequest('auditLog', auditLog);
  app.addHook('preHandler', async (req: FastifyRequest) => {
    req.user = { sub: 'admin-1', email: 'admin@x', role: 'admin', org_id: 'o1' } as never;
    (req as FastifyRequest & { auditLog: typeof auditLog }).auditLog = auditLog;
  });
  await app.register(identityReviewRoutes, { prefix: '/identity' });
  await app.ready();
  return { app, auditLog };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.unsafe = async (q: string, p: readonly unknown[] = []) => mockSql([q] as unknown as TemplateStringsArray, ...p);
  mockSql.begin = async (cb: (tx: typeof mockSql) => Promise<unknown>) => cb(mockSql);
});

describe('admin identity review routes', () => {
  it('GET /identity/reviews lists open reviews', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const t = strings.join('');
      if (t.includes("status = 'open'")) {
        return Promise.resolve([{ id: 1, person_id: 10, candidate_person_ids: [20], reason: 'demographic_only_match', source_system: 'epic', demographic_key: 'k', status: 'open', created_at: 'now' }]);
      }
      if (t.includes('FROM phm_edw.person')) {
        return Promise.resolve([{ person_id: 10, first_name: 'Grace', last_name: 'Hopper', date_of_birth: '1906-12-09', sex: 'female', status: 'active', linked_patient_count: 1 }]);
      }
      return Promise.resolve([]);
    });
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/identity/reviews' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.reviews[0]).toMatchObject({ id: 1, reason: 'demographic_only_match' });
    await app.close();
  });

  it('POST /identity/reviews/:id/merge merges and writes an audit log', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const t = strings.join('');
      if (t.includes('identity_review_queue') && t.includes('WHERE id') && !t.includes('SET')) {
        return Promise.resolve([{ id: 1, person_id: 10, candidate_person_ids: [20], reason: 'demographic_only_match', status: 'open' }]);
      }
      if (t.includes('UPDATE phm_edw.patient_link')) return Promise.resolve([{ patient_id: 101 }]);
      return Promise.resolve([]);
    });
    const { app, auditLog } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/identity/reviews/1/merge', payload: { survivorPersonId: 10 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ survivorPersonId: 10, mergedPersonIds: [20], movedPatientLinks: 1 });
    expect(auditLog).toHaveBeenCalledWith('identity_review_merge', 'person', '10', expect.objectContaining({ reviewId: 1 }));
    await app.close();
  });

  it('rejects a merge with a missing survivor', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/identity/reviews/1/merge', payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('GET /identity/merges lists recent merges', async () => {
    mockSql.mockImplementation(() => Promise.resolve([
      { id: 7, source_person_id: 20, target_person_id: 10, reason: 'demographic_only_match', performed_by: 'admin@x', created_at: 'now', reverted: false },
    ]));
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/identity/merges' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.merges[0]).toMatchObject({ id: 7, sourcePersonId: 20, targetPersonId: 10, reverted: false });
    await app.close();
  });

  it('POST /identity/merges/:id/unmerge reverses a merge and audits', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const t = strings.join('');
      if (t.includes('FROM phm_edw.patient_merge_log') && t.includes("action = 'merge'") && !t.includes('count(')) {
        return Promise.resolve([{ id: 7, source_person_id: 20, target_person_id: 10, reason: 'x', performed_by: 'a', created_at: 'now', details: { movedPatientIds: [101], movedIdentifiers: [] } }]);
      }
      if (t.includes('count(*)') && t.includes("action = 'unmerge'")) return Promise.resolve([{ count: 0 }]);
      return Promise.resolve([]);
    });
    const { app, auditLog } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/identity/merges/7/unmerge' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ restoredPersonId: 20 });
    expect(auditLog).toHaveBeenCalledWith('identity_unmerge', 'person', '20', { mergeLogId: 7 });
    await app.close();
  });

  it('POST /identity/reviews/:id/dismiss dismisses an open review', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const t = strings.join('');
      if (t.includes('identity_review_queue') && t.includes('WHERE id') && !t.includes('SET')) {
        return Promise.resolve([{ id: 2, person_id: 10, candidate_person_ids: [], reason: 'identifier_conflict', status: 'open' }]);
      }
      return Promise.resolve([]);
    });
    const { app, auditLog } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/identity/reviews/2/dismiss' });
    expect(res.statusCode).toBe(200);
    expect(auditLog).toHaveBeenCalledWith('identity_review_dismiss', 'identity_review', '2', {});
    await app.close();
  });
});
