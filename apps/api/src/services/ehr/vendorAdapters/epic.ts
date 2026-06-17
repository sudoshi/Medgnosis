import { normalizeOperationOutcome } from '../operationOutcome.js';
import { buildBackendServiceScopes, buildPatientLaunchScopes } from '../scopePolicy.js';
import type { EhrVendorAdapter, FhirSearchParams, ScopePolicyRequest } from '../types.js';
import {
  clampCount,
  discoverFromTenant,
  genericSmartAdapter,
  mapLaunchContext,
} from './genericSmart.js';

const EPIC_PAGINATION = {
  defaultPageSize: 50,
  maxPageSize: 100,
  maxPages: 20,
  nextLinkRelation: 'next' as const,
};

export const epicAdapter: EhrVendorAdapter = {
  ...genericSmartAdapter,
  vendor: 'epic',
  displayName: 'Epic SMART on FHIR',
  discover: discoverFromTenant,
  defaultScopes: epicDefaultScopes,
  normalizeSearchParams: normalizeEpicSearchParams,
  handleOperationOutcome: (outcome, context = {}) =>
    normalizeOperationOutcome(outcome, { ...context, vendor: 'epic' }),
  paginationPolicy: EPIC_PAGINATION,
  bulkCapabilities: {
    supported: true,
    exportLevels: ['group'],
    requiresTenantApproval: true,
    pollingMinSeconds: 600,
    pollingMaxSeconds: 1800,
    notes: ['Use only for customer-approved group export workflows.'],
  },
  cdsCapabilities: {
    cdsHooksVersion: '2.0.1',
    supportedHooks: ['patient-view', 'order-select', 'order-sign'],
    feedbackSupported: true,
    fhirAuthorizationRequired: true,
  },
  launchContextMapper: mapLaunchContext,
};

function epicDefaultScopes(request: ScopePolicyRequest): string[] {
  return request.mode === 'backend'
    ? buildBackendServiceScopes(request)
    : buildPatientLaunchScopes(request);
}

function normalizeEpicSearchParams(resourceType: string, params: FhirSearchParams): FhirSearchParams {
  const normalized = clampCount(params, EPIC_PAGINATION);
  if (resourceType !== 'Patient' && normalized._sort === undefined) {
    return { ...normalized, _sort: '-date' };
  }
  return normalized;
}
