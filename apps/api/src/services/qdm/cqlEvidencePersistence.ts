// =============================================================================
// Medgnosis API - QDM-backed CQL evidence persistence
// Persists bounded CQL population + subject outcomes beside QDM event summaries
// so the analytics bridge can reconcile CQL/QDM results before fact promotion.
// =============================================================================

import { sql } from '@medgnosis/db';
import {
  evaluateMeasure,
  populationsFromReport,
  type FhirMeasureReport,
  type MeasurePopulations,
} from '../fhir/cqlEngineClient.js';
import {
  persistMeasureEvidenceRows,
  persistMeasureReport,
  type MeasureEvidenceRow,
} from '../measureReportStore.js';
import type { QdmElement } from './model.js';
import { qdmElementToQiCore } from './qdmToQiCore.js';

const DEFAULT_ENGINE_URL = 'http://cql-engine:8080/fhir';
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;
const DEFAULT_EVIDENCE_LIMIT_PER_PATIENT = 100;
const MAX_EVIDENCE_LIMIT_PER_PATIENT = 500;
const DEFAULT_SOURCE = 'qdm-cql';

type UnsafeParameter = NonNullable<Parameters<typeof sql.unsafe>[1]>[number];

export interface PersistQdmCqlMeasureEvidenceInput {
  engineBaseUrl?: string;
  measureCode: string;
  engineMeasureId: string;
  periodStart: string;
  periodEnd: string;
  ehrTenantId?: number;
  orgId?: number | null;
  patientIds?: readonly number[];
  patientRefs?: readonly string[];
  limit?: number;
  evidenceLimitPerPatient?: number;
  source?: string;
  continueOnSubjectFailure?: boolean;
}

export interface QdmMeasureEvidenceSummary {
  qdmEventId: number;
  qdmDatatype: string;
  qdmCategory: string;
  codeSystem: string | null;
  code: string | null;
  codeDisplay: string | null;
  valueSetOid: string | null;
  populationRole: string;
  relevantStartAt: string | null;
  relevantEndAt: string | null;
  sourceTable: string | null;
  sourceId: number | null;
}

export interface PersistedQdmCqlPopulation {
  initialPopulation: number;
  denominator: number;
  numerator: number;
  denominatorExclusion: number;
  score: number | null;
}

export interface QdmCqlSubjectFailure {
  patientId: number | null;
  patientRef: string | null;
  subject: string | null;
  reason: string;
}

export interface PersistQdmCqlMeasureEvidenceResult {
  measureReportId: number;
  population: PersistedQdmCqlPopulation;
  subjectsSelected: number;
  subjectsEvaluated: number;
  evidenceRowsPersisted: number;
  qdmEvidenceSelected: number;
  subjectFailures: QdmCqlSubjectFailure[];
}

interface SubjectRow {
  qdm_event_id: number | string;
  patient_id: number | string | null;
  patient_ref: string | null;
  patient_key: number | string | null;
  measure_key: number | string | null;
  source_payload: unknown;
}

interface SubjectForEvaluation {
  patientId: number | null;
  patientRef: string | null;
  patientKey: number | null;
  measureKey: number | null;
  subject: string;
}

interface EvidenceRow {
  subject_patient_id: number | string | null;
  subject_patient_ref: string | null;
  qdm_event_id: number | string;
  qdm_datatype: string;
  qdm_category: string;
  code_system: string | null;
  code: string | null;
  code_display: string | null;
  value_set_oid: string | null;
  population_role: string | null;
  relevant_start_at: string | null;
  relevant_end_at: string | null;
  source_table: string | null;
  source_id: number | string | null;
}

export async function persistQdmCqlMeasureEvidence(
  input: PersistQdmCqlMeasureEvidenceInput,
): Promise<PersistQdmCqlMeasureEvidenceResult> {
  const period = normalizePeriod(input.periodStart, input.periodEnd);
  const measureCode = normalizeRequired(input.measureCode, 'measureCode');
  const engineMeasureId = normalizeRequired(input.engineMeasureId, 'engineMeasureId');
  const source = normalizeSource(input.source ?? DEFAULT_SOURCE);
  validateBoundedSubjects(input);

  const populationReport = await evaluateMeasure(engineUrl(input), engineMeasureId, {
    periodStart: period.start,
    periodEnd: period.end,
    reportType: 'population',
  });
  const measureReportId = await persistMeasureReport(measureCode, period, populationReport, {
    reportType: 'population',
    source,
  });

  const subjects = subjectsFromRows(await selectSubjectRows(input, measureCode));
  const evidenceBySubject = evidenceBySubjectKey(
    await selectEvidenceRows(input, measureCode, period, subjects),
  );
  const evidenceRows: MeasureEvidenceRow[] = [];
  const subjectFailures: QdmCqlSubjectFailure[] = [];
  let subjectsEvaluated = 0;

  for (const subject of subjects) {
    try {
      const subjectReport = await evaluateMeasure(engineUrl(input), engineMeasureId, {
        periodStart: period.start,
        periodEnd: period.end,
        reportType: 'subject',
        subject: subject.subject,
      });
      subjectsEvaluated += 1;
      const populations = populationsFromReport(subjectReport);
      evidenceRows.push({
        measureCode,
        patientId: subject.patientId,
        patientRef: subject.patientRef,
        patientKey: subject.patientKey,
        measureKey: subject.measureKey,
        periodStart: period.start,
        periodEnd: period.end,
        denominatorFlag: populations.denominator > 0,
        numeratorFlag: populations.numerator > 0,
        exclusionFlag: populations.denominatorExclusion > 0,
        measureValue: scoreFromReport(subjectReport),
        source,
        qdmEvidence: evidenceBySubject.get(subjectKey(subject.patientId, subject.patientRef)) ?? [],
        fhirSubjectReport: subjectReport,
      });
    } catch (error) {
      const failure = {
        patientId: subject.patientId,
        patientRef: subject.patientRef,
        subject: subject.subject,
        reason: error instanceof Error ? error.message : String(error),
      };
      subjectFailures.push(failure);
      if (!input.continueOnSubjectFailure) {
        throw new Error(`CQL subject evaluation failed for ${subject.subject}: ${failure.reason}`);
      }
    }
  }

  const persisted = await persistMeasureEvidenceRows(measureReportId, evidenceRows);
  const populations = populationsFromReport(populationReport);

  return {
    measureReportId,
    population: withScore(populations, populationReport),
    subjectsSelected: subjects.length,
    subjectsEvaluated,
    evidenceRowsPersisted: persisted.rowCount,
    qdmEvidenceSelected: Array.from(evidenceBySubject.values()).reduce((sum, rows) => sum + rows.length, 0),
    subjectFailures,
  };
}

async function selectSubjectRows(
  input: PersistQdmCqlMeasureEvidenceInput,
  measureCode: string,
): Promise<SubjectRow[]> {
  const parameters: UnsafeParameter[] = [measureCode as UnsafeParameter];
  const clauses = ["qe.qdm_datatype = 'Patient'", 'qe.source_payload IS NOT NULL'];
  const addParam = (value: unknown): string => {
    parameters.push(value as UnsafeParameter);
    return `$${parameters.length}`;
  };

  if (input.ehrTenantId !== undefined) {
    clauses.push(`qe.ehr_tenant_id = ${addParam(input.ehrTenantId)}::bigint`);
  }
  if (input.orgId !== undefined) {
    clauses.push(`qe.org_id IS NOT DISTINCT FROM ${addParam(input.orgId)}::int`);
  }
  const patientIds = normalizePositiveInts(input.patientIds ?? []);
  if (patientIds.length > 0) {
    clauses.push(`qe.patient_id = ANY(${addParam(patientIds)}::int[])`);
  }
  const patientRefs = normalizeStrings(input.patientRefs ?? []);
  if (patientRefs.length > 0) {
    const refParam = addParam(patientRefs);
    clauses.push(`(
      qe.patient_ref = ANY(${refParam}::text[])
      OR qe.source_payload #>> '{subject,reference}' = ANY(${refParam}::text[])
      OR qe.source_payload #>> '{source,reference}' = ANY(${refParam}::text[])
    )`);
  }

  const limitParam = addParam(clampLimit(input.limit));
  return sql.unsafe<SubjectRow[]>(
    `
    SELECT DISTINCT ON (
      COALESCE(qe.patient_id::text, qe.patient_ref, qe.source_payload #>> '{subject,reference}')
    )
      qe.qdm_event_id,
      qe.patient_id,
      qe.patient_ref,
      dp.patient_key,
      dm.measure_key,
      qe.source_payload
    FROM phm_edw.qdm_event qe
    LEFT JOIN phm_star.dim_patient dp
      ON dp.patient_id = qe.patient_id
     AND dp.is_current = TRUE
    LEFT JOIN phm_star.dim_measure dm
      ON dm.measure_code = $1
    WHERE ${clauses.join('\n      AND ')}
    ORDER BY
      COALESCE(qe.patient_id::text, qe.patient_ref, qe.source_payload #>> '{subject,reference}'),
      qe.qdm_event_id
    LIMIT ${limitParam}
    `,
    parameters,
  );
}

async function selectEvidenceRows(
  input: PersistQdmCqlMeasureEvidenceInput,
  measureCode: string,
  period: { start: string; end: string },
  subjects: readonly SubjectForEvaluation[],
): Promise<EvidenceRow[]> {
  if (subjects.length === 0) return [];

  const subjectScope = subjects.map((subject) => ({
    patient_id: subject.patientId,
    patient_ref: subject.patientRef,
  }));

  return sql.unsafe<EvidenceRow[]>(
    `
    WITH subject_scope AS (
      SELECT *
      FROM jsonb_to_recordset($2::text::jsonb) AS s(patient_id int, patient_ref text)
    ),
    measure_sets AS (
      SELECT
        mv.value_set_oid,
        mv.population_role,
        vc.code_system,
        vc.code
      FROM phm_edw.measure_definition md
      JOIN phm_edw.measure_value_set mv
        ON mv.measure_id = md.measure_id
      JOIN phm_edw.vsac_value_set_code vc
        ON vc.value_set_oid = mv.value_set_oid
      WHERE md.measure_code = $1
    )
    SELECT
      evidence.subject_patient_id,
      evidence.subject_patient_ref,
      evidence.qdm_event_id,
      evidence.qdm_datatype,
      evidence.qdm_category,
      evidence.code_system,
      evidence.code,
      evidence.code_display,
      evidence.value_set_oid,
      evidence.population_role,
      evidence.relevant_start_at::text AS relevant_start_at,
      evidence.relevant_end_at::text AS relevant_end_at,
      evidence.source_table,
      evidence.source_id
    FROM subject_scope s
    JOIN LATERAL (
      SELECT
        s.patient_id AS subject_patient_id,
        s.patient_ref AS subject_patient_ref,
        qe.qdm_event_id,
        qe.qdm_datatype,
        qe.qdm_category,
        qe.code_system,
        qe.code,
        qe.code_display,
        ms.value_set_oid,
        COALESCE(ms.population_role, 'unclassified') AS population_role,
        qe.relevant_start_at,
        qe.relevant_end_at,
        qe.source_table,
        qe.source_id
      FROM phm_edw.qdm_event qe
      LEFT JOIN measure_sets ms
        ON ms.code = qe.code
       AND ms.code_system = CASE lower(coalesce(qe.code_system, ''))
             WHEN 'http://snomed.info/sct' THEN 'SNOMEDCT'
             WHEN 'snomed' THEN 'SNOMEDCT'
             WHEN 'snomedct' THEN 'SNOMEDCT'
             WHEN 'http://loinc.org' THEN 'LOINC'
             WHEN 'loinc' THEN 'LOINC'
             WHEN 'http://www.nlm.nih.gov/research/umls/rxnorm' THEN 'RXNORM'
             WHEN 'rxnorm' THEN 'RXNORM'
             WHEN 'http://www.ama-assn.org/go/cpt' THEN 'CPT'
             WHEN 'cpt' THEN 'CPT'
             ELSE qe.code_system
           END
      WHERE qe.qdm_datatype <> 'Patient'
        AND (
          (s.patient_id IS NOT NULL AND qe.patient_id = s.patient_id)
          OR (
            s.patient_ref IS NOT NULL
            AND (
              qe.patient_ref = s.patient_ref
              OR qe.source_payload #>> '{subject,reference}' = s.patient_ref
              OR qe.source_payload #>> '{source,reference}' = s.patient_ref
            )
          )
        )
        AND ($3::date IS NULL OR qe.relevant_end_at IS NULL OR qe.relevant_end_at::date >= $3::date)
        AND ($4::date IS NULL OR qe.relevant_start_at IS NULL OR qe.relevant_start_at::date <= $4::date)
      ORDER BY
        CASE WHEN ms.population_role IS NULL OR ms.population_role = 'unclassified' THEN 1 ELSE 0 END,
        qe.relevant_start_at NULLS LAST,
        qe.qdm_event_id
      LIMIT $5
    ) evidence ON true
    ORDER BY evidence.subject_patient_id NULLS LAST, evidence.subject_patient_ref NULLS LAST, evidence.qdm_event_id
    `,
    [
      measureCode,
      JSON.stringify(subjectScope),
      period.start,
      period.end,
      clampEvidenceLimit(input.evidenceLimitPerPatient),
    ],
  );
}

function subjectsFromRows(rows: readonly SubjectRow[]): SubjectForEvaluation[] {
  const subjects: SubjectForEvaluation[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const qdm = qdmElementFromRow(row.source_payload);
    const subject = qdm ? subjectReferenceFromQdm(qdm) : null;
    if (!subject || seen.has(subject)) continue;
    seen.add(subject);
    subjects.push({
      patientId: toNumber(row.patient_id),
      patientRef: row.patient_ref,
      patientKey: toNumber(row.patient_key),
      measureKey: toNumber(row.measure_key),
      subject,
    });
  }
  return subjects;
}

function evidenceBySubjectKey(rows: readonly EvidenceRow[]): Map<string, QdmMeasureEvidenceSummary[]> {
  const grouped = new Map<string, QdmMeasureEvidenceSummary[]>();
  for (const row of rows) {
    const key = subjectKey(toNumber(row.subject_patient_id), row.subject_patient_ref);
    const evidence = grouped.get(key) ?? [];
    evidence.push({
      qdmEventId: Number(row.qdm_event_id),
      qdmDatatype: row.qdm_datatype,
      qdmCategory: row.qdm_category,
      codeSystem: row.code_system,
      code: row.code,
      codeDisplay: row.code_display,
      valueSetOid: row.value_set_oid,
      populationRole: row.population_role ?? 'unclassified',
      relevantStartAt: row.relevant_start_at,
      relevantEndAt: row.relevant_end_at,
      sourceTable: row.source_table,
      sourceId: toNumber(row.source_id),
    });
    grouped.set(key, evidence);
  }
  return grouped;
}

function subjectReferenceFromQdm(qdm: QdmElement): string | null {
  const resource = qdmElementToQiCore(qdm);
  if (!resource || resource.resourceType !== 'Patient' || typeof resource.id !== 'string') {
    return null;
  }
  return `Patient/${resource.id}`;
}

function qdmElementFromRow(value: unknown): QdmElement | null {
  if (!isRecord(value)) return null;
  if (typeof value['id'] !== 'string') return null;
  if (value['qdmVersion'] !== '5.6') return null;
  if (value['category'] !== 'Patient') return null;
  if (value['datatype'] !== 'Patient') return null;
  if (!isRecord(value['timing']) || !isRecord(value['attributes']) || !isRecord(value['source'])) {
    return null;
  }
  return value as unknown as QdmElement;
}

function withScore(populations: MeasurePopulations, report: FhirMeasureReport): PersistedQdmCqlPopulation {
  return {
    ...populations,
    score: scoreFromReport(report),
  };
}

function scoreFromReport(report: FhirMeasureReport): number | null {
  return report.group?.[0]?.measureScore?.value ?? null;
}

function validateBoundedSubjects(input: PersistQdmCqlMeasureEvidenceInput): void {
  if (
    normalizePositiveInts(input.patientIds ?? []).length === 0 &&
    normalizeStrings(input.patientRefs ?? []).length === 0
  ) {
    throw new Error('QDM CQL evidence persistence requires patientIds or patientRefs');
  }
}

function normalizePeriod(periodStart: string, periodEnd: string): { start: string; end: string } {
  const start = normalizeRequired(periodStart, 'periodStart');
  const end = normalizeRequired(periodEnd, 'periodEnd');
  if (Date.parse(start) > Date.parse(end)) {
    throw new Error('periodEnd must be on or after periodStart');
  }
  return { start, end };
}

function normalizeRequired(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
}

function normalizeSource(value: string): string {
  const source = normalizeRequired(value, 'source');
  if (source.length > 20) {
    throw new Error('source must be 20 characters or fewer for phm_edw.measure_report');
  }
  return source;
}

function engineUrl(input: PersistQdmCqlMeasureEvidenceInput): string {
  return input.engineBaseUrl ?? process.env['CQL_ENGINE_URL'] ?? DEFAULT_ENGINE_URL;
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT));
}

function clampEvidenceLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? DEFAULT_EVIDENCE_LIMIT_PER_PATIENT, MAX_EVIDENCE_LIMIT_PER_PATIENT));
}

function normalizePositiveInts(values: readonly number[]): number[] {
  return Array.from(
    new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0)),
  );
}

function normalizeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function subjectKey(patientId: number | null, patientRef: string | null): string {
  if (patientId !== null) return `patient-id:${patientId}`;
  return `patient-ref:${patientRef ?? ''}`;
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
