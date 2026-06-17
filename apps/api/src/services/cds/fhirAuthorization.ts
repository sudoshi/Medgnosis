// =============================================================================
// CDS Hooks client authentication
// Verifies CDS Hooks 2.0.1 client JWTs and keeps shared-secret compatibility
// isolated from Medgnosis app-user authentication.
// =============================================================================

import type { FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
import { config } from '../../config.js';

type AuthMethod = 'fhirAuthorization' | 'shared-secret' | 'open';
type AuthFailureCode =
  | 'cds_fhir_auth_not_configured'
  | 'cds_fhir_auth_missing'
  | 'cds_fhir_auth_invalid'
  | 'cds_shared_secret_invalid';

export interface FhirAuthorizationPayload {
  access_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
}

export interface CdsFhirAuthConfig {
  isProd: boolean;
  cdsHooksSecret: string;
  cdsFhirAuthRequired: boolean;
  cdsSharedSecretCompat: boolean;
  cdsJwksCacheTtlSeconds: number;
  cdsFhirAuthIssuer: string;
  cdsFhirAuthAudience: string;
  cdsFhirAuthJwksUrl: string;
  cdsFhirAuthRequiredScopes: string;
}

export interface FhirAuthorizationVerification {
  ok: boolean;
  method?: AuthMethod;
  status?: 401 | 503;
  code?: AuthFailureCode;
  message?: string;
  payload?: JWTPayload;
}

export interface VerifyFhirAuthorizationOptions {
  config?: Partial<CdsFhirAuthConfig>;
  jwks?: JWTVerifyGetKey;
}

const remoteJwksCache = new Map<string, JWTVerifyGetKey>();

function runtimeConfig(overrides: Partial<CdsFhirAuthConfig> = {}): CdsFhirAuthConfig {
  return {
    isProd: Boolean(config.isProd),
    cdsHooksSecret: config.cdsHooksSecret ?? '',
    cdsFhirAuthRequired: config.cdsFhirAuthRequired ?? false,
    cdsSharedSecretCompat: config.cdsSharedSecretCompat ?? true,
    cdsJwksCacheTtlSeconds: config.cdsJwksCacheTtlSeconds ?? 300,
    cdsFhirAuthIssuer: config.cdsFhirAuthIssuer ?? '',
    cdsFhirAuthAudience: config.cdsFhirAuthAudience ?? '',
    cdsFhirAuthJwksUrl: config.cdsFhirAuthJwksUrl ?? '',
    cdsFhirAuthRequiredScopes: config.cdsFhirAuthRequiredScopes ?? '',
    ...overrides,
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePositiveSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 300;
}

function getRemoteJwks(jwksUrl: string, ttlSeconds: number): JWTVerifyGetKey {
  const ttl = normalizePositiveSeconds(ttlSeconds);
  const key = `${jwksUrl}|${ttl}`;
  const cached = remoteJwksCache.get(key);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: ttl * 1000,
    cooldownDuration: Math.min(ttl * 1000, 30_000),
  });
  remoteJwksCache.set(key, jwks);
  return jwks;
}

function claimScopes(payload: JWTPayload, requestScope?: string): Set<string> {
  const scopes = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string') {
      for (const scope of splitList(value)) scopes.add(scope);
    } else if (Array.isArray(value)) {
      for (const scope of value) {
        if (typeof scope === 'string') scopes.add(scope);
      }
    }
  };

  add(payload.scope);
  add(payload.scp);
  add(requestScope);
  return scopes;
}

function hasRequiredScopes(payload: JWTPayload, requiredScopes: string[], requestScope?: string): boolean {
  if (requiredScopes.length === 0) return true;
  const scopes = claimScopes(payload, requestScope);
  return requiredScopes.every((scope) => scopes.has(scope));
}

function safeSecretEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearerToken(header: FastifyRequest['headers']['authorization']): string {
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function fhirAuthorizationFromBody(body: unknown): FhirAuthorizationPayload | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const candidate = (body as { fhirAuthorization?: unknown }).fhirAuthorization;
  return candidate && typeof candidate === 'object' ? (candidate as FhirAuthorizationPayload) : undefined;
}

function scopeFromFhirAuthorization(fhirAuthorization?: FhirAuthorizationPayload): string {
  return typeof fhirAuthorization?.scope === 'string' ? fhirAuthorization.scope : '';
}

function sharedSecretFromRequest(request: FastifyRequest): string {
  const bearer = bearerToken(request.headers.authorization);
  const secretHeader = headerValue(request.headers['x-medgnosis-cds-secret']);
  return secretHeader || bearer;
}

export function clearFhirAuthorizationJwksCache(): void {
  remoteJwksCache.clear();
}

export async function verifyFhirAuthorization(
  token: string,
  requestScope = '',
  options: VerifyFhirAuthorizationOptions = {},
): Promise<FhirAuthorizationVerification> {
  const cfg = runtimeConfig(options.config);

  if (!token) {
    return {
      ok: false,
      status: 401,
      code: 'cds_fhir_auth_missing',
      message: 'Missing CDS Hooks fhirAuthorization bearer token',
    };
  }

  const audiences = splitList(cfg.cdsFhirAuthAudience);
  if (!cfg.cdsFhirAuthJwksUrl || !cfg.cdsFhirAuthIssuer || audiences.length === 0) {
    return {
      ok: false,
      status: 503,
      code: 'cds_fhir_auth_not_configured',
      message: 'CDS Hooks FHIR authorization is not configured',
    };
  }

  try {
    const jwks = options.jwks ?? getRemoteJwks(cfg.cdsFhirAuthJwksUrl, cfg.cdsJwksCacheTtlSeconds);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: cfg.cdsFhirAuthIssuer,
      audience: audiences,
      typ: 'JWT',
    });
    if (typeof payload.exp !== 'number') {
      return {
        ok: false,
        status: 401,
        code: 'cds_fhir_auth_invalid',
        message: 'CDS Hooks client JWT must include exp',
      };
    }
    if (!hasRequiredScopes(payload, splitList(cfg.cdsFhirAuthRequiredScopes), requestScope)) {
      return {
        ok: false,
        status: 401,
        code: 'cds_fhir_auth_invalid',
        message: 'CDS Hooks client JWT is missing required scope',
      };
    }
    return { ok: true, method: 'fhirAuthorization', payload };
  } catch {
    return {
      ok: false,
      status: 401,
      code: 'cds_fhir_auth_invalid',
      message: 'Invalid CDS Hooks client JWT',
    };
  }
}

export async function verifyCdsHookRequest(
  request: FastifyRequest,
  options: VerifyFhirAuthorizationOptions = {},
): Promise<FhirAuthorizationVerification> {
  const cfg = runtimeConfig(options.config);
  const fhirAuthorization = fhirAuthorizationFromBody(request.body);
  const requestToken = bearerToken(request.headers.authorization);
  const requestScope = scopeFromFhirAuthorization(fhirAuthorization);
  const authRequired = cfg.cdsFhirAuthRequired || cfg.isProd || Boolean(cfg.cdsHooksSecret);
  const jwtConfigured =
    Boolean(cfg.cdsFhirAuthJwksUrl) &&
    Boolean(cfg.cdsFhirAuthIssuer) &&
    splitList(cfg.cdsFhirAuthAudience).length > 0;

  if (!authRequired) {
    return { ok: true, method: 'open' };
  }

  if (requestToken) {
    const result = await verifyFhirAuthorization(requestToken, requestScope, { ...options, config: cfg });
    if (result.ok) return result;
    if (!cfg.cdsSharedSecretCompat || !cfg.cdsHooksSecret) return result;
  }

  if (cfg.cdsSharedSecretCompat && cfg.cdsHooksSecret) {
    const suppliedSecret = sharedSecretFromRequest(request);
    if (suppliedSecret && safeSecretEqual(suppliedSecret, cfg.cdsHooksSecret)) {
      return { ok: true, method: 'shared-secret' };
    }
  }

  if (!cfg.cdsSharedSecretCompat && !requestToken) {
    const status = cfg.cdsFhirAuthRequired && !jwtConfigured ? 503 : 401;
    return {
      ok: false,
      status,
      code: status === 503 ? 'cds_fhir_auth_not_configured' : 'cds_fhir_auth_missing',
      message: status === 503 ? 'CDS Hooks FHIR authorization is not configured' : 'Unauthorized',
    };
  }

  if (cfg.cdsSharedSecretCompat && !cfg.cdsHooksSecret && !requestToken) {
    if (jwtConfigured) {
      return {
        ok: false,
        status: 401,
        code: 'cds_fhir_auth_missing',
        message: 'Unauthorized',
      };
    }

    return {
      ok: false,
      status: 503,
      code: 'cds_fhir_auth_not_configured',
      message: 'CDS Hooks authentication is not configured',
    };
  }

  return {
    ok: false,
    status: 401,
    code: requestToken ? 'cds_fhir_auth_invalid' : 'cds_shared_secret_invalid',
    message: 'Unauthorized',
  };
}

export async function authorizeCdsHookRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  options: VerifyFhirAuthorizationOptions & { cardsResponse?: boolean } = {},
): Promise<boolean> {
  const result = await verifyCdsHookRequest(request, options);
  if (result.ok) return true;

  const status = result.status ?? 401;
  const errorBody = options.cardsResponse
    ? { cards: [], _error: result.message ?? 'Unauthorized' }
    : { _error: result.message ?? 'Unauthorized' };
  reply.status(status).send(errorBody);
  return false;
}
