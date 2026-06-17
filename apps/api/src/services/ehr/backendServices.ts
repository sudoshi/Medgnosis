// =============================================================================
// SMART Backend Services
// Acquires system-level SMART access tokens using client_credentials plus
// private_key_jwt. Raw private keys are resolved only at runtime and raw access
// tokens are persisted only as hashes through tokenStore.
// =============================================================================

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { sql } from '@medgnosis/db';
import {
  importJWK,
  importPKCS8,
  SignJWT,
  type JWK,
  type JWTHeaderParameters,
} from 'jose';
import {
  expiresAtFromExpiresIn,
  persistSmartTokenMetadata,
  sanitizeTokenResponseMetadata,
  type SmartTokenMetadata,
} from './tokenStore.js';
import type {
  EhrTenantRef,
  FetchLike,
  FhirAccessTokenRef,
  SmartTokenResponseShape,
} from './types.js';
import type { EhrClientAuthMethod } from './tenantRegistry.js';
import { getVendorAdapter } from './vendorAdapters/index.js';

const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const DEFAULT_ASSERTION_TTL_SECONDS = 300;
const DEFAULT_SIGNING_ALG = 'RS384';

export type BackendSigningAlg = 'RS384' | 'ES384' | 'RS256' | 'ES256';
export type JsonObject = Record<string, unknown>;

export interface BackendServicesConfig {
  tenant: EhrTenantRef & {
    id: number;
    orgId: number | null;
  };
  clientRegistrationId: number;
  clientId: string;
  authMethod: EhrClientAuthMethod;
  clientSecretRef: string | null;
  jwksUrl: string | null;
  privateKeyRef: string | null;
  scopesRequested: string;
  scopesGranted: string;
  tokenEndpoint: string;
}

export interface BackendPrivateKeyMaterial {
  key: string | JWK;
  kid?: string;
  alg?: BackendSigningAlg;
  jku?: string;
}

export type BackendPrivateKeyResolver = (
  privateKeyRef: string,
) => Promise<BackendPrivateKeyMaterial | string | JWK>;

export type BackendClientSecretResolver = (clientSecretRef: string) => string | Promise<string>;

export interface CreateBackendClientAssertionInput {
  clientId: string;
  tokenEndpoint: string;
  privateKey: BackendPrivateKeyMaterial | string | JWK;
  jwksUrl?: string | null;
  now?: Date;
  ttlSeconds?: number;
  jti?: string;
}

export interface BackendTokenResponse extends SmartTokenResponseShape {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface RequestBackendServiceTokenInput {
  config: BackendServicesConfig;
  scope?: string | readonly string[];
  clientSecret?: string | null;
  clientSecretResolver?: BackendClientSecretResolver;
  privateKey?: BackendPrivateKeyMaterial | string | JWK;
  privateKeyResolver?: BackendPrivateKeyResolver;
  fetchImpl?: FetchLike;
  now?: Date;
  assertionTtlSeconds?: number;
  jti?: string;
  persistMetadata?: boolean;
}

export interface BackendServiceTokenResult {
  accessToken: FhirAccessTokenRef;
  tokenResponse: BackendTokenResponse;
  tokenMetadata: SmartTokenMetadata | null;
}

interface BackendServicesConfigRow {
  ehr_tenant_id: number;
  org_id: number | null;
  vendor: string;
  fhir_base_url: string;
  smart_config_url: string | null;
  issuer: string | null;
  audience: string | null;
  client_registration_id: number;
  client_id: string;
  auth_method: EhrClientAuthMethod;
  client_secret_ref: string | null;
  jwks_url: string | null;
  private_key_ref: string | null;
  scopes_requested: string;
  scopes_granted: string;
}

interface SmartConfigurationResponse {
  token_endpoint?: unknown;
  grant_types_supported?: unknown;
  token_endpoint_auth_methods_supported?: unknown;
  token_endpoint_auth_signing_alg_values_supported?: unknown;
}

export class BackendServicesError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'BackendServicesError';
    this.code = code;
    this.status = status;
  }
}

function mapDbNumber(value: number | string): number {
  return Number(value);
}

function mapNullableDbNumber(value: number | string | null): number | null {
  return value == null ? null : mapDbNumber(value);
}

export async function loadBackendServicesConfig(
  ehrTenantId: number,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis) as FetchLike,
): Promise<BackendServicesConfig | null> {
  const rows = await sql<BackendServicesConfigRow[]>`
    SELECT
      t.id AS ehr_tenant_id,
      t.org_id,
      t.vendor,
      t.fhir_base_url,
      t.smart_config_url,
      t.issuer,
      t.audience,
      r.id AS client_registration_id,
      r.client_id,
      r.auth_method,
      r.client_secret_ref,
      r.jwks_url,
      r.private_key_ref,
      r.scopes_requested,
      r.scopes_granted
    FROM phm_edw.ehr_tenant t
    JOIN phm_edw.ehr_client_registration r ON r.ehr_tenant_id = t.id
    WHERE t.id = ${ehrTenantId}
      AND r.client_type = 'backend_services'
      AND r.enabled = TRUE
      AND t.status IN ('testing', 'active')
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  const tenant = {
    id: mapDbNumber(row.ehr_tenant_id),
    orgId: mapNullableDbNumber(row.org_id),
    vendor: row.vendor,
    fhirBaseUrl: row.fhir_base_url,
    smartConfigUrl: row.smart_config_url ?? undefined,
    metadata: {
      issuer: row.issuer,
      audience: row.audience,
    },
  };
  const discovery = getVendorAdapter(row.vendor).discover(tenant);
  const smartConfiguration = await fetchSmartConfiguration(
    discovery.smartConfigurationUrl,
    fetchImpl,
    row.auth_method,
  );

  return {
    tenant,
    clientRegistrationId: mapDbNumber(row.client_registration_id),
    clientId: row.client_id,
    authMethod: row.auth_method,
    clientSecretRef: row.client_secret_ref,
    jwksUrl: row.jwks_url,
    privateKeyRef: row.private_key_ref,
    scopesRequested: row.scopes_requested,
    scopesGranted: row.scopes_granted,
    tokenEndpoint: smartConfiguration.tokenEndpoint,
  };
}

export async function createBackendClientAssertion(
  input: CreateBackendClientAssertionInput,
): Promise<string> {
  const material = normalizePrivateKeyMaterial(input.privateKey);
  const alg = material.alg ?? DEFAULT_SIGNING_ALG;
  const kid = material.kid;
  if (!kid) {
    throw new BackendServicesError(
      'backend_private_key_missing_kid',
      'SMART Backend Services private key material must include a kid',
      500,
    );
  }

  const ttlSeconds = normalizeAssertionTtl(input.ttlSeconds);
  const now = input.now ?? new Date();
  const signingKey = await importSigningKey(material, alg);
  const header: JWTHeaderParameters = {
    alg,
    kid,
    typ: 'JWT',
  };
  const jku = input.jwksUrl ?? material.jku;
  if (jku) {
    ensureHttpsOrLocalhostUrl(jku, 'backend_jwks_url_insecure', 'SMART Backend Services JWKS URL must use HTTPS');
    header.jku = jku;
  }

  return new SignJWT({})
    .setProtectedHeader(header)
    .setIssuer(input.clientId)
    .setSubject(input.clientId)
    .setAudience(input.tokenEndpoint)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + ttlSeconds)
    .setJti(input.jti ?? randomUUID())
    .sign(signingKey);
}

export async function requestBackendServiceToken(
  input: RequestBackendServiceTokenInput,
): Promise<BackendServiceTokenResult> {
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const scope = normalizeBackendScope(input.scope ?? input.config.scopesRequested);
  if (!scope) {
    throw new BackendServicesError(
      'backend_scopes_missing',
      'SMART Backend Services client registration has no requested or granted scopes',
      500,
    );
  }
  assertScopeSubset(scope, input.config.scopesGranted);

  const body = new URLSearchParams({
    scope,
    grant_type: 'client_credentials',
  });
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded',
  };
  await applyBackendTokenClientAuthentication(input, body, headers);

  const response = await fetchImpl(input.config.tokenEndpoint, {
    method: 'POST',
    headers,
    body,
  });
  const responseBody = await parseJsonResponse(response);

  if (!response.ok) {
    throw new BackendServicesError(
      'backend_token_request_failed',
      tokenErrorMessage(responseBody, response.status),
      response.status,
    );
  }

  const tokenResponse = parseBackendTokenResponse(responseBody);
  const expiresAt = expiresAtFromExpiresIn(tokenResponse.expires_in, input.now ?? new Date());
  const tokenMetadata = input.persistMetadata === false
    ? null
    : await persistSmartTokenMetadata({
        ehrTenantId: input.config.tenant.id,
        orgId: input.config.tenant.orgId,
        userId: null,
        tokenType: tokenResponse.token_type,
        scope: tokenResponse.scope,
        accessToken: tokenResponse.access_token,
        launchContext: { scopes: tokenResponse.scope.split(/\s+/).filter(Boolean) },
        tokenResponseMetadata: sanitizeTokenResponseMetadata(tokenResponse),
        expiresAt,
      });

  return {
    accessToken: {
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type,
      scope: tokenResponse.scope,
      expiresAt: expiresAt ?? undefined,
    },
    tokenResponse,
    tokenMetadata,
  };
}

export async function resolvePrivateKeyFromEnvironment(
  privateKeyRef: string,
): Promise<BackendPrivateKeyMaterial> {
  const parsed = parsePrivateKeyRef(privateKeyRef);
  if (parsed.scheme !== 'env') {
    throw new BackendServicesError(
      'backend_private_key_ref_unsupported',
      `Unsupported SMART Backend Services private key ref scheme: ${parsed.scheme}`,
      500,
    );
  }

  const envValue = process.env[parsed.name];
  if (!envValue) {
    throw new BackendServicesError(
      'backend_private_key_missing',
      `SMART Backend Services private key env var is not set: ${parsed.name}`,
      500,
    );
  }

  const material = normalizePrivateKeyMaterial(envValue);
  return {
    ...material,
    kid: parsed.params.kid ?? material.kid,
    alg: (parsed.params.alg as BackendSigningAlg | undefined) ?? material.alg,
    jku: parsed.params.jku ?? material.jku,
  };
}

async function applyBackendTokenClientAuthentication(
  input: RequestBackendServiceTokenInput,
  body: URLSearchParams,
  headers: Record<string, string>,
): Promise<void> {
  switch (input.config.authMethod) {
    case 'private_key_jwt': {
      const privateKey = input.privateKey ?? await resolveConfiguredPrivateKey(
        input.config.privateKeyRef,
        input.privateKeyResolver ?? resolvePrivateKeyFromEnvironment,
      );
      const clientAssertion = await createBackendClientAssertion({
        clientId: input.config.clientId,
        tokenEndpoint: input.config.tokenEndpoint,
        privateKey,
        jwksUrl: input.config.jwksUrl,
        now: input.now,
        ttlSeconds: input.assertionTtlSeconds,
        jti: input.jti,
      });
      body.set('client_assertion_type', CLIENT_ASSERTION_TYPE);
      body.set('client_assertion', clientAssertion);
      return;
    }
    case 'client_secret_post': {
      const clientSecret = await resolveConfiguredClientSecret(
        input.config.clientSecretRef,
        input.clientSecret,
        input.clientSecretResolver ?? resolveClientSecretFromEnvironment,
      );
      body.set('client_id', input.config.clientId);
      body.set('client_secret', clientSecret);
      return;
    }
    case 'client_secret_basic': {
      const clientSecret = await resolveConfiguredClientSecret(
        input.config.clientSecretRef,
        input.clientSecret,
        input.clientSecretResolver ?? resolveClientSecretFromEnvironment,
      );
      headers.authorization = `Basic ${Buffer.from(`${input.config.clientId}:${clientSecret}`).toString('base64')}`;
      return;
    }
    case 'public_pkce':
    case 'fhir_authorization_jwt':
    case 'shared_secret':
      throw new BackendServicesError(
        'backend_auth_method_unsupported',
        `SMART Backend Services token exchange does not support auth_method ${input.config.authMethod}`,
        500,
      );
  }
}

function resolveClientSecretFromEnvironment(clientSecretRef: string): string {
  const separator = clientSecretRef.indexOf(':');
  if (separator <= 0 || clientSecretRef.slice(0, separator) !== 'env') {
    throw new BackendServicesError(
      'backend_client_secret_ref_unsupported',
      'SMART Backend Services client_secret_ref must use the env: scheme',
      500,
    );
  }

  const envName = clientSecretRef.slice(separator + 1);
  const value = process.env[envName];
  if (!value) {
    throw new BackendServicesError(
      'backend_client_secret_missing',
      `SMART Backend Services client secret env var is not set: ${envName}`,
      500,
    );
  }
  return value;
}

function parsePrivateKeyRef(ref: string): {
  scheme: string;
  name: string;
  params: Record<string, string>;
} {
  const [base, query = ''] = ref.split('?', 2);
  const separator = base.indexOf(':');
  if (separator <= 0) {
    throw new BackendServicesError(
      'backend_private_key_ref_invalid',
      'SMART Backend Services private key ref must use a scheme, for example env:EHR_PRIVATE_KEY_PEM?kid=key-1',
      500,
    );
  }

  return {
    scheme: base.slice(0, separator),
    name: base.slice(separator + 1),
    params: Object.fromEntries(new URLSearchParams(query)),
  };
}

async function resolveConfiguredPrivateKey(
  privateKeyRef: string | null,
  resolver: BackendPrivateKeyResolver,
): Promise<BackendPrivateKeyMaterial | string | JWK> {
  if (!privateKeyRef) {
    throw new BackendServicesError(
      'backend_private_key_ref_missing',
      'SMART Backend Services client registration is missing private_key_ref',
      500,
    );
  }
  return resolver(privateKeyRef);
}

async function resolveConfiguredClientSecret(
  clientSecretRef: string | null,
  clientSecret: string | null | undefined,
  resolver: BackendClientSecretResolver,
): Promise<string> {
  if (clientSecret) return clientSecret;
  if (!clientSecretRef) {
    throw new BackendServicesError(
      'backend_client_secret_ref_missing',
      'SMART Backend Services client registration is missing client_secret_ref',
      500,
    );
  }
  return resolver(clientSecretRef);
}

function normalizePrivateKeyMaterial(
  value: BackendPrivateKeyMaterial | string | JWK,
): BackendPrivateKeyMaterial {
  if (typeof value === 'string') {
    const parsed = parseJsonPrivateKey(value);
    if (parsed) return parsed;
    return { key: value };
  }
  if ('key' in value) {
    return value as BackendPrivateKeyMaterial;
  }
  return {
    key: value,
    kid: typeof value.kid === 'string' ? value.kid : undefined,
    alg: isBackendSigningAlg(value.alg) ? value.alg : undefined,
  };
}

function parseJsonPrivateKey(value: string): BackendPrivateKeyMaterial | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;

  const parsed = JSON.parse(trimmed) as JsonObject;
  if (parsed.pem || parsed.jwk || parsed.key) {
    return {
      key: (parsed.pem ?? parsed.jwk ?? parsed.key) as string | JWK,
      kid: typeof parsed.kid === 'string' ? parsed.kid : undefined,
      alg: isBackendSigningAlg(parsed.alg) ? parsed.alg : undefined,
      jku: typeof parsed.jku === 'string' ? parsed.jku : undefined,
    };
  }

  return {
    key: parsed as JWK,
    kid: typeof parsed.kid === 'string' ? parsed.kid : undefined,
    alg: isBackendSigningAlg(parsed.alg) ? parsed.alg : undefined,
  };
}

function isBackendSigningAlg(value: unknown): value is BackendSigningAlg {
  return value === 'RS384' || value === 'ES384' || value === 'RS256' || value === 'ES256';
}

async function importSigningKey(material: BackendPrivateKeyMaterial, alg: BackendSigningAlg) {
  if (typeof material.key === 'string') {
    return importPKCS8(material.key, alg);
  }
  return importJWK(material.key, alg);
}

function normalizeAssertionTtl(value: number | undefined): number {
  const ttl = value ?? DEFAULT_ASSERTION_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > DEFAULT_ASSERTION_TTL_SECONDS) {
    throw new BackendServicesError(
      'backend_assertion_ttl_invalid',
      'SMART Backend Services client assertion ttlSeconds must be between 1 and 300',
      500,
    );
  }
  return ttl;
}

function normalizeBackendScope(scope: string | readonly string[]): string {
  const items = typeof scope === 'string' ? scope.split(/\s+/) : scope;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized.join(' ');
}

function assertScopeSubset(requestedScope: string, grantedScope: string): void {
  const granted = new Set(normalizeBackendScope(grantedScope).split(/\s+/).filter(Boolean));
  if (granted.size === 0) return;

  const requested = normalizeBackendScope(requestedScope).split(/\s+/).filter(Boolean);
  const denied = requested.filter((scope) => !granted.has(scope));
  if (denied.length > 0) {
    throw new BackendServicesError(
      'backend_scopes_not_granted',
      `SMART Backend Services requested scopes are not granted: ${denied.join(' ')}`,
      400,
    );
  }
}

async function fetchSmartConfiguration(
  smartConfigurationUrl: string,
  fetchImpl: FetchLike,
  authMethod: EhrClientAuthMethod,
): Promise<{ tokenEndpoint: string }> {
  const response = await fetchImpl(smartConfigurationUrl, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new BackendServicesError(
      'backend_smart_configuration_failed',
      `SMART configuration request failed with HTTP ${response.status}`,
      response.status,
    );
  }

  const configuration = body as SmartConfigurationResponse;
  if (typeof configuration.token_endpoint !== 'string') {
    throw new BackendServicesError(
      'backend_smart_configuration_invalid',
      'SMART configuration is missing token_endpoint',
      502,
    );
  }
  ensureHttpsOrLocalhostUrl(
    configuration.token_endpoint,
    'backend_token_endpoint_insecure',
    'SMART Backend Services token endpoint must use HTTPS',
  );
  validateBackendDiscovery(configuration, authMethod);

  return { tokenEndpoint: configuration.token_endpoint };
}

function validateBackendDiscovery(
  configuration: SmartConfigurationResponse,
  authMethod: EhrClientAuthMethod,
): void {
  const grantTypes = optionalStringArray(configuration.grant_types_supported);
  if (grantTypes && !grantTypes.includes('client_credentials')) {
    throw new BackendServicesError(
      'backend_client_credentials_not_supported',
      'SMART configuration does not advertise client_credentials grant support',
      502,
    );
  }

  const authMethods = optionalStringArray(configuration.token_endpoint_auth_methods_supported);
  if (authMethods && !backendTokenEndpointAuthMethodNames(authMethod).some((method) => authMethods.includes(method))) {
    throw new BackendServicesError(
      'backend_auth_method_not_supported',
      `SMART configuration does not advertise ${authMethod} token endpoint auth support`,
      502,
    );
  }

  const signingAlgs = optionalStringArray(configuration.token_endpoint_auth_signing_alg_values_supported);
  if (
    authMethod === 'private_key_jwt' &&
    signingAlgs &&
    !signingAlgs.some((alg) => alg === 'RS384' || alg === 'ES384' || alg === 'RS256' || alg === 'ES256')
  ) {
    throw new BackendServicesError(
      'backend_signing_alg_not_supported',
      'SMART configuration does not advertise a supported private_key_jwt signing algorithm',
      502,
    );
  }
}

function backendTokenEndpointAuthMethodNames(authMethod: EhrClientAuthMethod): string[] {
  switch (authMethod) {
    case 'private_key_jwt':
    case 'client_secret_post':
    case 'client_secret_basic':
      return [authMethod];
    case 'public_pkce':
      return ['none', 'public_pkce'];
    case 'fhir_authorization_jwt':
    case 'shared_secret':
      return [authMethod];
  }
}

function optionalStringArray(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BackendServicesError(
      'backend_response_invalid_json',
      'SMART Backend Services endpoint returned invalid JSON',
      502,
    );
  }
}

function parseBackendTokenResponse(value: unknown): BackendTokenResponse {
  if (!value || typeof value !== 'object') {
    throw new BackendServicesError(
      'backend_token_invalid',
      'SMART Backend Services token response was not an object',
      502,
    );
  }
  const response = value as Record<string, unknown>;
  if (typeof response.access_token !== 'string' || response.access_token.length === 0) {
    throw new BackendServicesError(
      'backend_token_missing_access_token',
      'SMART Backend Services token response omitted access_token',
      502,
    );
  }
  if (typeof response.token_type !== 'string' || response.token_type.toLowerCase() !== 'bearer') {
    throw new BackendServicesError(
      'backend_token_invalid_token_type',
      'SMART Backend Services token response must include token_type bearer',
      502,
    );
  }
  if (!Number.isFinite(response.expires_in) || typeof response.expires_in !== 'number' || response.expires_in <= 0) {
    throw new BackendServicesError(
      'backend_token_invalid_expires_in',
      'SMART Backend Services token response must include positive expires_in',
      502,
    );
  }
  if (typeof response.scope !== 'string' || response.scope.trim().length === 0) {
    throw new BackendServicesError(
      'backend_token_missing_scope',
      'SMART Backend Services token response must include authorized scope',
      502,
    );
  }

  return {
    ...response,
    access_token: response.access_token,
    token_type: response.token_type,
    expires_in: response.expires_in,
    scope: normalizeBackendScope(response.scope),
  };
}

function ensureHttpsOrLocalhostUrl(url: string, code: string, message: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BackendServicesError(code, message, 502);
  }

  if (parsed.protocol === 'https:') return;
  if (
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')
  ) {
    return;
  }

  throw new BackendServicesError(code, message, 502);
}

function tokenErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const errorDescription = (body as { error_description?: unknown }).error_description;
    const error = (body as { error?: unknown }).error;
    if (typeof errorDescription === 'string' && errorDescription.length > 0) {
      return errorDescription;
    }
    if (typeof error === 'string' && error.length > 0) {
      return error;
    }
  }
  return `SMART Backend Services token request failed with HTTP ${status}`;
}
