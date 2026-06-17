import { describe, expect, it } from 'vitest';
import { parseCliOptions } from './ehr-onboarding-profile.js';

describe('parseCliOptions', () => {
  it('parses profile options from CLI flags', () => {
    const options = parseCliOptions(
      [
        '--vendor',
        'epic',
        '--environment',
        'staging',
        '--name',
        'Epic Staging',
        '--fhir-base-url',
        'https://fhir.example.test/r4',
        '--api-base-url',
        'https://api.medgnosis.test',
        '--tenant-id',
        '42',
        '--smart-client-id',
        'smart-client',
        '--json',
      ],
      {},
    );

    expect(options).toMatchObject({
      vendor: 'epic',
      environment: 'staging',
      name: 'Epic Staging',
      fhirBaseUrl: 'https://fhir.example.test/r4',
      apiBaseUrl: 'https://api.medgnosis.test',
      tenantId: 42,
      smartClientId: 'smart-client',
      json: true,
    });
  });

  it('supports environment variables and defaults environment to sandbox', () => {
    const options = parseCliOptions([], {
      EHR_PROFILE_VENDOR: 'oracle_cerner',
      EHR_PROFILE_FHIR_BASE_URL: 'https://cerner.example.test/r4',
      EHR_PROFILE_BACKEND_CLIENT_ID: 'backend-client',
    });

    expect(options).toMatchObject({
      vendor: 'oracle_cerner',
      environment: 'sandbox',
      fhirBaseUrl: 'https://cerner.example.test/r4',
      backendClientId: 'backend-client',
    });
  });

  it('rejects missing required fields and unsupported environments', () => {
    expect(() => parseCliOptions([], {})).toThrow(/Provide --vendor/);
    expect(() =>
      parseCliOptions(
        [
          '--vendor',
          'epic',
          '--environment',
          'invalid',
          '--fhir-base-url',
          'https://fhir.example.test',
        ],
        {},
      ),
    ).toThrow(/Unsupported environment/);
  });
});
