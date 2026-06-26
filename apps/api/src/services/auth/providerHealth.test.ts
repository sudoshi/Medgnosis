import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  listAuthProviderHealth,
  recordAuthProviderTestEvent,
} from './providerHealth.js';

beforeEach(() => {
  mockSql.mockReset();
  mockSql.mockResolvedValue([]);
});

describe('recordAuthProviderTestEvent', () => {
  it('persists PHI-free OIDC test evidence', async () => {
    await recordAuthProviderTestEvent({
      providerType: 'oidc',
      status: 'ok',
      testedBy: '00000000-0000-4000-8000-000000000003',
      responseMs: 123,
      issuer: 'https://issuer.example.test',
      authorizationEndpoint: 'https://issuer.example.test/oauth2/authorize',
      tokenEndpoint: 'https://issuer.example.test/oauth2/token',
      jwksUri: 'https://issuer.example.test/oauth2/jwks',
      clientConfigured: true,
      redirectUri: 'https://medgnosis.example.test/api/v1/auth/oidc/callback',
    });

    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(mockSql.mock.calls[0]?.slice(1)).toEqual([
      'oidc',
      'ok',
      '00000000-0000-4000-8000-000000000003',
      123,
      'https://issuer.example.test',
      'https://issuer.example.test/oauth2/authorize',
      'https://issuer.example.test/oauth2/token',
      'https://issuer.example.test/oauth2/jwks',
      true,
      'https://medgnosis.example.test/api/v1/auth/oidc/callback',
      null,
      null,
    ]);
  });
});

describe('listAuthProviderHealth', () => {
  it('reports enabled OIDC without test evidence as degraded', async () => {
    mockSql.mockResolvedValueOnce([
      {
        provider_type: 'local',
        display_name: 'Email and password',
        enabled: true,
        updated_at: '2026-06-26T00:00:00Z',
        last_test_status: null,
        last_tested_at: null,
        last_response_ms: null,
        last_issuer: null,
        last_client_configured: null,
        last_error_code: null,
        last_error_message: null,
      },
      {
        provider_type: 'oidc',
        display_name: 'Authentik',
        enabled: true,
        updated_at: '2026-06-26T00:00:00Z',
        last_test_status: null,
        last_tested_at: null,
        last_response_ms: null,
        last_issuer: null,
        last_client_configured: null,
        last_error_code: null,
        last_error_message: null,
      },
    ]);

    const providers = await listAuthProviderHealth({ localEnabled: true, oidcEnabled: true });

    expect(providers).toEqual([
      expect.objectContaining({ provider_type: 'local', status: 'ok', issues: [] }),
      expect.objectContaining({
        provider_type: 'oidc',
        status: 'degraded',
        issues: ['No OIDC provider test has been recorded'],
      }),
    ]);
  });

  it('reports the latest OIDC test evidence', async () => {
    mockSql.mockResolvedValueOnce([
      {
        provider_type: 'oidc',
        display_name: 'Authentik',
        enabled: true,
        updated_at: '2026-06-26T00:00:00Z',
        last_test_status: 'ok',
        last_tested_at: '2026-06-26T01:00:00Z',
        last_response_ms: '45',
        last_issuer: 'https://issuer.example.test',
        last_client_configured: true,
        last_error_code: null,
        last_error_message: null,
      },
    ]);

    const providers = await listAuthProviderHealth({ localEnabled: true, oidcEnabled: true });

    expect(providers).toEqual([
      expect.objectContaining({ provider_type: 'local', status: 'ok' }),
      expect.objectContaining({
        provider_type: 'oidc',
        status: 'ok',
        last_test: expect.objectContaining({
          status: 'ok',
          tested_at: '2026-06-26T01:00:00Z',
          response_ms: 45,
          issuer: 'https://issuer.example.test',
          client_configured: true,
        }),
      }),
    ]);
  });
});
