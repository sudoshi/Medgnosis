// =============================================================================
// Unit tests — EDW → QI-Core projection helpers
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { negationToFhir, conceptInValueSet } from './edwToQiCore.js';

beforeEach(() => vi.clearAllMocks());

const OID = '2.16.840.1.113883.3.464.1003.103.12.1001';

describe('negationToFhir', () => {
  it('emits the QI-Core "not done" negation shape for an event resource (Procedure)', () => {
    const neg = negationToFhir('Procedure', {
      system: 'http://snomed.info/sct',
      code: '183932001',
      display: 'Procedure refused',
    });
    expect(neg.status).toBe('not-done');
    expect(neg.statusReason?.coding?.[0]?.code).toBe('183932001');
    expect(neg.doNotPerform).toBeUndefined();
  });

  it('emits doNotPerform for a request resource (MedicationRequest)', () => {
    const neg = negationToFhir('MedicationRequest', {
      system: 'http://snomed.info/sct',
      code: '183932001',
      display: 'Med not indicated',
    });
    expect(neg.doNotPerform).toBe(true);
    expect(neg.reasonCode?.[0]?.coding?.[0]?.code).toBe('183932001');
    expect(neg.status).toBeUndefined();
  });
});

describe('conceptInValueSet', () => {
  it('translates the EDW code system label and checks membership', async () => {
    mockSql.mockResolvedValueOnce([{ found: 1 }]);
    const inSet = await conceptInValueSet(OID, 'SNOMED', '44054006');
    expect(inSet).toBe(true);
  });

  it('returns false (without querying) for an unmapped EDW code system (ICD-9)', async () => {
    const inSet = await conceptInValueSet(OID, 'ICD-9', '250.00');
    expect(inSet).toBe(false);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('returns false when the code is not a member', async () => {
    mockSql.mockResolvedValueOnce([]);
    const inSet = await conceptInValueSet(OID, 'SNOMED', '99999999');
    expect(inSet).toBe(false);
  });
});
