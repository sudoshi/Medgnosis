import { describe, expect, it, vi } from 'vitest';
import {
  discoverSmartConfiguration,
  discoveryUrlsForTenant,
  summarizeCapabilityStatement,
  summarizeSmartConfiguration,
} from './smartDiscovery.js';
import type { FetchLike } from './types.js';

describe('discoveryUrlsForTenant', () => {
  it('uses a configured SMART URL and normalizes the FHIR base URL', () => {
    expect(
      discoveryUrlsForTenant({
        fhirBaseUrl: 'https://ehr.example.test/fhir/',
        smartConfigUrl: 'https://issuer.example.test/.well-known/smart-configuration',
      }),
    ).toEqual({
      fhirBaseUrl: 'https://ehr.example.test/fhir',
      smartConfigurationUrl: 'https://issuer.example.test/.well-known/smart-configuration',
      capabilityStatementUrl: 'https://ehr.example.test/fhir/metadata',
    });
  });

  it('falls back to the well-known SMART configuration path', () => {
    expect(
      discoveryUrlsForTenant({ fhirBaseUrl: 'https://ehr.example.test/r4/' }).smartConfigurationUrl,
    ).toBe('https://ehr.example.test/r4/.well-known/smart-configuration');
  });
});

describe('SMART discovery summarizers', () => {
  it('summarizes SMART endpoints, scopes, launch capabilities, and CDS hints', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(smartConfiguration()))
      .mockResolvedValueOnce(jsonResponse(capabilityStatement()));

    const result = await discoverSmartConfiguration(
      {
        id: 42,
        name: 'Acme Epic',
        vendor: 'epic',
        fhirBaseUrl: 'https://ehr.example.test/fhir',
        smartConfigUrl: 'https://issuer.example.test/.well-known/smart-configuration',
      },
      { fetchImpl: fetchMock, now: () => '2026-06-16T12:00:00.000Z' },
    );

    expect(result.checkedAt).toBe('2026-06-16T12:00:00.000Z');
    expect(result.tenant).toMatchObject({ id: 42, name: 'Acme Epic', vendor: 'epic' });
    expect(result.smartConfiguration.ok).toBe(true);
    expect(result.capabilityStatement.ok).toBe(true);
    expect(result.support.endpoints).toMatchObject({
      authorization: true,
      token: true,
      registration: true,
      management: true,
    });
    expect(result.support.scopes.patient).toEqual(['patient/Patient.rs']);
    expect(result.support.scopes.user).toEqual(['user/Observation.rs']);
    expect(result.support.scopes.system).toEqual(['system/Patient.rs']);
    expect(result.support.scopes.offlineAccess).toBe(true);
    expect(result.support.launch).toEqual({
      ehr: true,
      standalone: true,
      patientContext: { ehr: true, standalone: true },
      encounterContext: { ehr: true, standalone: true },
    });
    expect(result.support.cdsHooks).toMatchObject({
      advertised: true,
      endpoint: 'https://ehr.example.test/cds-services',
      fhirAuthorizationRequired: true,
    });
    expect(result.support.cdsHooks.hooks).toEqual(
      expect.arrayContaining(['order-sign', 'patient-view']),
    );
    expect(result.capabilityStatement.summary?.resourceSupport.Patient).toEqual({
      interactions: ['read', 'search-type'],
      searchParams: ['identifier'],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://issuer.example.test/.well-known/smart-configuration',
      expect.objectContaining({
        method: 'GET',
        headers: { accept: 'application/json, application/fhir+json' },
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ehr.example.test/fhir/metadata',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('reports SMART fetch errors while still summarizing CapabilityStatement OAuth endpoints', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ resourceType: 'OperationOutcome' }, 404))
      .mockResolvedValueOnce(jsonResponse(capabilityStatement()));

    const result = await discoverSmartConfiguration(
      { fhirBaseUrl: 'https://ehr.example.test/fhir/' },
      { fetchImpl: fetchMock },
    );

    expect(result.endpoints.smartConfigurationUrl).toBe(
      'https://ehr.example.test/fhir/.well-known/smart-configuration',
    );
    expect(result.smartConfiguration).toMatchObject({
      ok: false,
      status: 404,
      error: 'HTTP 404',
    });
    expect(result.capabilityStatement.ok).toBe(true);
    expect(result.support.endpoints.authorization).toBe(true);
    expect(result.support.endpoints.token).toBe(true);
  });

  it('summarizes raw document objects without network access', () => {
    expect(summarizeSmartConfiguration(smartConfiguration())).toMatchObject({
      issuer: 'https://issuer.example.test',
      tokenEndpoint: 'https://issuer.example.test/oauth2/token',
      cdsHooks: {
        endpoint: 'https://ehr.example.test/cds-services',
        hooks: ['order-sign', 'patient-view'],
      },
    });
    expect(summarizeCapabilityStatement(capabilityStatement())).toMatchObject({
      resourceType: 'CapabilityStatement',
      security: {
        oauthUris: {
          authorize: 'https://issuer.example.test/oauth2/authorize',
          token: 'https://issuer.example.test/oauth2/token',
        },
      },
    });
  });
});

function smartConfiguration(): Record<string, unknown> {
  return {
    issuer: 'https://issuer.example.test',
    authorization_endpoint: 'https://issuer.example.test/oauth2/authorize',
    token_endpoint: 'https://issuer.example.test/oauth2/token',
    registration_endpoint: 'https://issuer.example.test/oauth2/register',
    management_endpoint: 'https://issuer.example.test/oauth2/manage',
    scopes_supported: [
      'launch',
      'launch/patient',
      'launch/encounter',
      'openid',
      'fhirUser',
      'offline_access',
      'patient/Patient.rs',
      'user/Observation.rs',
      'system/Patient.rs',
    ],
    capabilities: [
      'launch-ehr',
      'launch-standalone',
      'context-ehr-patient',
      'context-standalone-patient',
      'context-ehr-encounter',
      'context-standalone-encounter',
    ],
    code_challenge_methods_supported: ['S256'],
    cds_hooks_endpoint: 'https://ehr.example.test/cds-services',
    cds_hooks_supported: ['patient-view', 'order-sign'],
    fhir_authorization_required: true,
  };
}

function capabilityStatement(): Record<string, unknown> {
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [
      {
        mode: 'server',
        security: {
          cors: true,
          service: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/restful-security-service',
                  code: 'SMART-on-FHIR',
                  display: 'SMART-on-FHIR',
                },
              ],
            },
          ],
          extension: [
            {
              url: 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris',
              extension: [
                { url: 'authorize', valueUri: 'https://issuer.example.test/oauth2/authorize' },
                { url: 'token', valueUri: 'https://issuer.example.test/oauth2/token' },
              ],
            },
            { url: 'https://cds-hooks.hl7.org/discovery' },
          ],
        },
        resource: [
          {
            type: 'Patient',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            searchParam: [{ name: 'identifier' }],
          },
        ],
        operation: [{ name: 'cds-services', definition: 'https://cds-hooks.hl7.org/2.0' }],
      },
    ],
    instantiates: ['https://cds-hooks.hl7.org/2.0'],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
