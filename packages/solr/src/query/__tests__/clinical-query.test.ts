import { describe, it, expect } from 'vitest';
import { buildClinicalCoreQuery, buildObservationCohortQuery } from '../clinical-query.js';

describe('buildClinicalCoreQuery', () => {
  it('builds conditions query for a patient', () => {
    const result = buildClinicalCoreQuery({
      patientId: 123,
      docType: 'condition',
      limit: 500,
      offset: 0,
    });
    expect(result.fq).toContain('patient_id:123');
    expect(result.fq).toContain('doc_type:condition');
    expect(result.q).toBe('*:*');
    expect(result.rows).toBe(500);
  });

  it('builds observation query with search term', () => {
    const result = buildClinicalCoreQuery({
      patientId: 123,
      docType: 'observation',
      searchTerm: 'blood pressure',
      limit: 100,
      offset: 0,
    });
    expect(result.q).toBe('blood pressure');
    expect(result.fq).toContain('doc_type:observation');
  });

  it('builds encounter query sorted by date desc', () => {
    const result = buildClinicalCoreQuery({
      patientId: 456,
      docType: 'encounter',
      limit: 50,
      offset: 0,
    });
    expect(result.sort).toBe('encounter_datetime desc');
  });

  it('builds medication query with status filter', () => {
    const result = buildClinicalCoreQuery({
      patientId: 789,
      docType: 'medication',
      filters: { prescription_status: 'active' },
      limit: 100,
      offset: 0,
    });
    expect(result.fq).toContain('prescription_status:active');
  });

  it('returns correct fields for each doc type', () => {
    const condResult = buildClinicalCoreQuery({
      patientId: 1,
      docType: 'condition',
      limit: 10,
      offset: 0,
    });
    expect(condResult.fl).toContain('condition_name');
    expect(condResult.fl).toContain('icd10_code');

    const obsResult = buildClinicalCoreQuery({
      patientId: 1,
      docType: 'observation',
      limit: 10,
      offset: 0,
    });
    expect(obsResult.fl).toContain('observation_code');
    expect(obsResult.fl).toContain('value_numeric');
  });
});

describe('buildObservationCohortQuery', () => {
  it('filters by codes, value range, and period (population-scoped, not patient)', () => {
    const r = buildObservationCohortQuery({
      codes: ['4548-4', '17856-6'],
      valueRange: { min: 9 },
      period: { start: '2024-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z' },
      limit: 1000,
      offset: 0,
    });
    expect(r.fq).toContain('doc_type:observation');
    expect(r.fq).toContain('observation_code:(4548-4 OR 17856-6)');
    expect(r.fq).toContain('value_numeric:[9 TO *]');
    expect(r.fq).toContain('observation_datetime:[2024-01-01T00:00:00Z TO 2024-12-31T23:59:59Z]');
    // NOT patient-scoped — this is a cohort query
    expect((r.fq as string[]).some((f) => f.startsWith('patient_id:'))).toBe(false);
    expect(r.rows).toBe(1000);
  });

  it('supports open-ended and bounded value ranges', () => {
    const upper = buildObservationCohortQuery({ codes: ['4548-4'], valueRange: { max: 9 }, limit: 10, offset: 0 });
    expect(upper.fq).toContain('value_numeric:[* TO 9]');
    const both = buildObservationCohortQuery({ codes: ['4548-4'], valueRange: { min: 7, max: 9 }, limit: 10, offset: 0 });
    expect(both.fq).toContain('value_numeric:[7 TO 9]');
  });

  it('omits the value-range filter when no bounds are given', () => {
    const r = buildObservationCohortQuery({ codes: ['4548-4'], limit: 10, offset: 0 });
    expect((r.fq as string[]).some((f) => f.startsWith('value_numeric:'))).toBe(false);
  });
});
