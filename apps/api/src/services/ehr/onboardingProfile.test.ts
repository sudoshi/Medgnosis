import { describe, expect, it } from 'vitest';
import {
  buildEhrOnboardingProfile,
  formatEhrOnboardingProfile,
} from './onboardingProfile.js';

describe('buildEhrOnboardingProfile', () => {
  it('builds an Epic registration workbook with default Medgnosis endpoints and least-privilege scopes', () => {
    const profile = buildEhrOnboardingProfile({
      vendor: 'epic',
      environment: 'sandbox',
      name: 'Acme Epic Sandbox',
      fhirBaseUrl: 'https://fhir.epic.example.test/r4/',
      apiBaseUrl: 'https://api.medgnosis.test/',
      tenantId: 42,
      smartClientId: 'smart-client',
      backendClientId: 'backend-client',
      cdsClientId: 'cds-client',
    });

    expect(profile.tenant).toMatchObject({
      vendor: 'epic',
      vendorDisplayName: 'Epic SMART on FHIR',
      fhirBaseUrl: 'https://fhir.epic.example.test/r4',
      smartConfigUrl: 'https://fhir.epic.example.test/r4/.well-known/smart-configuration',
      audience: 'https://fhir.epic.example.test/r4',
    });
    expect(profile.profile).toEqual({
      id: 'epic-smart-r4',
      version: '2026-06-17',
    });
    expect(profile.endpoints).toMatchObject({
      smartLaunchUrl: 'https://api.medgnosis.test/api/v1/ehr/launch/42',
      backendJwksUrl: 'https://api.medgnosis.test/.well-known/jwks.json',
      cdsServicesUrl: 'https://api.medgnosis.test/cds-services',
    });
    expect(profile.clientRegistrations.smartLaunch).toMatchObject({
      clientType: 'smart_launch',
      clientSlot: 'smart_launch',
      authMethod: 'public_pkce',
      clientId: 'smart-client',
      profileId: 'epic-smart-r4',
      profileVersion: '2026-06-17',
      approvalStatus: 'draft',
      redirectUris: ['https://api.medgnosis.test/api/v1/ehr/launch/callback'],
    });
    expect(profile.clientRegistrations.backendServices).toMatchObject({
      clientSlot: 'backend_services',
      authMethod: 'private_key_jwt',
      profileId: 'epic-smart-r4',
    });
    expect(profile.scopes.ehrLaunch).toContain('patient/Observation.rs');
    expect(profile.scopes.backendServices).toContain('system/Patient.rs');
    expect(profile.scopes.backendServices.some((scope) => scope.includes('*'))).toBe(false);
    expect(profile.vendorChecklist.join(' ')).toContain('Epic customer tenant activation');
    expect(profile.commands.onboard).toContain('--vendor epic');
    expect(profile.commands.onboard).toContain(
      "--backend-private-key-ref 'env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=backend-key-1&alg=RS384'",
    );
  });

  it('uses Oracle Cerner checklist and placeholder tenant/client values before vendor registration exists', () => {
    const profile = buildEhrOnboardingProfile({
      vendor: 'oracle_cerner',
      fhirBaseUrl: 'https://fhir.cerner.example.test/r4',
    });

    expect(profile.tenant.name).toBe('Oracle Health Millennium SMART on FHIR Sandbox');
    expect(profile.endpoints.smartLaunchUrl).toBe('https://api.medgnosis.example/api/v1/ehr/launch/{tenant_id}');
    expect(profile.clientRegistrations.smartLaunch.clientId).toBe('<SMART_LAUNCH_CLIENT_ID>');
    expect(profile.vendorChecklist.join(' ')).toContain('Oracle Health Millennium tenant');
    expect(profile.commands.smoke).toBe("npm run ehr:smoke -- --tenant-id '{tenant_id}'");
  });
});

describe('formatEhrOnboardingProfile', () => {
  it('renders a text workbook without private key material', () => {
    const output = formatEhrOnboardingProfile(
      buildEhrOnboardingProfile({
        vendor: 'smart_generic',
        fhirBaseUrl: 'https://launch.smarthealthit.org/v/r4/fhir',
        apiBaseUrl: 'http://localhost:3002',
      }),
    );

    expect(output).toContain('SMART launch registration:');
    expect(output).toContain('client_slot: smart_launch');
    expect(output).toContain('auth_method: public_pkce');
    expect(output).toContain('Backend Services registration:');
    expect(output).toContain('CDS Hooks registration:');
    expect(output).toContain('env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=backend-key-1&alg=RS384');
    expect(output).not.toContain('"d":');
  });
});
