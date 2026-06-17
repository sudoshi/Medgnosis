// =============================================================================
// SMART launch/session groundwork
// Creates and consumes SMART launch state, resolves tenant launch configuration,
// exchanges authorization codes, and records sanitized token metadata.
// =============================================================================

import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { sql } from '@medgnosis/db';
import type { JWK } from 'jose';
import {
  createBackendClientAssertion,
  resolvePrivateKeyFromEnvironment,
  type BackendPrivateKeyMaterial,
  type BackendPrivateKeyResolver,
} from './backendServices.js';
import type { EhrClientAuthMethod } from './tenantRegistry.js';
import {
  expiresAtFromExpiresIn,
  persistSmartTokenMetadata,
  sanitizeTokenResponseMetadata,
  type SmartTokenMetadata,
} from './tokenStore.js';
import type {
  EhrLaunchContext,
  EhrTenantRef,
  EhrVendorAdapter,
  FetchLike,
  SmartTokenResponseShape,
} from './types.js';
import { getVendorAdapter } from './vendorAdapters/index.js';

export type SmartLaunchStatus = 'pending' | 'consumed' | 'expired' | 'cancelled';
export type JsonObject = Record<string, unknown>;

export interface SmartLaunchSession {
  id: string;
  ehrTenantId: number;
  orgId: number | null;
  userId: string | null;
  clientRegistrationId: number | null;
  stateHash: string;
  nonceHash: string;
  codeVerifier: string;
  redirectUri: string;
  appRedirectUrl: string | null;
  issuer: string | null;
  launch: string | null;
  requestedScope: string;
  launchContext: JsonObject;
  status: SmartLaunchStatus;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmartLaunchConfig {
  tenant: EhrTenantRef & {
    id: number;
    orgId: number | null;
  };
  clientRegistrationId: number;
  clientId: string;
  clientSecretRef: string | null;
  authMethod: EhrClientAuthMethod;
  jwksUrl: string | null;
  privateKeyRef: string | null;
  redirectUris: string[];
  launchUrl: string | null;
  scopesRequested: string;
  scopesGranted: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

export interface CreateSmartLaunchStateInput {
  ehrTenantId: number;
  orgId?: number | null;
  userId?: string | null;
  clientRegistrationId?: number | null;
  clientId: string;
  authorizationEndpoint: string;
  fhirBaseUrl: string;
  redirectUri: string;
  appRedirectUrl?: string | null;
  issuer?: string | null;
  launch?: string | null;
  scope: string | readonly string[];
  launchContext?: JsonObject | null;
  expiresInSeconds?: number;
  state?: string;
  nonce?: string;
  codeVerifier?: string;
  now?: Date;
}

export interface CreatedSmartLaunchState {
  session: SmartLaunchSession;
  state: string;
  nonce: string;
  authorizationUrl: string;
}

export interface ConsumeSmartLaunchStateOptions {
  now?: Date;
}

export interface ExchangeSmartAuthorizationCodeInput {
  tenant: EhrTenantRef;
  adapter?: EhrVendorAdapter;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string | null;
  authMethod?: EhrClientAuthMethod;
  jwksUrl?: string | null;
  privateKeyRef?: string | null;
  privateKey?: BackendPrivateKeyMaterial | string | JWK;
  privateKeyResolver?: BackendPrivateKeyResolver;
  codeVerifier: string;
  code: string;
  redirectUri: string;
  now?: Date;
}

export interface SmartTokenResponse extends SmartTokenResponseShape {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export interface SmartTokenExchangeResult {
  tokenResponse: SmartTokenResponse;
  launchContext: EhrLaunchContext;
  expiresAt: string | null;
}

export interface CompleteSmartLaunchCallbackInput {
  state: string;
  code: string;
  config: Pick<
    SmartLaunchConfig,
    'tenant' | 'clientId' | 'tokenEndpoint' | 'authMethod' | 'jwksUrl' | 'privateKeyRef'
  > & {
    clientSecret?: string | null;
    clientSecretRef?: string | null;
  };
}

export interface CompleteSmartLaunchCallbackResult {
  session: SmartLaunchSession;
  launchContext: EhrLaunchContext;
  tokenMetadata: SmartTokenMetadata;
}

interface SmartLaunchSessionRow {
  id: string;
  ehr_tenant_id: number;
  org_id: number | null;
  user_id: string | null;
  client_registration_id: number | null;
  state_hash: string;
  nonce_hash: string;
  code_verifier: string;
  redirect_uri: string;
  app_redirect_url: string | null;
  issuer: string | null;
  launch: string | null;
  requested_scope: string;
  launch_context: JsonObject;
  status: SmartLaunchStatus;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SmartLaunchConfigRow {
  ehr_tenant_id: number;
  org_id: number | null;
  vendor: string;
  fhir_base_url: string;
  smart_config_url: string | null;
  issuer: string | null;
  audience: string | null;
  client_registration_id: number;
  client_id: string;
  client_secret_ref: string | null;
  auth_method: EhrClientAuthMethod;
  jwks_url: string | null;
  private_key_ref: string | null;
  redirect_uris: unknown;
  launch_url: string | null;
  scopes_requested: string;
  scopes_granted: string;
}

interface SmartConfigurationResponse {
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
  code_challenge_methods_supported?: unknown;
  token_endpoint_auth_methods_supported?: unknown;
}

const DEFAULT_LAUNCH_TTL_SECONDS = 10 * 60;

function asSqlJson(value: unknown): Parameters<typeof sql.json>[0] {
  return value as Parameters<typeof sql.json>[0];
}

function mapDbNumber(value: number | string): number {
  return Number(value);
}

function mapNullableDbNumber(value: number | string | null): number | null {
  return value == null ? null : mapDbNumber(value);
}

function mapSession(row: SmartLaunchSessionRow): SmartLaunchSession {
  return {
    id: row.id,
    ehrTenantId: mapDbNumber(row.ehr_tenant_id),
    orgId: mapNullableDbNumber(row.org_id),
    userId: row.user_id,
    clientRegistrationId: mapNullableDbNumber(row.client_registration_id),
    stateHash: row.state_hash,
    nonceHash: row.nonce_hash,
    codeVerifier: row.code_verifier,
    redirectUri: row.redirect_uri,
    appRedirectUrl: row.app_redirect_url,
    issuer: row.issuer,
    launch: row.launch,
    requestedScope: row.requested_scope,
    launchContext: row.launch_context,
    status: row.status,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SmartLaunchError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'SmartLaunchError';
    this.code = code;
    this.status = status;
  }
}

export function hashSmartValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateSmartOpaqueValue(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function smartPkceChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

export function normalizeSmartScope(scope: string | readonly string[]): string {
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

export async function createSmartLaunchState(
  input: CreateSmartLaunchStateInput,
): Promise<CreatedSmartLaunchState> {
  const state = input.state ?? generateSmartOpaqueValue();
  const nonce = input.nonce ?? generateSmartOpaqueValue();
  const codeVerifier = input.codeVerifier ?? generateSmartOpaqueValue(64);
  const now = input.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() + (input.expiresInSeconds ?? DEFAULT_LAUNCH_TTL_SECONDS) * 1000,
  );
  const requestedScope = normalizeSmartScope(input.scope);

  const rows = await sql<SmartLaunchSessionRow[]>`
    INSERT INTO phm_edw.smart_launch_session
      (ehr_tenant_id, org_id, user_id, client_registration_id, state_hash, nonce_hash,
       code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope, launch_context, expires_at)
    VALUES (
      ${input.ehrTenantId},
      ${input.orgId ?? null},
      ${input.userId ?? null},
      ${input.clientRegistrationId ?? null},
      ${hashSmartValue(state)},
      ${hashSmartValue(nonce)},
      ${codeVerifier},
      ${input.redirectUri},
      ${input.appRedirectUrl ?? null},
      ${input.issuer ?? null},
      ${input.launch ?? null},
      ${requestedScope},
      ${sql.json(asSqlJson(input.launchContext ?? {}))},
      ${expiresAt.toISOString()}
    )
    RETURNING id, ehr_tenant_id, org_id, user_id, client_registration_id, state_hash,
              nonce_hash, code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope,
              launch_context, status, expires_at::text AS expires_at,
              consumed_at::text AS consumed_at, created_at::text AS created_at,
              updated_at::text AS updated_at
  `;

  const session = mapSession(rows[0]!);
  return {
    session,
    state,
    nonce,
    authorizationUrl: buildAuthorizationUrl({
      authorizationEndpoint: input.authorizationEndpoint,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      scope: requestedScope,
      state,
      nonce,
      launch: input.launch ?? null,
      audience: input.fhirBaseUrl,
      codeChallenge: smartPkceChallenge(codeVerifier),
    }),
  };
}

export async function consumeSmartLaunchState(
  state: string,
  options: ConsumeSmartLaunchStateOptions = {},
): Promise<SmartLaunchSession | null> {
  const now = options.now ?? new Date();
  const session = await findSmartLaunchSessionByState(state);
  if (!session) return null;

  if (session.status !== 'pending') return null;

  if (Date.parse(session.expiresAt) <= now.getTime()) {
    await sql`
      UPDATE phm_edw.smart_launch_session
      SET status = 'expired', updated_at = NOW()
      WHERE id = ${session.id}::uuid AND status = 'pending'
    `;
    return null;
  }

  const updated = await sql<SmartLaunchSessionRow[]>`
    UPDATE phm_edw.smart_launch_session
    SET status = 'consumed', consumed_at = NOW(), updated_at = NOW()
    WHERE id = ${session.id}::uuid AND status = 'pending'
    RETURNING id, ehr_tenant_id, org_id, user_id, client_registration_id, state_hash,
              nonce_hash, code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope,
              launch_context, status, expires_at::text AS expires_at,
              consumed_at::text AS consumed_at, created_at::text AS created_at,
              updated_at::text AS updated_at
  `;

  return updated[0] ? mapSession(updated[0]) : null;
}

export async function findSmartLaunchSessionByState(state: string): Promise<SmartLaunchSession | null> {
  const stateHash = hashSmartValue(state);
  const rows = await sql<SmartLaunchSessionRow[]>`
    SELECT id, ehr_tenant_id, org_id, user_id, client_registration_id, state_hash,
           nonce_hash, code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope,
           launch_context, status, expires_at::text AS expires_at,
           consumed_at::text AS consumed_at, created_at::text AS created_at,
           updated_at::text AS updated_at
    FROM phm_edw.smart_launch_session
    WHERE state_hash = ${stateHash}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? mapSession(row) : null;
}

export async function loadSmartLaunchConfig(
  ehrTenantId: number,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis) as FetchLike,
): Promise<SmartLaunchConfig | null> {
  const rows = await sql<SmartLaunchConfigRow[]>`
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
      r.client_secret_ref,
      r.auth_method,
      r.jwks_url,
      r.private_key_ref,
      r.redirect_uris,
      r.launch_url,
      r.scopes_requested,
      r.scopes_granted
    FROM phm_edw.ehr_tenant t
    JOIN phm_edw.ehr_client_registration r ON r.ehr_tenant_id = t.id
    WHERE t.id = ${ehrTenantId}
      AND r.client_type = 'smart_launch'
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
  const adapter = getVendorAdapter(row.vendor);
  const discovery = adapter.discover(tenant);
  const smartConfiguration = await fetchSmartConfiguration(
    discovery.smartConfigurationUrl,
    fetchImpl,
    row.auth_method,
  );

  return {
    tenant,
    clientRegistrationId: mapDbNumber(row.client_registration_id),
    clientId: row.client_id,
    clientSecretRef: row.client_secret_ref,
    authMethod: row.auth_method,
    jwksUrl: row.jwks_url,
    privateKeyRef: row.private_key_ref,
    redirectUris: parseRedirectUris(row.redirect_uris),
    launchUrl: row.launch_url,
    scopesRequested: row.scopes_requested,
    scopesGranted: row.scopes_granted,
    authorizationEndpoint: smartConfiguration.authorizationEndpoint,
    tokenEndpoint: smartConfiguration.tokenEndpoint,
  };
}

export async function exchangeSmartAuthorizationCode(
  input: ExchangeSmartAuthorizationCodeInput,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis) as FetchLike,
): Promise<SmartTokenExchangeResult> {
  const adapter = input.adapter ?? getVendorAdapter(input.tenant.vendor);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  body.set('code_verifier', input.codeVerifier);

  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded',
  };
  await applySmartTokenClientAuthentication(input, body, headers);

  const response = await fetchImpl(input.tokenEndpoint, {
    method: 'POST',
    headers,
    body,
  });
  const responseBody = await parseJsonResponse(response);

  if (!response.ok) {
    throw new SmartLaunchError(
      'smart_token_exchange_failed',
      tokenErrorMessage(responseBody, response.status),
      response.status,
    );
  }

  const tokenResponse = parseSmartTokenResponse(responseBody);
  const launchContext = adapter.launchContextMapper(tokenResponse);

  return {
    tokenResponse,
    launchContext,
    expiresAt: expiresAtFromExpiresIn(tokenResponse.expires_in, input.now ?? new Date()),
  };
}

export async function saveSmartLaunchContext(
  sessionId: string,
  launchContext: EhrLaunchContext,
): Promise<SmartLaunchSession> {
  const rows = await sql<SmartLaunchSessionRow[]>`
    UPDATE phm_edw.smart_launch_session
    SET launch_context = ${sql.json(asSqlJson(launchContext))}, updated_at = NOW()
    WHERE id = ${sessionId}::uuid
    RETURNING id, ehr_tenant_id, org_id, user_id, client_registration_id, state_hash,
              nonce_hash, code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope,
              launch_context, status, expires_at::text AS expires_at,
              consumed_at::text AS consumed_at, created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return mapSession(rows[0]!);
}

export async function completeSmartLaunchCallback(
  input: CompleteSmartLaunchCallbackInput,
  fetchImpl?: FetchLike,
): Promise<CompleteSmartLaunchCallbackResult> {
  const session = await consumeSmartLaunchState(input.state);
  if (!session) {
    throw new SmartLaunchError('invalid_smart_launch_state', 'SMART launch state is invalid or expired', 400);
  }

  const clientSecret = smartLaunchAuthUsesClientSecret(input.config.authMethod)
    ? input.config.clientSecret ?? resolveClientSecretFromEnvironment(input.config.clientSecretRef ?? null)
    : input.config.clientSecret ?? null;
  const exchange = await exchangeSmartAuthorizationCode(
    {
      tenant: input.config.tenant,
      tokenEndpoint: input.config.tokenEndpoint,
      clientId: input.config.clientId,
      clientSecret,
      authMethod: input.config.authMethod,
      jwksUrl: input.config.jwksUrl,
      privateKeyRef: input.config.privateKeyRef,
      codeVerifier: session.codeVerifier,
      code: input.code,
      redirectUri: session.redirectUri,
    },
    fetchImpl,
  );

  const updatedSession = await saveSmartLaunchContext(session.id, exchange.launchContext);
  const tokenMetadata = await persistSmartTokenMetadata({
    smartLaunchSessionId: updatedSession.id,
    ehrTenantId: updatedSession.ehrTenantId,
    orgId: updatedSession.orgId,
    userId: updatedSession.userId,
    tokenType: exchange.tokenResponse.token_type ?? 'Bearer',
    scope: exchange.tokenResponse.scope ?? updatedSession.requestedScope,
    accessToken: exchange.tokenResponse.access_token,
    refreshToken: exchange.tokenResponse.refresh_token,
    idToken: exchange.tokenResponse.id_token,
    patientRef: exchange.launchContext.patient ?? null,
    encounterRef: exchange.launchContext.encounter ?? null,
    fhirUserRef: exchange.launchContext.fhirUser ?? null,
    launchContext: exchange.launchContext,
    tokenResponseMetadata: sanitizeTokenResponseMetadata(exchange.tokenResponse),
    expiresAt: exchange.expiresAt,
  });

  return {
    session: updatedSession,
    launchContext: exchange.launchContext,
    tokenMetadata,
  };
}

async function applySmartTokenClientAuthentication(
  input: ExchangeSmartAuthorizationCodeInput,
  body: URLSearchParams,
  headers: Record<string, string>,
): Promise<void> {
  const authMethod = input.authMethod ?? (input.clientSecret ? 'client_secret_post' : 'public_pkce');

  switch (authMethod) {
    case 'public_pkce':
      body.set('client_id', input.clientId);
      return;
    case 'client_secret_post':
      body.set('client_id', input.clientId);
      body.set('client_secret', requireSmartClientSecret(input.clientSecret, authMethod));
      return;
    case 'client_secret_basic':
      headers.authorization = `Basic ${Buffer.from(
        `${input.clientId}:${requireSmartClientSecret(input.clientSecret, authMethod)}`,
      ).toString('base64')}`;
      return;
    case 'private_key_jwt': {
      const privateKey = input.privateKey ?? await resolveSmartPrivateKey(
        input.privateKeyRef ?? null,
        input.privateKeyResolver ?? resolvePrivateKeyFromEnvironment,
      );
      const assertion = await createBackendClientAssertion({
        clientId: input.clientId,
        tokenEndpoint: input.tokenEndpoint,
        privateKey,
        jwksUrl: input.jwksUrl,
        now: input.now,
      });
      body.set('client_id', input.clientId);
      body.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
      body.set('client_assertion', assertion);
      return;
    }
    case 'fhir_authorization_jwt':
    case 'shared_secret':
      throw new SmartLaunchError(
        'smart_auth_method_unsupported',
        `SMART launch token exchange does not support auth_method ${authMethod}`,
        500,
      );
  }
}

function requireSmartClientSecret(
  clientSecret: string | null | undefined,
  authMethod: EhrClientAuthMethod,
): string {
  if (!clientSecret) {
    throw new SmartLaunchError(
      'smart_client_secret_missing',
      `SMART launch ${authMethod} token exchange requires client_secret_ref`,
      500,
    );
  }
  return clientSecret;
}

function smartLaunchAuthUsesClientSecret(authMethod: EhrClientAuthMethod): boolean {
  return authMethod === 'client_secret_post' || authMethod === 'client_secret_basic';
}

async function resolveSmartPrivateKey(
  privateKeyRef: string | null,
  resolver: BackendPrivateKeyResolver,
): Promise<BackendPrivateKeyMaterial | string | JWK> {
  if (!privateKeyRef) {
    throw new SmartLaunchError(
      'smart_private_key_ref_missing',
      'SMART launch private_key_jwt client registration is missing private_key_ref',
      500,
    );
  }
  return resolver(privateKeyRef);
}

function buildAuthorizationUrl(input: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  launch: string | null;
  audience: string;
  codeChallenge: string;
}): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', input.scope);
  url.searchParams.set('state', input.state);
  url.searchParams.set('nonce', input.nonce);
  url.searchParams.set('aud', input.audience);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (input.launch) {
    url.searchParams.set('launch', input.launch);
  }
  return url.toString();
}

function resolveClientSecretFromEnvironment(clientSecretRef: string | null): string | null {
  if (!clientSecretRef) return null;
  const separator = clientSecretRef.indexOf(':');
  if (separator <= 0 || clientSecretRef.slice(0, separator) !== 'env') {
    throw new SmartLaunchError(
      'smart_client_secret_ref_unsupported',
      'SMART launch client_secret_ref must use the env: scheme',
      500,
    );
  }

  const envName = clientSecretRef.slice(separator + 1);
  const value = process.env[envName];
  if (!value) {
    throw new SmartLaunchError(
      'smart_client_secret_missing',
      `SMART launch client secret env var is not set: ${envName}`,
      500,
    );
  }
  return value;
}

async function fetchSmartConfiguration(
  smartConfigurationUrl: string,
  fetchImpl: FetchLike,
  authMethod?: EhrClientAuthMethod,
): Promise<{ authorizationEndpoint: string; tokenEndpoint: string }> {
  const response = await fetchImpl(smartConfigurationUrl, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new SmartLaunchError(
      'smart_configuration_failed',
      `SMART configuration request failed with HTTP ${response.status}`,
      response.status,
    );
  }

  const configuration = body as SmartConfigurationResponse;
  if (
    typeof configuration.authorization_endpoint !== 'string' ||
    typeof configuration.token_endpoint !== 'string'
  ) {
    throw new SmartLaunchError(
      'smart_configuration_invalid',
      'SMART configuration is missing authorization_endpoint or token_endpoint',
      502,
    );
  }
  validatePkceSupport(configuration);
  validateSmartLaunchAuthMethodSupport(configuration, authMethod);

  return {
    authorizationEndpoint: configuration.authorization_endpoint,
    tokenEndpoint: configuration.token_endpoint,
  };
}

function validatePkceSupport(configuration: SmartConfigurationResponse): void {
  if (configuration.code_challenge_methods_supported === undefined) return;
  const methods = Array.isArray(configuration.code_challenge_methods_supported)
    ? configuration.code_challenge_methods_supported
    : [];
  if (!methods.includes('S256')) {
    throw new SmartLaunchError(
      'smart_configuration_pkce_not_supported',
      'SMART configuration does not advertise S256 PKCE support',
      502,
    );
  }
}

function validateSmartLaunchAuthMethodSupport(
  configuration: SmartConfigurationResponse,
  authMethod: EhrClientAuthMethod | undefined,
): void {
  if (!authMethod) return;
  if (authMethod === 'public_pkce') return;
  const authMethods = optionalStringArray(configuration.token_endpoint_auth_methods_supported);
  if (!authMethods) return;

  const acceptableNames = tokenEndpointAuthMethodNames(authMethod);
  if (acceptableNames.length > 0 && !acceptableNames.some((method) => authMethods.includes(method))) {
    throw new SmartLaunchError(
      'smart_token_auth_method_not_supported',
      `SMART configuration does not advertise ${authMethod} token endpoint auth support`,
      502,
    );
  }
}

function tokenEndpointAuthMethodNames(authMethod: EhrClientAuthMethod): string[] {
  switch (authMethod) {
    case 'client_secret_post':
    case 'client_secret_basic':
    case 'private_key_jwt':
      return [authMethod];
    case 'public_pkce':
    case 'fhir_authorization_jwt':
    case 'shared_secret':
      return [];
  }
}

function optionalStringArray(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function parseRedirectUris(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SmartLaunchError('smart_response_invalid_json', 'SMART endpoint returned invalid JSON', 502);
  }
}

function parseSmartTokenResponse(value: unknown): SmartTokenResponse {
  if (!value || typeof value !== 'object') {
    throw new SmartLaunchError('smart_token_invalid', 'SMART token response was not an object', 502);
  }

  const response = value as Record<string, unknown>;
  if (typeof response.access_token !== 'string' || response.access_token.length === 0) {
    throw new SmartLaunchError('smart_token_missing_access_token', 'SMART token response omitted access_token', 502);
  }

  return {
    ...response,
    access_token: response.access_token,
    token_type: typeof response.token_type === 'string' ? response.token_type : undefined,
    expires_in: typeof response.expires_in === 'number' ? response.expires_in : undefined,
    refresh_token: typeof response.refresh_token === 'string' ? response.refresh_token : undefined,
    id_token: typeof response.id_token === 'string' ? response.id_token : undefined,
    scope: typeof response.scope === 'string' ? response.scope : undefined,
  };
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
  return `SMART token exchange failed with HTTP ${status}`;
}
