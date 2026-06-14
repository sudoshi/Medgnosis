// =============================================================================
// Unit tests — QRDA Category I (patient-level) writer
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildQrdaCat1 } from './qrdaCat1.js';

const patient = {
  id: 'mgp-42',
  given: 'Ada',
  family: 'Lovelace',
  gender: 'female' as const,
  birthDate: '1970-05-05',
};

const measureResults = [
  {
    measureId: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
    version: 'CMS122v13',
    populations: { initialPopulation: 1, denominator: 1, numerator: 1, denominatorExclusion: 0 },
  },
];

describe('buildQrdaCat1', () => {
  const xml = buildQrdaCat1(patient, measureResults, {
    period: { start: '2024-01-01', end: '2024-12-31' },
  });

  it('emits a well-formed CDA ClinicalDocument', () => {
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('<ClinicalDocument');
    expect(xml).toContain('</ClinicalDocument>');
  });

  it('carries the QRDA Category I template ids', () => {
    // QRDA Cat I framework + QDM-based QRDA
    expect(xml).toContain('2.16.840.1.113883.10.20.24.1.1');
    expect(xml).toContain('2.16.840.1.113883.10.20.24.1.2');
    // US Realm Header
    expect(xml).toContain('2.16.840.1.113883.10.20.22.1.1');
  });

  it('includes the patient recordTarget', () => {
    expect(xml).toContain('<recordTarget>');
    expect(xml).toContain('Lovelace');
    expect(xml).toContain('Ada');
    expect(xml).toContain('value="19700505"'); // birthTime
  });

  it('includes a Measure Section referencing the eMeasure + the reporting period', () => {
    expect(xml).toContain('2.16.840.1.113883.10.20.24.2.2'); // Measure Section
    expect(xml).toContain('CMS122FHIRDiabetesAssessGreaterThan9Percent');
    expect(xml).toContain('20240101'); // period low
    expect(xml).toContain('20241231'); // period high
  });

  it('includes a QDM Patient Data Section', () => {
    expect(xml).toContain('2.16.840.1.113883.10.20.24.2.1'); // Patient Data Section
  });

  it('escapes XML-special characters in patient names', () => {
    const x = buildQrdaCat1({ id: 'mgp-1', given: 'A&B', family: '<Doe>', gender: 'male' }, measureResults, {
      period: { start: '2024-01-01', end: '2024-12-31' },
    });
    expect(x).toContain('A&amp;B');
    expect(x).toContain('&lt;Doe&gt;');
    expect(x).not.toContain('<Doe>');
  });
});
