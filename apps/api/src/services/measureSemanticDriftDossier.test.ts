// =============================================================================
// Unit tests — Measure semantic drift dossier
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql, mockUnsafe } = vi.hoisted(() => {
  const unsafe = vi.fn();
  const sql = vi.fn();
  Object.assign(sql, {
    unsafe,
    begin: vi.fn(async (cb: (tx: { unsafe: typeof unsafe }) => Promise<unknown>) =>
      cb({ unsafe }),
    ),
  });
  return { mockSql: sql, mockUnsafe: unsafe };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  generateMeasureSemanticDriftDossier,
  getMeasureSemanticDriftDetail,
  listMeasureSemanticDriftWorklist,
  MeasureSemanticDriftError,
} from './measureSemanticDriftDossier.js';

const RUN = {
  id: 7003,
  measure_code: 'CMS122v12',
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  evaluation_scope: 'full_population',
  promotion_eligible: false,
  status: 'drift',
  agree: false,
  sql_denominator: 256,
  sql_numerator: 58,
  sql_exclusion: 0,
  cql_denominator: 17,
  cql_numerator: 0,
  cql_exclusion: 0,
  delta_denominator: 239,
  delta_numerator: 58,
  delta_exclusion: 0,
  cql_measure_report_id: 9001,
  computed_at: '2026-06-18T12:00:00Z',
};

const REPORT = {
  id: 9001,
  measure_code: 'CMS122v12',
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  report_type: 'population',
  initial_population: 17,
  denominator: 17,
  numerator: 0,
  denominator_exclusion: 0,
  source: 'qdm-cql-smoke',
  computed_at: '2026-06-18T11:55:00Z',
};

const ALIAS = {
  source_measure_code: 'DM-02',
  mapping_method: 'local_care_gap_surrogate',
  metadata: { semanticRelationship: 'surrogate_not_equivalent' },
};

const DOSSIER = {
  id: 42,
  measure_code: 'CMS122v12',
  source_measure_code: 'DM-02',
  reconciliation_run_id: 7003,
  measure_report_id: 9001,
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  semantic_relationship: 'surrogate_not_equivalent',
  classification_counts: {
    denominator: { residual_cql_or_qicore_semantic_gap: 27 },
    numerator: { neither_numerator: 198 },
    exclusion: { neither_exclusion: 242 },
  },
  generated_at: '2026-06-18T13:15:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockReset();
  mockUnsafe.mockReset();
  mockSql.begin.mockImplementation(
    async (cb: (tx: { unsafe: typeof mockUnsafe }) => Promise<unknown>) =>
      cb({ unsafe: mockUnsafe }),
  );
});

describe('generateMeasureSemanticDriftDossier', () => {
  it('classifies denominator and numerator semantic drift without promotion side effects', async () => {
    mockSql
      .mockResolvedValueOnce([RUN])
      .mockResolvedValueOnce([REPORT])
      .mockResolvedValueOnce([ALIAS])
      .mockResolvedValueOnce([
        patientRow({
          patient_id: 1,
          sql_denominator: true,
          cql_denominator: false,
          age_qualifies_cms122: false,
          has_diabetes_evidence: true,
        }),
        patientRow({
          patient_id: 2,
          sql_denominator: true,
          sql_numerator: true,
          cql_denominator: false,
          local_gap_status: 'closed',
          local_gap_closed: true,
          age_qualifies_cms122: true,
          has_diabetes_evidence: true,
          has_qualifying_encounter_evidence: true,
          has_hba1c_evidence: true,
          has_hba1c_gt9: false,
          max_hba1c_value: '7.4',
        }),
        patientRow({
          patient_id: 3,
          sql_denominator: true,
          cql_denominator: true,
          age_qualifies_cms122: true,
          has_diabetes_evidence: true,
          has_qualifying_encounter_evidence: true,
        }),
      ]);

    const dossier = await generateMeasureSemanticDriftDossier({
      measureCode: 'CMS122v12',
      reconciliationRunId: 7003,
      persist: false,
    });

    expect(dossier.persisted).toBe(false);
    expect(dossier.sourceMeasureCode).toBe('DM-02');
    expect(dossier.summary).toMatchObject({
      comparedPatients: 3,
      driftPatients: 2,
      sqlCounts: { denominator: 3, numerator: 1, exclusion: 0 },
      cqlCounts: { denominator: 1, numerator: 0, exclusion: 0 },
    });
    expect(dossier.classificationCounts).toMatchObject({
      denominator: {
        outside_cms122_age_range: 1,
        residual_cql_or_qicore_semantic_gap: 1,
        aligned_denominator: 1,
      },
      numerator: {
        neither_numerator: 2,
        local_gap_closed_with_controlled_hba1c_not_cms122_poor_control: 1,
      },
    });
    expect(dossier.patientDriftRows.map((row) => row.patientId)).toEqual([1, 2]);
    const comparisonQuery = (mockSql.mock.calls[3]?.[0] as TemplateStringsArray).join('');
    expect(comparisonQuery).toContain('AND source = ');
    expect(mockSql.mock.calls[3]).toContain(REPORT.source);
    expect(mockSql.begin).not.toHaveBeenCalled();
  });

  it('persists an aggregate dossier and patient drift rows by default', async () => {
    mockSql
      .mockResolvedValueOnce([RUN])
      .mockResolvedValueOnce([REPORT])
      .mockResolvedValueOnce([ALIAS])
      .mockResolvedValueOnce([
        patientRow({
          patient_id: 2,
          sql_denominator: true,
          sql_numerator: true,
          cql_denominator: false,
          local_gap_status: 'closed',
          local_gap_closed: true,
          age_qualifies_cms122: true,
          has_diabetes_evidence: true,
          has_qualifying_encounter_evidence: true,
        }),
      ]);
    mockUnsafe
      .mockResolvedValueOnce([{ id: 42, generated_at: '2026-06-18T13:00:00Z' }])
      .mockResolvedValueOnce([{ patient_rows_inserted: 1 }]);

    const dossier = await generateMeasureSemanticDriftDossier({
      measureCode: 'CMS122v12',
      reconciliationRunId: 7003,
      actorId: '00000000-0000-4000-8000-000000000001',
    });

    expect(dossier.dossierId).toBe(42);
    expect(dossier.patientsPersisted).toBe(1);
    const queries = mockUnsafe.mock.calls.map(([query]) => query as string);
    expect(queries[0]).toContain('INSERT INTO phm_edw.measure_semantic_drift_dossier');
    expect(queries[1]).toContain('INSERT INTO phm_edw.measure_semantic_drift_patient');
  });

  it('rejects scoped reconciliation runs', async () => {
    mockSql.mockResolvedValueOnce([{ ...RUN, evaluation_scope: 'scoped_subjects' }]);

    await expect(
      generateMeasureSemanticDriftDossier({
        measureCode: 'CMS122v12',
        reconciliationRunId: 2,
        persist: false,
      }),
    ).rejects.toBeInstanceOf(MeasureSemanticDriftError);
  });
});

describe('listMeasureSemanticDriftWorklist', () => {
  it('returns a paged residual-case review worklist with subject population counts', async () => {
    mockSql
      .mockResolvedValueOnce([DOSSIER])
      .mockResolvedValueOnce([{ total_rows: 27 }])
      .mockResolvedValueOnce([
        worklistPatientRow({
          id: 1001,
          patient_id: 3,
          sql_denominator: true,
          sql_numerator: true,
          cql_denominator: false,
          denominator_drift: 'residual_cql_or_qicore_semantic_gap',
          numerator_drift: 'local_gap_closed_without_qdm_hba1c_or_gmi_evidence',
          evidence_summary: {
            qdmEvidenceCount: 72,
            ageQualifiesCms122: true,
            hasDiabetesEvidence: true,
            hasQualifyingEncounterEvidence: true,
            hasHbA1cEvidence: false,
          },
          cql_population_counts: { 'initial-population': 0, denominator: 0 },
          has_subject_report: true,
        }),
      ]);

    const worklist = await listMeasureSemanticDriftWorklist({
      measureCode: 'CMS122v12',
      dossierId: 42,
      denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
      limit: 5,
      offset: 10,
    });

    expect(worklist.pagination).toMatchObject({
      limit: 5,
      offset: 10,
      total: 27,
      returned: 1,
      hasMore: true,
    });
    expect(worklist.rows[0]).toMatchObject({
      dossierPatientId: 1001,
      patientId: 3,
      cqlPopulationCounts: { 'initial-population': 0, denominator: 0 },
      hasSubjectReport: true,
      reviewBuckets: {
        localGap: 'unknown',
        hba1c: 'missing',
        qdmEvidenceVolume: 'high',
        denominatorPrerequisites: 'age_diabetes_encounter_present',
        cqlSubjectPopulation: 'subject_population_zero',
      },
      reviewPriority: 100,
      reviewHint: expect.stringContaining('subject MeasureReport initial population is 0'),
    });
    const rowQuery = (mockSql.mock.calls[2]?.[0] as TemplateStringsArray).join('');
    expect(rowQuery).toContain('phm_edw.measure_report_evidence');
    expect(rowQuery).toContain('LEFT JOIN LATERAL');
    expect(rowQuery).toContain('mre.source IN');
    expect(rowQuery).toContain('mre.computed_at DESC');
    expect(rowQuery).toContain('jsonb_object_agg');
  });

  it('rejects invalid pagination before reading the database', async () => {
    await expect(
      listMeasureSemanticDriftWorklist({ measureCode: 'CMS122v12', limit: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe('getMeasureSemanticDriftDetail', () => {
  it('returns an audited drilldown payload with raw QDM and FHIR evidence for one row', async () => {
    mockSql.mockResolvedValueOnce([
      detailPatientRow({
        id: 1001,
        patient_id: 3,
        denominator_drift: 'residual_cql_or_qicore_semantic_gap',
        evidence_summary: {
          qdmEvidenceCount: 2,
          ageQualifiesCms122: true,
          hasDiabetesEvidence: true,
          hasQualifyingEncounterEvidence: true,
        },
        cql_population_counts: { 'initial-population': 0, denominator: 0 },
        measure_report_evidence_id: 90001,
        evidence_measure_report_id: 9001,
        raw_qdm_evidence: [
          { qdmEventId: 1, qdmDatatype: 'Diagnosis', valueSetOid: '2.16.840.1' },
          { qdmEventId: 2, qdmDatatype: 'Encounter, Performed', valueSetOid: '2.16.840.2' },
        ],
        raw_fhir_subject_report: {
          resourceType: 'MeasureReport',
          group: [{ population: [{ code: { coding: [{ code: 'initial-population' }] }, count: 0 }] }],
        },
      }),
    ]);

    const detail = await getMeasureSemanticDriftDetail({
      measureCode: 'CMS122v12',
      dossierPatientId: 1001,
    });

    expect(detail).toMatchObject({
      measureCode: 'CMS122v12',
      dossierId: 42,
      dossierPatientId: 1001,
      worklistRow: {
        patientId: 3,
        denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
        cqlPopulationCounts: { 'initial-population': 0, denominator: 0 },
      },
      measureReportEvidence: {
        id: 90001,
        measureReportId: 9001,
        qdmEvidenceCount: 2,
        fhirSubjectReportPresent: true,
      },
    });
    expect(detail.measureReportEvidence?.qdmEvidence).toHaveLength(2);
    expect(detail.measureReportEvidence?.fhirSubjectReport).toMatchObject({
      resourceType: 'MeasureReport',
    });
    const query = (mockSql.mock.calls[0]?.[0] as TemplateStringsArray).join('');
    expect(query).toContain('mre.qdm_evidence AS raw_qdm_evidence');
    expect(query).toContain('LEFT JOIN LATERAL');
    expect(query).toContain('mre.source IN');
    expect(query).toContain('mre.computed_at DESC');
    expect(query).toContain('p.id = ');
  });

  it('returns not found for a detail row outside the measure', async () => {
    mockSql.mockResolvedValueOnce([]);

    await expect(
      getMeasureSemanticDriftDetail({ measureCode: 'CMS122v12', dossierPatientId: 999 }),
    ).rejects.toMatchObject({ code: 'SEMANTIC_DRIFT_PATIENT_NOT_FOUND', statusCode: 404 });
  });
});

function patientRow(overrides: Record<string, unknown> = {}) {
  return {
    patient_id: 1,
    patient_ref: 'Patient/1',
    patient_key: 10,
    sql_denominator: false,
    sql_numerator: false,
    sql_exclusion: false,
    cql_denominator: false,
    cql_numerator: false,
    cql_exclusion: false,
    local_gap_status: null,
    local_gap_closed: false,
    qdm_evidence_count: 0,
    initial_population_evidence_count: 0,
    denominator_exclusion_evidence_count: 0,
    numerator_evidence_count: 0,
    has_initial_population_evidence: false,
    has_denominator_exclusion_evidence: false,
    has_diabetes_evidence: false,
    has_qualifying_encounter_evidence: false,
    has_hba1c_evidence: false,
    has_hba1c_gt9: false,
    max_hba1c_value: null,
    latest_hba1c_at: null,
    age_at_period_start: 50,
    age_at_period_end: 50,
    age_qualifies_cms122: true,
    sql_snapshot_date: '2026-06-18',
    ...overrides,
  };
}

function worklistPatientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1000,
    patient_id: 1,
    patient_ref: 'Patient/1',
    patient_key: 10,
    sql_denominator: false,
    sql_numerator: false,
    sql_exclusion: false,
    cql_denominator: false,
    cql_numerator: false,
    cql_exclusion: false,
    denominator_drift: 'neither_denominator',
    numerator_drift: 'neither_numerator',
    exclusion_drift: 'neither_exclusion',
    local_gap_status: null,
    classification: {},
    evidence_summary: {},
    cql_population_counts: {},
    has_subject_report: false,
    created_at: '2026-06-18T13:20:00Z',
    ...overrides,
  };
}

function detailPatientRow(overrides: Record<string, unknown> = {}) {
  return {
    ...worklistPatientRow(overrides),
    dossier_id: 42,
    measure_code: 'CMS122v12',
    source_measure_code: 'DM-02',
    reconciliation_run_id: 7003,
    dossier_measure_report_id: 9001,
    period_start: '2024-01-01',
    period_end: '2024-12-31',
    semantic_relationship: 'surrogate_not_equivalent',
    generated_at: '2026-06-18T13:15:00Z',
    measure_report_evidence_id: null,
    evidence_measure_report_id: null,
    evidence_period_start: '2024-01-01',
    evidence_period_end: '2024-12-31',
    evidence_denominator_flag: false,
    evidence_numerator_flag: false,
    evidence_exclusion_flag: false,
    measure_value: null,
    evidence_source: 'qdm-cql-smoke',
    evidence_computed_at: '2026-06-18T13:10:00Z',
    raw_qdm_evidence: [],
    raw_fhir_subject_report: null,
    ...overrides,
  };
}
