import { normalizeOperationOutcome } from '../operationOutcome.js';
import { defaultScopesForRequest } from '../scopePolicy.js';
import type { EhrVendorAdapter } from '../types.js';
import {
  discoverFromTenant,
  genericSmartAdapter,
  mapLaunchContext,
} from './genericSmart.js';

export const otherAdapter: EhrVendorAdapter = {
  ...genericSmartAdapter,
  vendor: 'other',
  displayName: 'Other FHIR-capable EHR',
  discover: discoverFromTenant,
  defaultScopes: defaultScopesForRequest,
  handleOperationOutcome: (outcome, context = {}) =>
    normalizeOperationOutcome(outcome, { ...context, vendor: 'other' }),
  bulkCapabilities: {
    supported: false,
    exportLevels: [],
    requiresTenantApproval: true,
    pollingMinSeconds: 600,
    pollingMaxSeconds: 1800,
    notes: ['Document any non-FHIR/interface-engine feeds before enabling production ingestion.'],
  },
  launchContextMapper: mapLaunchContext,
};
