// =============================================================================
// Unit tests — EHR tenant production-hardening policy
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  evaluateTenantPolicy,
  insecureTenantEndpointFields,
  isAcceptableTenantEndpointUrl,
  isKnownEhrVendor,
  isProductionTenantEnvironment,
  KNOWN_EHR_VENDORS,
  TENANT_POLICY_FINDING_CODES,
  type TenantPolicyInput,
} from './tenantPolicy.js';

const productionTenant: TenantPolicyInput = {
  vendor: 'epic',
  environment: 'production',
  fhirBaseUrl: 'https://ehr.example.org/fhir/R4',
  smartConfigUrl: 'https://ehr.example.org/fhir/R4/.well-known/smart-configuration',
  issuer: 'https://issuer.example.org',
  audience: 'https://ehr.example.org/fhir/R4',
};

describe('isProductionTenantEnvironment', () => {
  it('treats only the production environment as production', () => {
    expect(isProductionTenantEnvironment('production')).toBe(true);
    expect(isProductionTenantEnvironment('staging')).toBe(false);
    expect(isProductionTenantEnvironment('sandbox')).toBe(false);
  });
});

describe('isKnownEhrVendor', () => {
  it('accepts every registered vendor adapter including generic SMART', () => {
    for (const vendor of KNOWN_EHR_VENDORS) {
      expect(isKnownEhrVendor(vendor)).toBe(true);
    }
    expect(isKnownEhrVendor('smart_generic')).toBe(true);
    expect(isKnownEhrVendor('epic')).toBe(true);
  });

  it('rejects unknown/unsupported and missing vendors', () => {
    expect(isKnownEhrVendor('athena')).toBe(false);
    expect(isKnownEhrVendor('')).toBe(false);
    expect(isKnownEhrVendor(null)).toBe(false);
    expect(isKnownEhrVendor(undefined)).toBe(false);
  });
});

describe('isAcceptableTenantEndpointUrl', () => {
  it('permits HTTPS in any environment', () => {
    expect(isAcceptableTenantEndpointUrl('https://ehr.example.org/fhir', 'production')).toBe(true);
    expect(isAcceptableTenantEndpointUrl('https://ehr.example.org/fhir', 'sandbox')).toBe(true);
  });

  it('rejects non-HTTPS production endpoints', () => {
    expect(isAcceptableTenantEndpointUrl('http://ehr.example.org/fhir', 'production')).toBe(false);
    expect(isAcceptableTenantEndpointUrl('http://localhost:8080/fhir', 'production')).toBe(false);
    expect(isAcceptableTenantEndpointUrl('http://127.0.0.1:8080/fhir', 'production')).toBe(false);
  });

  it('permits http://localhost and 127.0.0.1 only in non-production environments', () => {
    expect(isAcceptableTenantEndpointUrl('http://localhost:8080/fhir', 'sandbox')).toBe(true);
    expect(isAcceptableTenantEndpointUrl('http://127.0.0.1:8080/fhir', 'staging')).toBe(true);
    expect(isAcceptableTenantEndpointUrl('http://[::1]:8080/fhir', 'sandbox')).toBe(true);
  });

  it('rejects plain HTTP against non-loopback hosts even in non-production', () => {
    expect(isAcceptableTenantEndpointUrl('http://ehr.example.org/fhir', 'sandbox')).toBe(false);
    expect(isAcceptableTenantEndpointUrl('http://10.0.0.5/fhir', 'sandbox')).toBe(false);
  });

  it('rejects malformed URLs and treats blank/absent values as not-insecure', () => {
    expect(isAcceptableTenantEndpointUrl('not-a-url', 'production')).toBe(false);
    expect(isAcceptableTenantEndpointUrl('ftp://ehr.example.org', 'production')).toBe(false);
    expect(isAcceptableTenantEndpointUrl(null, 'production')).toBe(true);
    expect(isAcceptableTenantEndpointUrl(undefined, 'production')).toBe(true);
    expect(isAcceptableTenantEndpointUrl('   ', 'production')).toBe(true);
  });
});

describe('insecureTenantEndpointFields', () => {
  it('returns an empty list for a fully-HTTPS production tenant', () => {
    expect(insecureTenantEndpointFields(productionTenant)).toEqual([]);
  });

  it('lists every non-HTTPS production endpoint field in stable order', () => {
    const fields = insecureTenantEndpointFields({
      ...productionTenant,
      fhirBaseUrl: 'http://ehr.example.org/fhir/R4',
      issuer: 'http://issuer.example.org',
    });
    expect(fields).toEqual(['fhirBaseUrl', 'issuer']);
  });

  it('permits http loopback FHIR base for a sandbox tenant', () => {
    expect(
      insecureTenantEndpointFields({
        vendor: 'smart_generic',
        environment: 'sandbox',
        fhirBaseUrl: 'http://localhost:8080/fhir',
        smartConfigUrl: null,
        issuer: null,
        audience: null,
      }),
    ).toEqual([]);
  });
});

describe('evaluateTenantPolicy', () => {
  it('returns no findings for a compliant known-vendor production tenant', () => {
    expect(evaluateTenantPolicy(productionTenant)).toEqual([]);
  });

  it('flags a non-HTTPS production endpoint as a critical finding', () => {
    const findings = evaluateTenantPolicy({
      ...productionTenant,
      fhirBaseUrl: 'http://ehr.example.org/fhir/R4',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'critical',
      code: TENANT_POLICY_FINDING_CODES.insecureTransport,
    });
    expect(findings[0]!.message).toContain('fhirBaseUrl');
  });

  it('flags an unknown vendor as a warning finding', () => {
    const findings = evaluateTenantPolicy({
      ...productionTenant,
      vendor: 'athena',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'warning',
      code: TENANT_POLICY_FINDING_CODES.unsupportedVendor,
    });
    expect(findings[0]!.message).toContain('athena');
  });

  it('does not flag generic-SMART (an explicitly-supported known vendor)', () => {
    const findings = evaluateTenantPolicy({
      ...productionTenant,
      vendor: 'smart_generic',
    });
    expect(findings.some((f) => f.code === TENANT_POLICY_FINDING_CODES.unsupportedVendor)).toBe(false);
  });

  it('can surface both transport and vendor findings together', () => {
    const findings = evaluateTenantPolicy({
      vendor: 'athena',
      environment: 'production',
      fhirBaseUrl: 'http://ehr.example.org/fhir/R4',
      smartConfigUrl: null,
      issuer: null,
      audience: null,
    });
    expect(findings.map((f) => f.code).sort()).toEqual(
      [TENANT_POLICY_FINDING_CODES.insecureTransport, TENANT_POLICY_FINDING_CODES.unsupportedVendor].sort(),
    );
  });
});
