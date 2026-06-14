// =============================================================================
// Medgnosis — DEQM sample generator (Phase 2 Epic C3 conformance)
// Writes a deterministic DEQM Gaps-in-Care document Bundle (open + prospective
// gaps) for validation against Da Vinci DEQM 5.0.0 via scripts/deqm-validate.sh.
// Pure function — no DB; runs under tsx with no env required.
// =============================================================================

import { writeFileSync } from 'node:fs';
import { buildGapsInCareBundle } from '../src/services/deqm/careGaps.js';

const bundle = buildGapsInCareBundle(
  'Patient/example',
  [
    { measureCode: 'CMS122v13', measureUrl: 'https://madie.cms.gov/Measure/CMS122', gapStatus: 'open', prospective: false },
    { measureCode: 'CMS165v12', measureUrl: 'https://madie.cms.gov/Measure/CMS165', gapStatus: 'prospective', prospective: true },
  ],
  { period: { start: '2024-01-01', end: '2024-12-31' }, timestamp: '2026-06-14T00:00:00Z' },
);

const out = process.argv[2] ?? '/tmp/deqm-gaps-sample.json';
writeFileSync(out, JSON.stringify(bundle, null, 2));
console.log(`[deqm-sample] wrote ${out} (${bundle.entry.length} entries)`);
