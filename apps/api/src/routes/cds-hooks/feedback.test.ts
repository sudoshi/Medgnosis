// =============================================================================
// Unit tests — CDS Hooks 2.0.1 feedback route
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { mockAuditLog, mockRecord } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
  mockRecord: vi.fn(),
}));
vi.mock('../../services/cds/feedback.js', () => ({ recordFeedback: mockRecord }));
// Dev config (isProd=false, no secret) → feedback endpoint is reachable in tests.
vi.mock('../../config.js', () => ({ config: { isProd: false, cdsHooksSecret: '' } }));

import cdsFeedbackRoutes from './feedback.js';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(cdsFeedbackRoutes, { prefix: '/cds-services' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditLog.mockReset();
});

describe('POST /cds-services/:id/feedback', () => {
  it('persists a valid feedback payload and returns the recorded count', async () => {
    mockRecord.mockResolvedValueOnce(2);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/cds-services/medgnosis-care-gaps/feedback',
      payload: {
        feedback: [
          {
            card: 'card-with-clinical-context',
            outcome: 'overridden',
            outcomeTimestamp: '2026-06-14T00:00:00Z',
            overrideReason: {
              reason: { code: 'patient-refused', display: 'Patient refused' },
              userComment: 'Patient wants to discuss with spouse first',
            },
          },
          {
            card: 'card-accepted',
            outcome: 'accepted',
            outcomeTimestamp: '2026-06-14T00:01:00Z',
            acceptedSuggestions: [{ id: 'suggestion-order-a1c' }],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ recorded: 2 });
    expect(mockRecord).toHaveBeenCalledWith('medgnosis-care-gaps', expect.objectContaining({ feedback: expect.any(Array) }));
    expect(mockAuditLog).toHaveBeenCalledWith(
      'cds_feedback_record',
      'cds_service',
      'medgnosis-care-gaps',
      {
        recorded: 2,
        feedback_count: 2,
        accepted_count: 1,
        overridden_count: 1,
        override_reason_count: 1,
        accepted_suggestion_count: 1,
      },
    );
    const auditPayload = JSON.stringify(mockAuditLog.mock.calls);
    expect(auditPayload).not.toContain('card-with-clinical-context');
    expect(auditPayload).not.toContain('Patient wants to discuss');
    expect(auditPayload).not.toContain('suggestion-order-a1c');
    expect(auditPayload).not.toContain('2026-06-14T00:00:00Z');
    await app.close();
  });

  it('400s when the store rejects an invalid payload', async () => {
    mockRecord.mockRejectedValueOnce(new Error('outcome must be accepted or overridden'));
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/cds-services/x/feedback',
      payload: { feedback: [{ card: 'c', outcome: 'maybe', outcomeTimestamp: 't' }] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()._error).toMatch(/outcome/);
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });
});
