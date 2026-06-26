import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';

const { mockAuditLog, mockSql } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
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
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(clinicalNoteRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockAuditLog.mockReset();
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
    expect(mockAuditLog).toHaveBeenCalledWith(
      'clinical_note_create',
      'clinical_note',
      'note-1',
      expect.objectContaining({
        patient_bound: true,
        encounter_bound: false,
        visit_type: 'followup',
        status: 'draft',
      }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('Follow-up');
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
    expect(mockAuditLog).not.toHaveBeenCalled();
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

  it('audits draft note updates with changed-field flags only', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.clinical_note') && text.includes('SELECT status, patient_id')) {
        return Promise.resolve([{ status: 'draft', patient_id: 42 }]);
      }
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 7 }]);
      }
      if (text.includes('UPDATE phm_edw.clinical_note')) {
        return Promise.resolve([{ note_id: '11111111-1111-4111-8111-111111111111', updated_date: '2026-06-26T12:00:00Z' }]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/11111111-1111-4111-8111-111111111111',
      payload: {
        subjective: 'Patient reports improved symptoms',
        plan_text: 'Continue medication',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'clinical_note_update',
      'clinical_note',
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        patient_bound: true,
        status: 'draft',
        changed_fields: expect.objectContaining({
          subjective: true,
          plan_text: true,
          objective: false,
        }),
      }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('Patient reports improved symptoms');
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('Continue medication');
    await app.close();
  });

  it('audits note finalization with a status transition', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.clinical_note') && text.includes('SELECT status, patient_id')) {
        return Promise.resolve([{ status: 'draft', patient_id: 42 }]);
      }
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 7 }]);
      }
      if (text.includes("SET status = 'finalized'")) {
        return Promise.resolve([{ note_id: '11111111-1111-4111-8111-111111111111', status: 'finalized' }]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/11111111-1111-4111-8111-111111111111/finalize',
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'clinical_note_finalize',
      'clinical_note',
      '11111111-1111-4111-8111-111111111111',
      { patient_bound: true, from_status: 'draft', to_status: 'finalized' },
    );
    await app.close();
  });

  it('audits note amendments without raw amendment reason', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.clinical_note') && text.includes('SELECT status, patient_id')) {
        return Promise.resolve([{ status: 'finalized', patient_id: 42 }]);
      }
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 7 }]);
      }
      if (text.includes("SET status = 'amended'")) {
        return Promise.resolve([{ note_id: '11111111-1111-4111-8111-111111111111', status: 'amended' }]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/11111111-1111-4111-8111-111111111111/amend',
      payload: { reason: 'Correcting dictated assessment text' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'clinical_note_amend',
      'clinical_note',
      '11111111-1111-4111-8111-111111111111',
      { patient_bound: true, from_status: 'finalized', to_status: 'amended', reason_present: true },
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('Correcting dictated assessment text');
    await app.close();
  });

  it('audits draft note soft deletion', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.clinical_note') && text.includes('SELECT status, patient_id')) {
        return Promise.resolve([{ status: 'draft', patient_id: 42 }]);
      }
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 7 }]);
      }
      if (text.includes("SET active_ind = 'N'")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'DELETE',
      url: '/11111111-1111-4111-8111-111111111111',
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'clinical_note_soft_delete',
      'clinical_note',
      '11111111-1111-4111-8111-111111111111',
      { patient_bound: true, from_status: 'draft', active_ind: 'N' },
    );
    await app.close();
  });
});
