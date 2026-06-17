import type { EhrVendorAdapter, EhrVendorId } from '../types.js';
import { epicAdapter } from './epic.js';
import { genericSmartAdapter } from './genericSmart.js';
import { hapiAdapter } from './hapi.js';
import { otherAdapter } from './other.js';
import { oracleCernerAdapter } from './oracleCerner.js';

export { epicAdapter } from './epic.js';
export { genericSmartAdapter } from './genericSmart.js';
export { hapiAdapter } from './hapi.js';
export { otherAdapter } from './other.js';
export { oracleCernerAdapter } from './oracleCerner.js';

export const vendorAdapters: Record<EhrVendorId, EhrVendorAdapter> = {
  smart_generic: genericSmartAdapter,
  epic: epicAdapter,
  oracle_cerner: oracleCernerAdapter,
  hapi: hapiAdapter,
  other: otherAdapter,
};

export function getVendorAdapter(vendor: EhrVendorId | string | undefined): EhrVendorAdapter {
  if (vendor === 'epic') return epicAdapter;
  if (vendor === 'oracle_cerner') return oracleCernerAdapter;
  if (vendor === 'hapi') return hapiAdapter;
  if (vendor === 'other') return otherAdapter;
  return genericSmartAdapter;
}
