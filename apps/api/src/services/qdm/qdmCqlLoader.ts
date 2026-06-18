// =============================================================================
// Medgnosis API - QDM-backed CQL engine loader
// Selects a bounded set of persisted QDM events, projects them to QI-Core, and
// loads the resulting transaction Bundle into the clinical-reasoning sidecar.
// =============================================================================

import { sql } from '@medgnosis/db';
import type { LoadResult } from '../cqlEngineLoader.js';
import { loadBundle } from '../cqlEngineLoader.js';
import type { TransactionBundle, TransactionBundleEntry } from '../fhir/qicoreExport.js';
import type { QdmElement } from './model.js';
import { qdmElementsToQiCoreBundle, type QdmToQiCoreOptions } from './qdmToQiCore.js';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 50_000;

type UnsafeParameter = NonNullable<Parameters<typeof sql.unsafe>[1]>[number];

export interface LoadQdmEventsToCqlEngineInput {
  engineBaseUrl?: string;
  ehrTenantId?: number;
  orgId?: number | null;
  ingestRunId?: string;
  qdmEventIds?: readonly number[];
  patientIds?: readonly number[];
  patientRefs?: readonly string[];
  qdmDatatypes?: readonly string[];
  periodStart?: string;
  periodEnd?: string;
  limit?: number;
  includePatientRecords?: boolean;
  now?: string;
}

export interface QdmCqlBundleBuildResult {
  qdmEventsSelected: number;
  qdmEventsIncluded: number;
  qdmEventsProjected: number;
  qdmEventsSkipped: number;
  bundle: TransactionBundle;
}

export interface LoadQdmEventsToCqlEngineResult extends Omit<QdmCqlBundleBuildResult, 'bundle'> {
  bundleEntries: number;
  load: LoadResult | null;
}

interface QdmEventRow {
  qdm_event_id: number | string;
  patient_id: number | string | null;
  patient_ref: string | null;
  qdm_datatype: string;
  source_payload: unknown;
}

interface SelectQdmEventRowsInput extends LoadQdmEventsToCqlEngineInput {
  onlyPatientDatatype?: boolean;
  forcePatientIds?: readonly number[];
  forcePatientRefs?: readonly string[];
}

export async function buildQdmQiCoreBundleForCql(
  input: LoadQdmEventsToCqlEngineInput = {},
): Promise<QdmCqlBundleBuildResult> {
  validatePeriod(input);

  const selectedRows = await selectQdmEventRows(input);
  const includedRows =
    input.includePatientRecords === false
      ? selectedRows
      : mergeRowsById([
          ...selectedRows,
          ...(await selectPatientRowsForSubjects(selectedRows, input)),
        ]);

  const qdmElements = includedRows
    .map((row) => qdmElementFromRow(row.source_payload))
    .filter((element): element is QdmElement => element !== null);
  const projectedBundle = qdmElementsToQiCoreBundle(qdmElements, qdmOptions(input));
  const bundle = dedupeTransactionBundle(projectedBundle);

  return {
    qdmEventsSelected: selectedRows.length,
    qdmEventsIncluded: includedRows.length,
    qdmEventsProjected: projectedBundle.entry.length,
    qdmEventsSkipped: includedRows.length - projectedBundle.entry.length,
    bundle,
  };
}

export async function loadQdmEventsToCqlEngine(
  input: LoadQdmEventsToCqlEngineInput = {},
): Promise<LoadQdmEventsToCqlEngineResult> {
  const built = await buildQdmQiCoreBundleForCql(input);
  if (built.bundle.entry.length === 0) {
    return {
      qdmEventsSelected: built.qdmEventsSelected,
      qdmEventsIncluded: built.qdmEventsIncluded,
      qdmEventsProjected: built.qdmEventsProjected,
      qdmEventsSkipped: built.qdmEventsSkipped,
      bundleEntries: 0,
      load: null,
    };
  }

  const load = await loadBundle(engineUrl(input), built.bundle);
  return {
    qdmEventsSelected: built.qdmEventsSelected,
    qdmEventsIncluded: built.qdmEventsIncluded,
    qdmEventsProjected: built.qdmEventsProjected,
    qdmEventsSkipped: built.qdmEventsSkipped,
    bundleEntries: built.bundle.entry.length,
    load,
  };
}

function validatePeriod(input: LoadQdmEventsToCqlEngineInput): void {
  if (input.periodStart && input.periodEnd && input.periodEnd < input.periodStart) {
    throw new Error('periodEnd must be on or after periodStart');
  }
}

async function selectQdmEventRows(input: SelectQdmEventRowsInput): Promise<QdmEventRow[]> {
  const limit = clampLimit(input.limit);
  const parameters: UnsafeParameter[] = [];
  const clauses = ['qe.source_payload IS NOT NULL'];

  const addParam = (value: unknown): string => {
    parameters.push(value as UnsafeParameter);
    return `$${parameters.length}`;
  };

  if (input.onlyPatientDatatype) {
    clauses.push("qe.qdm_datatype = 'Patient'");
  }
  if (input.ehrTenantId !== undefined) {
    clauses.push(`qe.ehr_tenant_id = ${addParam(input.ehrTenantId)}::bigint`);
  }
  if (input.orgId !== undefined) {
    clauses.push(`qe.org_id IS NOT DISTINCT FROM ${addParam(input.orgId)}::int`);
  }
  if (input.ingestRunId) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM phm_edw.fhir_ingest_staging fis
        WHERE fis.id = qe.source_staging_id
          AND fis.ingest_run_id = ${addParam(input.ingestRunId)}::uuid
      )
    `);
  }
  if (input.qdmEventIds?.length) {
    clauses.push(
      `qe.qdm_event_id = ANY(${addParam(normalizePositiveInts(input.qdmEventIds))}::bigint[])`,
    );
  }
  if (input.patientIds?.length) {
    clauses.push(
      `qe.patient_id = ANY(${addParam(normalizePositiveInts(input.patientIds))}::int[])`,
    );
  }
  if (input.patientRefs?.length) {
    clauses.push(`qe.patient_ref = ANY(${addParam(normalizeStrings(input.patientRefs))}::text[])`);
  }
  if (input.qdmDatatypes?.length) {
    clauses.push(
      `qe.qdm_datatype = ANY(${addParam(normalizeStrings(input.qdmDatatypes))}::text[])`,
    );
  }
  if (input.periodStart) {
    clauses.push(`(
      qe.qdm_datatype = 'Patient'
      OR qe.relevant_end_at IS NULL
      OR qe.relevant_end_at >= ${addParam(input.periodStart)}::timestamptz
    )`);
  }
  if (input.periodEnd) {
    clauses.push(`(
      qe.qdm_datatype = 'Patient'
      OR qe.relevant_start_at IS NULL
      OR qe.relevant_start_at <= ${addParam(input.periodEnd)}::timestamptz
    )`);
  }

  const forcedSubjectClauses: string[] = [];
  const forcedPatientIds = normalizePositiveInts(input.forcePatientIds ?? []);
  const forcedPatientRefs = normalizeStrings(input.forcePatientRefs ?? []);
  if (forcedPatientIds.length > 0) {
    forcedSubjectClauses.push(`qe.patient_id = ANY(${addParam(forcedPatientIds)}::int[])`);
  }
  if (forcedPatientRefs.length > 0) {
    const refParam = addParam(forcedPatientRefs);
    forcedSubjectClauses.push(`(
      qe.patient_ref = ANY(${refParam}::text[])
      OR qe.source_payload #>> '{subject,reference}' = ANY(${refParam}::text[])
      OR qe.source_payload #>> '{source,reference}' = ANY(${refParam}::text[])
    )`);
  }
  if (forcedSubjectClauses.length > 0) {
    clauses.push(`(${forcedSubjectClauses.join(' OR ')})`);
  }

  parameters.push(limit as UnsafeParameter);
  const limitParam = `$${parameters.length}`;
  return sql.unsafe<QdmEventRow[]>(
    `
    SELECT qe.qdm_event_id,
           qe.patient_id,
           qe.patient_ref,
           qe.qdm_datatype,
           qe.source_payload
    FROM phm_edw.qdm_event qe
    WHERE ${clauses.join('\n      AND ')}
    ORDER BY
      qe.patient_id NULLS LAST,
      qe.patient_ref NULLS LAST,
      CASE WHEN qe.qdm_datatype = 'Patient' THEN 0 ELSE 1 END,
      qe.relevant_start_at NULLS LAST,
      qe.qdm_event_id
    LIMIT ${limitParam}
    `,
    parameters,
  );
}

async function selectPatientRowsForSubjects(
  rows: readonly QdmEventRow[],
  input: LoadQdmEventsToCqlEngineInput,
): Promise<QdmEventRow[]> {
  const patientIds = Array.from(
    new Set(rows.map((row) => toNumber(row.patient_id)).filter((id): id is number => id !== null)),
  );
  const patientRefs = Array.from(new Set(rows.flatMap(patientReferencesForRow)));
  if (patientIds.length === 0 && patientRefs.length === 0) return [];

  return selectQdmEventRows({
    ehrTenantId: input.ehrTenantId,
    orgId: input.orgId,
    limit: input.limit,
    onlyPatientDatatype: true,
    forcePatientIds: patientIds,
    forcePatientRefs: patientRefs,
  });
}

function patientReferencesForRow(row: QdmEventRow): string[] {
  const refs = new Set<string>();
  if (row.patient_ref) refs.add(row.patient_ref);
  const qdm = qdmElementFromRow(row.source_payload);
  if (qdm?.subject?.reference) refs.add(qdm.subject.reference);
  if (qdm?.subject?.id) refs.add(`Patient/${qdm.subject.id}`);
  if (qdm?.source.reference && qdm.source.resourceType === 'Patient')
    refs.add(qdm.source.reference);
  if (qdm?.source.resourceType === 'Patient' && qdm.source.id) refs.add(`Patient/${qdm.source.id}`);
  return Array.from(refs);
}

function qdmElementFromRow(value: unknown): QdmElement | null {
  if (!isRecord(value)) return null;
  if (typeof value['id'] !== 'string') return null;
  if (value['qdmVersion'] !== '5.6') return null;
  if (typeof value['category'] !== 'string' || typeof value['datatype'] !== 'string') return null;
  if (!isRecord(value['timing']) || !isRecord(value['attributes']) || !isRecord(value['source'])) {
    return null;
  }
  return value as unknown as QdmElement;
}

function dedupeTransactionBundle(bundle: TransactionBundle): TransactionBundle {
  const byUrl = new Map<string, TransactionBundleEntry>();
  for (const entry of bundle.entry) {
    byUrl.set(entry.request.url, entry);
  }
  return { ...bundle, entry: Array.from(byUrl.values()) };
}

function mergeRowsById(rows: readonly QdmEventRow[]): QdmEventRow[] {
  const byId = new Map<string, QdmEventRow>();
  for (const row of rows) {
    byId.set(String(row.qdm_event_id), row);
  }
  return Array.from(byId.values());
}

function qdmOptions(input: LoadQdmEventsToCqlEngineInput): QdmToQiCoreOptions | undefined {
  return input.now ? { now: input.now } : undefined;
}

function engineUrl(input: LoadQdmEventsToCqlEngineInput): string {
  return input.engineBaseUrl ?? process.env['CQL_ENGINE_URL'] ?? 'http://cql-engine:8080/fhir';
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT));
}

function normalizePositiveInts(values: readonly number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0)));
}

function normalizeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
