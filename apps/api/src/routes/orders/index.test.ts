import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));
const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
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
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(orderRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockSql.mockReset();
  delete (mockSql as typeof mockSql & { begin?: unknown }).begin;
  mockAuditLog.mockReset();
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

  it('audits single placed orders without patient or care-gap identifiers in details', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 7 }]);
      }
      if (text.includes('FROM phm_edw.patient')) {
        return Promise.resolve([{ patient_id: 42, first_name: 'Ada', last_name: 'Lovelace' }]);
      }
      if (text.includes('FROM phm_edw.care_gap')) {
        return Promise.resolve([{ care_gap_id: 1001, gap_status: 'open' }]);
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
      if (text.includes('INSERT INTO phm_edw.clinical_order')) {
        return Promise.resolve([{ order_id: 555, order_datetime: '2026-06-26T10:00:00Z' }]);
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
        priority: 'stat',
        instructions: 'Call patient after draw.',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockAuditLog).toHaveBeenCalledWith('create', 'clinical_order', '555', {
      patient_bound: true,
      care_gap_bound: true,
      order_set_item_bound: true,
      priority: 'stat',
    });
    const details = mockAuditLog.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(JSON.stringify(details)).not.toContain('42');
    expect(JSON.stringify(details)).not.toContain('1001');
    expect(JSON.stringify(details)).not.toContain('99');
    expect(JSON.stringify(details)).not.toContain('Call patient');
    await app.close();
  });

  it('audits batch placed orders with aggregate details only', async () => {
    const unsafe = vi.fn((text: string) => {
      if (text.includes('INSERT INTO phm_edw.clinical_order')) {
        return Promise.resolve([{ order_id: 900, order_datetime: '2026-06-26T10:00:00Z' }]);
      }
      return Promise.resolve([]);
    });
    Object.assign(mockSql, {
      begin: vi.fn(async (callback: (tx: { unsafe: typeof unsafe }) => Promise<void>) => {
        await callback({ unsafe });
      }),
    });
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 7 }]);
      }
      if (text.includes('FROM phm_edw.patient')) {
        return Promise.resolve([{ patient_id: 42, first_name: 'Ada', last_name: 'Lovelace' }]);
      }
      if (text.includes('FROM phm_edw.care_gap')) {
        return Promise.resolve([
          { care_gap_id: 1001, gap_status: 'open' },
          { care_gap_id: 1002, gap_status: 'open' },
        ]);
      }
      if (text.includes('FROM phm_edw.order_set_item')) {
        return Promise.resolve([
          {
            item_id: 99,
            order_set_id: 1,
            item_name: 'A1c',
            item_type: 'lab',
            loinc_code: null,
            loinc_description: null,
            cpt_code: null,
            cpt_description: null,
            icd10_indication: null,
          },
          {
            item_id: 100,
            order_set_id: 1,
            item_name: 'BMP',
            item_type: 'lab',
            loinc_code: null,
            loinc_description: null,
            cpt_code: null,
            cpt_description: null,
            icd10_indication: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/place-batch',
      payload: {
        patient_id: 42,
        priority: 'routine',
        orders: [
          { care_gap_id: 1001, order_set_item_id: 99 },
          { care_gap_id: 1002, order_set_item_id: 100 },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockAuditLog).toHaveBeenCalledWith('create', 'clinical_order', 'batch-2', {
      patient_bound: true,
      order_count: 2,
      priority: 'routine',
    });
    const details = mockAuditLog.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(JSON.stringify(details)).not.toContain('42');
    expect(JSON.stringify(details)).not.toContain('1001');
    expect(JSON.stringify(details)).not.toContain('99');
    await app.close();
  });
});
