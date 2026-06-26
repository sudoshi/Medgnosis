// =============================================================================
// Medgnosis API — EHR tenant registry service
// Vendor-neutral registry functions for EHR tenant onboarding, SMART/CDS client
// registrations, and captured FHIR capability metadata.
// =============================================================================

import { sql } from '@medgnosis/db';
import {
  evaluateTenantPolicy,
  type TenantPolicyFinding,
} from './tenantPolicy.js';

export type EhrVendor = 'epic' | 'oracle_cerner' | 'smart_generic' | 'hapi' | 'other';
export type EhrEnvironment = 'sandbox' | 'staging' | 'production';
export type EhrClientType = 'smart_launch' | 'backend_services' | 'cds_hooks';
export type EhrClientAuthMethod =
  | 'public_pkce'
  | 'client_secret_post'
  | 'client_secret_basic'
  | 'private_key_jwt'
  | 'fhir_authorization_jwt'
  | 'shared_secret';
export type EhrClientApprovalStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'unknown';
export type JsonObject = Record<string, unknown>;

export interface EhrTenant {
  id: number;
  orgId: number | null;
  vendor: EhrVendor;
  name: string;
  environment: EhrEnvironment;
  fhirBaseUrl: string;
  smartConfigUrl: string | null;
  issuer: string | null;
  audience: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEhrTenantInput {
  orgId?: number | null;
  vendor: EhrVendor;
  name: string;
  environment: EhrEnvironment;
  fhirBaseUrl: string;
  smartConfigUrl?: string | null;
  issuer?: string | null;
  audience?: string | null;
  status?: string;
}

export interface UpsertEhrTenantInput extends CreateEhrTenantInput {
  id?: number;
}

/**
 * Raised when a tenant create/upsert violates a hard production-hardening
 * policy (e.g. a non-HTTPS endpoint on a production tenant). Non-critical
 * findings (e.g. unknown vendor) are NOT thrown here — they are surfaced as
 * readiness issues so existing generic-SMART tenants keep working.
 */
export class EhrTenantPolicyError extends Error {
  readonly code: string;
  readonly status: number;
  readonly findings: TenantPolicyFinding[];

  constructor(findings: TenantPolicyFinding[]) {
    const messages = findings.map((finding) => finding.message).join(' ');
    super(messages || 'EHR tenant violates production-hardening policy');
    this.name = 'EhrTenantPolicyError';
    this.code = 'ehr_tenant_policy_violation';
    this.status = 422;
    this.findings = findings;
  }
}

/**
 * Reject hard production-hardening violations at registration/upsert. Only
 * `critical` findings block (transport security); `warning` findings — such as
 * an unknown vendor — pass through and are surfaced downstream as readiness
 * issues. Returns the non-blocking findings so callers may log/flag them.
 */
export function assertTenantPolicy(input: CreateEhrTenantInput): TenantPolicyFinding[] {
  const findings = evaluateTenantPolicy(input);
  const blocking = findings.filter((finding) => finding.severity === 'critical');
  if (blocking.length > 0) {
    throw new EhrTenantPolicyError(blocking);
  }
  return findings;
}

export interface ListEhrTenantsFilter {
  vendor?: EhrVendor;
  environment?: EhrEnvironment;
  status?: string;
}

export interface EhrClientRegistrationSecretRefs {
  clientSecretRef: string | null;
  privateKeyRef: string | null;
}

export interface EhrClientRegistrationRecord extends EhrClientRegistrationSecretRefs {
  id: number;
  ehrTenantId: number;
  clientType: EhrClientType;
  clientSlot: string;
  clientId: string;
  jwksUrl: string | null;
  redirectUris: string[];
  launchUrl: string | null;
  scopesRequested: string;
  scopesGranted: string;
  authMethod: EhrClientAuthMethod;
  profileId: string | null;
  profileVersion: string | null;
  portalAppId: string | null;
  approvalStatus: EhrClientApprovalStatus;
  approvalEvidence: JsonObject;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SanitizedEhrClientRegistration = Omit<
  EhrClientRegistrationRecord,
  'clientSecretRef' | 'privateKeyRef'
> & {
  hasClientSecretRef: boolean;
  hasPrivateKeyRef: boolean;
};

export interface UpsertEhrClientRegistrationInput {
  ehrTenantId: number;
  clientType: EhrClientType;
  clientSlot?: string;
  clientId: string;
  clientSecretRef?: string | null;
  jwksUrl?: string | null;
  privateKeyRef?: string | null;
  redirectUris?: string[];
  launchUrl?: string | null;
  scopesRequested?: string;
  scopesGranted?: string;
  authMethod?: EhrClientAuthMethod;
  profileId?: string | null;
  profileVersion?: string | null;
  portalAppId?: string | null;
  approvalStatus?: EhrClientApprovalStatus;
  approvalEvidence?: JsonObject;
  enabled?: boolean;
}

export interface EhrCapabilitySnapshot {
  id: number;
  ehrTenantId: number;
  smartConfiguration: JsonObject | null;
  capabilityStatement: JsonObject | null;
  resourceSupport: JsonObject;
  capturedAt: string;
}

export interface SaveEhrCapabilitySnapshotInput {
  ehrTenantId: number;
  smartConfiguration?: JsonObject | null;
  capabilityStatement?: JsonObject | null;
  resourceSupport?: JsonObject;
}

interface EhrTenantRow {
  id: number;
  org_id: number | null;
  vendor: EhrVendor;
  name: string;
  environment: EhrEnvironment;
  fhir_base_url: string;
  smart_config_url: string | null;
  issuer: string | null;
  audience: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface EhrClientRegistrationRow {
  id: number;
  ehr_tenant_id: number;
  client_type: EhrClientType;
  client_slot: string;
  client_id: string;
  client_secret_ref: string | null;
  jwks_url: string | null;
  private_key_ref: string | null;
  redirect_uris: string[];
  launch_url: string | null;
  scopes_requested: string;
  scopes_granted: string;
  auth_method: EhrClientAuthMethod;
  profile_id: string | null;
  profile_version: string | null;
  portal_app_id: string | null;
  approval_status: EhrClientApprovalStatus;
  approval_evidence: JsonObject;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface EhrCapabilitySnapshotRow {
  id: number;
  ehr_tenant_id: number;
  smart_configuration: JsonObject | null;
  capability_statement: JsonObject | null;
  resource_support: JsonObject;
  captured_at: string;
}

function asSqlJson(value: unknown): Parameters<typeof sql.json>[0] {
  return value as Parameters<typeof sql.json>[0];
}

function mapDbNumber(value: number | string): number {
  return Number(value);
}

function mapNullableDbNumber(value: number | string | null): number | null {
  return value == null ? null : mapDbNumber(value);
}

function mapTenant(row: EhrTenantRow): EhrTenant {
  return {
    id: mapDbNumber(row.id),
    orgId: mapNullableDbNumber(row.org_id),
    vendor: row.vendor,
    name: row.name,
    environment: row.environment,
    fhirBaseUrl: row.fhir_base_url,
    smartConfigUrl: row.smart_config_url,
    issuer: row.issuer,
    audience: row.audience,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClientRegistration(row: EhrClientRegistrationRow): EhrClientRegistrationRecord {
  return {
    id: mapDbNumber(row.id),
    ehrTenantId: mapDbNumber(row.ehr_tenant_id),
    clientType: row.client_type,
    clientSlot: row.client_slot,
    clientId: row.client_id,
    clientSecretRef: row.client_secret_ref,
    jwksUrl: row.jwks_url,
    privateKeyRef: row.private_key_ref,
    redirectUris: row.redirect_uris,
    launchUrl: row.launch_url,
    scopesRequested: row.scopes_requested,
    scopesGranted: row.scopes_granted,
    authMethod: row.auth_method,
    profileId: row.profile_id,
    profileVersion: row.profile_version,
    portalAppId: row.portal_app_id,
    approvalStatus: row.approval_status,
    approvalEvidence: row.approval_evidence,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCapabilitySnapshot(row: EhrCapabilitySnapshotRow): EhrCapabilitySnapshot {
  return {
    id: mapDbNumber(row.id),
    ehrTenantId: mapDbNumber(row.ehr_tenant_id),
    smartConfiguration: row.smart_configuration,
    capabilityStatement: row.capability_statement,
    resourceSupport: row.resource_support,
    capturedAt: row.captured_at,
  };
}

export function sanitizeClientRegistration(
  registration: EhrClientRegistrationRecord,
): SanitizedEhrClientRegistration {
  const { clientSecretRef, privateKeyRef, ...safe } = registration;
  return {
    ...safe,
    hasClientSecretRef: Boolean(clientSecretRef),
    hasPrivateKeyRef: Boolean(privateKeyRef),
  };
}

export async function createTenant(input: CreateEhrTenantInput): Promise<EhrTenant> {
  assertTenantPolicy(input);
  const rows = await sql<EhrTenantRow[]>`
    INSERT INTO phm_edw.ehr_tenant
      (org_id, vendor, name, environment, fhir_base_url, smart_config_url, issuer, audience, status)
    VALUES (
      ${input.orgId ?? null},
      ${input.vendor},
      ${input.name},
      ${input.environment},
      ${input.fhirBaseUrl},
      ${input.smartConfigUrl ?? null},
      ${input.issuer ?? null},
      ${input.audience ?? null},
      ${input.status ?? 'draft'}
    )
    RETURNING id, org_id, vendor, name, environment, fhir_base_url, smart_config_url,
              issuer, audience, status, created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return mapTenant(rows[0]!);
}

export async function upsertTenant(input: UpsertEhrTenantInput): Promise<EhrTenant> {
  assertTenantPolicy(input);
  const existingId = input.id ?? await findTenantId(input.vendor, input.environment, input.fhirBaseUrl);

  if (existingId) {
    const rows = await sql<EhrTenantRow[]>`
      UPDATE phm_edw.ehr_tenant
      SET org_id = ${input.orgId ?? null},
          vendor = ${input.vendor},
          name = ${input.name},
          environment = ${input.environment},
          fhir_base_url = ${input.fhirBaseUrl},
          smart_config_url = ${input.smartConfigUrl ?? null},
          issuer = ${input.issuer ?? null},
          audience = ${input.audience ?? null},
          status = ${input.status ?? 'draft'},
          updated_at = NOW()
      WHERE id = ${existingId}
      RETURNING id, org_id, vendor, name, environment, fhir_base_url, smart_config_url,
                issuer, audience, status, created_at::text AS created_at,
                updated_at::text AS updated_at
    `;
    return mapTenant(rows[0]!);
  }

  return createTenant(input);
}

async function findTenantId(
  vendor: EhrVendor,
  environment: EhrEnvironment,
  fhirBaseUrl: string,
): Promise<number | null> {
  const rows = await sql<Array<{ id: number | string }>>`
    SELECT id
    FROM phm_edw.ehr_tenant
    WHERE vendor = ${vendor}
      AND environment = ${environment}
      AND fhir_base_url = ${fhirBaseUrl}
    ORDER BY id ASC
    LIMIT 1
  `;
  return rows[0] ? mapDbNumber(rows[0].id) : null;
}

export async function listTenants(filter: ListEhrTenantsFilter = {}): Promise<EhrTenant[]> {
  const vendor = filter.vendor ?? null;
  const environment = filter.environment ?? null;
  const status = filter.status ?? null;

  const rows = await sql<EhrTenantRow[]>`
    SELECT id, org_id, vendor, name, environment, fhir_base_url, smart_config_url,
           issuer, audience, status, created_at::text AS created_at,
           updated_at::text AS updated_at
    FROM phm_edw.ehr_tenant
    WHERE (${vendor}::text IS NULL OR vendor = ${vendor}::text)
      AND (${environment}::text IS NULL OR environment = ${environment}::text)
      AND (${status}::text IS NULL OR status = ${status}::text)
    ORDER BY name ASC, id ASC
  `;
  return rows.map(mapTenant);
}

export async function getTenant(id: number): Promise<EhrTenant | null> {
  const rows = await sql<EhrTenantRow[]>`
    SELECT id, org_id, vendor, name, environment, fhir_base_url, smart_config_url,
           issuer, audience, status, created_at::text AS created_at,
           updated_at::text AS updated_at
    FROM phm_edw.ehr_tenant
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? mapTenant(rows[0]) : null;
}

export async function upsertClientRegistration(
  input: UpsertEhrClientRegistrationInput,
): Promise<SanitizedEhrClientRegistration> {
  const clientSlot = input.clientSlot ?? input.clientType;
  const authMethod = input.authMethod ?? defaultAuthMethod(input.clientType);
  const approvalStatus = input.approvalStatus ?? 'draft';
  const approvalEvidence = sql.json(asSqlJson(input.approvalEvidence ?? {}));

  const rows = await sql<EhrClientRegistrationRow[]>`
    INSERT INTO phm_edw.ehr_client_registration
      (ehr_tenant_id, client_type, client_slot, client_id, client_secret_ref, jwks_url, private_key_ref,
       redirect_uris, launch_url, scopes_requested, scopes_granted, auth_method, profile_id,
       profile_version, portal_app_id, approval_status, approval_evidence, enabled)
    VALUES (
      ${input.ehrTenantId},
      ${input.clientType},
      ${clientSlot},
      ${input.clientId},
      ${input.clientSecretRef ?? null},
      ${input.jwksUrl ?? null},
      ${input.privateKeyRef ?? null},
      ${sql.json(asSqlJson(input.redirectUris ?? []))},
      ${input.launchUrl ?? null},
      ${input.scopesRequested ?? ''},
      ${input.scopesGranted ?? ''},
      ${authMethod},
      ${input.profileId ?? null},
      ${input.profileVersion ?? null},
      ${input.portalAppId ?? null},
      ${approvalStatus},
      ${approvalEvidence},
      ${input.enabled ?? false}
    )
    ON CONFLICT (ehr_tenant_id, client_slot)
    DO UPDATE SET
      client_type       = EXCLUDED.client_type,
      client_id         = EXCLUDED.client_id,
      client_secret_ref = EXCLUDED.client_secret_ref,
      jwks_url          = EXCLUDED.jwks_url,
      private_key_ref   = EXCLUDED.private_key_ref,
      redirect_uris     = EXCLUDED.redirect_uris,
      launch_url        = EXCLUDED.launch_url,
      scopes_requested  = EXCLUDED.scopes_requested,
      scopes_granted    = EXCLUDED.scopes_granted,
      auth_method       = EXCLUDED.auth_method,
      profile_id        = EXCLUDED.profile_id,
      profile_version   = EXCLUDED.profile_version,
      portal_app_id     = EXCLUDED.portal_app_id,
      approval_status   = EXCLUDED.approval_status,
      approval_evidence = EXCLUDED.approval_evidence,
      enabled           = EXCLUDED.enabled,
      updated_at        = NOW()
    RETURNING id, ehr_tenant_id, client_type, client_slot, client_id, client_secret_ref, jwks_url,
              private_key_ref, redirect_uris, launch_url, scopes_requested, scopes_granted,
              auth_method, profile_id, profile_version, portal_app_id, approval_status,
              approval_evidence, enabled, created_at::text AS created_at, updated_at::text AS updated_at
  `;
  return sanitizeClientRegistration(mapClientRegistration(rows[0]!));
}

export async function listClientRegistrations(
  ehrTenantId: number,
): Promise<SanitizedEhrClientRegistration[]> {
  const rows = await sql<EhrClientRegistrationRow[]>`
    SELECT id, ehr_tenant_id, client_type, client_slot, client_id, client_secret_ref, jwks_url,
           private_key_ref, redirect_uris, launch_url, scopes_requested, scopes_granted,
           auth_method, profile_id, profile_version, portal_app_id, approval_status,
           approval_evidence, enabled, created_at::text AS created_at, updated_at::text AS updated_at
    FROM phm_edw.ehr_client_registration
    WHERE ehr_tenant_id = ${ehrTenantId}
    ORDER BY client_type ASC, client_slot ASC, id ASC
  `;
  return rows.map((row) => sanitizeClientRegistration(mapClientRegistration(row)));
}

function defaultAuthMethod(clientType: EhrClientType): EhrClientAuthMethod {
  if (clientType === 'backend_services') return 'private_key_jwt';
  if (clientType === 'cds_hooks') return 'fhir_authorization_jwt';
  return 'public_pkce';
}

export async function saveCapabilitySnapshot(
  input: SaveEhrCapabilitySnapshotInput,
): Promise<EhrCapabilitySnapshot> {
  const smartConfiguration = input.smartConfiguration == null
    ? null
    : sql.json(asSqlJson(input.smartConfiguration));
  const capabilityStatement = input.capabilityStatement == null
    ? null
    : sql.json(asSqlJson(input.capabilityStatement));

  const rows = await sql<EhrCapabilitySnapshotRow[]>`
    INSERT INTO phm_edw.ehr_capability_snapshot
      (ehr_tenant_id, smart_configuration, capability_statement, resource_support)
    VALUES (
      ${input.ehrTenantId},
      ${smartConfiguration},
      ${capabilityStatement},
      ${sql.json(asSqlJson(input.resourceSupport ?? {}))}
    )
    RETURNING id, ehr_tenant_id, smart_configuration, capability_statement,
              resource_support, captured_at::text AS captured_at
  `;
  return mapCapabilitySnapshot(rows[0]!);
}

export async function getLatestCapabilitySnapshot(
  ehrTenantId: number,
): Promise<EhrCapabilitySnapshot | null> {
  const rows = await sql<EhrCapabilitySnapshotRow[]>`
    SELECT id, ehr_tenant_id, smart_configuration, capability_statement,
           resource_support, captured_at::text AS captured_at
    FROM phm_edw.ehr_capability_snapshot
    WHERE ehr_tenant_id = ${ehrTenantId}
    ORDER BY captured_at DESC, id DESC
    LIMIT 1
  `;
  return rows[0] ? mapCapabilitySnapshot(rows[0]) : null;
}
