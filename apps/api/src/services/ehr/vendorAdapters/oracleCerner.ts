import { normalizeOperationOutcome } from '../operationOutcome.js';
import { buildBackendServiceScopes, buildPatientLaunchScopes } from '../scopePolicy.js';
import type { EhrVendorAdapter, FhirSearchParams, ScopePolicyRequest } from '../types.js';
import {
  clampCount,
  discoverFromTenant,
  genericSmartAdapter,
  mapLaunchContext,
} from './genericSmart.js';

const ORACLE_CERNER_PAGINATION = {
  defaultPageSize: 50,
  maxPageSize: 100,
  maxPages: 20,
  nextLinkRelation: 'next' as const,
};

export const oracleCernerAdapter: EhrVendorAdapter = {
  ...genericSmartAdapter,
  vendor: 'oracle_cerner',
  displayName: 'Oracle Health Millennium SMART on FHIR',
  discover: discoverFromTenant,
  defaultScopes: oracleCernerDefaultScopes,
  normalizeSearchParams: normalizeOracleCernerSearchParams,
  handleOperationOutcome: (outcome, context = {}) =>
    normalizeOperationOutcome(outcome, { ...context, vendor: 'oracle_cerner' }),
  paginationPolicy: ORACLE_CERNER_PAGINATION,
  bulkCapabilities: {
    supported: true,
    exportLevels: ['patient', 'group'],
    requiresTenantApproval: true,
    pollingMinSeconds: 600,
    pollingMaxSeconds: 1800,
    notes: ['Patient and group export depend on tenant permissions in Oracle Code Console.'],
  },
  cdsCapabilities: {
    cdsHooksVersion: '2.0.1',
    supportedHooks: ['patient-view', 'order-select', 'order-sign'],
    feedbackSupported: true,
    fhirAuthorizationRequired: true,
  },
  launchContextMapper: mapLaunchContext,
};

function oracleCernerDefaultScopes(request: ScopePolicyRequest): string[] {
  return request.mode === 'backend'
    ? buildBackendServiceScopes(request)
    : buildPatientLaunchScopes(request);
}

function normalizeOracleCernerSearchParams(_resourceType: string, params: FhirSearchParams): FhirSearchParams {
  return clampCount(params, ORACLE_CERNER_PAGINATION);
}

