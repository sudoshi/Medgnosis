import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import authPlugin from '../auth.js';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({
  sql: mockSql,
}));

vi.mock('../../config.js', () => ({
  config: {
    jwtSecret: 'test-secret-key-for-auth-plugin',
    jwtAccessExpiry: '15m',
  },
}));

describe('auth plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockSql.mockReset();
    app = Fastify({ logger: false });
    await app.register(authPlugin);
    app.get('/protected', { preHandler: [app.authenticate] }, async () => ({
      success: true,
    }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects pending MFA tokens on protected routes', async () => {
    const token = app.jwt.sign({
      sub: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      email: 'mfa@example.test',
      role: 'analyst',
      org_id: '',
      mfa_pending: true,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('MFA_PENDING');
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('rejects JWTs whose backing session has been revoked or expired', async () => {
    const token = app.jwt.sign({
      sub: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      email: 'user@example.test',
      role: 'analyst',
      org_id: '',
      session_id: '11111111-1111-4111-8111-111111111111',
    });
    mockSql.mockResolvedValueOnce([]);

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SESSION_REVOKED');
  });

  it('allows JWTs with active backing sessions', async () => {
    const token = app.jwt.sign({
      sub: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      email: 'user@example.test',
      role: 'analyst',
      org_id: '',
      session_id: '11111111-1111-4111-8111-111111111111',
    });
    mockSql.mockResolvedValueOnce([{ id: '11111111-1111-4111-8111-111111111111' }]);

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
  });
});
