import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import orderRoutes from './index.js';

const PROVIDER_USER: JwtPayload = {
  sub: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'provider@example.test',
  role: 'provider',
  org_id: 'org-1',
  provider_id: 7,
};

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: FastifyRequest) => {
    request.user = PROVIDER_USER;
  });
  app.decorateRequest('auditLog', async () => {});
  await app.register(orderRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockSql.mockReset();
});

describe('order route authorization', () => {
  it('scopes the order worklist to the authenticated provider panel', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT DISTINCT ON')) return Promise.resolve([]);
      if (text.includes('COUNT(DISTINCT')) return Promise.resolve([{ total: 0 }]);
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/worklist' });

    expect(res.statusCode).toBe(200);
    expect(
      mockSql.mock.calls.some(([strings, ...values]) =>
        strings.join('').includes('p.pcp_provider_id') && values.includes(7),
      ),
    ).toBe(true);
    await app.close();
  });

  it('does not read recommendations outside the authenticated provider panel', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 8 }]);
      }
      if (text.includes('FROM phm_edw.care_gap cg')) {
        throw new Error('care-gap recommendations should not be queried');
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/recommendations/42' });

    expect(res.statusCode).toBe(403);
    expect(
      mockSql.mock.calls.some(([strings]) =>
        strings.join('').includes('FROM phm_edw.care_gap cg'),
      ),
    ).toBe(false);
    await app.close();
  });

  it('validates placed orders against care gaps for the same patient', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 7 }]);
      }
      if (text.includes('FROM phm_edw.patient')) {
        return Promise.resolve([{ patient_id: 42, first_name: 'Ada', last_name: 'Lovelace' }]);
      }
      if (text.includes('FROM phm_edw.care_gap')) {
        return Promise.resolve([]);
      }
      if (text.includes('FROM phm_edw.order_set_item')) {
        return Promise.resolve([{
          item_id: 99,
          order_set_id: 1,
          item_name: 'A1c',
          item_type: 'lab',
          loinc_code: null,
          loinc_description: null,
          cpt_code: null,
          cpt_description: null,
          icd10_indication: null,
        }]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/place',
      payload: {
        patient_id: 42,
        care_gap_id: 1001,
        order_set_item_id: 99,
        priority: 'routine',
      },
    });

    const careGapCall = mockSql.mock.calls.find(([strings]) =>
      strings.join('').includes('FROM phm_edw.care_gap'),
    );
    expect(res.statusCode).toBe(404);
    expect(careGapCall?.[0].join('')).toContain('patient_id =');
    expect(careGapCall).toContain(42);
    await app.close();
  });
});
