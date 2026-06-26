import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const { mockSql, mockAuditLog } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockAuditLog: vi.fn(),
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
import { getPatientClinicalContext, formatContextForPrompt } from '../../services/patientContext.js';
import { generateChat, generateCompletion } from '../../services/llmClient.js';

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
  await app.register(insightsRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockSql.mockReset();
  mockAuditLog.mockReset();
  vi.mocked(getPatientClinicalContext).mockReset();
  vi.mocked(formatContextForPrompt).mockReset();
  vi.mocked(generateChat).mockReset();
  vi.mocked(generateCompletion).mockReset();
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

  it('audits patient-aware chat with bound flags only — never the message', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM app_users')) {
        return Promise.resolve([{ ai_consent_given_at: new Date().toISOString() }]);
      }
      if (text.includes('SELECT pcp_provider_id')) {
        return Promise.resolve([{ pcp_provider_id: 7 }]);
      }
      return Promise.resolve([]);
    });
    vi.mocked(getPatientClinicalContext).mockResolvedValue({} as never);
    vi.mocked(formatContextForPrompt).mockReturnValue('context summary');
    vi.mocked(generateChat).mockResolvedValue({
      text: 'assistant answer',
      inputTokens: 120,
      outputTokens: 64,
      modelId: 'test-model',
      provider: 'ollama',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        message: 'Summarize this patient SECRET-PHI',
        patient_id: 42,
        history: [{ role: 'user', content: 'earlier turn' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ai_chat',
      'ai_insight',
      undefined,
      expect.objectContaining({
        patient_bound: true,
        history_turns: 1,
        provider: 'ollama',
        model: 'test-model',
        input_tokens: 120,
        output_tokens: 64,
      }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('SECRET-PHI');
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('assistant answer');
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('context summary');
    await app.close();
  });

  it('audits the morning briefing with aggregate counts only — never patient identifiers', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM app_users')) {
        return Promise.resolve([{ ai_consent_given_at: new Date().toISOString() }]);
      }
      if (text.includes('phm_star.fact_patient_composite')) {
        return Promise.resolve([
          { patient_name: 'Jane SECRET-PHI', age: 70, gender: 'F', risk_tier: 'Critical' },
        ]);
      }
      if (text.includes('FROM phm_edw.encounter')) {
        return Promise.resolve([{ count: 5 }]);
      }
      if (text.includes('clinical_alerts')) {
        return Promise.resolve([{ count: 2 }]);
      }
      return Promise.resolve([]);
    });
    vi.mocked(generateCompletion).mockResolvedValue({
      text: 'briefing body',
      inputTokens: 200,
      outputTokens: 88,
      modelId: 'test-model',
      provider: 'anthropic',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/morning-briefing',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ai_morning_briefing',
      'ai_insight',
      undefined,
      expect.objectContaining({
        provider_scoped: true,
        high_risk_count: 1,
        schedule_count: 5,
        critical_alerts: 2,
        provider: 'anthropic',
        model: 'test-model',
        input_tokens: 200,
        output_tokens: 88,
      }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('SECRET-PHI');
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('briefing body');
    await app.close();
  });
});
