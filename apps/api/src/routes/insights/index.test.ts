import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../config.js', () => ({ config: { aiInsightsEnabled: true } }));
vi.mock('../../services/llmClient.js', () => ({
  generateChat: vi.fn(),
  generateCompletion: vi.fn(),
}));
vi.mock('../../services/patientContext.js', () => ({
  getPatientClinicalContext: vi.fn(),
  formatContextForPrompt: vi.fn(),
}));

import insightsRoutes from './index.js';
import { getPatientClinicalContext } from '../../services/patientContext.js';

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
  await app.register(insightsRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockSql.mockReset();
  vi.mocked(getPatientClinicalContext).mockReset();
});

describe('insights route authorization', () => {
  it('does not build patient-aware chat context outside the authenticated provider panel', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM app_users')) {
        return Promise.resolve([{ ai_consent_given_at: new Date().toISOString() }]);
      }
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 8 }]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        message: 'Summarize this patient',
        patient_id: 42,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(getPatientClinicalContext).not.toHaveBeenCalled();
    await app.close();
  });
});
