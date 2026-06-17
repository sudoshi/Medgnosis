import { normalizeOperationOutcome } from '../operationOutcome.js';
import { defaultScopesForRequest } from '../scopePolicy.js';
import type {
  EhrLaunchContext,
  EhrTenantRef,
  EhrVendorAdapter,
  FhirDiscoverResult,
  FhirResourceSupport,
  FhirSearchParams,
  PaginationPolicy,
  SmartTokenResponseShape,
} from '../types.js';

const GENERIC_PAGINATION: PaginationPolicy = {
  defaultPageSize: 100,
  maxPageSize: 100,
  maxPages: 25,
  nextLinkRelation: 'next',
};

const RESOURCE_SUPPORT: Record<string, FhirResourceSupport> = {
  Patient: { interactions: ['read', 'search'], searchParams: ['_id', 'identifier', 'name', 'birthdate'] },
  Encounter: { interactions: ['read', 'search'], searchParams: ['patient', 'subject', 'date', 'status'] },
  Condition: { interactions: ['read', 'search'], searchParams: ['patient', 'subject', 'clinical-status', 'code'] },
  Observation: { interactions: ['read', 'search'], searchParams: ['patient', 'subject', 'category', 'code', 'date'] },
  MedicationRequest: { interactions: ['read', 'search'], searchParams: ['patient', 'subject', 'status', 'intent'] },
  AllergyIntolerance: { interactions: ['read', 'search'], searchParams: ['patient', 'clinical-status', 'code'] },
  Procedure: { interactions: ['read', 'search'], searchParams: ['patient', 'subject', 'code', 'date'] },
  Immunization: { interactions: ['read', 'search'], searchParams: ['patient', 'status', 'date'] },
  Practitioner: { interactions: ['read', 'search'], searchParams: ['_id', 'identifier', 'name'] },
  Organization: { interactions: ['read', 'search'], searchParams: ['_id', 'identifier', 'name'] },
  Location: { interactions: ['read', 'search'], searchParams: ['_id', 'identifier', 'name'] },
};

export const genericSmartAdapter: EhrVendorAdapter = {
  vendor: 'smart_generic',
  displayName: 'Generic SMART on FHIR',
  discover: discoverFromTenant,
  defaultScopes: defaultScopesForRequest,
  resourceSupport: RESOURCE_SUPPORT,
  normalizeSearchParams: (_resourceType, params) => clampCount(params, GENERIC_PAGINATION),
  handleOperationOutcome: (outcome, context = {}) =>
    normalizeOperationOutcome(outcome, { ...context, vendor: 'smart_generic' }),
  paginationPolicy: GENERIC_PAGINATION,
  bulkCapabilities: {
    supported: false,
    exportLevels: [],
    requiresTenantApproval: true,
    pollingMinSeconds: 600,
    pollingMaxSeconds: 1800,
    notes: ['Enable only after tenant CapabilityStatement confirms Bulk Data support.'],
  },
  cdsCapabilities: {
    cdsHooksVersion: '2.0.1',
    supportedHooks: ['patient-view', 'order-select', 'order-sign'],
    feedbackSupported: true,
    fhirAuthorizationRequired: true,
  },
  launchContextMapper: mapLaunchContext,
};

export function discoverFromTenant(tenant: EhrTenantRef): FhirDiscoverResult {
  const fhirBaseUrl = normalizeBaseUrl(tenant.fhirBaseUrl);
  return {
    fhirBaseUrl,
    smartConfigurationUrl: tenant.smartConfigUrl ?? `${fhirBaseUrl}/.well-known/smart-configuration`,
    capabilityStatementUrl: `${fhirBaseUrl}/metadata`,
  };
}

export function clampCount(params: FhirSearchParams, policy: PaginationPolicy): FhirSearchParams {
  const next: FhirSearchParams = { ...params };
  const requested = numericValue(next._count);
  const pageSize = requested ?? policy.defaultPageSize;
  next._count = Math.min(Math.max(pageSize, 1), policy.maxPageSize);
  return next;
}

export function mapLaunchContext(tokenResponse: SmartTokenResponseShape): EhrLaunchContext {
  return {
    patient: stringValue(tokenResponse.patient),
    encounter: stringValue(tokenResponse.encounter),
    fhirUser: stringValue(tokenResponse.fhirUser),
    scopes: stringValue(tokenResponse.scope)?.split(/\s+/).filter(Boolean) ?? [],
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
