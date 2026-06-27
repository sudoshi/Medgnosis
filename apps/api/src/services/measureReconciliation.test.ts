// =============================================================================
// Unit tests — Measure reconciliation (CQL vs SQL)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql, mockEval, mockCapability } = vi.hoisted(() => {
  const sql = vi.fn();
  const unsafe = vi.fn();
  Object.assign(sql, {
    json: vi.fn((value: unknown) => value),
    unsafe,
    begin: vi.fn(async (cb: (tx: { unsafe: typeof unsafe }) => Promise<unknown>) => cb({ unsafe })),
  });
  return { mockSql: sql, mockEval: vi.fn(), mockCapability: vi.fn() };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./fhir/cqlEngineClient.js', () => ({
  evaluateMeasure: mockEval,
  fetchEngineCapability: mockCapability,
  populationsFromReport: (r: {
    __p: { denominator: number; numerator: number; denominatorExclusion: number };
  }) => ({
    initialPopulation: 0,
    ...r.__p,
  }),
}));

import {
  MeasurePromotionError,
  promoteMeasureToCqlAuthoritative,
  reconcile,
  updateMeasurePromotionConfig,
} from './measureReconciliation.js';

const PERIOD = { start: '2026-01-01', end: '2026-12-31' };
const CONFIG = {
  measure_artifact_id: 56,
  promotion_mode: 'cql_shadow',
  tolerance: 0,
  evaluator_source: 'qdm-cql',
  authoritative_source: 'sql_bundle',
  require_reconciliation_agreement: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.unsafe.mockReset();
  mockSql.begin.mockImplementation(
    async (cb: (tx: { unsafe: typeof mockSql.unsafe }) => Promise<unknown>) =>
      cb({ unsafe: mockSql.unsafe }),
  );
  mockCapability.mockResolvedValue({
    reachable: true,
    version: 'HAPI-7.4.0',
    software: 'HAPI FHIR',
    fhirVersion: '4.0.1',
  });
});

describe('reconcile', () => {
  it('agrees when SQL and CQL populations match within tolerance', async () => {
    mockSql
      .mockResolvedValueOnce([CONFIG])
      .mockResolvedValueOnce([{ denominator: 80, numerator: 55, exclusion: 5 }]);
    mockEval.mockResolvedValue({
      __p: { denominator: 80, numerator: 55, denominatorExclusion: 5 },
    });
    const r = await reconcile('CMS122v12', PERIOD, { engineUrl: 'http://e/fhir' });
    expect(r.agree).toBe(true);
    expect(r.status).toBe('agree');
    expect(r.promotionMode).toBe('cql_shadow');
    expect(r.measureArtifactId).toBe(56);
    expect(r.reconciliationRunId).toBeNull();
    expect(r.deltas).toEqual({ denominator: 0, numerator: 0, exclusion: 0 });
    const query = (mockSql.mock.calls[1]?.[0] as TemplateStringsArray).join('');
    expect(query).toContain("fr.source = 'sql_bundle'");
    expect(query).toContain("fr.evaluation_scope = 'full_population'");
    expect(query).toContain("fr.reconciliation_status = 'authoritative'");
  });

  it('captures the engine version on the result and persists it in metadata', async () => {
    mockSql
      .mockResolvedValueOnce([CONFIG])
      .mockResolvedValueOnce([{ denominator: 80, numerator: 55, exclusion: 5 }])
      .mockResolvedValueOnce([{ id: 7100 }]);
    mockEval.mockResolvedValue({
      __p: { denominator: 80, numerator: 55, denominatorExclusion: 5 },
    });

    const r = await reconcile('CMS122v12', PERIOD, {
      engineUrl: 'http://e/fhir',
      persist: true,
    });

    expect(r.engineVersion).toBe('HAPI-7.4.0');
    expect(mockCapability).toHaveBeenCalledWith('http://e/fhir');
    // The persisted run's metadata template value carries the engine version.
    const insertValues = mockSql.mock.calls[2] ?? [];
    const flattened = JSON.stringify(insertValues);
    expect(flattened).toContain('HAPI-7.4.0');
  });

  it('records a null engine version (no throw) when the engine /metadata is unreachable', async () => {
    mockCapability.mockResolvedValue({
      reachable: false,
      version: null,
      software: null,
      fhirVersion: null,
      error: 'ECONNREFUSED',
    });
    mockSql
      .mockResolvedValueOnce([CONFIG])
      .mockResolvedValueOnce([{ denominator: 80, numerator: 55, exclusion: 5 }]);
    mockEval.mockResolvedValue({
      __p: { denominator: 80, numerator: 55, denominatorExclusion: 5 },
    });

    const r = await reconcile('CMS122v12', PERIOD, { engineUrl: 'http://e/fhir' });
    expect(r.engineVersion).toBeNull();
    expect(r.agree).toBe(true);
  });

  it('disagrees and reports deltas', async () => {
    mockSql
      .mockResolvedValueOnce([CONFIG])
      .mockResolvedValueOnce([{ denominator: 80, numerator: 55, exclusion: 5 }]);
    mockEval.mockResolvedValue({
      __p: { denominator: 80, numerator: 40, denominatorExclusion: 5 },
    });
    const r = await reconcile('CMS122v12', PERIOD, { engineUrl: 'http://e/fhir' });
    expect(r.agree).toBe(false);
    expect(r.status).toBe('drift');
    expect(r.deltas.numerator).toBe(15);
  });

  it('honors a non-zero tolerance', async () => {
    mockSql
      .mockResolvedValueOnce([{ ...CONFIG, tolerance: 1 }])
      .mockResolvedValueOnce([{ denominator: 80, numerator: 55, exclusion: 5 }]);
    mockEval.mockResolvedValue({
      __p: { denominator: 80, numerator: 53, denominatorExclusion: 5 },
    });
    const r = await reconcile('CMS122v12', PERIOD, { engineUrl: 'http://e/fhir', tolerance: 2 });
    expect(r.agree).toBe(true);
    expect(r.tolerance).toBe(2);
  });

  it('treats a missing SQL row as zero counts', async () => {
    mockSql
      .mockResolvedValueOnce([{ ...CONFIG, measure_artifact_id: null, promotion_mode: 'sql_only' }])
      .mockResolvedValueOnce([]);
    mockEval.mockResolvedValue({ __p: { denominator: 0, numerator: 0, denominatorExclusion: 0 } });
    const r = await reconcile('UNKNOWN', PERIOD, { engineUrl: 'http://e/fhir' });
    expect(r.sql).toEqual({ denominator: 0, numerator: 0, exclusion: 0 });
    expect(r.agree).toBe(true);
    expect(r.promotionMode).toBe('sql_only');
  });

  it('persists an append-only reconciliation run when requested', async () => {
    mockSql
      .mockResolvedValueOnce([CONFIG])
      .mockResolvedValueOnce([{ denominator: 80, numerator: 55, exclusion: 5 }])
      .mockResolvedValueOnce([{ id: 7001 }]);
    mockEval.mockResolvedValue({
      __p: { denominator: 80, numerator: 40, denominatorExclusion: 5 },
    });

    const r = await reconcile('CMS122v12', PERIOD, {
      engineUrl: 'http://e/fhir',
      engineMeasureId: 'CMS122FHIR',
      persist: true,
      metadata: { source: 'unit-test' },
    });

    expect(r.reconciliationRunId).toBe(7001);
    expect(r.status).toBe('drift');
    const insertQuery = (mockSql.mock.calls[2]?.[0] as TemplateStringsArray).join('');
    expect(insertQuery).toContain('INSERT INTO phm_edw.measure_reconciliation_run');
    expect(mockSql.json).toHaveBeenCalledWith({ denominator: 80, numerator: 55, exclusion: 5 });
    expect(mockSql.json).toHaveBeenCalledWith({ denominator: 80, numerator: 40, exclusion: 5 });
    expect(mockSql.json).toHaveBeenCalledWith({ denominator: 0, numerator: 15, exclusion: 0 });
  });

  it('scopes SQL counts to the loaded patient cohort and marks the run ineligible for promotion', async () => {
    mockSql
      .mockResolvedValueOnce([CONFIG])
      .mockResolvedValueOnce([{ denominator: 1, numerator: 0, exclusion: 0 }])
      .mockResolvedValueOnce([{ id: 7002 }]);
    mockEval.mockResolvedValue({ __p: { denominator: 1, numerator: 0, denominatorExclusion: 0 } });

    const r = await reconcile('CMS122v12', PERIOD, {
      engineUrl: 'http://e/fhir',
      persist: true,
      scope: { evaluationScope: 'scoped_subjects', patientIds: [9] },
    });

    expect(r.agree).toBe(true);
    expect(r.evaluationScope).toBe('scoped_subjects');
    expect(r.promotionEligible).toBe(false);
    const scopedQuery = (mockSql.mock.calls[1]?.[0] as TemplateStringsArray).join('');
    expect(scopedQuery).toContain('JOIN phm_star.dim_patient dp');
    expect(scopedQuery).toContain('dp.patient_id = ANY');
    const insertQuery = (mockSql.mock.calls[2]?.[0] as TemplateStringsArray).join('');
    expect(insertQuery).toContain('evaluation_scope');
    expect(insertQuery).toContain('promotion_eligible');
    expect(insertQuery).toContain('cql_measure_report_id');
  });

  it('does not mark full-population drift runs promotion eligible even when requested', async () => {
    mockSql
      .mockResolvedValueOnce([CONFIG])
      .mockResolvedValueOnce([{ denominator: 256, numerator: 58, exclusion: 0 }])
      .mockResolvedValueOnce([{ id: 7003 }]);
    mockEval.mockResolvedValue({ __p: { denominator: 17, numerator: 0, denominatorExclusion: 0 } });

    const r = await reconcile('CMS122v12', PERIOD, {
      engineUrl: 'http://e/fhir',
      persist: true,
      cqlMeasureReportId: 9001,
      scope: { evaluationScope: 'full_population', patientIds: [9], promotionEligible: true },
    });

    expect(r.agree).toBe(false);
    expect(r.status).toBe('drift');
    expect(r.evaluationScope).toBe('full_population');
    expect(r.promotionEligible).toBe(false);
  });
});

describe('updateMeasurePromotionConfig', () => {
  it('does not allow direct cql_authoritative config patches', async () => {
    await expect(
      updateMeasurePromotionConfig({
        measureCode: 'CMS122v12',
        promotionMode: 'cql_authoritative',
      }),
    ).rejects.toMatchObject({
      code: 'PROMOTION_REQUIRES_ACCEPTED_RECONCILIATION',
      statusCode: 400,
    });

    expect(mockSql).not.toHaveBeenCalled();
  });

  it('updates a measure into CQL shadow mode', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ...CONFIG,
        measure_code: 'CMS122v12',
        promotion_mode: 'cql_shadow',
        enabled_at: null,
        updated_at: '2026-06-18T12:00:00Z',
        metadata: { source: 'unit-test' },
        latest_reconciliation_run_id: null,
      },
    ]);

    const config = await updateMeasurePromotionConfig({
      measureCode: 'CMS122v12',
      promotionMode: 'cql_shadow',
      tolerance: 1,
      metadata: { source: 'unit-test' },
    });

    expect(config.promotionMode).toBe('cql_shadow');
    expect(config.authoritativeSource).toBe('sql_bundle');
    const query = (mockSql.mock.calls[0]?.[0] as TemplateStringsArray).join('');
    expect(query).toContain('INSERT INTO phm_edw.measure_promotion_config');
    expect(query).toContain('ON CONFLICT (measure_code)');
  });
});

describe('promoteMeasureToCqlAuthoritative', () => {
  const CONFIG_STATE = {
    measure_code: 'CMS122v12',
    measure_artifact_id: 56,
    latest_measure_artifact_id: 56,
    promotion_mode: 'cql_shadow',
    tolerance: 0,
    evaluator_source: 'qdm-cql',
    authoritative_source: 'sql_bundle',
    require_reconciliation_agreement: true,
    metadata: {},
  };
  const ACCEPTED_RUN = {
    id: 7001,
    measure_artifact_id: 56,
    period_start: '2026-01-01',
    period_end: '2026-12-31',
    engine_measure_id: 'CMS122FHIR',
    promotion_mode: 'cql_shadow',
    evaluation_scope: 'full_population',
    promotion_eligible: true,
    cql_measure_report_id: 9001,
    tolerance: 0,
    agree: true,
    status: 'agree',
    cql_denominator: 1,
    cql_numerator: 1,
    cql_exclusion: 0,
    delta_denominator: 0,
    delta_numerator: 0,
    delta_exclusion: 0,
    deltas: { denominator: 0, numerator: 0, exclusion: 0 },
    computed_at: '2026-06-18T12:00:00Z',
  };
  const REPORT = {
    id: 9001,
    measure_code: 'CMS122v12',
    period_start: '2026-01-01',
    period_end: '2026-12-31',
    report_type: 'population',
    initial_population: 1,
    denominator: 1,
    numerator: 1,
    denominator_exclusion: 0,
    source: 'qdm-cql',
    computed_at: '2026-06-18T12:01:00Z',
  };
  const COVERAGE = {
    evidence_rows_seen: 1,
    evidence_rows_promotable: 1,
    distinct_patient_keys: 1,
    distinct_measure_keys: 1,
  };
  const MATERIALIZATION_COUNTS = {
    evidence_rows_seen: 1,
    evidence_rows_promoted: 1,
    evidence_rows_skipped: 0,
    result_rows_upserted: 1,
    qdm_evidence_selected: 2,
    bridge_rows_upserted: 2,
    fact_evidence_rows_upserted: 2,
  };

  it('promotes only after accepted reconciliation and persisted evidence coverage', async () => {
    mockSql.unsafe
      .mockResolvedValueOnce([CONFIG_STATE])
      .mockResolvedValueOnce([ACCEPTED_RUN])
      .mockResolvedValueOnce([REPORT])
      .mockResolvedValueOnce([COVERAGE])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([MATERIALIZATION_COUNTS])
      .mockResolvedValueOnce([{ rows_promoted: 1 }])
      .mockResolvedValueOnce([
        {
          ...CONFIG_STATE,
          promotion_mode: 'cql_authoritative',
          authoritative_source: 'qdm-cql',
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await promoteMeasureToCqlAuthoritative({
      measureCode: 'CMS122v12',
      reconciliationRunId: 7001,
      measureReportId: 9001,
      actorId: '00000000-0000-4000-8000-000000000001',
    });

    expect(result.rowsPromoted).toBe(1);
    expect(result.config.promotionMode).toBe('cql_authoritative');
    expect(result.config.authoritativeSource).toBe('qdm-cql');
    expect(result.materialization?.evaluationScope).toBe('full_population');
    const queries = mockSql.unsafe.mock.calls.map(([query]) => query as string);
    expect(queries.some((query) => query.includes('FOR UPDATE OF mpc'))).toBe(true);
    expect(queries.some((query) => query.includes("promotion_mode = 'cql_authoritative'"))).toBe(
      true,
    );
    expect(queries.some((query) => query.includes('measure_reconciliation_run'))).toBe(true);
  });

  it('rejects drift reconciliation runs before materializing rows', async () => {
    mockSql.unsafe.mockResolvedValueOnce([CONFIG_STATE]).mockResolvedValueOnce([
      {
        ...ACCEPTED_RUN,
        agree: false,
        status: 'drift',
        delta_denominator: 1,
      },
    ]);

    await expect(
      promoteMeasureToCqlAuthoritative({
        measureCode: 'CMS122v12',
        reconciliationRunId: 7001,
        measureReportId: 9001,
      }),
    ).rejects.toBeInstanceOf(MeasurePromotionError);

    expect(mockSql.unsafe).toHaveBeenCalledTimes(2);
  });

  it('rejects scoped reconciliation runs before materializing rows', async () => {
    mockSql.unsafe.mockResolvedValueOnce([CONFIG_STATE]).mockResolvedValueOnce([
      {
        ...ACCEPTED_RUN,
        evaluation_scope: 'scoped_subjects',
        promotion_eligible: false,
      },
    ]);

    await expect(
      promoteMeasureToCqlAuthoritative({
        measureCode: 'CMS122v12',
        reconciliationRunId: 7001,
        measureReportId: 9001,
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_NOT_PROMOTION_ELIGIBLE' });

    expect(mockSql.unsafe).toHaveBeenCalledTimes(2);
  });

  it('supports dry-run validation without changing star rows or config', async () => {
    mockSql.unsafe
      .mockResolvedValueOnce([CONFIG_STATE])
      .mockResolvedValueOnce([ACCEPTED_RUN])
      .mockResolvedValueOnce([REPORT])
      .mockResolvedValueOnce([COVERAGE]);

    const result = await promoteMeasureToCqlAuthoritative({
      measureCode: 'CMS122v12',
      reconciliationRunId: 7001,
      measureReportId: 9001,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.rowsPromoted).toBe(0);
    expect(result.materialization).toBeNull();
    expect(mockSql.unsafe).toHaveBeenCalledTimes(4);
  });
});
