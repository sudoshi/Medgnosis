import { describe, it, expect } from 'vitest';
import { buildClinicalCoreQuery } from '../clinical-query.js';

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
