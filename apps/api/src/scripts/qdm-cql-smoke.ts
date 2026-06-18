import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { sql } from '@medgnosis/db';
import { evaluateMeasure, populationsFromReport } from '../services/fhir/cqlEngineClient.js';
import { reconcile, type MeasureReconciliationScope } from '../services/measureReconciliation.js';
import {
  backfillQdmFromEdw,
  loadQdmEventsToCqlEngine,
  persistQdmCqlMeasureEvidence,
  promoteMeasureReportEvidenceToStar,
  upsertMeasureDataCriteriaFromBundle,
} from '../services/qdm/index.js';

const DEFAULT_ENGINE_URL = 'http://localhost:18080/fhir';
const DEFAULT_MEASURE_CODE = 'CMS122v12';
const DEFAULT_ENGINE_MEASURE_ID = 'CMS122FHIRDiabetesAssessGreaterThan9Percent';
const DEFAULT_PERIOD = { start: '2026-01-01', end: '2026-12-31' };
const CMS122_HBA1C_LOINC = [
  '4548-4',
  '4549-2',
  '17855-8',
  '17856-6',
  '41995-2',
  '59261-8',
  '62388-4',
  '71875-9',
];

interface SmokeOptions {
  engineUrl: string;
  measureCode: string;
  engineMeasureId?: string;
  period: { start: string; end: string };
  limit: number;
  qdmEventIds: number[];
  patientIds: number[];
  patientRefs: string[];
  qdmDatatypes: string[];
  includePatientRecords: boolean;
  requireData: boolean;
  runReconcile: boolean;
  persistReconciliation: boolean;
  reconciliationScope: MeasureReconciliationScope;
  reconciliationPromotionEligible: boolean;
  backfillEdw: boolean;
  backfillConditionCodes: string[];
  backfillObservationCodes: string[];
  persistEvidence: boolean;
  evidenceLimitPerPatient?: number;
  evidenceSource: string;
  continueOnSubjectFailure: boolean;
  persistCriteria: boolean;
  replaceCriteria: boolean;
  artifactBundlePath?: string;
  promoteStar: boolean;
  starSource: string;
  qdmRunId?: string;
}

interface MeasureBinding {
  ecqm_id: string | null;
  period_start: string | null;
  period_end: string | null;
}

async function main(): Promise<void> {
  const options = parseOptions(process.env);
  const binding = await resolveMeasureBinding(options.measureCode);
  const engineMeasureId = options.engineMeasureId ?? binding?.ecqm_id ?? DEFAULT_ENGINE_MEASURE_ID;
  const period = {
    start: binding?.period_start ?? options.period.start,
    end: binding?.period_end ?? options.period.end,
  };
  if (options.promoteStar && !options.persistEvidence) {
    throw new Error('QDM_CQL_PROMOTE_STAR=true requires QDM_CQL_PERSIST_EVIDENCE=true');
  }

  console.info('[qdm-cql-smoke] loading QDM-derived QI-Core resources', {
    engineUrl: options.engineUrl,
    measureCode: options.measureCode,
    engineMeasureId,
    period,
    limit: options.limit,
    qdmEventIds: options.qdmEventIds,
    patientIds: options.patientIds,
    patientRefs: options.patientRefs,
    qdmDatatypes: options.qdmDatatypes,
    includePatientRecords: options.includePatientRecords,
    backfillEdw: options.backfillEdw,
    persistCriteria: options.persistCriteria,
    persistEvidence: options.persistEvidence,
    promoteStar: options.promoteStar,
  });

  if (options.backfillEdw) {
    if (options.patientIds.length === 0) {
      throw new Error('QDM_CQL_BACKFILL_EDW=true requires QDM_PATIENT_IDS');
    }
    const backfill = await backfillQdmFromEdw({
      patientIds: options.patientIds,
      periodStart: period.start,
      periodEnd: period.end,
      conditionCodes: emptyToUndefined(options.backfillConditionCodes),
      observationCodes: emptyToUndefined(options.backfillObservationCodes),
      limit: options.limit,
      sourceSystem: 'qdm-cql-smoke',
    });
    console.info('[qdm-cql-smoke] EDW backfill result:', backfill);
  }

  if (options.persistCriteria) {
    if (!options.artifactBundlePath) {
      throw new Error('QDM_CQL_PERSIST_CRITERIA=true requires QDM_CQL_ARTIFACT_BUNDLE');
    }
    const artifactBundle = JSON.parse(
      await readFile(options.artifactBundlePath, 'utf8'),
    ) as unknown;
    const criteria = await upsertMeasureDataCriteriaFromBundle({
      measureCode: options.measureCode,
      bundle: artifactBundle,
      replaceExisting: options.replaceCriteria,
    });
    console.info('[qdm-cql-smoke] persisted measure data criteria:', {
      measureArtifactId: criteria.measureArtifactId,
      libraryId: criteria.libraryId,
      populationExpressions: criteria.populationExpressions.length,
      rowsParsed: criteria.rowsParsed,
      rowsDeleted: criteria.rowsDeleted,
      rowsUpserted: criteria.rowsUpserted,
      warnings: criteria.warnings,
    });
  }

  const load = await loadQdmEventsToCqlEngine({
    engineBaseUrl: options.engineUrl,
    limit: options.limit,
    qdmEventIds: emptyToUndefined(options.qdmEventIds),
    patientIds: emptyToUndefined(options.patientIds),
    patientRefs: emptyToUndefined(options.patientRefs),
    qdmDatatypes: emptyToUndefined(options.qdmDatatypes),
    periodStart: period.start,
    periodEnd: period.end,
    includePatientRecords: options.includePatientRecords,
  });
  console.info('[qdm-cql-smoke] QDM load result:', load);

  if (options.requireData && load.bundleEntries === 0) {
    throw new Error(
      'QDM CQL smoke loaded zero resources; set QDM_CQL_REQUIRE_DATA=false for no-data environments',
    );
  }

  let cqlMeasureReportId: number | null = null;
  if (options.persistEvidence) {
    if (options.patientIds.length === 0 && options.patientRefs.length === 0) {
      throw new Error('QDM_CQL_PERSIST_EVIDENCE=true requires QDM_PATIENT_IDS or QDM_PATIENT_REFS');
    }
    const persisted = await persistQdmCqlMeasureEvidence({
      engineBaseUrl: options.engineUrl,
      measureCode: options.measureCode,
      engineMeasureId,
      periodStart: period.start,
      periodEnd: period.end,
      patientIds: emptyToUndefined(options.patientIds),
      patientRefs: emptyToUndefined(options.patientRefs),
      limit: options.limit,
      evidenceLimitPerPatient: options.evidenceLimitPerPatient,
      source: options.evidenceSource,
      continueOnSubjectFailure: options.continueOnSubjectFailure,
    });
    cqlMeasureReportId = persisted.measureReportId;
    console.info('[qdm-cql-smoke] CQL population result:', persisted.population);
    console.info('[qdm-cql-smoke] persisted QDM CQL evidence:', persisted);

    if (options.promoteStar) {
      const starEvaluationScope = options.reconciliationScope;
      const promoted = await promoteMeasureReportEvidenceToStar({
        measureReportId: persisted.measureReportId,
        evidenceSource: options.evidenceSource,
        starSource: options.starSource,
        qdmRunId: options.qdmRunId,
        evaluationScope: starEvaluationScope,
        reconciliationStatus: starEvaluationScope === 'full_population' ? 'cql_shadow' : 'shadow_pending',
      });
      console.info('[qdm-cql-smoke] promoted QDM CQL evidence to star:', promoted);
    }
  } else {
    const report = await evaluateMeasure(options.engineUrl, engineMeasureId, {
      periodStart: period.start,
      periodEnd: period.end,
      reportType: 'population',
    });
    const populations = populationsFromReport(report);
    const score = report.group?.[0]?.measureScore?.value;
    console.info('[qdm-cql-smoke] CQL population result:', { ...populations, score });
  }

  if (options.runReconcile) {
    const result = await reconcile(options.measureCode, period, {
      engineUrl: options.engineUrl,
      engineMeasureId,
      persist: options.persistReconciliation,
      cqlMeasureReportId,
      scope: {
        evaluationScope: options.reconciliationScope,
        patientIds: options.patientIds,
        patientRefs: options.patientRefs,
        promotionEligible: options.reconciliationPromotionEligible,
      },
      metadata: {
        source: 'qdm-cql-smoke',
        qdmRunId: options.qdmRunId ?? null,
        persistEvidence: options.persistEvidence,
        promoteStar: options.promoteStar,
        reconciliationScope: options.reconciliationScope,
        requestedPromotionEligible: options.reconciliationPromotionEligible,
      },
    });
    console.info('[qdm-cql-smoke] SQL vs CQL:', result);
  }
}

async function resolveMeasureBinding(measureCode: string): Promise<MeasureBinding | null> {
  const [binding] = await sql<MeasureBinding[]>`
    SELECT ecqm_id,
           reporting_period_start::text AS period_start,
           reporting_period_end::text AS period_end
    FROM phm_edw.measure_artifact
    WHERE measure_code = ${measureCode}
      AND ecqm_id IS NOT NULL
    ORDER BY reporting_period_start DESC NULLS LAST
    LIMIT 1
  `;
  return binding ?? null;
}

function parseOptions(env: NodeJS.ProcessEnv): SmokeOptions {
  const period = {
    start: env['QDM_CQL_PERIOD_START'] ?? env['CQL_REPORTING_PERIOD_START'] ?? DEFAULT_PERIOD.start,
    end: env['QDM_CQL_PERIOD_END'] ?? env['CQL_REPORTING_PERIOD_END'] ?? DEFAULT_PERIOD.end,
  };
  if (period.end < period.start)
    throw new Error('QDM_CQL_PERIOD_END must be on or after QDM_CQL_PERIOD_START');

  return {
    engineUrl: env['CQL_ENGINE_URL'] ?? DEFAULT_ENGINE_URL,
    measureCode: env['MEASURE_CODE'] ?? DEFAULT_MEASURE_CODE,
    engineMeasureId: stringValue(env['ENGINE_MEASURE_ID']),
    period,
    limit: positiveInt(env['QDM_CQL_LIMIT']) ?? 500,
    qdmEventIds: intList(env['QDM_EVENT_IDS']),
    patientIds: intList(env['QDM_PATIENT_IDS']),
    patientRefs: stringList(env['QDM_PATIENT_REFS']),
    qdmDatatypes: stringList(env['QDM_DATATYPES']),
    includePatientRecords: env['QDM_CQL_INCLUDE_PATIENTS'] !== 'false',
    requireData: env['QDM_CQL_REQUIRE_DATA'] !== 'false',
    runReconcile: env['QDM_CQL_RECONCILE'] === 'true',
    persistReconciliation: env['QDM_CQL_PERSIST_RECONCILIATION'] !== 'false',
    reconciliationScope: reconciliationScope(env),
    reconciliationPromotionEligible: env['QDM_CQL_PROMOTION_ELIGIBLE'] === 'true',
    backfillEdw: env['QDM_CQL_BACKFILL_EDW'] === 'true',
    backfillConditionCodes: stringList(env['QDM_CONDITION_CODES']),
    backfillObservationCodes:
      stringList(env['QDM_OBSERVATION_CODES']).length > 0
        ? stringList(env['QDM_OBSERVATION_CODES'])
        : CMS122_HBA1C_LOINC,
    persistEvidence: env['QDM_CQL_PERSIST_EVIDENCE'] === 'true',
    evidenceLimitPerPatient: positiveInt(env['QDM_CQL_EVIDENCE_LIMIT_PER_PATIENT']) ?? undefined,
    evidenceSource: env['QDM_CQL_EVIDENCE_SOURCE'] ?? 'qdm-cql-smoke',
    continueOnSubjectFailure: env['QDM_CQL_CONTINUE_ON_SUBJECT_FAILURE'] === 'true',
    persistCriteria: env['QDM_CQL_PERSIST_CRITERIA'] === 'true',
    replaceCriteria: env['QDM_CQL_REPLACE_CRITERIA'] === 'true',
    artifactBundlePath: stringValue(env['QDM_CQL_ARTIFACT_BUNDLE']),
    promoteStar: env['QDM_CQL_PROMOTE_STAR'] === 'true',
    starSource: env['QDM_CQL_STAR_SOURCE'] ?? 'qdm-cql',
    qdmRunId: stringValue(env['QDM_RUN_ID']),
  };
}

function reconciliationScope(env: NodeJS.ProcessEnv): MeasureReconciliationScope {
  const explicit = stringValue(env['QDM_CQL_RECONCILIATION_SCOPE']);
  if (explicit === 'full_population' || explicit === 'scoped_subjects') return explicit;
  if (
    intList(env['QDM_PATIENT_IDS']).length > 0 ||
    stringList(env['QDM_PATIENT_REFS']).length > 0 ||
    intList(env['QDM_EVENT_IDS']).length > 0
  ) {
    return 'scoped_subjects';
  }
  return 'scoped_subjects';
}

function stringValue(value: string | undefined): string | undefined {
  const parsed = value?.trim();
  return parsed || undefined;
}

function stringList(value: string | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function intList(value: string | undefined): number[] {
  return Array.from(
    new Set(
      stringList(value)
        .map((item) => Number(item))
        .filter((item) => Number.isSafeInteger(item) && item > 0),
    ),
  );
}

function positiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function emptyToUndefined<T>(items: T[]): T[] | undefined {
  return items.length > 0 ? items : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .catch((error) => {
      console.error(
        '[qdm-cql-smoke] FAILED:',
        error instanceof Error && error.message.length > 0 ? error.message : error,
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await sql.end({ timeout: 1 });
      } catch {
        /* ignore */
      }
    });
}
