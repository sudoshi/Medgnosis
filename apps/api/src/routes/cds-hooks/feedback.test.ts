// =============================================================================
// Unit tests — CDS Hooks 2.0.1 feedback route
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { mockRecord } = vi.hoisted(() => ({ mockRecord: vi.fn() }));
vi.mock('../../services/cds/feedback.js', () => ({ recordFeedback: mockRecord }));
// Dev config (isProd=false, no secret) → feedback endpoint is reachable in tests.
vi.mock('../../config.js', () => ({ config: { isProd: false, cdsHooksSecret: '' } }));

import cdsFeedbackRoutes from './feedback.js';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cdsFeedbackRoutes, { prefix: '/cds-services' });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('POST /cds-services/:id/feedback', () => {
  it('persists a valid feedback payload and returns the recorded count', async () => {
    mockRecord.mockResolvedValueOnce(2);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/cds-services/medgnosis-care-gaps/feedback',
      payload: {
        feedback: [
          { card: 'c1', outcome: 'overridden', outcomeTimestamp: '2026-06-14T00:00:00Z' },
          { card: 'c2', outcome: 'accepted', outcomeTimestamp: '2026-06-14T00:01:00Z' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ recorded: 2 });
    expect(mockRecord).toHaveBeenCalledWith('medgnosis-care-gaps', expect.objectContaining({ feedback: expect.any(Array) }));
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
    await app.close();
  });
});
