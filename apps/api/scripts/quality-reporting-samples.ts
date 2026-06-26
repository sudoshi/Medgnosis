// =============================================================================
// Medgnosis - QRDA/QPP sample generator
// Writes deterministic QRDA Category I, QRDA Category III, and QPP JSON fixtures
// for local structural validation and external validator handoff.
// =============================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildQrdaCat1 } from '../src/services/qrda/qrdaCat1.js';
import { buildQrdaCat3, type MeasurePopulationCounts } from '../src/services/qrda/qrdaCat3.js';
import { buildQppSubmission } from '../src/services/qrda/qppJson.js';

const outDir = process.argv[2] ?? 'apps/api/test-fixtures/quality';
mkdirSync(outDir, { recursive: true });

const reportingYear = 2026;
const measure: MeasurePopulationCounts = {
  eCqmId: 'CMS122v13',
  measureUuid: '2.16.840.1.113883.3.560.1.1001',
  version: '13',
  initialPopulation: 100,
  denominator: 80,
  numerator: 55,
  denominatorExclusion: 5,
};

const cat1 = buildQrdaCat1(
  {
    id: 'mgp-qrda-001',
    given: 'Ada',
    family: 'Lovelace',
    gender: 'female',
    birthDate: '1970-05-05',
  },
  [
    {
      measureId: measure.eCqmId,
      measureUuid: measure.measureUuid,
      version: measure.version,
      populations: {
        initialPopulation: 1,
        denominator: 1,
        numerator: 1,
        denominatorExclusion: 0,
      },
    },
  ],
  { period: { start: `${reportingYear}-01-01`, end: `${reportingYear}-12-31` } },
);

const cat3 = buildQrdaCat3({
  reportingYear,
  measures: [measure],
  igVersionExtension: '2026-02-01',
  organizationName: 'Medgnosis Validation',
});

const qpp = buildQppSubmission(reportingYear, [measure]);

writeFileSync(join(outDir, 'qrda-cat1-sample.xml'), cat1);
writeFileSync(join(outDir, 'qrda-cat3-sample.xml'), cat3);
writeFileSync(join(outDir, 'qpp-submission-sample.json'), `${JSON.stringify(qpp, null, 2)}\n`);

console.log(`[quality-reporting-samples] wrote QRDA/QPP fixtures to ${outDir}`);
