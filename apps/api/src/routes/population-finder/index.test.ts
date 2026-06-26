import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const { mockSql, mockApplyBulk, mockAuditLog } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockApplyBulk: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../services/problemListService.js', () => ({ applyBulk: mockApplyBulk }));

import populationFinderRoutes from './index.js';

const REVIEWER_USER: JwtPayload = {
  sub: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'reviewer@example.test',
  role: 'provider',
  org_id: 'org-1',
  provider_id: 7,
};

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: FastifyRequest) => {
    request.user = REVIEWER_USER;
  });
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(populationFinderRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockSql.mockReset();
  mockApplyBulk.mockReset();
  mockAuditLog.mockReset();
});

describe('population finder audit payloads', () => {
  it('audits accepted candidates with aggregate plan summary only', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.population_finder_candidate') && text.includes('LIMIT 1')) {
        return Promise.resolve([{
          candidate_id: 123,
          patient_id: 42,
          pass: 2,
          finding_type: 'new_problem',
          current_problem_id: null,
          current_icd10: null,
          suggested_icd10: 'E11.9',
          suggested_name: 'Type 2 diabetes mellitus',
          ontology_id: 12,
          evidence: { source: 'claim' },
          status: 'pending',
        }]);
      }
      return Promise.resolve([]);
    });
    mockApplyBulk.mockResolvedValue([
      {
        action: 'add',
        status: 'applied',
        patient_id: 42,
        icd10_code: 'E11.9',
        problem_name: 'Type 2 diabetes mellitus',
      },
      {
        action: 'restage',
        status: 'skipped',
        patient_id: 42,
        icd10_code: 'N18.31',
        problem_name: 'Chronic kidney disease stage 3a',
      },
    ]);
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/123/accept' });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith('accept', 'finder_candidate', '123', {
      plan_entry_count: 2,
      applied_count: 1,
      skipped_count: 1,
      planned_count: 0,
      action_counts: { add: 1, restage: 1 },
      status_counts: { applied: 1, skipped: 1 },
    });
    const details = mockAuditLog.mock.calls[0]?.[3] as Record<string, unknown>;
    const serializedDetails = JSON.stringify(details);
    expect(serializedDetails).not.toContain('42');
    expect(serializedDetails).not.toContain('E11.9');
    expect(serializedDetails).not.toContain('diabetes');
    expect(serializedDetails).not.toContain('N18.31');
    await app.close();
  });
});
