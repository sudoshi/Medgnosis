// =============================================================================
// Unit tests - QDM-backed CQL evidence persistence
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FhirMeasureReport } from '../fhir/cqlEngineClient.js';
import type { QdmElement } from './model.js';

const { mockSql, mockEvaluateMeasure, mockPersistMeasureReport, mockPersistMeasureEvidenceRows } = vi.hoisted(() => {
  return {
    mockSql: { unsafe: vi.fn() },
    mockEvaluateMeasure: vi.fn(),
    mockPersistMeasureReport: vi.fn(),
    mockPersistMeasureEvidenceRows: vi.fn(),
  };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../fhir/cqlEngineClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fhir/cqlEngineClient.js')>();
  return {
    ...actual,
    evaluateMeasure: mockEvaluateMeasure,
  };
});
vi.mock('../measureReportStore.js', () => ({
  persistMeasureReport: mockPersistMeasureReport,
  persistMeasureEvidenceRows: mockPersistMeasureEvidenceRows,
}));

import { persistQdmCqlMeasureEvidence } from './cqlEvidencePersistence.js';

const patientQdm: QdmElement = {
  id: 'Patient/9',
  qdmVersion: '5.6',
  category: 'Patient',
  datatype: 'Patient',
  status: 'active',
  subject: { reference: 'Patient/9', type: 'Patient', id: '9' },
  timing: { birthDate: '1971-02-03' },
  attributes: { active: true, gender: 'female', birthDate: '1971-02-03' },
  source: {
    resourceType: 'Patient',
    id: '9',
    reference: 'Patient/9',
    profiles: [],
    identifiers: [{ system: 'urn:mrn', value: 'MRN-9' }],
  },
};

const populationReport: FhirMeasureReport = {
  resourceType: 'MeasureReport',
  status: 'complete',
  measure: 'CMS122FHIR',
  group: [
    {
      population: [
        { code: { coding: [{ code: 'initial-population' }] }, count: 1 },
        { code: { coding: [{ code: 'denominator' }] }, count: 1 },
        { code: { coding: [{ code: 'numerator' }] }, count: 0 },
        { code: { coding: [{ code: 'denominator-exclusion' }] }, count: 0 },
      ],
      measureScore: { value: 0 },
    },
  ],
};

const subjectReport: FhirMeasureReport = {
  resourceType: 'MeasureReport',
  status: 'complete',
  measure: 'CMS122FHIR',
  group: [
    {
      population: [
        { code: { coding: [{ code: 'initial-population' }] }, count: 1 },
        { code: { coding: [{ code: 'denominator' }] }, count: 1 },
        { code: { coding: [{ code: 'numerator' }] }, count: 0 },
        { code: { coding: [{ code: 'denominator-exclusion' }] }, count: 0 },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPersistMeasureReport.mockResolvedValue(7001);
  mockPersistMeasureEvidenceRows.mockResolvedValue({ rowCount: 1, ids: [8001] });
});

describe('persistQdmCqlMeasureEvidence', () => {
  it('persists aggregate and subject-level QDM CQL evidence for bounded patients', async () => {
    mockEvaluateMeasure
      .mockResolvedValueOnce(populationReport)
      .mockResolvedValueOnce(subjectReport);
    mockSql.unsafe
      .mockResolvedValueOnce([
        {
          qdm_event_id: 901,
          patient_id: 9,
          patient_ref: 'Patient/9',
          patient_key: 1009,
          measure_key: 122,
          source_payload: patientQdm,
        },
      ])
      .mockResolvedValueOnce([
        {
          subject_patient_id: 9,
          subject_patient_ref: 'Patient/9',
          qdm_event_id: 902,
          qdm_datatype: 'Laboratory Test, Performed',
          qdm_category: 'Laboratory Test',
          code_system: 'http://loinc.org',
          code: '4548-4',
          code_display: 'HbA1c',
          value_set_oid: '2.16.840.1.113883.3.464.1003.198.12.1013',
          population_role: 'numerator',
          relevant_start_at: '2026-03-01T00:00:00.000Z',
          relevant_end_at: null,
          source_table: 'phm_edw.observation',
          source_id: 555,
        },
      ]);

    const result = await persistQdmCqlMeasureEvidence({
      engineBaseUrl: 'http://engine.test/fhir',
      measureCode: 'CMS122v12',
      engineMeasureId: 'CMS122FHIR',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      patientIds: [9],
      source: 'qdm-cql',
    });

    expect(result).toMatchObject({
      measureReportId: 7001,
      population: {
        initialPopulation: 1,
        denominator: 1,
        numerator: 0,
        denominatorExclusion: 0,
        score: 0,
      },
      subjectsSelected: 1,
      subjectsEvaluated: 1,
      evidenceRowsPersisted: 1,
      qdmEvidenceSelected: 1,
      subjectFailures: [],
    });

    expect(mockEvaluateMeasure).toHaveBeenNthCalledWith(1, 'http://engine.test/fhir', 'CMS122FHIR', {
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      reportType: 'population',
    });
    expect(mockEvaluateMeasure).toHaveBeenNthCalledWith(2, 'http://engine.test/fhir', 'CMS122FHIR', {
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      reportType: 'subject',
      subject: 'Patient/qdm-Patient-9',
    });
    expect(mockPersistMeasureReport).toHaveBeenCalledWith(
      'CMS122v12',
      { start: '2026-01-01', end: '2026-12-31' },
      populationReport,
      { reportType: 'population', source: 'qdm-cql' },
    );
    expect(mockPersistMeasureEvidenceRows).toHaveBeenCalledWith(7001, [
      expect.objectContaining({
        measureCode: 'CMS122v12',
        patientId: 9,
        patientRef: 'Patient/9',
        patientKey: 1009,
        measureKey: 122,
        denominatorFlag: true,
        numeratorFlag: false,
        exclusionFlag: false,
        qdmEvidence: [
          expect.objectContaining({
            qdmEventId: 902,
            qdmDatatype: 'Laboratory Test, Performed',
            populationRole: 'numerator',
            sourceTable: 'phm_edw.observation',
            sourceId: 555,
          }),
        ],
        fhirSubjectReport: subjectReport,
      }),
    ]);

    const subjectQuery = mockSql.unsafe.mock.calls[0]?.[0] as string;
    const subjectParams = mockSql.unsafe.mock.calls[0]?.[1] as unknown[];
    expect(subjectQuery).toContain("qe.qdm_datatype = 'Patient'");
    expect(subjectQuery).toContain('LEFT JOIN phm_star.dim_patient');
    expect(subjectParams).toEqual(['CMS122v12', [9], 500]);

    const evidenceQuery = mockSql.unsafe.mock.calls[1]?.[0] as string;
    const evidenceParams = mockSql.unsafe.mock.calls[1]?.[1] as unknown[];
    expect(evidenceQuery).toContain('jsonb_to_recordset');
    expect(evidenceQuery).toContain('JOIN LATERAL');
    expect(evidenceQuery).toContain('phm_edw.measure_value_set');
    expect(evidenceParams).toEqual([
      'CMS122v12',
      JSON.stringify([{ patient_id: 9, patient_ref: 'Patient/9' }]),
      '2026-01-01',
      '2026-12-31',
      100,
    ]);
  });

  it('requires an explicit bounded subject scope', async () => {
    await expect(
      persistQdmCqlMeasureEvidence({
        measureCode: 'CMS122v12',
        engineMeasureId: 'CMS122FHIR',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
      }),
    ).rejects.toThrow('requires patientIds or patientRefs');

    expect(mockEvaluateMeasure).not.toHaveBeenCalled();
    expect(mockSql.unsafe).not.toHaveBeenCalled();
  });

  it('can continue on subject-level engine failures and preserve the aggregate report', async () => {
    mockEvaluateMeasure
      .mockResolvedValueOnce(populationReport)
      .mockRejectedValueOnce(new Error('subject missing in engine'));
    mockSql.unsafe
      .mockResolvedValueOnce([
        {
          qdm_event_id: 901,
          patient_id: 9,
          patient_ref: 'Patient/9',
          patient_key: 1009,
          measure_key: 122,
          source_payload: patientQdm,
        },
      ])
      .mockResolvedValueOnce([]);
    mockPersistMeasureEvidenceRows.mockResolvedValueOnce({ rowCount: 0, ids: [] });

    const result = await persistQdmCqlMeasureEvidence({
      engineBaseUrl: 'http://engine.test/fhir',
      measureCode: 'CMS122v12',
      engineMeasureId: 'CMS122FHIR',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      patientIds: [9],
      continueOnSubjectFailure: true,
    });

    expect(result).toMatchObject({
      measureReportId: 7001,
      subjectsSelected: 1,
      subjectsEvaluated: 0,
      evidenceRowsPersisted: 0,
      subjectFailures: [
        {
          patientId: 9,
          patientRef: 'Patient/9',
          subject: 'Patient/qdm-Patient-9',
          reason: 'subject missing in engine',
        },
      ],
    });
    expect(mockPersistMeasureEvidenceRows).toHaveBeenCalledWith(7001, []);
  });

  it('rejects overly long source names before engine calls', async () => {
    await expect(
      persistQdmCqlMeasureEvidence({
        measureCode: 'CMS122v12',
        engineMeasureId: 'CMS122FHIR',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        patientIds: [9],
        source: 'this-source-is-far-too-long',
      }),
    ).rejects.toThrow('source must be 20 characters or fewer');

    expect(mockEvaluateMeasure).not.toHaveBeenCalled();
  });
});
