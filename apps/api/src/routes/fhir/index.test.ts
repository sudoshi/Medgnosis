import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../config.js', () => ({
  config: {
    fhirBaseUrl: 'http://test.local/fhir',
  },
}));

import fhirRoutes from './index.js';

const PROVIDER_USER: JwtPayload = {
  sub: 'user-1',
  email: 'provider@example.test',
  role: 'provider',
  org_id: 'org-1',
  provider_id: 7,
};

async function buildApp(user: JwtPayload = PROVIDER_USER): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate('authenticate', async (request: FastifyRequest) => {
    request.user = user;
  });
  await app.register(fhirRoutes);
  await app.ready();
  return app;
}

function installSqlMock(): void {
  mockSql.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('');

    if (text.includes('SELECT pcp_provider_id')) {
      return Promise.resolve([{ pcp_provider_id: 8 }]);
    }

    if (text.includes('FROM phm_edw.patient p')) {
      return Promise.resolve([
        {
          patient_id: 42,
          first_name: 'Ada',
          last_name: 'Lovelace',
          date_of_birth: '1970-01-01',
          gender: 'female',
          race: null,
          ethnicity: null,
          mrn: 'MRN-42',
        },
      ]);
    }

    if (text.includes('FROM phm_edw.condition_diagnosis cd')) {
      return Promise.resolve([]);
    }

    return { text, values };
  });
}

beforeEach(() => {
  mockSql.mockReset();
  installSqlMock();
});

describe('FHIR route authorization', () => {
  it('scopes Patient search to the authenticated provider panel', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/Patient' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ resourceType: 'Bundle', type: 'searchset' });
    expect(
      mockSql.mock.calls.some(([strings, ...values]) =>
        strings.join('').includes('pcp_provider_id') && values.includes(7),
      ),
    ).toBe(true);
    await app.close();
  });

  it('rejects direct patient reads outside the authenticated provider panel', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/Patient/42' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ code: 'forbidden' }],
    });
    await app.close();
  });

  it('normalizes Patient/id query references before checking resource access', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/Condition?patient=Patient/42' });

    expect(res.statusCode).toBe(403);
    expect(mockSql.mock.calls[0]?.[1]).toBe('42');
    await app.close();
  });
});
