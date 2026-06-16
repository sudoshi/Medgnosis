import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../config.js', () => ({ config: { aiInsightsEnabled: true } }));
vi.mock('../../services/llmClient.js', () => ({ generateCompletion: vi.fn() }));
vi.mock('../../services/patientContext.js', () => ({ getPatientClinicalContext: vi.fn() }));

import clinicalNoteRoutes from './index.js';
import type { JwtPayload } from '../../plugins/auth.js';
import { getPatientClinicalContext } from '../../services/patientContext.js';

const PROVIDER_USER: JwtPayload = {
  sub: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'provider@example.test',
  role: 'provider',
  org_id: 'org-1',
  provider_id: 7,
};

async function buildApp(user: JwtPayload = PROVIDER_USER) {
  const app = Fastify();
  app.decorate('authenticate', async (request: FastifyRequest) => {
    request.user = user;
  });
  app.decorateRequest('auditLog', async () => {});
  await app.register(clinicalNoteRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockSql.mockReset();
  vi.mocked(getPatientClinicalContext).mockReset();
});

describe('clinical note authorization and authorship', () => {
  it('creates notes with the JWT sub claim as author_user_id', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 7 }]);
      }
      if (text.includes('INSERT INTO phm_edw.clinical_note')) {
        return Promise.resolve([{ note_id: 'note-1', patient_id: 42, status: 'draft' }]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        patient_id: 42,
        visit_type: 'followup',
        chief_complaint: 'Follow-up',
      },
    });

    expect(res.statusCode).toBe(201);
    const insertCall = mockSql.mock.calls.find(([strings]) =>
      strings.join('').includes('INSERT INTO phm_edw.clinical_note'),
    );
    expect(insertCall?.[2]).toBe(PROVIDER_USER.sub);
    await app.close();
  });

  it('does not create a note outside the authenticated provider panel', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 8 }]);
      }
      if (text.includes('INSERT INTO phm_edw.clinical_note')) {
        throw new Error('insert should not run');
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        patient_id: 42,
        visit_type: 'followup',
        chief_complaint: 'Follow-up',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(
      mockSql.mock.calls.some(([strings]) =>
        strings.join('').includes('INSERT INTO phm_edw.clinical_note'),
      ),
    ).toBe(false);
    await app.close();
  });

  it('does not generate scribe context outside the authenticated provider panel', async () => {
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
      url: '/scribe',
      payload: {
        patient_id: 42,
        visit_type: 'followup',
        sections: ['assessment'],
      },
    });

    expect(res.statusCode).toBe(403);
    expect(getPatientClinicalContext).not.toHaveBeenCalled();
    await app.close();
  });
});
