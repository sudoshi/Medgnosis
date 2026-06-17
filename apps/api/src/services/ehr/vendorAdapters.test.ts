import { describe, expect, it } from 'vitest';
import { buildBackendServiceScopes, buildPatientLaunchScopes } from './scopePolicy.js';
import {
  epicAdapter,
  genericSmartAdapter,
  getVendorAdapter,
  hapiAdapter,
  otherAdapter,
  oracleCernerAdapter,
} from './vendorAdapters/index.js';

describe('scopePolicy', () => {
  it('builds least-privilege patient launch scopes without wildcards', () => {
    const scopes = buildPatientLaunchScopes();

    expect(scopes).toContain('openid');
    expect(scopes).toContain('fhirUser');
    expect(scopes).toContain('launch');
    expect(scopes).toContain('patient/Patient.r');
    expect(scopes).toContain('patient/Observation.rs');
    expect(scopes).not.toContain('online_access');
    expect(scopes.some((scope) => scope.includes('*'))).toBe(false);
  });

  it('builds explicit backend service scopes without system wildcards', () => {
    const scopes = buildBackendServiceScopes({ resources: ['Patient', 'Observation'] });

    expect(scopes).toEqual(['system/Patient.rs', 'system/Observation.rs']);
    expect(scopes.some((scope) => scope.includes('*'))).toBe(false);
  });

  it('supports standalone patient launch and optional refresh scopes explicitly', () => {
    const scopes = buildPatientLaunchScopes({
      launchMode: 'standalone',
      includeOnlineAccess: true,
      resources: ['Patient'],
    });

    expect(scopes).toEqual(['openid', 'fhirUser', 'launch/patient', 'patient/Patient.r', 'online_access']);
  });
});

describe('vendor adapters', () => {
  it('selects concrete adapters and falls back to generic SMART', () => {
    expect(getVendorAdapter('epic')).toBe(epicAdapter);
    expect(getVendorAdapter('oracle_cerner')).toBe(oracleCernerAdapter);
    expect(getVendorAdapter('hapi')).toBe(hapiAdapter);
    expect(getVendorAdapter('other')).toBe(otherAdapter);
    expect(getVendorAdapter('unknown')).toBe(genericSmartAdapter);
  });

  it('discovers SMART and metadata endpoints from the tenant FHIR base URL', () => {
    const discovery = genericSmartAdapter.discover({
      fhirBaseUrl: 'https://ehr.example/fhir/',
    });

    expect(discovery).toEqual({
      fhirBaseUrl: 'https://ehr.example/fhir',
      smartConfigurationUrl: 'https://ehr.example/fhir/.well-known/smart-configuration',
      capabilityStatementUrl: 'https://ehr.example/fhir/metadata',
    });
  });

  it('uses conservative vendor pagination and search defaults', () => {
    expect(genericSmartAdapter.normalizeSearchParams('Observation', {})._count).toBe(100);
    expect(epicAdapter.normalizeSearchParams('Observation', { _count: 250 })).toMatchObject({
      _count: 100,
      _sort: '-date',
    });
    expect(oracleCernerAdapter.normalizeSearchParams('Observation', { _count: 0 })._count).toBe(1);
  });

  it('maps SMART launch context without retaining raw token payloads', () => {
    const context = genericSmartAdapter.launchContextMapper({
      patient: 'pat-1',
      encounter: 'enc-1',
      fhirUser: 'Practitioner/doc-1',
      scope: 'openid fhirUser launch patient/Patient.r',
      access_token: 'raw-token',
    });

    expect(context).toEqual({
      patient: 'pat-1',
      encounter: 'enc-1',
      fhirUser: 'Practitioner/doc-1',
      scopes: ['openid', 'fhirUser', 'launch', 'patient/Patient.r'],
    });
  });

  it('classifies vendor-specific OperationOutcome patterns', () => {
    expect(
      epicAdapter.handleOperationOutcome(
        {
          resourceType: 'OperationOutcome',
          issue: [{ code: 'forbidden', diagnostics: 'Break-the-glass required' }],
        },
        { status: 403 },
      ).classification,
    ).toBe('restricted_patient');

    expect(
      oracleCernerAdapter.handleOperationOutcome(
        {
          resourceType: 'OperationOutcome',
          issue: [{ code: 'forbidden', diagnostics: 'Insufficient scope for persona' }],
        },
        { status: 403 },
      ).classification,
    ).toBe('authorization');
  });

  it('exposes conservative bulk capability metadata', () => {
    expect(genericSmartAdapter.bulkCapabilities.supported).toBe(false);
    expect(epicAdapter.bulkCapabilities).toMatchObject({
      supported: true,
      exportLevels: ['group'],
      requiresTenantApproval: true,
    });
    expect(oracleCernerAdapter.bulkCapabilities.exportLevels).toEqual(['patient', 'group']);
    expect(hapiAdapter.bulkCapabilities.supported).toBe(false);
    expect(otherAdapter.bulkCapabilities.supported).toBe(false);
  });
});
