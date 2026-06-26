// =============================================================================
// Medgnosis API — EHR tenant production-hardening policy
// Pure, dependency-free validation helpers for production-tenant transport
// security (HTTPS-only endpoints) and known-vendor/adapter enforcement.
// Shared by tenantRegistry (enforce at create/upsert) and readinessEvidence
// (surface as structured readiness issues).
// =============================================================================

import type { EhrEnvironment, EhrVendor } from './tenantRegistry.js';
import { vendorAdapters } from './vendorAdapters/index.js';

/**
 * Vendors/adapters Medgnosis explicitly supports. Generic SMART on FHIR
 * (`smart_generic`) is an explicitly-supported known vendor — only vendors
 * absent from the adapter registry are treated as unknown/unsupported.
 */
export const KNOWN_EHR_VENDORS: ReadonlySet<string> = new Set(Object.keys(vendorAdapters));

/** Tenant endpoint fields that participate in transport-security validation. */
export type TenantEndpointField = 'fhirBaseUrl' | 'smartConfigUrl' | 'issuer' | 'audience';

export interface TenantEndpointDescriptor {
  readonly field: TenantEndpointField;
  readonly url: string | null | undefined;
}

export type TenantPolicySeverity = 'warning' | 'critical';

export interface TenantPolicyFinding {
  readonly severity: TenantPolicySeverity;
  readonly code: string;
  readonly message: string;
}

/** Minimal tenant view required to evaluate production-hardening policy. */
export interface TenantPolicyInput {
  readonly vendor: EhrVendor | string;
  readonly environment: EhrEnvironment | string;
  readonly fhirBaseUrl: string;
  readonly smartConfigUrl?: string | null;
  readonly issuer?: string | null;
  readonly audience?: string | null;
}

const HTTPS_REQUIRED_FINDING_CODE = 'tenant_endpoint_insecure_transport';
const UNKNOWN_VENDOR_FINDING_CODE = 'tenant_vendor_unsupported';

const LOCAL_LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

/**
 * Production tenants must use HTTPS for every advertised endpoint. A tenant is
 * "production" when its own environment is `production`, independent of the
 * NODE_ENV the API process runs under — a production tenant served over plain
 * HTTP is a configuration defect even in a dev/test process.
 */
export function isProductionTenantEnvironment(environment: EhrEnvironment | string): boolean {
  return environment === 'production';
}

/** True when `vendor` maps to a supported vendor adapter (incl. generic SMART). */
export function isKnownEhrVendor(vendor: EhrVendor | string | null | undefined): boolean {
  return typeof vendor === 'string' && KNOWN_EHR_VENDORS.has(vendor);
}

/**
 * True when `url` is an acceptable transport for the given tenant environment.
 * Production: https:// only. Non-production: https:// always, plus http://
 * against loopback hosts (localhost / 127.0.0.1 / ::1) for sandbox/dev.
 * Null/undefined/blank URLs are treated as "not insecure" (absence is handled
 * separately by discovery readiness, not transport-security policy).
 */
export function isAcceptableTenantEndpointUrl(
  url: string | null | undefined,
  environment: EhrEnvironment | string,
): boolean {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (trimmed.length === 0) return true;

  const protocol = endpointProtocol(trimmed);
  if (protocol === null) return false;
  if (protocol === 'https:') return true;
  if (protocol !== 'http:') return false;

  // Plain HTTP is permitted only outside production AND only on loopback hosts.
  if (isProductionTenantEnvironment(environment)) return false;
  return isLoopbackHostname(trimmed);
}

/**
 * Produce structured findings for production-hardening policy violations:
 * non-HTTPS production endpoints and unknown/unsupported vendors. Returns an
 * empty array when the tenant is fully compliant.
 */
export function evaluateTenantPolicy(input: TenantPolicyInput): TenantPolicyFinding[] {
  const findings: TenantPolicyFinding[] = [];

  const insecureFields = insecureTenantEndpointFields(input);
  if (insecureFields.length > 0) {
    findings.push({
      severity: 'critical',
      code: HTTPS_REQUIRED_FINDING_CODE,
      message: `Production tenant endpoint(s) must use HTTPS: ${insecureFields.join(', ')}.`,
    });
  }

  if (!isKnownEhrVendor(input.vendor)) {
    findings.push({
      severity: 'warning',
      code: UNKNOWN_VENDOR_FINDING_CODE,
      message: `Tenant declares unsupported vendor "${describeVendor(input.vendor)}"; no matching vendor adapter is registered.`,
    });
  }

  return findings;
}

/**
 * Identify the endpoint fields that violate the transport-security policy for
 * the tenant's environment (always empty for fully-HTTPS or loopback-dev
 * tenants). Ordering is stable for deterministic messages and tests.
 */
export function insecureTenantEndpointFields(input: TenantPolicyInput): TenantEndpointField[] {
  return tenantEndpointDescriptors(input)
    .filter((descriptor) => !isAcceptableTenantEndpointUrl(descriptor.url, input.environment))
    .map((descriptor) => descriptor.field);
}

function tenantEndpointDescriptors(input: TenantPolicyInput): TenantEndpointDescriptor[] {
  return [
    { field: 'fhirBaseUrl', url: input.fhirBaseUrl },
    { field: 'smartConfigUrl', url: input.smartConfigUrl },
    { field: 'issuer', url: input.issuer },
    { field: 'audience', url: input.audience },
  ];
}

function endpointProtocol(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

function isLoopbackHostname(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return LOCAL_LOOPBACK_HOSTNAMES.has(hostname) || LOCAL_LOOPBACK_HOSTNAMES.has(`[${hostname}]`);
  } catch {
    return false;
  }
}

function describeVendor(vendor: EhrVendor | string | null | undefined): string {
  return typeof vendor === 'string' && vendor.length > 0 ? vendor : '(unset)';
}

export const TENANT_POLICY_FINDING_CODES = {
  insecureTransport: HTTPS_REQUIRED_FINDING_CODE,
  unsupportedVendor: UNKNOWN_VENDOR_FINDING_CODE,
} as const;
