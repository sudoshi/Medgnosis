import { normalizeOperationOutcome } from '../operationOutcome.js';
import { defaultScopesForRequest } from '../scopePolicy.js';
import type { EhrVendorAdapter, FhirSearchParams } from '../types.js';
import {
  clampCount,
  discoverFromTenant,
  genericSmartAdapter,
  mapLaunchContext,
} from './genericSmart.js';

const HAPI_PAGINATION = {
  defaultPageSize: 100,
  maxPageSize: 200,
  maxPages: 25,
  nextLinkRelation: 'next' as const,
};

export const hapiAdapter: EhrVendorAdapter = {
  ...genericSmartAdapter,
  vendor: 'hapi',
  displayName: 'HAPI/Smile CDR SMART on FHIR',
  discover: discoverFromTenant,
  defaultScopes: defaultScopesForRequest,
  normalizeSearchParams: (_resourceType: string, params: FhirSearchParams): FhirSearchParams =>
    clampCount(params, HAPI_PAGINATION),
  handleOperationOutcome: (outcome, context = {}) =>
    normalizeOperationOutcome(outcome, { ...context, vendor: 'hapi' }),
  paginationPolicy: HAPI_PAGINATION,
  bulkCapabilities: {
    supported: false,
    exportLevels: [],
    requiresTenantApproval: true,
    pollingMinSeconds: 600,
    pollingMaxSeconds: 1800,
    notes: ['Enable only after the HAPI/Smile deployment advertises Bulk Data support.'],
  },
  launchContextMapper: mapLaunchContext,
};
