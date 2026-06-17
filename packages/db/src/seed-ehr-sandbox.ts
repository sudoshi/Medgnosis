// =============================================================================
// Medgnosis DB — EHR sandbox seed
// Creates a local SMART Health IT R4 tenant/client registration for integration
// smoke tests. This is idempotent and stores only client metadata.
// =============================================================================

import { sql } from './client.js';

const SMART_FHIR_BASE_URL = 'https://launch.smarthealthit.org/v/r4/fhir';
const SMART_CONFIG_URL = `${SMART_FHIR_BASE_URL}/.well-known/smart-configuration`;
const SMART_ISSUER = SMART_FHIR_BASE_URL;
const DEFAULT_SCOPES = [
  'openid',
  'fhirUser',
  'launch/patient',
  'patient/Patient.r',
  'patient/Encounter.rs',
  'patient/Condition.rs',
  'patient/Observation.rs',
  'patient/MedicationRequest.rs',
  'offline_access',
].join(' ');

interface TenantRow {
  id: number;
  name: string;
  fhir_base_url: string;
}

interface ClientRow {
  id: number;
  client_id: string;
  redirect_uris: string[];
}

interface OrgRow {
  org_id: number;
}

function envInt(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

function envString(key: string, fallback: string): string {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : fallback;
}

async function assertOrganizationExists(orgId: number): Promise<void> {
  const rows = await sql<OrgRow[]>`
    SELECT org_id
    FROM phm_edw.organization
    WHERE org_id = ${orgId}
    LIMIT 1
  `;
  if (!rows[0]) {
    throw new Error(
      `EHR_SANDBOX_ORG_ID=${orgId} does not exist in phm_edw.organization; seed a demo org first or choose an existing org`,
    );
  }
}

async function upsertSmartHealthItTenant(orgId: number): Promise<TenantRow> {
  const existing = await sql<TenantRow[]>`
    SELECT id, name, fhir_base_url
    FROM phm_edw.ehr_tenant
    WHERE vendor = 'smart_generic'
      AND environment = 'sandbox'
      AND fhir_base_url = ${SMART_FHIR_BASE_URL}
    ORDER BY id ASC
    LIMIT 1
  `;

  if (existing[0]) {
    const rows = await sql<TenantRow[]>`
      UPDATE phm_edw.ehr_tenant
      SET org_id = ${orgId},
          name = 'SMART Health IT R4 Sandbox',
          smart_config_url = ${SMART_CONFIG_URL},
          issuer = ${SMART_ISSUER},
          audience = ${SMART_FHIR_BASE_URL},
          status = 'testing',
          updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING id, name, fhir_base_url
    `;
    return rows[0]!;
  }

  const rows = await sql<TenantRow[]>`
    INSERT INTO phm_edw.ehr_tenant
      (org_id, vendor, name, environment, fhir_base_url, smart_config_url, issuer, audience, status)
    VALUES (
      ${orgId},
      'smart_generic',
      'SMART Health IT R4 Sandbox',
      'sandbox',
      ${SMART_FHIR_BASE_URL},
      ${SMART_CONFIG_URL},
      ${SMART_ISSUER},
      ${SMART_FHIR_BASE_URL},
      'testing'
    )
    RETURNING id, name, fhir_base_url
  `;
  return rows[0]!;
}

async function upsertLaunchClient(tenantId: number, clientId: string, redirectUri: string): Promise<ClientRow> {
  const rows = await sql<ClientRow[]>`
    INSERT INTO phm_edw.ehr_client_registration
      (ehr_tenant_id, client_type, client_slot, client_id, redirect_uris, launch_url,
       scopes_requested, scopes_granted, auth_method, profile_id, profile_version,
       approval_status, approval_evidence, enabled)
    VALUES (
      ${tenantId},
      'smart_launch',
      'smart_launch',
      ${clientId},
      ${sql.json([redirectUri])},
      ${redirectUri.replace(/\/callback$/, `/${tenantId}`)},
      ${DEFAULT_SCOPES},
      ${DEFAULT_SCOPES},
      'public_pkce',
      'smart_generic-smart-r4',
      '2026-06-17',
      'approved',
      ${sql.json({ source: 'local seed', sandbox: 'SMART Health IT R4' })},
      TRUE
    )
    ON CONFLICT (ehr_tenant_id, client_slot)
    DO UPDATE SET
      client_type = EXCLUDED.client_type,
      client_id = EXCLUDED.client_id,
      redirect_uris = EXCLUDED.redirect_uris,
      launch_url = EXCLUDED.launch_url,
      scopes_requested = EXCLUDED.scopes_requested,
      scopes_granted = EXCLUDED.scopes_granted,
      auth_method = EXCLUDED.auth_method,
      profile_id = EXCLUDED.profile_id,
      profile_version = EXCLUDED.profile_version,
      approval_status = EXCLUDED.approval_status,
      approval_evidence = EXCLUDED.approval_evidence,
      enabled = TRUE,
      updated_at = NOW()
    RETURNING id, client_id, redirect_uris
  `;
  return rows[0]!;
}

async function main(): Promise<void> {
  const orgId = envInt('EHR_SANDBOX_ORG_ID', 1);
  const apiPort = envString('API_PORT', '3002');
  const redirectUri = envString(
    'EHR_SMART_SANDBOX_REDIRECT_URI',
    `http://localhost:${apiPort}/api/v1/ehr/launch/callback`,
  );
  const clientId = envString('EHR_SMART_SANDBOX_CLIENT_ID', 'medgnosis-dev-smart-launch');

  console.info('[seed-ehr-sandbox] Seeding SMART Health IT R4 sandbox tenant...');
  await assertOrganizationExists(orgId);
  const tenant = await upsertSmartHealthItTenant(orgId);
  const client = await upsertLaunchClient(tenant.id, clientId, redirectUri);

  console.info(
    `[seed-ehr-sandbox] Tenant ${tenant.id} (${tenant.name}) -> ${tenant.fhir_base_url}`,
  );
  console.info(
    `[seed-ehr-sandbox] SMART launch client ${client.id} (${client.client_id}) redirect=${client.redirect_uris[0]}`,
  );
  await sql.end();
}

main().catch(async (err) => {
  console.error('[seed-ehr-sandbox] Seeding failed:', err);
  await sql.end();
  process.exit(1);
});
