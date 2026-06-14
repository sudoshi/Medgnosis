// =============================================================================
// Unit tests — EDW encounter_type → qualifying FHIR visit crosswalk
// =============================================================================

import { describe, it, expect } from 'vitest';
import { crosswalkEncounter } from './encounterCrosswalk.js';

describe('crosswalkEncounter', () => {
  it('maps qualifying primary-care settings to an Office Visit code', () => {
    for (const t of ['ambulatory', 'outpatient', 'urgentcare']) {
      const m = crosswalkEncounter(t);
      expect(m.classCode).toBe('AMB');
      expect(m.typeCoding?.code).toBe('99213');
    }
  });

  it('maps wellness to a check-up SNOMED code', () => {
    const m = crosswalkEncounter('wellness');
    expect(m.typeCoding?.system).toBe('http://snomed.info/sct');
    expect(m.typeCoding?.code).toBe('185349003');
  });

  it('gives non-qualifying settings a class but NO qualifying type code', () => {
    expect(crosswalkEncounter('emergency')).toEqual({ classCode: 'EMER' });
    expect(crosswalkEncounter('home').typeCoding).toBeUndefined();
    expect(crosswalkEncounter('hospice').typeCoding).toBeUndefined();
  });

  it('is case-insensitive and defaults unknown/empty types to ambulatory class with no code', () => {
    expect(crosswalkEncounter('AMBULATORY').typeCoding?.code).toBe('99213');
    expect(crosswalkEncounter(null)).toEqual({ classCode: 'AMB' });
    expect(crosswalkEncounter('teledentistry')).toEqual({ classCode: 'AMB' });
  });
});
