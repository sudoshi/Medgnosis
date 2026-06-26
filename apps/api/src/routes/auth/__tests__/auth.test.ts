// =============================================================================
// Unit tests — Auth routes
// =============================================================================

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import crypto from 'node:crypto';
import {
  generateTotpCode,
  protectMfaSecret,
  recoveryCodeRecords,
} from '../../../services/auth/mfa.js';

// ---------------------------------------------------------------------------
// Mock @medgnosis/db
// ---------------------------------------------------------------------------

type SqlRow = Record<string, unknown>;
const mockSql = vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>>();
const mockUnsafe = vi.fn().mockResolvedValue([]);
const mockAuditLog = vi.fn();
const mockBegin = vi.fn(
  async (callback: (tx: { unsafe: typeof mockUnsafe }) => Promise<unknown>) => (
    callback({ unsafe: mockUnsafe })
  ),
);

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, {
    unsafe: mockUnsafe,
    begin: mockBegin,
  }),
}));

// Mock bcrypt for fast tests (no actual hashing)
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$mockhash'),
    compare: vi.fn().mockImplementation(
      (plain: string, _hash: string) => Promise.resolve(plain === 'correct-password'),
    ),
  },
}));

const mockConfig = {
  nodeEnv: 'test',
  jwtSecret: 'test-secret-key-for-testing-only',
  jwtAccessExpiry: '15m',
  resendApiKey: '',
  emailFrom: 'test@example.com',
  publicRegistrationEnabled: true,
  publicRegistrationAllowProduction: false,
  demoQuickFillEnabled: false,
  localAuthEnabled: true,
  oidcEnabled: false,
  oidcLabel: 'Authentik',
  oidcDiscoveryUrl: '',
  oidcClientId: '',
  oidcClientSecret: '',
  oidcClientSecretRef: 'OIDC_CLIENT_SECRET',
  oidcRedirectUri: 'http://localhost:3000/api/v1/auth/oidc/callback',
  oidcScopes: ['openid', 'profile', 'email', 'groups'],
  oidcAllowedGroups: ['Medgnosis Admins'],
  oidcAdminGroups: ['Medgnosis Admins'],
  oidcStateTtlSeconds: 300,
  oidcExchangeTtlSeconds: 60,
  webAppUrl: 'http://localhost:5173',
};

// Mock config (avoid requiring real env vars)
vi.mock('../../../config.js', () => ({ config: mockConfig }));

// ---------------------------------------------------------------------------
// Build test app
// ---------------------------------------------------------------------------

let app: FastifyInstance;

const MOCK_USER = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'test@example.com',
  password_hash: '$2b$12$mockhash',
  first_name: 'Test',
  last_name: 'User',
  role: 'analyst',
  org_id: null,
  mfa_enabled: false,
  is_active: true,
  must_change_password: false,
};

beforeAll(async () => {
  app = Fastify({ logger: false });

  // Register JWT
  await app.register(fastifyJwt, {
    secret: 'test-secret-key-for-testing-only',
    sign: { expiresIn: '15m' },
  });

  // Decorate authenticate
  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
        });
      }
    },
  );

  // Decorate auditLog with a mock so auth security events stay testable.
  app.decorateRequest('auditLog', mockAuditLog);

  // Register auth routes
  const authRoutes = await import('../index.js');
  await app.register(authRoutes.default, { prefix: '/auth' });

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditLog.mockReset();
  mockSql.mockResolvedValue([]);
  mockUnsafe.mockResolvedValue([]);
  mockConfig.publicRegistrationEnabled = true;
  mockConfig.publicRegistrationAllowProduction = false;
  mockConfig.demoQuickFillEnabled = false;
  mockConfig.localAuthEnabled = true;
  mockConfig.nodeEnv = 'test';
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configureLoginMock(user: SqlRow | null = MOCK_USER): void {
  mockSql.mockImplementation(((strings: TemplateStringsArray) => {
    const query = strings.join('');

    // User lookup
    if (query.includes('FROM app_users') && query.includes('email')) {
      return Promise.resolve(user ? [user] : []);
    }
    // Update last_login_at
    if (query.includes('UPDATE app_users SET last_login_at')) {
      return Promise.resolve([]);
    }
    // Provider lookup
    if (query.includes('phm_edw.provider')) {
      return Promise.resolve([]);
    }
    // Insert refresh token
    if (query.includes('INSERT INTO refresh_tokens')) {
      return Promise.resolve([{ id: '11111111-1111-4111-8111-111111111111' }]);
    }
    // Refresh token lookup
    if (query.includes('FROM refresh_tokens')) {
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  }) as typeof mockSql);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /auth/providers', () => {
  it('reports auth exposure availability from environment policy', async () => {
    mockConfig.localAuthEnabled = false;
    mockConfig.publicRegistrationEnabled = true;
    mockConfig.demoQuickFillEnabled = true;

    const response = await app.inject({ method: 'GET', url: '/auth/providers' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      local_enabled: false,
      oidc_enabled: false,
      registration_enabled: true,
      demo_quick_fill_enabled: true,
    });
  });

  it('reports registration and demo quick-fill disabled under production guardrails', async () => {
    mockConfig.nodeEnv = 'production';
    mockConfig.publicRegistrationEnabled = true;
    mockConfig.demoQuickFillEnabled = true;

    const response = await app.inject({ method: 'GET', url: '/auth/providers' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      registration_enabled: false,
      demo_quick_fill_enabled: false,
    });
  });
});

describe('POST /auth/login', () => {
  it('returns 404 when local auth is disabled by environment policy', async () => {
    mockConfig.localAuthEnabled = false;

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correct-password' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatchObject({
      code: 'LOCAL_AUTH_DISABLED',
      message: 'Local sign-in is not enabled',
    });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('returns 400 for missing email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password: 'somepassword1' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email', password: 'somepassword1' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for password shorter than 8 chars', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'short' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 401 when user is not found', async () => {
    configureLoginMock(null);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'securepass1' },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('returns 401 when user is inactive', async () => {
    configureLoginMock({ ...MOCK_USER, is_active: false });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correct-password' },
    });
    expect(response.statusCode).toBe(401);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('returns 401 for wrong password', async () => {
    configureLoginMock(MOCK_USER);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'wrong-password' },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(mockAuditLog).toHaveBeenCalledWith('login_failed', 'auth', MOCK_USER.id, {
      reason: 'invalid_password',
    });
    const auditPayload = JSON.stringify(mockAuditLog.mock.calls);
    expect(auditPayload).not.toContain('wrong-password');
    expect(auditPayload).not.toContain('test@example.com');
  });

  it('returns tokens on successful login', async () => {
    configureLoginMock(MOCK_USER);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correct-password' },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.tokens.access_token).toBeDefined();
    expect(body.data.tokens.refresh_token).toBeDefined();
    expect(body.data.tokens.expires_in).toBe(900);
    expect(mockAuditLog).toHaveBeenCalledWith('login', 'auth', MOCK_USER.id);
  });

  it('returns user info on successful login', async () => {
    configureLoginMock(MOCK_USER);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correct-password' },
    });
    const body = response.json();
    expect(body.data.user.email).toBe('test@example.com');
    expect(body.data.user.first_name).toBe('Test');
    expect(body.data.user.role).toBe('analyst');
  });

  it('does not leak password_hash in the response', async () => {
    configureLoginMock(MOCK_USER);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correct-password' },
    });
    const raw = response.body;
    expect(raw).not.toContain('password_hash');
    expect(raw).not.toContain('$2b$');
  });

  it('includes must_change_password in JWT when set', async () => {
    configureLoginMock({ ...MOCK_USER, must_change_password: true });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correct-password' },
    });
    const body = response.json();
    expect(body.data.user.must_change_password).toBe(true);
  });

  it('includes session_id in issued access tokens', async () => {
    configureLoginMock(MOCK_USER);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correct-password' },
    });

    const body = response.json();
    const decoded = app.jwt.decode<{ session_id?: string }>(body.data.tokens.access_token);
    expect(decoded?.session_id).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('returns a pending MFA challenge without issuing refresh tokens when MFA is enabled', async () => {
    const queries: string[] = [];
    configureLoginMock({ ...MOCK_USER, mfa_enabled: true, mfa_secret: 'JBSWY3DPEHPK3PXP' });
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('');
      queries.push(query);
      if (query.includes('FROM app_users') && query.includes('email')) {
        return Promise.resolve([{ ...MOCK_USER, mfa_enabled: true, mfa_secret: 'JBSWY3DPEHPK3PXP' }]);
      }
      if (query.includes('UPDATE app_users SET last_login_at')) {
        return Promise.resolve([]);
      }
      if (query.includes('phm_edw.provider')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correct-password' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.mfa_required).toBe(true);
    expect(body.data.mfa_token).toBeDefined();
    expect(body.data.tokens).toBeUndefined();
    const decoded = app.jwt.decode<{ mfa_pending?: boolean }>(body.data.mfa_token);
    expect(decoded?.mfa_pending).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO refresh_tokens'))).toBe(false);
  });
});

describe('MFA routes', () => {
  it('starts TOTP setup with an encrypted pending secret and QR data URL', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
    });
    let storedSecret = '';

    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      if (query.includes('SELECT id, email, mfa_enabled')) {
        return Promise.resolve([{ id: MOCK_USER.id, email: MOCK_USER.email, mfa_enabled: false }]);
      }
      if (query.includes('UPDATE public.app_users') && query.includes('mfa_secret_pending')) {
        storedSecret = String(values[0]);
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.manual_secret).toMatch(/^[A-Z2-7]+$/);
    expect(body.data.otpauth_url).toContain('otpauth://totp/');
    expect(body.data.qr_code_data_url).toMatch(/^data:image\/png;base64,/);
    expect(storedSecret).toMatch(/^v1:/);
    expect(storedSecret).not.toBe(body.data.manual_secret);
  });

  it('confirms TOTP setup and returns one-time recovery codes', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
      session_id: '11111111-1111-4111-8111-111111111111',
    });
    const secret = 'JBSWY3DPEHPK3PXP';
    const encryptedSecret = protectMfaSecret(secret, `medgnosis:mfa:${mockConfig.jwtSecret}`);

    mockUnsafe.mockImplementation((async (query: string, values: unknown[]) => {
      if (query.includes('SELECT id, email') && query.includes('FOR UPDATE')) {
        expect(values[0]).toBe(MOCK_USER.id);
        return [{
          ...MOCK_USER,
          mfa_enabled: false,
          mfa_secret: null,
          mfa_secret_pending: encryptedSecret,
          mfa_secret_pending_expires_at: '2099-01-01T00:00:00Z',
          mfa_recovery_codes: [],
          mfa_last_used_step: null,
        }];
      }
      if (query.includes('UPDATE public.app_users') && query.includes('mfa_enabled = TRUE')) {
        const records = JSON.parse(String(values[1])) as unknown[];
        expect(records).toHaveLength(8);
        expect(values[2]).not.toBeNull();
        return [{
          ...MOCK_USER,
          mfa_enabled: true,
          mfa_secret: encryptedSecret,
          mfa_secret_pending: null,
          mfa_secret_pending_expires_at: null,
          mfa_recovery_codes: records,
          mfa_last_used_step: values[2],
        }];
      }
      if (query.includes('UPDATE public.refresh_tokens')) {
        return [];
      }
      return [];
    }) as typeof mockUnsafe);
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('');
      if (query.includes('phm_edw.provider')) return Promise.resolve([]);
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/mfa/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { code: generateTotpCode(secret) },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.user.mfa_enabled).toBe(true);
    expect(body.data.recovery_codes).toHaveLength(8);
    expect(body.data.recovery_codes[0]).toMatch(/^MG-[A-Z2-7]{8}-[A-Z2-7]{8}$/);
  });

  it('verifies a pending MFA challenge and issues a full auth session', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const mfaToken = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
      mfa_pending: true,
    }, { expiresIn: '5m' });

    mockUnsafe.mockImplementation((async (query: string, values: unknown[]) => {
      if (query.includes('SELECT id, email') && query.includes('FOR UPDATE')) {
        expect(values[0]).toBe(MOCK_USER.id);
        return [{
          ...MOCK_USER,
          mfa_enabled: true,
          mfa_secret: secret,
          mfa_secret_pending: null,
          mfa_secret_pending_expires_at: null,
          mfa_recovery_codes: [],
          mfa_last_used_step: null,
        }];
      }
      if (query.includes('UPDATE public.app_users') && query.includes('mfa_last_used_step')) {
        expect(values[1]).not.toBeNull();
        return [];
      }
      return [];
    }) as typeof mockUnsafe);
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('');
      if (query.includes('phm_edw.provider')) return Promise.resolve([]);
      if (query.includes('INSERT INTO refresh_tokens')) {
        return Promise.resolve([{ id: '11111111-1111-4111-8111-111111111111' }]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: { mfa_token: mfaToken, code: generateTotpCode(secret) },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.tokens.access_token).toBeDefined();
    expect(body.data.tokens.refresh_token).toBeDefined();
    expect(body.data.user.mfa_enabled).toBe(true);
  });

  it('rejects invalid MFA codes without issuing a session', async () => {
    const mfaToken = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
      mfa_pending: true,
    }, { expiresIn: '5m' });
    const queries: string[] = [];

    mockUnsafe.mockImplementation((async (query: string) => {
      queries.push(query);
      if (query.includes('SELECT id, email') && query.includes('FOR UPDATE')) {
        return [{
          ...MOCK_USER,
          mfa_enabled: true,
          mfa_secret: 'JBSWY3DPEHPK3PXP',
          mfa_secret_pending: null,
          mfa_secret_pending_expires_at: null,
          mfa_recovery_codes: [],
          mfa_last_used_step: null,
        }];
      }
      return [];
    }) as typeof mockUnsafe);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: { mfa_token: mfaToken, code: '000000' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('MFA_INVALID');
    expect(queries.some((query) => query.includes('INSERT INTO refresh_tokens'))).toBe(false);
    expect(mockAuditLog).toHaveBeenCalledWith('login_mfa_verify_failed', 'auth', MOCK_USER.id, {
      reason: 'invalid_code',
      method: 'totp',
    });
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('000000');
  });

  it('rejects replayed TOTP codes at or before the last accepted time step', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const code = generateTotpCode(secret);
    const currentStep = Math.floor(Date.now() / 1000 / 30);
    const mfaToken = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
      mfa_pending: true,
    }, { expiresIn: '5m' });

    mockUnsafe.mockImplementation((async (query: string) => {
      if (query.includes('SELECT id, email') && query.includes('FOR UPDATE')) {
        return [{
          ...MOCK_USER,
          mfa_enabled: true,
          mfa_secret: secret,
          mfa_secret_pending: null,
          mfa_secret_pending_expires_at: null,
          mfa_recovery_codes: [],
          mfa_last_used_step: currentStep,
        }];
      }
      return [];
    }) as typeof mockUnsafe);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: { mfa_token: mfaToken, code },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('MFA_INVALID');
  });

  it('rejects MFA verification if the user is disabled after challenge creation', async () => {
    const mfaToken = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
      mfa_pending: true,
    }, { expiresIn: '5m' });

    mockUnsafe.mockImplementation((async (query: string) => {
      if (query.includes('SELECT id, email') && query.includes('FOR UPDATE')) {
        return [];
      }
      return [];
    }) as typeof mockUnsafe);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: { mfa_token: mfaToken, code: '123456' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('MFA_INVALID');
  });

  it('consumes recovery codes and issues a verified session', async () => {
    const recoveryCode = 'MG-ABCDEFGH-234567AB';
    const records = recoveryCodeRecords([recoveryCode], '2026-06-19T00:00:00Z');
    const mfaToken = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
      mfa_pending: true,
    }, { expiresIn: '5m' });

    mockUnsafe.mockImplementation((async (query: string, values: unknown[]) => {
      if (query.includes('SELECT id, email') && query.includes('FOR UPDATE')) {
        return [{
          ...MOCK_USER,
          mfa_enabled: true,
          mfa_secret: 'JBSWY3DPEHPK3PXP',
          mfa_secret_pending: null,
          mfa_secret_pending_expires_at: null,
          mfa_recovery_codes: records,
          mfa_last_used_step: null,
        }];
      }
      if (query.includes('UPDATE public.app_users') && query.includes('mfa_recovery_codes')) {
        const updatedRecords = JSON.parse(String(values[2])) as Array<{ used_at: string | null }>;
        expect(values[1]).toBeNull();
        expect(updatedRecords[0]?.used_at).not.toBeNull();
        return [];
      }
      return [];
    }) as typeof mockUnsafe);
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('');
      if (query.includes('phm_edw.provider')) return Promise.resolve([]);
      if (query.includes('INSERT INTO refresh_tokens')) {
        return Promise.resolve([{ id: '11111111-1111-4111-8111-111111111111' }]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: { mfa_token: mfaToken, code: recoveryCode },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.tokens.refresh_token).toBeDefined();
    expect(body.data.user.mfa_enabled).toBe(true);
  });
});

describe('POST /auth/register', () => {
  it('returns 403 when public registration is disabled', async () => {
    mockConfig.publicRegistrationEnabled = false;

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'new@example.com', firstName: 'Jane', lastName: 'Doe' },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe('REGISTRATION_DISABLED');
  });

  it('returns 403 in production unless the production registration key is explicitly enabled', async () => {
    mockConfig.nodeEnv = 'production';
    mockConfig.publicRegistrationEnabled = true;
    mockConfig.publicRegistrationAllowProduction = false;

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'new@example.com', firstName: 'Jane', lastName: 'Doe' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('REGISTRATION_DISABLED');
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('returns 400 for missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'new@example.com' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'bad', firstName: 'A', lastName: 'B' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns same success message for existing user (prevents enumeration)', async () => {
    // Mock: user already exists
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('');
      if (query.includes('SELECT id FROM app_users')) {
        return Promise.resolve([{ id: 'existing-id' }]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'exists@example.com', firstName: 'A', lastName: 'B' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('account instructions');
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('returns success for new user registration', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('');
      if (query.includes('SELECT id FROM app_users')) {
        return Promise.resolve([]); // user not found
      }
      if (query.includes('INSERT INTO app_users')) {
        return Promise.resolve([{
          id: '33333333-3333-4333-8333-333333333333',
          role: 'analyst',
          is_active: false,
          must_change_password: true,
        }]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'new@example.com', firstName: 'Jane', lastName: 'Doe' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'public_registration_create',
      'app_user',
      '33333333-3333-4333-8333-333333333333',
      {
        role: 'analyst',
        active: false,
        must_change_password: true,
        welcome_email_sent: false,
      },
    );
    const auditPayload = JSON.stringify(mockAuditLog.mock.calls);
    expect(auditPayload).not.toContain('new@example.com');
    expect(auditPayload).not.toContain('Jane');
    expect(auditPayload).not.toContain('Doe');
  });
});

describe('POST /auth/request-password-reset', () => {
  it('creates a reset token for active local users without returning the token', async () => {
    const queries: string[] = [];
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      queries.push(query);

      if (query.includes('FROM public.app_users') && query.includes('lower(email)')) {
        expect(values[0]).toBe('test@example.com');
        return Promise.resolve([{
          id: MOCK_USER.id,
          email: MOCK_USER.email,
          first_name: MOCK_USER.first_name,
          last_name: MOCK_USER.last_name,
          role: MOCK_USER.role,
        }]);
      }
      if (query.includes('UPDATE public.app_password_reset_tokens')) {
        return Promise.resolve([]);
      }
      if (query.includes('INSERT INTO public.app_password_reset_tokens')) {
        const tokenHash = values[1];
        expect(typeof tokenHash).toBe('string');
        expect(String(tokenHash)).toHaveLength(64);
        return Promise.resolve([{
          id: 'reset-1',
          user_id: MOCK_USER.id,
          expires_at: '2099-01-01T00:00:00Z',
          created_at: '2026-06-18T00:00:00Z',
        }]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/request-password-reset',
      payload: { email: ' Test@Example.com ' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { message: expect.stringContaining('eligible for password reset') },
    });
    expect(response.body).not.toContain('reset-password?token=');
    expect(queries.some((query) => query.includes('INSERT INTO public.app_password_reset_tokens'))).toBe(true);
  });

  it('returns the same response for unknown emails without creating a token', async () => {
    const queries: string[] = [];
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('');
      queries.push(query);
      if (query.includes('FROM public.app_users') && query.includes('lower(email)')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/request-password-reset',
      payload: { email: 'missing@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { message: expect.stringContaining('eligible for password reset') },
    });
    expect(queries.some((query) => query.includes('INSERT INTO public.app_password_reset_tokens'))).toBe(false);
  });

  it('rejects invalid reset request email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/request-password-reset',
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/reset-password', () => {
  it('consumes a reset token, updates the password, and revokes refresh tokens', async () => {
    const rawToken = 'reset-token-with-enough-length';
    const hashedToken = hashForTest(rawToken);

    mockUnsafe.mockImplementation((async (query: string, values: unknown[]) => {
      if (query.includes('SELECT r.id, r.user_id')) {
        expect(values[0]).toBe(hashedToken);
        expect(values[0]).not.toBe(rawToken);
        return [{ id: 'reset-1', user_id: MOCK_USER.id }];
      }
      if (query.includes('UPDATE public.app_users')) {
        expect(values[0]).toBe('$2b$12$mockhash');
        expect(values[1]).toBe(MOCK_USER.id);
        return [{
          user_id: MOCK_USER.id,
          email: MOCK_USER.email,
          first_name: MOCK_USER.first_name,
          last_name: MOCK_USER.last_name,
          role: MOCK_USER.role,
        }];
      }
      if (query.includes('UPDATE public.refresh_tokens')) {
        expect(values[0]).toBe(MOCK_USER.id);
        return [];
      }
      if (query.includes('UPDATE public.app_password_reset_tokens')) {
        expect(values[0]).toBe('reset-1');
        return [{ consumed_at: '2026-06-18T12:00:00Z' }];
      }
      return [];
    }) as typeof mockUnsafe);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: rawToken, password: 'new-password-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { message: expect.stringContaining('Password reset successfully') },
    });
  });

  it('rejects invalid or expired reset tokens', async () => {
    mockUnsafe.mockResolvedValueOnce([]);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'expired-reset-token-value', password: 'new-password-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('RESET_TOKEN_INVALID');
  });

  it('rejects short reset passwords before consuming the token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'reset-token-with-enough-length', password: 'short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockBegin).not.toHaveBeenCalled();
  });
});

describe('POST /auth/accept-invite', () => {
  it('validates a pending invite by hashed token without returning the token', async () => {
    const rawToken = 'plain-invite-token';
    const hashedToken = hashForTest(rawToken);

    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      if (query.includes('FROM public.app_user_invites i')) {
        expect(values[0]).toBe(hashedToken);
        expect(values[0]).not.toBe(rawToken);
        return Promise.resolve([{
          id: 'invite-1',
          user_id: MOCK_USER.id,
          email: 'invitee@example.com',
          first_name: 'Invite',
          last_name: 'User',
          role: 'provider',
          expires_at: '2099-01-01T00:00:00Z',
        }]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/accept-invite',
      payload: { token: rawToken },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.invite.email).toBe('invitee@example.com');
    expect(response.body).not.toContain(rawToken);
  });

  it('rejects invalid or expired invite tokens', async () => {
    mockSql.mockResolvedValue([]);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/accept-invite',
      payload: { token: 'expired-token' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVITE_INVALID');
  });
});

describe('POST /auth/set-password', () => {
  it('sets the password and activates the invited user', async () => {
    const rawToken = 'activation-token';
    const hashedToken = hashForTest(rawToken);

    mockUnsafe.mockImplementation((async (query: string, values: unknown[]) => {
      if (query.includes('SELECT i.id, i.user_id')) {
        expect(values[0]).toBe(hashedToken);
        expect(values[0]).not.toBe(rawToken);
        return [{ id: 'invite-1', user_id: MOCK_USER.id }];
      }
      if (query.includes('UPDATE public.app_users')) {
        expect(values[0]).toBe('$2b$12$mockhash');
        expect(values[1]).toBe(MOCK_USER.id);
        return [{
          user_id: MOCK_USER.id,
          email: 'invitee@example.com',
          first_name: 'Invite',
          last_name: 'User',
          role: 'provider',
        }];
      }
      if (query.includes('UPDATE public.app_user_invites')) {
        expect(values[0]).toBe('invite-1');
        return [{ expires_at: '2099-01-01T00:00:00Z' }];
      }
      return [];
    }) as typeof mockUnsafe);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/set-password',
      payload: { token: rawToken, password: 'new-password-1' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('invitee@example.com');
    expect(body.data.user.id).toBe(MOCK_USER.id);
  });

  it('rejects short activation passwords', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/set-password',
      payload: { token: 'activation-token', password: 'short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(mockBegin).not.toHaveBeenCalled();
  });
});

describe('POST /auth/change-password', () => {
  it('returns 401 without authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      payload: { currentPassword: 'old', newPassword: 'newpass123' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 400 for newPassword shorter than 8 chars (with auth)', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'oldpass12', newPassword: 'short' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('audits failed password changes for an invalid current password', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
    });
    mockSql.mockResolvedValueOnce([{ password_hash: '$2b$12$mockhash' }]);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'wrong-current', newPassword: 'new-password-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PASSWORD');
    expect(mockAuditLog).toHaveBeenCalledWith('password_change_failed', 'auth', MOCK_USER.id, {
      reason: 'invalid_current_password',
    });
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('wrong-current');
  });

  it('audits rejected password changes when the new password matches the current password', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
    });
    mockSql.mockResolvedValueOnce([{ password_hash: '$2b$12$mockhash' }]);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'correct-password', newPassword: 'correct-password' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('SAME_PASSWORD');
    expect(mockAuditLog).toHaveBeenCalledWith('password_change_failed', 'auth', MOCK_USER.id, {
      reason: 'same_password',
    });
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('correct-password');
  });
});

describe('GET /auth/sessions', () => {
  it('lists sessions and marks the current session', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
      session_id: '11111111-1111-4111-8111-111111111111',
    });
    mockSql.mockResolvedValueOnce([
      {
        id: '11111111-1111-4111-8111-111111111111',
        created_at: '2026-06-18T00:00:00Z',
        expires_at: '2099-01-01T00:00:00Z',
        revoked: false,
        revoked_at: null,
        last_used_at: '2026-06-18T12:00:00Z',
        ip_address: '127.0.0.1',
        user_agent: 'vitest',
        active: true,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        created_at: '2026-06-18T00:00:00Z',
        expires_at: '2099-01-01T00:00:00Z',
        revoked: false,
        revoked_at: null,
        last_used_at: '2026-06-18T11:00:00Z',
        ip_address: '127.0.0.2',
        user_agent: 'other browser',
        active: true,
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        sessions: [
          { id: '11111111-1111-4111-8111-111111111111', current: true, active: true },
          { id: '22222222-2222-4222-8222-222222222222', current: false, active: true },
        ],
      },
    });
  });
});

describe('DELETE /auth/sessions/:id', () => {
  it('revokes a single session for the current user', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
      session_id: '11111111-1111-4111-8111-111111111111',
    });
    mockSql.mockResolvedValueOnce([{
      id: '22222222-2222-4222-8222-222222222222',
      revoked_at: '2026-06-18T12:00:00Z',
    }]);

    const response = await app.inject({
      method: 'DELETE',
      url: '/auth/sessions/22222222-2222-4222-8222-222222222222',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        session: {
          id: '22222222-2222-4222-8222-222222222222',
          revoked_at: '2026-06-18T12:00:00Z',
        },
      },
    });
  });

  it('rejects invalid session ids before querying', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/auth/sessions/not-a-uuid',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('audits valid session revoke requests that do not match an active session', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
      session_id: '11111111-1111-4111-8111-111111111111',
    });
    mockSql.mockResolvedValueOnce([]);

    const response = await app.inject({
      method: 'DELETE',
      url: '/auth/sessions/22222222-2222-4222-8222-222222222222',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('SESSION_NOT_FOUND');
    expect(mockAuditLog).toHaveBeenCalledWith(
      'session_revoke_failed',
      'auth_session',
      '22222222-2222-4222-8222-222222222222',
      {
        reason: 'not_found_or_already_revoked',
        current: false,
      },
    );
  });
});

describe('POST /auth/refresh', () => {
  it('returns 400 when refresh_token is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('MISSING_TOKEN');
  });

  it('returns 401 for invalid refresh token', async () => {
    mockSql.mockImplementation((() => Promise.resolve([])) as typeof mockSql);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: 'invalid-token' },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_TOKEN');
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('rotates valid refresh tokens and returns a new session-bound access token', async () => {
    const refreshToken = 'valid-refresh-token';
    const refreshHash = hashForTest(refreshToken);

    mockUnsafe.mockImplementation((async (query: string, values: unknown[]) => {
      if (query.includes('SELECT id, user_id, expires_at, revoked, mfa_verified_at')) {
        expect(values[0]).toBe(refreshHash);
        return [{
          id: '11111111-1111-4111-8111-111111111111',
          user_id: MOCK_USER.id,
          expires_at: '2099-01-01T00:00:00Z',
          revoked: false,
          mfa_verified_at: null,
        }];
      }
      if (query.includes('SELECT id, email, role, org_id')) {
        return [{
          id: MOCK_USER.id,
          email: MOCK_USER.email,
          role: MOCK_USER.role,
          org_id: null,
          must_change_password: false,
          mfa_enabled: false,
        }];
      }
      if (query.includes('UPDATE refresh_tokens')) {
        return [];
      }
      if (query.includes('phm_edw.provider')) {
        return [];
      }
      if (query.includes('INSERT INTO refresh_tokens')) {
        expect(values[5]).toBeNull();
        return [{ id: '22222222-2222-4222-8222-222222222222' }];
      }
      return [];
    }) as typeof mockUnsafe);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: refreshToken },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.tokens.refresh_token).toBeDefined();
    const decoded = app.jwt.decode<{ session_id?: string }>(body.data.tokens.access_token);
    expect(decoded?.session_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(mockAuditLog).toHaveBeenCalledWith(
      'refresh_token_rotate',
      'auth_session',
      '22222222-2222-4222-8222-222222222222',
      {
        previous_session_present: true,
        mfa_verified: false,
        provider_resolved: false,
      },
    );
    const auditPayload = JSON.stringify(mockAuditLog.mock.calls);
    expect(auditPayload).not.toContain(refreshToken);
    expect(auditPayload).not.toContain(refreshHash);
  });

  it('audits refresh token replay and revokes the user sessions', async () => {
    const refreshToken = 'revoked-refresh-token';
    const refreshHash = hashForTest(refreshToken);
    const queries: string[] = [];

    mockUnsafe.mockImplementation((async (query: string, values: unknown[]) => {
      queries.push(query);
      if (query.includes('SELECT id, user_id, expires_at, revoked, mfa_verified_at')) {
        expect(values[0]).toBe(refreshHash);
        return [{
          id: '11111111-1111-4111-8111-111111111111',
          user_id: MOCK_USER.id,
          expires_at: '2099-01-01T00:00:00Z',
          revoked: true,
          mfa_verified_at: null,
        }];
      }
      if (query.includes('UPDATE refresh_tokens')) {
        expect(values[0]).toBe(MOCK_USER.id);
        return [];
      }
      return [];
    }) as typeof mockUnsafe);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: refreshToken },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('TOKEN_REUSE');
    expect(queries.some((query) => query.includes('WHERE user_id = $1::UUID'))).toBe(true);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'refresh_token_reuse',
      'auth_session',
      '11111111-1111-4111-8111-111111111111',
      {
        affected_user_bound: true,
        all_sessions_revoked: true,
      },
    );
    const auditPayload = JSON.stringify(mockAuditLog.mock.calls);
    expect(auditPayload).not.toContain(refreshToken);
    expect(auditPayload).not.toContain(refreshHash);
  });

  it('revokes pre-MFA refresh tokens once the user has MFA enabled', async () => {
    const refreshToken = 'pre-mfa-refresh-token';
    const refreshHash = hashForTest(refreshToken);
    const queries: string[] = [];

    mockUnsafe.mockImplementation((async (query: string, values: unknown[]) => {
      queries.push(query);
      if (query.includes('SELECT id, user_id, expires_at, revoked, mfa_verified_at')) {
        expect(values[0]).toBe(refreshHash);
        return [{
          id: '11111111-1111-4111-8111-111111111111',
          user_id: MOCK_USER.id,
          expires_at: '2099-01-01T00:00:00Z',
          revoked: false,
          mfa_verified_at: null,
        }];
      }
      if (query.includes('SELECT id, email, role, org_id')) {
        return [{
          id: MOCK_USER.id,
          email: MOCK_USER.email,
          role: MOCK_USER.role,
          org_id: null,
          must_change_password: false,
          mfa_enabled: true,
        }];
      }
      if (query.includes('UPDATE refresh_tokens')) {
        expect(values[0]).toBe('11111111-1111-4111-8111-111111111111');
        return [];
      }
      return [];
    }) as typeof mockUnsafe);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: refreshToken },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('MFA_REQUIRED');
    expect(queries.some((query) => query.includes('INSERT INTO refresh_tokens'))).toBe(false);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'refresh_token_mfa_required',
      'auth_session',
      '11111111-1111-4111-8111-111111111111',
      { affected_user_bound: true },
    );
  });

  it('preserves MFA verification on refresh-token rotation for MFA sessions', async () => {
    const refreshToken = 'verified-mfa-refresh-token';
    const mfaVerifiedAt = '2026-06-19T01:23:45.000Z';

    mockUnsafe.mockImplementation((async (query: string, values: unknown[]) => {
      if (query.includes('SELECT id, user_id, expires_at, revoked, mfa_verified_at')) {
        return [{
          id: '11111111-1111-4111-8111-111111111111',
          user_id: MOCK_USER.id,
          expires_at: '2099-01-01T00:00:00Z',
          revoked: false,
          mfa_verified_at: mfaVerifiedAt,
        }];
      }
      if (query.includes('SELECT id, email, role, org_id')) {
        return [{
          id: MOCK_USER.id,
          email: MOCK_USER.email,
          role: MOCK_USER.role,
          org_id: null,
          must_change_password: false,
          mfa_enabled: true,
        }];
      }
      if (query.includes('UPDATE refresh_tokens')) {
        return [];
      }
      if (query.includes('phm_edw.provider')) {
        return [];
      }
      if (query.includes('INSERT INTO refresh_tokens')) {
        expect(values[5]).toBe(mfaVerifiedAt);
        return [{ id: '22222222-2222-4222-8222-222222222222' }];
      }
      return [];
    }) as typeof mockUnsafe);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: refreshToken },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.tokens.refresh_token).toBeDefined();
  });
});

describe('GET /auth/me', () => {
  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns user data with valid token', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
    });

    mockSql.mockImplementation((() =>
      Promise.resolve([{
        id: MOCK_USER.id,
        email: MOCK_USER.email,
        first_name: MOCK_USER.first_name,
        last_name: MOCK_USER.last_name,
        role: 'analyst',
        org_id: null,
        mfa_enabled: false,
      }])
    ) as typeof mockSql);

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('test@example.com');
  });
});

describe('PATCH /auth/me/preferences', () => {
  it('audits preference key changes without storing preference values', async () => {
    const token = app.jwt.sign({
      sub: MOCK_USER.id,
      email: MOCK_USER.email,
      role: 'analyst',
      org_id: '',
    });

    mockSql.mockResolvedValueOnce([{
      preferences: {
        theme: 'dark',
        dashboard: { hidden: ['risk'] },
      },
    }]);

    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/me/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        theme: 'dark',
        dashboard: { hidden: ['risk'] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      theme: 'dark',
      dashboard: { hidden: ['risk'] },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'preferences_update',
      'auth_preferences',
      MOCK_USER.id,
      {
        preference_keys: ['dashboard', 'theme'],
        preference_key_count: 2,
      },
    );
    const auditPayload = JSON.stringify(mockAuditLog.mock.calls);
    expect(auditPayload).not.toContain('hidden');
    expect(auditPayload).not.toContain('risk');
    expect(auditPayload).not.toContain('dark');
  });
});

function hashForTest(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
