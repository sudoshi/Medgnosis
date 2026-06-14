// =============================================================================
// Phase 0 exit smoke — integration. Requires a loaded VSAC DB + DATABASE_URL.
// Skipped unless PHASE0_SMOKE=1. The terminology service (and its DB client)
// is dynamically imported INSIDE the test so this file stays inert — and never
// touches @medgnosis/db — when the smoke is skipped in the normal unit run.
// Proves a CMS measure value set resolves end-to-end against the warehouse
// (the data-binding prerequisite the Phase 1 CQL engine depends on).
// =============================================================================

import { describe, it, expect } from 'vitest';

const run = process.env['PHASE0_SMOKE'] === '1' ? describe : describe.skip;

run('Phase 0 exit: a VSAC value set resolves', () => {
  it('expands a known value set to >0 codes', async () => {
    const { expandValueSet } = await import('../terminology.js');
    // Provide a confirmed-present OID via SMOKE_VS_OID, e.g.:
    //   SELECT value_set_oid FROM phm_edw.vsac_value_set LIMIT 1;
    const oid =
      process.env['SMOKE_VS_OID'] ?? '2.16.840.1.113883.3.464.1003.103.12.1001';
    const vs = await expandValueSet(oid);
    expect(vs).not.toBeNull();
    expect(vs!.expansion!.total).toBeGreaterThan(0);
    expect(vs!.expansion!.contains[0]!.system).toMatch(/^https?:|^urn:/);
  });
});
