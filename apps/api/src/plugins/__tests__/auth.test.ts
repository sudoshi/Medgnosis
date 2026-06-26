import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { UserRole } from '@medgnosis/shared';
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
    app.get('/admin-role', { preHandler: [app.requireRole(['admin'])] }, async () => ({
      success: true,
    }));
    app.get('/super-admin', { preHandler: [app.requireSuperAdmin] }, async () => ({
      success: true,
    }));
    app.get('/system-health', { preHandler: [app.requirePermission('admin:system-health')] }, async () => ({
      success: true,
    }));
    app.get('/auth-providers', { preHandler: [app.requirePermission('admin:auth-providers')] }, async () => ({
      success: true,
    }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  function tokenForRole(role: UserRole): string {
    return app.jwt.sign({
      sub: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      email: `${role}@example.test`,
      role,
      org_id: '',
    });
  }

  async function getAs(role: UserRole, url: string) {
    return app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${tokenForRole(role)}` },
    });
  }

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

  it.each(['admin', 'super_admin'] as UserRole[])(
    'allows %s through admin role gates',
    async (role) => {
      const response = await getAs(role, '/admin-role');

      expect(response.statusCode).toBe(200);
    },
  );

  it.each(['provider', 'analyst', 'care_coordinator'] as UserRole[])(
    'rejects %s from admin role gates',
    async (role) => {
      const response = await getAs(role, '/admin-role');

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    },
  );

  it('allows only super-admin through the super-admin gate', async () => {
    await expect(getAs('super_admin', '/super-admin')).resolves.toMatchObject({ statusCode: 200 });
    await expect(getAs('admin', '/super-admin')).resolves.toMatchObject({ statusCode: 403 });
  });

  it.each(['admin', 'super_admin'] as UserRole[])(
    'allows %s to use admin system-health permission',
    async (role) => {
      const response = await getAs(role, '/system-health');

      expect(response.statusCode).toBe(200);
    },
  );

  it('reserves auth-provider permission for super-admin', async () => {
    await expect(getAs('super_admin', '/auth-providers')).resolves.toMatchObject({ statusCode: 200 });
    await expect(getAs('admin', '/auth-providers')).resolves.toMatchObject({ statusCode: 403 });
  });
});
