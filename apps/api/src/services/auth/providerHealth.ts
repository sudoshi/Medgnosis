import { sql } from '@medgnosis/db';

export type AuthProviderTestStatus = 'ok' | 'error';
export type AuthProviderHealthStatus = 'ok' | 'degraded' | 'error' | 'disabled';

export interface AuthProviderTestEventInput {
  providerType: 'oidc';
  status: AuthProviderTestStatus;
  testedBy?: string | null;
  responseMs?: number | null;
  issuer?: string | null;
  authorizationEndpoint?: string | null;
  tokenEndpoint?: string | null;
  jwksUri?: string | null;
  clientConfigured?: boolean | null;
  redirectUri?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface AuthProviderHealth {
  provider_type: 'local' | 'oidc';
  display_name: string;
  enabled: boolean;
  status: AuthProviderHealthStatus;
  updated_at: string | null;
  last_test: {
    status: AuthProviderTestStatus;
    tested_at: string;
    response_ms: number | null;
    issuer: string | null;
    client_configured: boolean | null;
    error_code: string | null;
    error_message: string | null;
  } | null;
  issues: string[];
}

interface ProviderHealthRow {
  provider_type: 'local' | 'oidc';
  display_name: string;
  enabled: boolean;
  updated_at: string | null;
  last_test_status: AuthProviderTestStatus | null;
  last_tested_at: string | null;
  last_response_ms: number | string | null;
  last_issuer: string | null;
  last_client_configured: boolean | null;
  last_error_code: string | null;
  last_error_message: string | null;
}

export async function recordAuthProviderTestEvent(input: AuthProviderTestEventInput): Promise<void> {
  await sql`
    INSERT INTO public.auth_provider_test_events (
      provider_type,
      status,
      tested_by,
      response_ms,
      issuer,
      authorization_endpoint,
      token_endpoint,
      jwks_uri,
      client_configured,
      redirect_uri,
      error_code,
      error_message
    )
    VALUES (
      ${input.providerType},
      ${input.status},
      ${input.testedBy ?? null}::uuid,
      ${input.responseMs ?? null},
      ${input.issuer ?? null},
      ${input.authorizationEndpoint ?? null},
      ${input.tokenEndpoint ?? null},
      ${input.jwksUri ?? null},
      ${input.clientConfigured ?? null},
      ${input.redirectUri ?? null},
      ${input.errorCode ?? null},
      ${input.errorMessage ?? null}
    )
  `;
}

export async function listAuthProviderHealth(fallbacks: {
  localEnabled: boolean;
  oidcEnabled: boolean;
}): Promise<AuthProviderHealth[]> {
  const rows = await sql<ProviderHealthRow[]>`
    WITH latest_tests AS (
      SELECT DISTINCT ON (provider_type)
        provider_type,
        status,
        tested_at::text AS tested_at,
        response_ms,
        issuer,
        client_configured,
        error_code,
        error_message
      FROM public.auth_provider_test_events
      ORDER BY provider_type, tested_at DESC
    )
    SELECT
      provider.provider_type,
      provider.display_name,
      provider.enabled,
      provider.updated_at::text AS updated_at,
      latest_tests.status AS last_test_status,
      latest_tests.tested_at AS last_tested_at,
      latest_tests.response_ms AS last_response_ms,
      latest_tests.issuer AS last_issuer,
      latest_tests.client_configured AS last_client_configured,
      latest_tests.error_code AS last_error_code,
      latest_tests.error_message AS last_error_message
    FROM public.auth_provider_settings provider
    LEFT JOIN latest_tests ON latest_tests.provider_type = provider.provider_type
    WHERE provider.provider_type IN ('local', 'oidc')
    ORDER BY CASE provider.provider_type WHEN 'local' THEN 0 WHEN 'oidc' THEN 1 ELSE 2 END
  `;

  return withFallbackProviders(rows, fallbacks).map(mapProviderHealthRow);
}

function withFallbackProviders(
  rows: ProviderHealthRow[],
  fallbacks: { localEnabled: boolean; oidcEnabled: boolean },
): ProviderHealthRow[] {
  const byType = new Map(rows.map((row) => [row.provider_type, row]));
  if (!byType.has('local')) {
    rows.push(providerFallback('local', 'Email and password', fallbacks.localEnabled));
  }
  if (!byType.has('oidc')) {
    rows.push(providerFallback('oidc', 'OIDC', fallbacks.oidcEnabled));
  }
  return rows.sort((a, b) => providerSort(a.provider_type) - providerSort(b.provider_type));
}

function providerFallback(
  providerType: 'local' | 'oidc',
  displayName: string,
  enabled: boolean,
): ProviderHealthRow {
  return {
    provider_type: providerType,
    display_name: displayName,
    enabled,
    updated_at: null,
    last_test_status: null,
    last_tested_at: null,
    last_response_ms: null,
    last_issuer: null,
    last_client_configured: null,
    last_error_code: null,
    last_error_message: null,
  };
}

function providerSort(providerType: string): number {
  return providerType === 'local' ? 0 : providerType === 'oidc' ? 1 : 2;
}

function mapProviderHealthRow(row: ProviderHealthRow): AuthProviderHealth {
  const issues: string[] = [];
  const lastTest = row.last_test_status && row.last_tested_at
    ? {
        status: row.last_test_status,
        tested_at: row.last_tested_at,
        response_ms: toNumberOrNull(row.last_response_ms),
        issuer: row.last_issuer,
        client_configured: row.last_client_configured,
        error_code: row.last_error_code,
        error_message: row.last_error_message,
      }
    : null;

  let status: AuthProviderHealthStatus = row.enabled ? 'ok' : 'disabled';

  if (row.provider_type === 'oidc' && row.enabled) {
    if (!lastTest) {
      status = 'degraded';
      issues.push('No OIDC provider test has been recorded');
    } else if (lastTest.status === 'error') {
      status = 'error';
      issues.push(lastTest.error_message ?? 'Latest OIDC provider test failed');
    } else if (lastTest.client_configured === false) {
      status = 'degraded';
      issues.push('OIDC discovery succeeded but the client id is not configured');
    }
  }

  return {
    provider_type: row.provider_type,
    display_name: row.display_name,
    enabled: row.enabled,
    status,
    updated_at: row.updated_at,
    last_test: lastTest,
    issues,
  };
}

function toNumberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
