// =============================================================================
// SMART token metadata store
// Persists only token metadata and SHA-256 token hashes. Raw bearer, refresh, and
// ID token values must be kept outside this table in a dedicated secret store.
// =============================================================================

import { createHash } from 'node:crypto';
import { sql } from '@medgnosis/db';
import type { EhrLaunchContext } from './types.js';

export type JsonObject = Record<string, unknown>;

export interface SmartTokenMetadata {
  id: string;
  smartLaunchSessionId: string | null;
  ehrTenantId: number;
  orgId: number | null;
  userId: string | null;
  tokenType: string;
  scope: string;
  accessTokenHash: string | null;
  refreshTokenHash: string | null;
  idTokenHash: string | null;
  patientRef: string | null;
  encounterRef: string | null;
  fhirUserRef: string | null;
  launchContext: JsonObject;
  tokenResponseMetadata: JsonObject;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersistSmartTokenMetadataInput {
  smartLaunchSessionId?: string | null;
  ehrTenantId: number;
  orgId?: number | null;
  userId?: string | null;
  tokenType?: string | null;
  scope?: string | readonly string[] | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  patientRef?: string | null;
  encounterRef?: string | null;
  fhirUserRef?: string | null;
  launchContext?: EhrLaunchContext | JsonObject | null;
  tokenResponseMetadata?: JsonObject | null;
  issuedAt?: string | Date | null;
  expiresAt?: string | Date | null;
}

export interface TokenResponseMetadataInput {
  token_type?: unknown;
  scope?: unknown;
  expires_in?: unknown;
  patient?: unknown;
  encounter?: unknown;
  fhirUser?: unknown;
  [key: string]: unknown;
}

interface SmartTokenMetadataRow {
  id: string;
  smart_launch_session_id: string | null;
  ehr_tenant_id: number;
  org_id: number | null;
  user_id: string | null;
  token_type: string;
  scope: string;
  access_token_hash: string | null;
  refresh_token_hash: string | null;
  id_token_hash: string | null;
  patient_ref: string | null;
  encounter_ref: string | null;
  fhir_user_ref: string | null;
  launch_context: JsonObject;
  token_response_metadata: JsonObject;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

const RAW_TOKEN_RESPONSE_KEYS = new Set(['access_token', 'refresh_token', 'id_token']);

function asSqlJson(value: unknown): Parameters<typeof sql.json>[0] {
  return value as Parameters<typeof sql.json>[0];
}

function mapDbNumber(value: number | string): number {
  return Number(value);
}

function mapNullableDbNumber(value: number | string | null): number | null {
  return value == null ? null : mapDbNumber(value);
}

function mapTokenMetadata(row: SmartTokenMetadataRow): SmartTokenMetadata {
  return {
    id: row.id,
    smartLaunchSessionId: row.smart_launch_session_id,
    ehrTenantId: mapDbNumber(row.ehr_tenant_id),
    orgId: mapNullableDbNumber(row.org_id),
    userId: row.user_id,
    tokenType: row.token_type,
    scope: row.scope,
    accessTokenHash: row.access_token_hash,
    refreshTokenHash: row.refresh_token_hash,
    idTokenHash: row.id_token_hash,
    patientRef: row.patient_ref,
    encounterRef: row.encounter_ref,
    fhirUserRef: row.fhir_user_ref,
    launchContext: row.launch_context,
    tokenResponseMetadata: row.token_response_metadata,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function hashToken(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeScope(scope: string | readonly string[] | null | undefined): string {
  if (Array.isArray(scope)) {
    return scope.map((item) => item.trim()).filter(Boolean).join(' ');
  }
  return typeof scope === 'string' ? scope.trim() : '';
}

export function dateToIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function expiresAtFromExpiresIn(expiresIn: unknown, now = new Date()): string | null {
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }
  return new Date(now.getTime() + expiresIn * 1000).toISOString();
}

export function sanitizeTokenResponseMetadata(input: TokenResponseMetadataInput): JsonObject {
  const metadata: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (!RAW_TOKEN_RESPONSE_KEYS.has(key)) {
      metadata[key] = value;
    }
  }
  return metadata;
}

export async function persistSmartTokenMetadata(
  input: PersistSmartTokenMetadataInput,
): Promise<SmartTokenMetadata> {
  const tokenResponseMetadata = sanitizeTokenResponseMetadata(input.tokenResponseMetadata ?? {});

  const rows = await sql<SmartTokenMetadataRow[]>`
    INSERT INTO phm_edw.smart_token_metadata
      (smart_launch_session_id, ehr_tenant_id, org_id, user_id, token_type, scope,
       access_token_hash, refresh_token_hash, id_token_hash, patient_ref, encounter_ref,
       fhir_user_ref, launch_context, token_response_metadata, issued_at, expires_at)
    VALUES (
      ${input.smartLaunchSessionId ?? null},
      ${input.ehrTenantId},
      ${input.orgId ?? null},
      ${input.userId ?? null},
      ${input.tokenType ?? 'Bearer'},
      ${normalizeScope(input.scope)},
      ${hashToken(input.accessToken)},
      ${hashToken(input.refreshToken)},
      ${hashToken(input.idToken)},
      ${input.patientRef ?? null},
      ${input.encounterRef ?? null},
      ${input.fhirUserRef ?? null},
      ${sql.json(asSqlJson(input.launchContext ?? {}))},
      ${sql.json(asSqlJson(tokenResponseMetadata))},
      COALESCE(${dateToIso(input.issuedAt)}::timestamptz, NOW()),
      ${dateToIso(input.expiresAt)}::timestamptz
    )
    RETURNING id, smart_launch_session_id, ehr_tenant_id, org_id, user_id, token_type,
              scope, access_token_hash, refresh_token_hash, id_token_hash, patient_ref,
              encounter_ref, fhir_user_ref, launch_context, token_response_metadata,
              issued_at::text AS issued_at, expires_at::text AS expires_at,
              revoked_at::text AS revoked_at, created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return mapTokenMetadata(rows[0]!);
}
