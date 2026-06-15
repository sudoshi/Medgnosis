// =============================================================================
// Unit tests — CDS alert-burden API
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { mockBurden } = vi.hoisted(() => ({ mockBurden: vi.fn() }));
vi.mock('../../services/cds/feedback.js', () => ({ serviceBurden: mockBurden }));

import cdsBurdenRoutes from './burden.js';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  await app.register(cdsBurdenRoutes, { prefix: '/cds' });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /cds/burden', () => {
  it('returns the per-service alert-burden summary', async () => {
    mockBurden.mockResolvedValueOnce({
      accepted: 7, overridden: 5, total: 12, overrideRate: 0.4167,
      overrideReasons: { 'Not applicable': 3, 'Already addressed': 2 },
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/cds/burden?serviceId=medgnosis-care-gaps' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.overridden).toBe(5);
    expect(body.data.overrideReasons['Not applicable']).toBe(3);
    expect(mockBurden).toHaveBeenCalledWith('medgnosis-care-gaps');
    await app.close();
  });

  it('returns the global summary when no serviceId is given', async () => {
    mockBurden.mockResolvedValueOnce({ accepted: 0, overridden: 0, total: 0, overrideRate: 0, overrideReasons: {} });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/cds/burden' });

    expect(res.statusCode).toBe(200);
    expect(mockBurden).toHaveBeenCalledWith(undefined);
    await app.close();
  });
});
