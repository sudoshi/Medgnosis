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
});
