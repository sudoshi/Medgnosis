// =============================================================================
// Unit tests — EHR tenant registry service
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  // postgres.js sql.json() wrapper — identity is fine for assertions.
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  return { mockSql: fn };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  assertTenantPolicy,
  createTenant,
  EhrTenantPolicyError,
  getTenant,
  listTenants,
  sanitizeClientRegistration,
  saveCapabilitySnapshot,
  upsertClientRegistration,
  upsertTenant,
  type EhrClientRegistrationRecord,
} from './tenantRegistry.js';

beforeEach(() => vi.clearAllMocks());

const tenantRow = {
  id: 42,
  org_id: 7,
  vendor: 'epic',
  name: 'Acme Epic Sandbox',
  environment: 'sandbox',
  fhir_base_url: 'https://fhir.example.test/r4',
  smart_config_url: 'https://fhir.example.test/r4/.well-known/smart-configuration',
  issuer: 'https://issuer.example.test',
  audience: 'https://fhir.example.test/r4',
  status: 'testing',
  created_at: '2026-06-16T12:00:00Z',
  updated_at: '2026-06-16T12:00:00Z',
} as const;

const clientRow = {
  id: 5,
  ehr_tenant_id: 42,
  client_type: 'backend_services',
  client_slot: 'backend_services',
  client_id: 'backend-client',
  client_secret_ref: 'vault://ehr/acme/client-secret',
  jwks_url: 'https://medgnosis.example.test/jwks.json',
  private_key_ref: 'vault://ehr/acme/private-key',
  redirect_uris: ['https://api.medgnosis.test/smart/callback'],
  launch_url: null,
  scopes_requested: 'system/Patient.rs system/Observation.rs',
  scopes_granted: 'system/Patient.rs',
  auth_method: 'private_key_jwt',
  profile_id: 'epic-smart-r4',
  profile_version: '2026-06-17',
  portal_app_id: 'epic-app-123',
  approval_status: 'approved',
  approval_evidence: { ticket: 'EHR-123' },
  enabled: true,
  created_at: '2026-06-16T12:00:00Z',
  updated_at: '2026-06-16T12:05:00Z',
} as const;

describe('createTenant', () => {
  it('creates a tenant and maps database snake_case to service camelCase', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);

    const tenant = await createTenant({
      orgId: 7,
      vendor: 'epic',
      name: 'Acme Epic Sandbox',
      environment: 'sandbox',
      fhirBaseUrl: 'https://fhir.example.test/r4',
      smartConfigUrl: 'https://fhir.example.test/r4/.well-known/smart-configuration',
      issuer: 'https://issuer.example.test',
      audience: 'https://fhir.example.test/r4',
      status: 'testing',
    });

    expect(tenant.id).toBe(42);
    expect(tenant.orgId).toBe(7);
    expect(tenant.fhirBaseUrl).toBe('https://fhir.example.test/r4');
    expect(tenant.smartConfigUrl).toContain('smart-configuration');

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toContain('epic');
    expect(values).toContain('sandbox');
    expect(values).toContain('testing');
  });

  it('defaults nullable tenant metadata and status', async () => {
    mockSql.mockResolvedValueOnce([{ ...tenantRow, org_id: null, status: 'draft' }]);

    await createTenant({
      vendor: 'smart_generic',
      name: 'SMART Health IT',
      environment: 'sandbox',
      fhirBaseUrl: 'https://launch.smarthealthit.org/v/r4/fhir',
    });

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toContain(null);
    expect(values).toContain('draft');
  });
});

describe('upsertTenant', () => {
  it('updates an existing tenant matched by vendor, environment, and FHIR base URL', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: 42 }])
      .mockResolvedValueOnce([{ ...tenantRow, name: 'Updated Epic Sandbox' }]);

    const tenant = await upsertTenant({
      orgId: 7,
      vendor: 'epic',
      name: 'Updated Epic Sandbox',
      environment: 'sandbox',
      fhirBaseUrl: 'https://fhir.example.test/r4',
      smartConfigUrl: 'https://fhir.example.test/r4/.well-known/smart-configuration',
      issuer: 'https://issuer.example.test',
      audience: 'https://fhir.example.test/r4',
      status: 'testing',
    });

    expect(tenant).toMatchObject({ id: 42, name: 'Updated Epic Sandbox' });
    expect((mockSql.mock.calls[1]![0] as TemplateStringsArray).join('')).toContain('UPDATE phm_edw.ehr_tenant');
  });

  it('creates a tenant when no existing tenant matches', async () => {
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([tenantRow]);

    const tenant = await upsertTenant({
      orgId: 7,
      vendor: 'epic',
      name: 'Acme Epic Sandbox',
      environment: 'sandbox',
      fhirBaseUrl: 'https://fhir.example.test/r4',
      status: 'testing',
    });

    expect(tenant.id).toBe(42);
    expect((mockSql.mock.calls[1]![0] as TemplateStringsArray).join('')).toContain('INSERT INTO phm_edw.ehr_tenant');
  });
});

describe('listTenants / getTenant', () => {
  it('lists tenants with optional vendor/environment/status filters', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);

    const tenants = await listTenants({ vendor: 'epic', environment: 'sandbox', status: 'testing' });

    expect(tenants).toHaveLength(1);
    expect(tenants[0]!.vendor).toBe('epic');

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toEqual(expect.arrayContaining(['epic', 'sandbox', 'testing']));
  });

  it('returns one tenant by id or null when absent', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    await expect(getTenant(42)).resolves.toMatchObject({ id: 42, name: 'Acme Epic Sandbox' });

    mockSql.mockResolvedValueOnce([]);
    await expect(getTenant(999)).resolves.toBeNull();
  });
});

describe('upsertClientRegistration', () => {
  it('upserts a client registration and returns only sanitized secret-ref state', async () => {
    mockSql.mockResolvedValueOnce([clientRow]);

    const registration = await upsertClientRegistration({
      ehrTenantId: 42,
      clientType: 'backend_services',
      clientSlot: 'backend_services',
      clientId: 'backend-client',
      clientSecretRef: 'vault://ehr/acme/client-secret',
      jwksUrl: 'https://medgnosis.example.test/jwks.json',
      privateKeyRef: 'vault://ehr/acme/private-key',
      redirectUris: ['https://api.medgnosis.test/smart/callback'],
      scopesRequested: 'system/Patient.rs system/Observation.rs',
      scopesGranted: 'system/Patient.rs',
      authMethod: 'private_key_jwt',
      profileId: 'epic-smart-r4',
      profileVersion: '2026-06-17',
      portalAppId: 'epic-app-123',
      approvalStatus: 'approved',
      approvalEvidence: { ticket: 'EHR-123' },
      enabled: true,
    });

    expect(registration).toMatchObject({
      ehrTenantId: 42,
      clientType: 'backend_services',
      clientSlot: 'backend_services',
      clientId: 'backend-client',
      hasClientSecretRef: true,
      hasPrivateKeyRef: true,
      authMethod: 'private_key_jwt',
      profileId: 'epic-smart-r4',
      approvalStatus: 'approved',
      approvalEvidence: { ticket: 'EHR-123' },
    });
    expect('clientSecretRef' in registration).toBe(false);
    expect('privateKeyRef' in registration).toBe(false);

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toContain('backend-client');
    expect(values).toContain('backend_services');
    expect(values).toContain('vault://ehr/acme/client-secret');
    expect(values).toContain('vault://ehr/acme/private-key');
    expect(values).toContain('private_key_jwt');
    expect(values).toContain('epic-smart-r4');
    expect(values).toContain('approved');
    expect(values).toContainEqual({ ticket: 'EHR-123' });
    expect(values).toContain(true);
  });

  it('defaults workbook metadata for legacy single-slot registrations', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ...clientRow,
        client_type: 'smart_launch',
        client_slot: 'smart_launch',
        auth_method: 'public_pkce',
        profile_id: null,
        profile_version: null,
        portal_app_id: null,
        approval_status: 'draft',
        approval_evidence: {},
      },
    ]);

    await upsertClientRegistration({
      ehrTenantId: 42,
      clientType: 'smart_launch',
      clientId: 'smart-client',
    });

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toEqual(
      expect.arrayContaining(['smart_launch', 'smart-client', 'public_pkce', 'draft', {}]),
    );
  });

  it('sanitizes client registration records without leaking secret refs', () => {
    const record: EhrClientRegistrationRecord = {
      id: 1,
      ehrTenantId: 42,
      clientType: 'smart_launch',
      clientSlot: 'smart_launch',
      clientId: 'launch-client',
      clientSecretRef: null,
      jwksUrl: null,
      privateKeyRef: 'vault://ehr/acme/private-key',
      redirectUris: [],
      launchUrl: 'https://launch.example.test',
      scopesRequested: 'launch patient/Patient.rs',
      scopesGranted: '',
      authMethod: 'public_pkce',
      profileId: null,
      profileVersion: null,
      portalAppId: null,
      approvalStatus: 'draft',
      approvalEvidence: {},
      enabled: false,
      createdAt: '2026-06-16T12:00:00Z',
      updatedAt: '2026-06-16T12:00:00Z',
    };

    const safe = sanitizeClientRegistration(record);

    expect(safe.hasClientSecretRef).toBe(false);
    expect(safe.hasPrivateKeyRef).toBe(true);
    expect('clientSecretRef' in safe).toBe(false);
    expect('privateKeyRef' in safe).toBe(false);
  });
});

describe('saveCapabilitySnapshot', () => {
  it('persists SMART configuration, CapabilityStatement, and resource support JSON', async () => {
    mockSql.mockResolvedValueOnce([
      {
        id: 9,
        ehr_tenant_id: 42,
        smart_configuration: { issuer: 'https://issuer.example.test' },
        capability_statement: { resourceType: 'CapabilityStatement', status: 'active' },
        resource_support: { Patient: { read: true, search: true } },
        captured_at: '2026-06-16T12:10:00Z',
      },
    ]);

    const snapshot = await saveCapabilitySnapshot({
      ehrTenantId: 42,
      smartConfiguration: { issuer: 'https://issuer.example.test' },
      capabilityStatement: { resourceType: 'CapabilityStatement', status: 'active' },
      resourceSupport: { Patient: { read: true, search: true } },
    });

    expect(snapshot.id).toBe(9);
    expect(snapshot.ehrTenantId).toBe(42);
    expect(snapshot.resourceSupport.Patient).toEqual({ read: true, search: true });

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toContain(42);
    expect(values).toContainEqual({ issuer: 'https://issuer.example.test' });
    expect(values).toContainEqual({ resourceType: 'CapabilityStatement', status: 'active' });
    expect(values).toContainEqual({ Patient: { read: true, search: true } });
  });
});

describe('production-hardening policy enforcement', () => {
  it('rejects a non-HTTPS production tenant at createTenant before any DB write', async () => {
    await expect(
      createTenant({
        vendor: 'epic',
        name: 'Insecure Prod',
        environment: 'production',
        fhirBaseUrl: 'http://ehr.example.org/fhir/R4',
      }),
    ).rejects.toBeInstanceOf(EhrTenantPolicyError);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('rejects a non-HTTPS production tenant at upsertTenant with a typed 422 error', async () => {
    let captured: EhrTenantPolicyError | null = null;
    try {
      await upsertTenant({
        vendor: 'epic',
        name: 'Insecure Prod',
        environment: 'production',
        fhirBaseUrl: 'http://ehr.example.org/fhir/R4',
        issuer: 'http://issuer.example.org',
      });
    } catch (error) {
      captured = error as EhrTenantPolicyError;
    }
    expect(captured).toBeInstanceOf(EhrTenantPolicyError);
    expect(captured?.status).toBe(422);
    expect(captured?.code).toBe('ehr_tenant_policy_violation');
    expect(captured?.findings[0]?.message).toContain('fhirBaseUrl');
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('permits an http://localhost FHIR base for a sandbox tenant', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ...tenantRow,
        environment: 'sandbox',
        vendor: 'smart_generic',
        fhir_base_url: 'http://localhost:8080/fhir',
      },
    ]);

    const tenant = await createTenant({
      vendor: 'smart_generic',
      name: 'Local Sandbox',
      environment: 'sandbox',
      fhirBaseUrl: 'http://localhost:8080/fhir',
    });

    expect(tenant.environment).toBe('sandbox');
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('admits a known/generic-SMART production tenant and surfaces no blocking findings', async () => {
    mockSql.mockResolvedValueOnce([{ ...tenantRow, environment: 'production', vendor: 'smart_generic' }]);

    const findings = assertTenantPolicy({
      vendor: 'smart_generic',
      name: 'Generic Prod',
      environment: 'production',
      fhirBaseUrl: 'https://ehr.example.org/fhir/R4',
    });
    expect(findings).toEqual([]);

    await expect(
      createTenant({
        vendor: 'smart_generic',
        name: 'Generic Prod',
        environment: 'production',
        fhirBaseUrl: 'https://ehr.example.org/fhir/R4',
      }),
    ).resolves.toMatchObject({ vendor: 'smart_generic', environment: 'production' });
  });

  it('does not block an unknown vendor (warning-only) — returns the non-blocking finding', () => {
    const findings = assertTenantPolicy({
      vendor: 'athena',
      name: 'Unknown Vendor',
      environment: 'production',
      fhirBaseUrl: 'https://ehr.example.org/fhir/R4',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'warning', code: 'tenant_vendor_unsupported' });
  });
});
