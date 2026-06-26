import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const { mockAuditLog, mockSql, mockStreamTick } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
  mockSql: vi.fn(),
  mockStreamTick: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../services/surveillance.js', () => ({ streamTick: mockStreamTick }));

import surveillanceRoutes from './index.js';

const ADMIN_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  role: 'admin',
  org_id: '7',
};

const PROVIDER_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000002',
  email: 'provider@example.test',
  role: 'provider',
  org_id: '7',
  provider_id: 7,
};

async function buildApp(user: JwtPayload = ADMIN_USER) {
  const app = Fastify();
  app.decorate('authenticate', async (request: FastifyRequest) => {
    request.user = user;
  });
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(surveillanceRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockAuditLog.mockReset();
  mockSql.mockReset();
  mockStreamTick.mockReset();
  mockStreamTick.mockResolvedValue({ ticked: 4, alerts: 2 });
});

describe('surveillance manual tick audit', () => {
  it('audits admin-triggered surveillance ticks as aggregate metadata', async () => {
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/tick',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { ticked: 4, alerts: 2 },
    });
    expect(mockStreamTick).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'surveillance_tick_run',
      'surveillance_tick',
      undefined,
      {
        ticked: 4,
        alerts: 2,
        initiated_by: 'manual',
      },
    );
    await app.close();
  });

  it('does not tick or audit for non-admin callers', async () => {
    const app = await buildApp(PROVIDER_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/tick',
    });

    expect(res.statusCode).toBe(403);
    expect(mockStreamTick).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });
});
