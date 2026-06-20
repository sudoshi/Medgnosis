import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../plugins/solr.js', () => ({ getSolrClient: () => null }));

import patientRoutes from './index.js';

const PROVIDER_USER: JwtPayload = {
  sub: 'user-1',
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
  await app.register(patientRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockSql.mockReset();
  mockSql.mockImplementation((strings: TemplateStringsArray) => {
    const text = strings.join('');
    if (text.includes('SELECT pcp_provider_id')) {
      return Promise.resolve([{ pcp_provider_id: 8 }]);
    }
    return Promise.resolve([]);
  });
});

describe('patient route authorization', () => {
  it('applies risk filters to patient list queries', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('COUNT(*)::int AS total')) {
        return Promise.resolve([{ total: 0 }]);
      }
      if (text.includes('p.patient_id AS id')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/?risk_level=moderate' });

    expect(res.statusCode).toBe(200);
    expect(
      mockSql.mock.calls.some(([strings, ...values]) =>
        strings.join('').includes('fact_patient_composite') &&
        values.some((value) =>
          Array.isArray(value) && value.includes('moderate') && value.includes('medium'),
        ),
      ),
    ).toBe(true);
    await app.close();
  });

  it('applies measure cohort filters to patient list queries', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('COUNT(*)::int AS total')) {
        return Promise.resolve([{ total: 0 }]);
      }
      if (text.includes('p.patient_id AS id')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/?measure=COL130&cohort=compliant',
    });

    expect(res.statusCode).toBe(200);
    expect(
      mockSql.mock.calls.some(([strings]) => strings.join('').includes('fact_measure_result')),
    ).toBe(true);
    expect(
      mockSql.mock.calls.some(([strings]) => strings.join('').includes('fmr.numerator_flag = TRUE')),
    ).toBe(true);
    expect(
      mockSql.mock.calls.some(([strings]) => strings.join('').includes('measure_promotion_config')),
    ).toBe(true);
    expect(
      mockSql.mock.calls.some(([strings]) =>
        strings.join('').includes("fmr.source = COALESCE(NULLIF(mpc.authoritative_source, ''), 'sql_bundle')"),
      ),
    ).toBe(true);
    expect(
      mockSql.mock.calls.some(([strings]) => strings.join('').includes("fmr.evaluation_scope = 'full_population'")),
    ).toBe(true);
    expect(
      mockSql.mock.calls.some(([, ...values]) => values.includes('COL130')),
    ).toBe(true);
    await app.close();
  });

  it('rejects patient subresources outside the authenticated provider panel', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/42/medications' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(
      mockSql.mock.calls.some(([strings]) =>
        strings.join('').includes('FROM phm_edw.medication_order'),
      ),
    ).toBe(false);
    await app.close();
  });

  it('returns diagnostic reports for an in-panel patient', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT pcp_provider_id')) return Promise.resolve([{ pcp_provider_id: 7 }]);
      if (text.includes('FROM phm_edw.diagnostic_report')) {
        return Promise.resolve([{ id: 1, name: 'Comprehensive metabolic panel', status: 'final' }]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/42/diagnostic-reports' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: [{ id: 1, name: 'Comprehensive metabolic panel' }] });
    await app.close();
  });

  it('returns documents for an in-panel patient', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT pcp_provider_id')) return Promise.resolve([{ pcp_provider_id: 7 }]);
      if (text.includes('FROM phm_edw.document_reference')) {
        return Promise.resolve([{ id: 5, content_title: 'Discharge Summary', doc_status: 'final' }]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/42/documents' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: [{ id: 5, content_title: 'Discharge Summary' }] });
    await app.close();
  });
});
