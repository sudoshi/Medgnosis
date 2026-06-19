// =============================================================================
// Unit tests - patient identity matching primitives (pure, no DB)
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { FhirResource } from '../types.js';
import {
  demographicMatchKey,
  extractPatientIdentifiers,
  normalizeDemographics,
} from './identityKeys.js';

function patient(overrides: Record<string, unknown> = {}): FhirResource {
  return {
    resourceType: 'Patient',
    id: 'pat-1',
    name: [{ use: 'official', family: 'Hopper', given: ['Grace', 'B'] }],
    birthDate: '1906-12-09',
    gender: 'female',
    identifier: [
      {
        type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] },
        system: 'urn:oid:1.2.3.4',
        value: 'MRN-001',
      },
    ],
    ...overrides,
  };
}

describe('extractPatientIdentifiers', () => {
  it('returns system-scoped identifiers as strong matches', () => {
    const result = extractPatientIdentifiers(patient());
    expect(result).toEqual([
      { system: 'urn:oid:1.2.3.4', value: 'MRN-001', typeCode: 'MR', strong: true },
    ]);
  });

  it('skips identifiers with no value', () => {
    const result = extractPatientIdentifiers(
      patient({ identifier: [{ system: 'urn:oid:1.2.3.4' }, { system: 'urn:oid:1.2.3.4', value: 'X' }] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('X');
  });

  it('flags identifiers lacking an assigning system as weak (not usable for cross-source match)', () => {
    const result = extractPatientIdentifiers(patient({ identifier: [{ value: 'bare-value' }] }));
    expect(result).toEqual([{ system: '', value: 'bare-value', typeCode: null, strong: false }]);
  });

  it('trims whitespace and returns [] when no identifier array is present', () => {
    expect(extractPatientIdentifiers(patient({ identifier: undefined }))).toEqual([]);
    const trimmed = extractPatientIdentifiers(
      patient({ identifier: [{ system: ' urn:x ', value: ' 42 ' }] }),
    );
    expect(trimmed[0]).toEqual({ system: 'urn:x', value: '42', typeCode: null, strong: true });
  });
});

describe('normalizeDemographics', () => {
  it('extracts the preferred official name, DOB, and sex', () => {
    expect(normalizeDemographics(patient())).toEqual({
      firstName: 'Grace',
      lastName: 'Hopper',
      dateOfBirth: '1906-12-09',
      sex: 'female',
    });
  });

  it('throws when birthDate is missing or malformed', () => {
    expect(() => normalizeDemographics(patient({ birthDate: undefined }))).toThrow(/birthDate/);
    expect(() => normalizeDemographics(patient({ birthDate: '12/09/1906' }))).toThrow(/birthDate/);
  });

  it('throws when given or family name is absent', () => {
    expect(() => normalizeDemographics(patient({ name: [{ family: 'Hopper' }] }))).toThrow(/name/);
  });

  it('returns null sex when gender is absent', () => {
    expect(normalizeDemographics(patient({ gender: undefined })).sex).toBeNull();
  });
});

describe('demographicMatchKey', () => {
  it('produces a case-insensitive, whitespace-stable floor key', () => {
    const a = demographicMatchKey({
      firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-09', sex: 'female',
    });
    const b = demographicMatchKey({
      firstName: '  grace ', lastName: 'HOPPER', dateOfBirth: '1906-12-09', sex: 'Female',
    });
    expect(a).toBe(b);
  });

  it('distinguishes different people', () => {
    const a = demographicMatchKey({
      firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-09', sex: 'female',
    });
    const c = demographicMatchKey({
      firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1906-12-10', sex: 'female',
    });
    expect(a).not.toBe(c);
  });
});
