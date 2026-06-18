// =============================================================================
// Unit tests - bounded EDW to QDM backfill
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  type SqlMock = typeof fn & {
    unsafe: (query: string, parameters?: readonly unknown[]) => Promise<unknown>;
    begin: (cb: (tx: SqlMock) => Promise<unknown>) => Promise<unknown>;
  };
  const sqlMock = fn as SqlMock;
  sqlMock.unsafe = async (query, parameters = []) =>
    fn([query] as unknown as TemplateStringsArray, ...parameters);
  sqlMock.begin = vi.fn(async (cb) => cb(sqlMock));
  return { mockSql: sqlMock };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { backfillQdmFromEdw } from './edwBackfill.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.unsafe = async (query, parameters = []) =>
    mockSql([query] as unknown as TemplateStringsArray, ...parameters);
  mockSql.begin = vi.fn(async (cb) => cb(mockSql));
});

describe('backfillQdmFromEdw', () => {
  it('backfills bounded EDW patient, diagnosis, encounter, and lab rows into QDM events', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join('');
      if (query.includes('SET LOCAL statement_timeout')) return Promise.resolve([]);
      if (query.includes('FROM phm_edw.patient')) {
        return Promise.resolve([
          {
            patient_id: 123,
            first_name: 'Ada',
            last_name: 'Bridge',
            date_of_birth: '1970-05-05',
            gender: 'female',
            race: null,
            ethnicity: null,
            mrn: 'MRN-123',
          },
        ]);
      }
      if (query.includes('FROM phm_edw.condition_diagnosis')) {
        return Promise.resolve([
          {
            condition_diagnosis_id: 456,
            patient_id: 123,
            encounter_id: 789,
            provider_id: 22,
            condition_name: 'Diabetes mellitus',
            condition_code: '44054006',
            onset_date: '2023-01-01',
            resolution_date: null,
            diagnosis_status: 'active',
          },
        ]);
      }
      if (query.includes('FROM phm_edw.encounter')) {
        return Promise.resolve([
          {
            encounter_id: 789,
            patient_id: 123,
            provider_id: 22,
            org_id: 7,
            encounter_type: 'ambulatory',
            encounter_datetime: '2024-03-01T10:00:00Z',
            discharge_datetime: '2024-03-01T11:00:00Z',
            status: 'finished',
          },
        ]);
      }
      if (query.includes('FROM phm_edw.observation')) {
        return Promise.resolve([
          {
            observation_id: 987,
            patient_id: 123,
            encounter_id: 789,
            provider_id: 22,
            observation_desc: 'Hemoglobin A1c/Hemoglobin.total in Blood',
            observation_code: '4548-4',
            value_numeric: '9.8',
            value_text: null,
            units: '%',
            observation_datetime: '2024-07-01T08:00:00Z',
            status: 'final',
          },
        ]);
      }
      if (query.includes('INSERT INTO phm_edw.qdm_event')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await backfillQdmFromEdw({
      patientIds: [123, 123],
      orgId: 7,
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      conditionCodes: ['44054006'],
      observationCodes: ['4548-4'],
      limit: 10,
      sourceSystem: 'unit-test',
    });

    expect(result).toEqual({
      patientsSeen: 1,
      rowsSeen: 4,
      eventsUpserted: 4,
      byDatatype: {
        Patient: 1,
        Diagnosis: 1,
        'Encounter, Performed': 1,
        'Laboratory Test, Performed': 1,
      },
    });

    const queries = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join(''));
    expect(queries.some((query) => query.includes('FROM unnest($1::int[]) AS cohort(patient_id)'))).toBe(true);
    expect(queries.some((query) => query.includes('JOIN LATERAL'))).toBe(true);
    expect(queries.some((query) => query.includes('obs.patient_id = cohort.patient_id'))).toBe(true);
    expect(queries.some((query) => query.includes('enc.patient_id = cohort.patient_id'))).toBe(true);

    const insertCalls = mockSql.mock.calls.filter((call) =>
      (call[0] as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.qdm_event'),
    );
    expect(insertCalls).toHaveLength(4);
    const diagnosisInsert = insertCalls.find((call) => call[7] === 'phm_edw.condition_diagnosis');
    expect(diagnosisInsert?.[8]).toBe(456);
    expect(diagnosisInsert?.[24]).toEqual(expect.objectContaining({ clinicalStatus: 'active' }));
    expect(diagnosisInsert?.[25]).toEqual(expect.objectContaining({ datatype: 'Diagnosis' }));

    const observationInsert = insertCalls.find((call) => call[7] === 'phm_edw.observation');
    expect(observationInsert?.[19]).toBe(9.8);
    expect(observationInsert?.[21]).toBe('%');
    expect(observationInsert?.[25]).toEqual(
      expect.objectContaining({
        datatype: 'Laboratory Test, Performed',
        code: expect.objectContaining({ code: '4548-4' }),
      }),
    );
  });

  it('rejects inverted reporting periods before opening a transaction', async () => {
    await expect(
      backfillQdmFromEdw({
        patientIds: [123],
        periodStart: '2024-12-31',
        periodEnd: '2024-01-01',
      }),
    ).rejects.toThrow('periodEnd must be on or after periodStart');

    expect(mockSql.begin).not.toHaveBeenCalled();
  });
});
