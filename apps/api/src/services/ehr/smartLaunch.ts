// =============================================================================
// SMART launch/session groundwork
// Creates and consumes SMART launch state, resolves tenant launch configuration,
// exchanges authorization codes, and records sanitized token metadata.
// =============================================================================

import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { sql } from '@medgnosis/db';
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose';
import type { JSONWebKeySet, JWK, JWTPayload } from 'jose';
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
import {
  enrichLaunchContextWithPatientSync,
  localPatientIdFromLaunchContext,
  patientResourceIdFromLaunchContext,
  syncSmartLaunchPatientContext,
  type SmartLaunchPatientSyncResult,
} from './smartPatientSync.js';
import {
  enqueueSmartPatientContextRefresh,
  type EnqueueSmartPatientContextRefreshResult,
} from '../../workers/ehr-patient-context-refresh.js';
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
  appSessionId: string | null;
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
  handoffCodeHash: string | null;
  handoffExpiresAt: string | null;
  handoffConsumedAt: string | null;
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
  issuer: string | null;
  idTokenJwksUrl: string | null;
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
  now?: Date;
  config: Pick<
    SmartLaunchConfig,
    | 'tenant'
    | 'clientId'
    | 'tokenEndpoint'
    | 'authMethod'
    | 'jwksUrl'
    | 'privateKeyRef'
    | 'issuer'
    | 'idTokenJwksUrl'
  > & {
    clientSecret?: string | null;
    clientSecretRef?: string | null;
    idTokenJwks?: JSONWebKeySet | null;
  };
}

export interface CompleteSmartLaunchCallbackResult {
  session: SmartLaunchSession;
  launchContext: EhrLaunchContext;
  tokenMetadata: SmartTokenMetadata;
}

export interface CreateSmartLaunchHandoffOptions {
  expiresInSeconds?: number;
  now?: Date;
}

export interface CreatedSmartLaunchHandoff {
  sessionId: string;
  handoffCode: string;
  expiresAt: string;
}

export interface ConsumeSmartLaunchHandoffInput {
  handoffCode: string;
  userId: string;
  orgId?: number | null;
  appSessionId?: string | null;
  now?: Date;
}

export interface ConsumedSmartLaunchHandoff {
  session: SmartLaunchSession;
  patientId: number | null;
}

interface SmartLaunchSessionRow {
  id: string;
  ehr_tenant_id: number;
  org_id: number | null;
  user_id: string | null;
  app_session_id: string | null;
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
  handoff_code_hash: string | null;
  handoff_expires_at: string | null;
  handoff_consumed_at: string | null;
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
  issuer?: unknown;
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
  jwks_uri?: unknown;
  code_challenge_methods_supported?: unknown;
  token_endpoint_auth_methods_supported?: unknown;
}

interface ParsedSmartConfiguration {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  issuer: string | null;
  jwksUri: string | null;
}

export interface ValidateSmartIdTokenInput {
  idToken: string;
  expectedIssuer: string | null | undefined;
  expectedAudience: string;
  nonceHash: string;
  jwksUrl?: string | null;
  jwks?: JSONWebKeySet | null;
  now?: Date;
}

const DEFAULT_LAUNCH_TTL_SECONDS = 10 * 60;
const DEFAULT_HANDOFF_TTL_SECONDS = 5 * 60;
const SMART_ID_TOKEN_MAX_AGE = '15m';
const SMART_ID_TOKEN_CLOCK_TOLERANCE_SECONDS = 60;

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
    appSessionId: row.app_session_id ?? null,
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
    handoffCodeHash: row.handoff_code_hash ?? null,
    handoffExpiresAt: row.handoff_expires_at ?? null,
    handoffConsumedAt: row.handoff_consumed_at ?? null,
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
    RETURNING id, ehr_tenant_id, org_id, user_id, app_session_id,
              client_registration_id, state_hash,
              nonce_hash, code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope,
              launch_context, status, expires_at::text AS expires_at,
              consumed_at::text AS consumed_at,
              handoff_code_hash,
              handoff_expires_at::text AS handoff_expires_at,
              handoff_consumed_at::text AS handoff_consumed_at,
              created_at::text AS created_at,
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
    RETURNING id, ehr_tenant_id, org_id, user_id, app_session_id,
              client_registration_id, state_hash,
              nonce_hash, code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope,
              launch_context, status, expires_at::text AS expires_at,
              consumed_at::text AS consumed_at,
              handoff_code_hash,
              handoff_expires_at::text AS handoff_expires_at,
              handoff_consumed_at::text AS handoff_consumed_at,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;

  return updated[0] ? mapSession(updated[0]) : null;
}

export async function findSmartLaunchSessionByState(state: string): Promise<SmartLaunchSession | null> {
  const stateHash = hashSmartValue(state);
  const rows = await sql<SmartLaunchSessionRow[]>`
    SELECT id, ehr_tenant_id, org_id, user_id, app_session_id,
           client_registration_id, state_hash,
           nonce_hash, code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope,
           launch_context, status, expires_at::text AS expires_at,
           consumed_at::text AS consumed_at,
           handoff_code_hash,
           handoff_expires_at::text AS handoff_expires_at,
           handoff_consumed_at::text AS handoff_consumed_at,
           created_at::text AS created_at,
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
    issuer: smartConfiguration.issuer ?? row.issuer ?? null,
    idTokenJwksUrl: smartConfiguration.jwksUri,
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
    RETURNING id, ehr_tenant_id, org_id, user_id, app_session_id,
              client_registration_id, state_hash,
              nonce_hash, code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope,
              launch_context, status, expires_at::text AS expires_at,
              consumed_at::text AS consumed_at,
              handoff_code_hash,
              handoff_expires_at::text AS handoff_expires_at,
              handoff_consumed_at::text AS handoff_consumed_at,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return mapSession(rows[0]!);
}

export async function completeSmartLaunchCallback(
  input: CompleteSmartLaunchCallbackInput,
  fetchImpl?: FetchLike,
): Promise<CompleteSmartLaunchCallbackResult> {
  const session = await consumeSmartLaunchState(input.state, { now: input.now });
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
      now: input.now,
    },
    fetchImpl,
  );

  await validateSmartLaunchTokenResponse({
    tokenResponse: exchange.tokenResponse,
    session,
    config: input.config,
    now: input.now,
  });

  const patientSync = await syncSmartLaunchPatientContext({
    session,
    tenant: input.config.tenant,
    tokenResponse: exchange.tokenResponse,
    launchContext: exchange.launchContext,
    fetchImpl,
  });
  const patientContextRefresh = await enqueuePatientContextRefreshForLaunch(
    session,
    input.config.tenant,
    patientSync,
  );
  const launchContext = enrichLaunchContextWithPatientSync(exchange.launchContext, patientSync);
  if (patientContextRefresh) {
    (launchContext as unknown as JsonObject).patientContextRefresh = patientContextRefresh;
  }

  const updatedSession = await saveSmartLaunchContext(session.id, launchContext);
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
    patientRef: launchContext.patient ?? null,
    encounterRef: launchContext.encounter ?? null,
    fhirUserRef: launchContext.fhirUser ?? null,
    launchContext,
    tokenResponseMetadata: sanitizeTokenResponseMetadata(exchange.tokenResponse),
    expiresAt: exchange.expiresAt,
  });

  return {
    session: updatedSession,
    launchContext,
    tokenMetadata,
  };
}

async function enqueuePatientContextRefreshForLaunch(
  session: SmartLaunchSession,
  tenant: EhrTenantRef & { id: number; orgId: number | null },
  patientSync: SmartLaunchPatientSyncResult,
): Promise<JsonObject | null> {
  if (!patientSync.patientResourceId || patientSync.localPatientId === null) {
    return null;
  }

  try {
    const queued = await enqueueSmartPatientContextRefresh({
      ehrTenantId: session.ehrTenantId,
      orgId: tenant.orgId ?? session.orgId,
      patientResourceId: patientSync.patientResourceId,
      localPatientId: patientSync.localPatientId,
      smartLaunchSessionId: session.id,
      triggeredBy: 'smart_launch',
    });
    return queuedRefreshSummary(queued);
  } catch (err) {
    return {
      status: 'enqueue_failed',
      queueName: 'medgnosis-ehr-patient-context-refresh',
      message: messageFromError(err, 'SMART patient-context refresh enqueue failed'),
    };
  }
}

function queuedRefreshSummary(result: EnqueueSmartPatientContextRefreshResult): JsonObject | null {
  if (!result.enqueued && result.reason === 'disabled') return null;
  return {
    status: result.enqueued ? 'queued' : 'skipped',
    queueName: result.queueName,
    jobId: result.jobId ?? null,
    reason: result.reason ?? null,
  };
}

export async function createSmartLaunchHandoff(
  sessionId: string,
  options: CreateSmartLaunchHandoffOptions = {},
): Promise<CreatedSmartLaunchHandoff> {
  const handoffCode = generateSmartOpaqueValue(32);
  const now = options.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() + (options.expiresInSeconds ?? DEFAULT_HANDOFF_TTL_SECONDS) * 1000,
  );
  const updated = await sql<Pick<SmartLaunchSessionRow, 'id'>[]>`
    UPDATE phm_edw.smart_launch_session
    SET handoff_code_hash = ${hashSmartValue(handoffCode)},
        handoff_expires_at = ${expiresAt.toISOString()},
        handoff_consumed_at = NULL,
        updated_at = NOW()
    WHERE id = ${sessionId}::uuid
      AND status = 'consumed'
    RETURNING id
  `;
  if (!updated[0]) {
    throw new SmartLaunchError(
      'smart_handoff_unavailable',
      'SMART launch session is not ready for app handoff',
      409,
    );
  }

  return {
    sessionId,
    handoffCode,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function consumeSmartLaunchHandoff(
  input: ConsumeSmartLaunchHandoffInput,
): Promise<ConsumedSmartLaunchHandoff | null> {
  const now = input.now ?? new Date();
  const rows = await sql<SmartLaunchSessionRow[]>`
    UPDATE phm_edw.smart_launch_session
    SET handoff_consumed_at = NOW(),
        app_session_id = ${input.appSessionId ?? null}::uuid,
        updated_at = NOW()
    WHERE handoff_code_hash = ${hashSmartValue(input.handoffCode)}
      AND handoff_consumed_at IS NULL
      AND handoff_expires_at > ${now.toISOString()}::timestamptz
      AND status = 'consumed'
      AND (user_id IS NULL OR user_id = ${input.userId}::uuid)
      AND (org_id IS NULL OR org_id = ${input.orgId ?? null}::int)
    RETURNING id, ehr_tenant_id, org_id, user_id, app_session_id,
              client_registration_id, state_hash,
              nonce_hash, code_verifier, redirect_uri, app_redirect_url, issuer, launch, requested_scope,
              launch_context, status, expires_at::text AS expires_at,
              consumed_at::text AS consumed_at,
              handoff_code_hash,
              handoff_expires_at::text AS handoff_expires_at,
              handoff_consumed_at::text AS handoff_consumed_at,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  const session = rows[0] ? mapSession(rows[0]) : null;
  if (!session) return null;

  return {
    session,
    patientId: await resolveLocalPatientIdForLaunch(session),
  };
}

async function validateSmartLaunchTokenResponse(input: {
  tokenResponse: SmartTokenResponse;
  session: SmartLaunchSession;
  config: CompleteSmartLaunchCallbackInput['config'];
  now?: Date;
}): Promise<void> {
  const requestedOpenId = scopeContains(input.session.requestedScope, 'openid');
  if (requestedOpenId && !input.tokenResponse.id_token) {
    throw new SmartLaunchError(
      'smart_id_token_missing',
      'SMART token response omitted id_token for an OpenID launch',
      502,
    );
  }

  if (input.tokenResponse.id_token) {
    await validateSmartIdToken({
      idToken: input.tokenResponse.id_token,
      expectedIssuer: input.config.issuer,
      expectedAudience: input.config.clientId,
      nonceHash: input.session.nonceHash,
      jwksUrl: input.config.idTokenJwksUrl,
      jwks: input.config.idTokenJwks,
      now: input.now,
    });
  }
}

export async function validateSmartIdToken(input: ValidateSmartIdTokenInput): Promise<JWTPayload> {
  const expectedIssuer = normalizeRequiredUrl(input.expectedIssuer, 'SMART issuer');
  const keySet = input.jwks
    ? createLocalJWKSet(input.jwks)
    : createRemoteJWKSet(new URL(normalizeRequiredUrl(input.jwksUrl, 'SMART JWKS URI')));

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(input.idToken, keySet, {
      issuer: expectedIssuer,
      audience: input.expectedAudience,
      clockTolerance: SMART_ID_TOKEN_CLOCK_TOLERANCE_SECONDS,
      currentDate: input.now,
      maxTokenAge: SMART_ID_TOKEN_MAX_AGE,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown validation error';
    throw new SmartLaunchError(
      'smart_id_token_invalid',
      `SMART id_token validation failed: ${message}`,
      502,
    );
  }

  if (typeof payload.exp !== 'number') {
    throw new SmartLaunchError('smart_id_token_invalid', 'SMART id_token is missing exp', 502);
  }
  if (typeof payload.iat !== 'number') {
    throw new SmartLaunchError('smart_id_token_invalid', 'SMART id_token is missing iat', 502);
  }

  const nowMs = input.now?.getTime() ?? Date.now();
  const futureToleranceMs = SMART_ID_TOKEN_CLOCK_TOLERANCE_SECONDS * 1000;
  if (payload.iat * 1000 > nowMs + futureToleranceMs) {
    throw new SmartLaunchError('smart_id_token_invalid', 'SMART id_token iat is in the future', 502);
  }

  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== input.expectedAudience) {
    throw new SmartLaunchError(
      'smart_id_token_invalid',
      'SMART id_token azp does not match the launch client',
      502,
    );
  }

  const tokenUse = payload.token_use;
  if (tokenUse !== undefined && tokenUse !== 'id' && tokenUse !== 'id_token') {
    throw new SmartLaunchError(
      'smart_id_token_invalid',
      'SMART id_token token_use is not an ID token',
      502,
    );
  }

  if (typeof payload.nonce !== 'string' || hashSmartValue(payload.nonce) !== input.nonceHash) {
    throw new SmartLaunchError('smart_id_token_nonce_mismatch', 'SMART id_token nonce does not match launch state', 400);
  }

  return payload;
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
): Promise<ParsedSmartConfiguration> {
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
    issuer: typeof configuration.issuer === 'string' && configuration.issuer.length > 0
      ? configuration.issuer
      : null,
    jwksUri: typeof configuration.jwks_uri === 'string' && configuration.jwks_uri.length > 0
      ? configuration.jwks_uri
      : null,
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

function scopeContains(scope: string | null | undefined, expected: string): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).some((item) => item === expected);
}

async function resolveLocalPatientIdForLaunch(session: SmartLaunchSession): Promise<number | null> {
  const localPatientId = localPatientIdFromLaunchContext(session.launchContext);
  if (localPatientId !== null) return localPatientId;

  const patientResourceId = patientResourceIdFromLaunchContext(session.launchContext);
  if (!patientResourceId) return null;

  const rows = await sql<{ patient_id: number | string }[]>`
    SELECT patient_id
    FROM phm_edw.ehr_resource_crosswalk
    WHERE ehr_tenant_id = ${session.ehrTenantId}
      AND resource_type = 'Patient'
      AND ehr_resource_id = ${patientResourceId}
      AND patient_id IS NOT NULL
    ORDER BY last_seen_at DESC
    LIMIT 1
  `;
  return rows[0] ? Number(rows[0].patient_id) : null;
}

function normalizeRequiredUrl(value: string | null | undefined, label: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length === 0) {
    throw new SmartLaunchError(
      'smart_configuration_invalid',
      `${label} is required for SMART id_token validation`,
      502,
    );
  }
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    throw new SmartLaunchError(
      'smart_configuration_invalid',
      `${label} must be a valid URL`,
      502,
    );
  }
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
  if (typeof response.token_type !== 'string' || response.token_type.toLowerCase() !== 'bearer') {
    throw new SmartLaunchError(
      'smart_token_invalid_token_type',
      'SMART token response must use Bearer token_type',
      502,
    );
  }
  if (typeof response.expires_in !== 'number' || !Number.isFinite(response.expires_in) || response.expires_in <= 0) {
    throw new SmartLaunchError(
      'smart_token_invalid_expires_in',
      'SMART token response must include a positive expires_in',
      502,
    );
  }
  if (typeof response.scope !== 'string' || response.scope.trim().length === 0) {
    throw new SmartLaunchError(
      'smart_token_missing_scope',
      'SMART token response omitted scope',
      502,
    );
  }

  return {
    ...response,
    access_token: response.access_token,
    token_type: response.token_type,
    expires_in: response.expires_in,
    refresh_token: typeof response.refresh_token === 'string' ? response.refresh_token : undefined,
    id_token: typeof response.id_token === 'string' ? response.id_token : undefined,
    scope: response.scope,
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

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
