// =============================================================================
// Unit tests — QRDA Category III + QPP JSON serializers
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildQrdaCat3, type MeasurePopulationCounts } from './qrdaCat3.js';
import { buildQppSubmission, qppMeasureId } from './qppJson.js';

const CMS122: MeasurePopulationCounts = {
  eCqmId: 'CMS122v13',
  initialPopulation: 100,
  denominator: 80,
  numerator: 55,
  denominatorExclusion: 5,
};

describe('buildQrdaCat3', () => {
  const xml = buildQrdaCat3({ reportingYear: 2026, measures: [CMS122] });

  it('emits a QRDA Cat III ClinicalDocument with the report templateId', () => {
    expect(xml).toContain('<ClinicalDocument');
    expect(xml).toContain('2.16.840.1.113883.10.20.27.1.1'); // QRDA Cat III report
    expect(xml).toContain('55186-1'); // Measure Section
  });

  it('references the measure and carries aggregate counts per population', () => {
    expect(xml).toContain('CMS122v13');
    expect(xml).toMatch(/value xsi:type="INT" value="100"/); // initial population
    expect(xml).toMatch(/value xsi:type="INT" value="80"/); // denominator
    expect(xml).toMatch(/value xsi:type="INT" value="55"/); // numerator
    expect(xml).toMatch(/value xsi:type="INT" value="5"/); // exclusion
  });

  it('escapes XML-special characters in the organization name', () => {
    const x = buildQrdaCat3({ reportingYear: 2026, measures: [CMS122], organizationName: 'A & B <Health>' });
    expect(x).toContain('A &amp; B &lt;Health&gt;');
    expect(x).not.toContain('A & B <Health>');
  });

  it('is well-formed XML (balanced ClinicalDocument tags, declaration present)', () => {
    expect(xml.startsWith('<?xml')).toBe(true);
    expect((xml.match(/<ClinicalDocument/g) ?? []).length).toBe(1);
    expect((xml.match(/<\/ClinicalDocument>/g) ?? []).length).toBe(1);
  });
});

describe('buildQppSubmission', () => {
  it('maps populations to the QPP performance-data shape', () => {
    const sub = buildQppSubmission(2026, [CMS122]);
    expect(sub.performanceYear).toBe(2026);
    const meas = sub.measurementSets[0]!.measurements[0]!;
    expect(meas.measureId).toBe('122');
    expect(meas.value.performanceMet).toBe(55); // numerator
    expect(meas.value.eligiblePopulation).toBe(80); // denominator
    expect(meas.value.eligiblePopulationExclusion).toBe(5);
    expect(meas.value.performanceNotMet).toBe(20); // 80 - 5 - 55
  });
});

describe('qppMeasureId', () => {
  it('strips CMS prefix + version to the numeric id', () => {
    expect(qppMeasureId('CMS122v13')).toBe('122');
    expect(qppMeasureId('CMS0122')).toBe('122');
  });
});
