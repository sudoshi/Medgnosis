// =============================================================================
// Unit tests — QI-Core cohort export (transaction Bundle for engine loading)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildCohortBundle } from './qicoreExport.js';

describe('buildCohortBundle', () => {
  it('emits a transaction Bundle of QI-Core resources with PUT requests', () => {
    const b = buildCohortBundle({
      patients: [
        { patient_id: 1, first_name: 'A', last_name: 'B', gender: 'female', date_of_birth: '1970-01-01' },
      ],
      conditions: [
        { condition_diagnosis_id: 9, patient_id: 1, condition_code: '44054006', condition_name: 'DM2', diagnosis_status: 'active' },
      ],
      observations: [
        { observation_id: 7, patient_id: 1, observation_code: '4548-4', observation_desc: 'HbA1c', value_numeric: 9.5, units: '%', observation_datetime: '2026-03-01T00:00:00Z' },
      ],
      medications: [],
    });
    expect(b.resourceType).toBe('Bundle');
    expect(b.type).toBe('transaction');
    const types = b.entry.map((e) => e.resource.resourceType).sort();
    expect(types).toEqual(['Condition', 'Observation', 'Patient']);
    expect(b.entry.every((e) => e.request.method === 'PUT')).toBe(true);
  });

  it('namespaces numeric EDW ids (FHIR servers reject purely-numeric client ids)', () => {
    const b = buildCohortBundle({
      patients: [{ patient_id: 42, first_name: 'A', last_name: 'B', gender: 'male', date_of_birth: '1980-05-05' }],
      conditions: [],
      observations: [],
      medications: [],
    });
    const [patient] = b.entry;
    expect(patient?.request.url).toBe('Patient/mgp-42');
    expect(patient?.fullUrl).toBe('Patient/mgp-42');
    expect(patient?.resource.id).toBe('mgp-42');
    // every id carries a non-numeric prefix
    expect(b.entry.every((e) => /[a-z]/.test(e.resource.id))).toBe(true);
  });

  it('wires child resources back to their (prefixed) patient subject reference', () => {
    const b = buildCohortBundle({
      patients: [{ patient_id: 5, first_name: 'C', last_name: 'D', gender: 'female', date_of_birth: '1960-01-01' }],
      conditions: [{ condition_diagnosis_id: 3, patient_id: 5, condition_code: '44054006', condition_name: 'DM2', diagnosis_status: 'active' }],
      observations: [],
      medications: [
        { medication_order_id: 2, patient_id: 5, medication_code: '860975', medication_name: 'metformin', prescription_status: 'active', start_datetime: '2026-01-02T00:00:00Z' },
      ],
    });
    const cond = b.entry.find((e) => e.resource.resourceType === 'Condition');
    const med = b.entry.find((e) => e.resource.resourceType === 'MedicationRequest');
    expect(cond?.resource.id).toBe('mgc-3');
    expect(med?.resource.id).toBe('mgm-2');
    expect((cond?.resource as Record<string, { reference: string }>).subject.reference).toBe('Patient/mgp-5');
    expect((med?.resource as Record<string, { reference: string }>).subject.reference).toBe('Patient/mgp-5');
  });

  it('produces an empty-entry transaction Bundle for an empty cohort', () => {
    const b = buildCohortBundle({ patients: [], conditions: [], observations: [], medications: [] });
    expect(b.type).toBe('transaction');
    expect(b.entry).toEqual([]);
  });
});
