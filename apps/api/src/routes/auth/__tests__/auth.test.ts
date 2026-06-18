// =============================================================================
// Unit tests — Auth routes
// =============================================================================

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';

// ---------------------------------------------------------------------------
// Mock @medgnosis/db
// ---------------------------------------------------------------------------

type SqlRow = Record<string, unknown>;
const mockSql = vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>>();
const mockUnsafe = vi.fn().mockResolvedValue([]);
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
  jwtSecret: 'test-secret-key-for-testing-only',
  jwtAccessExpiry: '15m',
  resendApiKey: '',
  emailFrom: 'test@example.com',
  publicRegistrationEnabled: true,
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

  // Decorate auditLog as no-op
  app.decorateRequest('auditLog', async () => {});

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
  mockUnsafe.mockResolvedValue([]);
  mockConfig.publicRegistrationEnabled = true;
  mockConfig.localAuthEnabled = true;
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
      return Promise.resolve([]);
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

describe('POST /auth/login', () => {
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
  });

  it('returns 401 when user is inactive', async () => {
    configureLoginMock({ ...MOCK_USER, is_active: false });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'correct-password' },
    });
    expect(response.statusCode).toBe(401);
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
  });

  it('returns success for new user registration', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('');
      if (query.includes('SELECT id FROM app_users')) {
        return Promise.resolve([]); // user not found
      }
      if (query.includes('INSERT INTO app_users')) {
        return Promise.resolve([]);
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
