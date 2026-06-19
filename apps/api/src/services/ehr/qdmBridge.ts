// =============================================================================
// Medgnosis API - staged FHIR to QDM bridge
// Replays phm_edw.fhir_ingest_staging rows into the canonical QDM event spine.
// =============================================================================

import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { sql } from '@medgnosis/db';
import type { FhirResource } from './types.js';
import { normalizeFhirToQdm, type QdmElement, type QdmNormalizationContext } from '../qdm/index.js';

const QDM_MAPPING_VERSION = 'qdm-v5.6-foundation-1';
const DEFAULT_LIMIT = 500;

export interface NormalizeStagedRunToQdmInput {
  ingestRunId: string;
  ehrTenantId?: number;
  orgId?: number | null;
  limit?: number;
  sourceSystem?: string;
}

export interface NormalizeStagedRunToQdmError {
  stagingId: number;
  resourceType: string;
  resourceId: string;
  message: string;
}

export interface NormalizeStagedRunToQdmResult {
  resourcesSeen: number;
  resourcesNormalized: number;
  resourcesSkipped: number;
  resourcesFailed: number;
  eventsUpserted: number;
  errors: NormalizeStagedRunToQdmError[];
}

export interface StagedFhirResourceRow {
  id: number | string;
  org_id: number | string | null;
  ehr_tenant_id: number | string;
  ingest_run_id: string;
  resource_type: string;
  resource_id: string;
  patient_ref: string | null;
  resource: FhirResource;
  source_version_id: string | null;
  source_last_updated: string | null;
  content_hash: string | null;
}

interface QdmEventUpsertInput {
  qdmEventKey: string;
  orgId: number | null;
  patientId: number | null;
  patientRef: string | null;
  encounterId: number | null;
  providerId: number | null;
  ehrTenantId: number;
  sourceStagingId: number;
  sourceHash: string | null;
  qdmCategory: string;
  qdmDatatype: string;
  qdmStatus: string | null;
  codeSystem: string | null;
  code: string | null;
  codeDisplay: string | null;
  relevantStartAt: string | null;
  relevantEndAt: string | null;
  authorDatetime: string | null;
  resultDatetime: string | null;
  valueNumeric: number | null;
  valueText: string | null;
  valueUnit: string | null;
  negationRationaleCode: string | null;
  negationRationaleSystem: string | null;
  attributes: Record<string, unknown>;
  sourcePayload: QdmElement;
}

type Tx = postgres.TransactionSql;
type UnsafeParameter = NonNullable<Parameters<Tx['unsafe']>[1]>[number];

function asSqlJson(value: unknown): Parameters<typeof sql.json>[0] {
  return value as Parameters<typeof sql.json>[0];
}

function asUnsafeJson(value: unknown): UnsafeParameter {
  return value as UnsafeParameter;
}

export async function normalizeStagedRunToQdm(
  input: NormalizeStagedRunToQdmInput,
): Promise<NormalizeStagedRunToQdmResult> {
  const stagedRows = await findStagedResources(input);
  const result: NormalizeStagedRunToQdmResult = {
    resourcesSeen: stagedRows.length,
    resourcesNormalized: 0,
    resourcesSkipped: 0,
    resourcesFailed: 0,
    eventsUpserted: 0,
    errors: [],
  };

  for (const row of stagedRows) {
    try {
      const eventsUpserted = await normalizeStagedResourceToQdm(row, input);
      if (eventsUpserted === 0) {
        result.resourcesSkipped += 1;
      } else {
        result.resourcesNormalized += 1;
        result.eventsUpserted += eventsUpserted;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.resourcesFailed += 1;
      result.errors.push({
        stagingId: Number(row.id),
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        message,
      });
      await markStagedResourceFailed(Number(row.id), message);
    }
  }

  return result;
}

export function buildQdmEventUpsertInput(
  staged: StagedFhirResourceRow,
  qdm: QdmElement,
  patientId: number | null,
): QdmEventUpsertInput {
  const value = qdm.attributes['value'];
  const quantity = isRecord(value) ? value : undefined;
  const negationRationale = firstCode(qdm.attributes['negationRationale']);
  const timing = qdm.timing;
  const relevantPeriod = timing.relevantPeriod ?? timing.prevalencePeriod;
  const relevantStartAt =
    timing.relevantDateTime ?? relevantPeriod?.start ?? timing.birthDate ?? null;
  const relevantEndAt = relevantPeriod?.end ?? null;

  return {
    qdmEventKey: qdmEventKey(staged, qdm),
    orgId: nullableNumber(staged.org_id),
    patientId,
    patientRef: qdm.subject?.reference ?? staged.patient_ref ?? null,
    encounterId: null,
    providerId: null,
    ehrTenantId: Number(staged.ehr_tenant_id),
    sourceStagingId: Number(staged.id),
    sourceHash: staged.content_hash,
    qdmCategory: qdm.category,
    qdmDatatype: qdm.datatype,
    qdmStatus: qdm.status ?? null,
    codeSystem: qdm.code?.system ?? null,
    code: qdm.code?.code ?? null,
    codeDisplay: qdm.code?.display ?? qdm.code?.text ?? null,
    relevantStartAt,
    relevantEndAt,
    authorDatetime: timing.authorDateTime ?? null,
    resultDatetime: timing.resultDateTime ?? null,
    valueNumeric: typeof quantity?.['value'] === 'number' ? quantity['value'] : null,
    valueText: valueText(value),
    valueUnit: typeof quantity?.['unit'] === 'string' ? quantity['unit'] : null,
    negationRationaleCode: negationRationale?.code ?? null,
    negationRationaleSystem: negationRationale?.system ?? null,
    attributes: qdm.attributes,
    sourcePayload: qdm,
  };
}

function normalizeStagedResourceToQdm(
  row: StagedFhirResourceRow,
  input: NormalizeStagedRunToQdmInput,
): Promise<number> {
  return sql.begin(async (tx) => {
    const patientId = await resolvePatientId(tx, row);
    const context: QdmNormalizationContext = {
      sourceSystem: input.sourceSystem ?? 'fhir-ingest-staging',
      patient: row.patient_ref ? referenceFromString(row.patient_ref) : undefined,
      provenance: {
        ingestRunId: row.ingest_run_id,
        stagingId: Number(row.id),
        ehrTenantId: Number(row.ehr_tenant_id),
        sourceVersionId: row.source_version_id,
        sourceLastUpdated: row.source_last_updated,
        contentHash: row.content_hash,
      },
    };

    const qdmElements = normalizeFhirToQdm(row.resource, context);
    if (qdmElements.length === 0) {
      await markStagedResourceSkipped(tx, Number(row.id), `Unsupported FHIR resourceType: ${row.resource_type}`);
      return 0;
    }

    const resourceCrosswalkId = await upsertResourceCrosswalk(tx, row, patientId);
    let eventsUpserted = 0;
    for (const qdm of qdmElements) {
      const event = await upsertQdmEvent(tx, buildQdmEventUpsertInput(row, qdm, patientId));
      if (eventsUpserted === 0 && resourceCrosswalkId != null && row.resource_type !== 'Patient') {
        await setResourceCrosswalkLocalTarget(tx, resourceCrosswalkId, event.qdm_event_id);
      }
      await upsertFhirQdmCrosswalk(tx, row, event.qdm_event_id, resourceCrosswalkId, qdm);
      eventsUpserted += 1;
    }

    await markStagedResourceNormalized(tx, Number(row.id));
    return eventsUpserted;
  });
}

async function findStagedResources(input: NormalizeStagedRunToQdmInput): Promise<StagedFhirResourceRow[]> {
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, 5000));
  const tenantFilter = input.ehrTenantId ?? null;
  const orgFilter = input.orgId ?? null;

  return sql<StagedFhirResourceRow[]>`
    SELECT id,
           org_id,
           ehr_tenant_id,
           ingest_run_id::text AS ingest_run_id,
           resource_type,
           resource_id,
           patient_ref,
           resource,
           source_version_id,
           source_last_updated::text AS source_last_updated,
           content_hash
    FROM phm_edw.fhir_ingest_staging
    WHERE ingest_run_id = ${input.ingestRunId}::uuid
      AND status = 'staged'
      AND (${tenantFilter}::bigint IS NULL OR ehr_tenant_id = ${tenantFilter})
      AND (${orgFilter}::int IS NULL OR org_id IS NOT DISTINCT FROM ${orgFilter})
    ORDER BY received_at ASC, id ASC
    LIMIT ${limit}
  `;
}

async function resolvePatientId(tx: Tx, row: StagedFhirResourceRow): Promise<number | null> {
  const patientResourceId = patientResourceIdFromRow(row);
  if (!patientResourceId) return null;

  const rows = await tx.unsafe<{ patient_id: number | string }[]>(
    `
    SELECT COALESCE(patient_id, CASE WHEN local_table = 'phm_edw.patient' THEN local_id END) AS patient_id
    FROM phm_edw.ehr_resource_crosswalk
    WHERE ehr_tenant_id = $1
      AND resource_type = 'Patient'
      AND ehr_resource_id = $2
      AND (
        patient_id IS NOT NULL
        OR (local_table = 'phm_edw.patient' AND local_id IS NOT NULL)
      )
    ORDER BY last_seen_at DESC
    LIMIT 1
    `,
    [Number(row.ehr_tenant_id), patientResourceId],
  );

  return rows[0] ? Number(rows[0].patient_id) : null;
}

async function upsertResourceCrosswalk(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number | null,
): Promise<number | null> {
  const localTarget = crosswalkLocalTarget(row, patientId);
  const rows = await tx.unsafe<{ id: number | string }[]>(
    `
    INSERT INTO phm_edw.ehr_resource_crosswalk
      (ehr_tenant_id, resource_type, ehr_resource_id, ehr_identifier,
       local_table, local_id, patient_id, source_version_id,
       source_last_updated, hash, last_seen_at)
    VALUES (
      $1,
      $2,
      $3,
      $4::jsonb,
      $5,
      $6,
      $7,
      $8,
      $9::timestamptz,
      $10,
      NOW()
    )
    ON CONFLICT ON CONSTRAINT uq_ehr_resource_crosswalk_source
    DO UPDATE SET
      ehr_identifier = EXCLUDED.ehr_identifier,
      local_table = CASE
        WHEN EXCLUDED.resource_type = 'Patient' AND EXCLUDED.patient_id IS NOT NULL
          THEN 'phm_edw.patient'
        WHEN phm_edw.ehr_resource_crosswalk.local_table IS NOT NULL
          AND phm_edw.ehr_resource_crosswalk.local_table <> 'phm_edw.qdm_event'
          THEN phm_edw.ehr_resource_crosswalk.local_table
        ELSE EXCLUDED.local_table
      END,
      local_id = CASE
        WHEN EXCLUDED.resource_type = 'Patient' AND EXCLUDED.patient_id IS NOT NULL
          THEN EXCLUDED.patient_id
        WHEN phm_edw.ehr_resource_crosswalk.local_table IS NOT NULL
          AND phm_edw.ehr_resource_crosswalk.local_table <> 'phm_edw.qdm_event'
          THEN phm_edw.ehr_resource_crosswalk.local_id
        ELSE EXCLUDED.local_id
      END,
      patient_id = COALESCE(EXCLUDED.patient_id, phm_edw.ehr_resource_crosswalk.patient_id),
      source_version_id = EXCLUDED.source_version_id,
      source_last_updated = EXCLUDED.source_last_updated,
      hash = EXCLUDED.hash,
      last_seen_at = NOW()
    RETURNING id
    `,
    [
      Number(row.ehr_tenant_id),
      row.resource_type,
      row.resource_id,
      asUnsafeJson(fhirIdentifierArray(row.resource.identifier)),
      localTarget.localTable,
      localTarget.localId,
      patientId,
      row.source_version_id,
      row.source_last_updated,
      row.content_hash,
    ],
  );

  return rows[0] ? Number(rows[0].id) : null;
}

function crosswalkLocalTarget(
  row: StagedFhirResourceRow,
  patientId: number | null,
): { localTable: string; localId: number | null } {
  if (row.resource_type === 'Patient' && patientId !== null) {
    return { localTable: 'phm_edw.patient', localId: patientId };
  }

  return { localTable: 'phm_edw.qdm_event', localId: null };
}

async function upsertQdmEvent(
  tx: Tx,
  event: QdmEventUpsertInput,
): Promise<{ qdm_event_id: number }> {
  const rows = await tx.unsafe<{ qdm_event_id: number }[]>(
    `
    INSERT INTO phm_edw.qdm_event
      (qdm_event_key, org_id, patient_id, patient_ref, encounter_id, provider_id,
       ehr_tenant_id, source_staging_id, source_table, source_id, source_hash,
       qdm_category, qdm_datatype, qdm_status, code_system, code, code_display,
       relevant_start_at, relevant_end_at, author_datetime, result_datetime,
       value_numeric, value_text, value_unit,
       negation_rationale_code, negation_rationale_system,
       attributes, source_payload)
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      'phm_edw.fhir_ingest_staging',
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      $15,
      $16,
      $17::timestamptz,
      $18::timestamptz,
      $19::timestamptz,
      $20::timestamptz,
      $21,
      $22,
      $23,
      $24,
      $25,
      $26::jsonb,
      $27::jsonb
    )
    ON CONFLICT ON CONSTRAINT uq_qdm_event_key
    DO UPDATE SET
      patient_id = COALESCE(EXCLUDED.patient_id, phm_edw.qdm_event.patient_id),
      patient_ref = EXCLUDED.patient_ref,
      qdm_status = EXCLUDED.qdm_status,
      code_system = EXCLUDED.code_system,
      code = EXCLUDED.code,
      code_display = EXCLUDED.code_display,
      relevant_start_at = EXCLUDED.relevant_start_at,
      relevant_end_at = EXCLUDED.relevant_end_at,
      author_datetime = EXCLUDED.author_datetime,
      result_datetime = EXCLUDED.result_datetime,
      value_numeric = EXCLUDED.value_numeric,
      value_text = EXCLUDED.value_text,
      value_unit = EXCLUDED.value_unit,
      negation_rationale_code = EXCLUDED.negation_rationale_code,
      negation_rationale_system = EXCLUDED.negation_rationale_system,
      attributes = EXCLUDED.attributes,
      source_payload = EXCLUDED.source_payload,
      updated_at = NOW()
    RETURNING qdm_event_id
    `,
    [
      event.qdmEventKey,
      event.orgId,
      event.patientId,
      event.patientRef,
      event.encounterId,
      event.providerId,
      event.ehrTenantId,
      event.sourceStagingId,
      event.sourceStagingId,
      event.sourceHash,
      event.qdmCategory,
      event.qdmDatatype,
      event.qdmStatus,
      event.codeSystem,
      event.code,
      event.codeDisplay,
      event.relevantStartAt,
      event.relevantEndAt,
      event.authorDatetime,
      event.resultDatetime,
      event.valueNumeric,
      event.valueText,
      event.valueUnit,
      event.negationRationaleCode,
      event.negationRationaleSystem,
      asUnsafeJson(event.attributes),
      asUnsafeJson(event.sourcePayload),
    ],
  );

  return rows[0]!;
}

async function setResourceCrosswalkLocalTarget(
  tx: Tx,
  resourceCrosswalkId: number,
  qdmEventId: number,
): Promise<void> {
  await tx.unsafe(
    `
    UPDATE phm_edw.ehr_resource_crosswalk
    SET local_table = 'phm_edw.qdm_event',
        local_id = $2,
        last_seen_at = NOW()
    WHERE id = $1
      AND (local_table IS NULL OR local_table = 'phm_edw.qdm_event')
    `,
    [resourceCrosswalkId, qdmEventId],
  );
}

async function upsertFhirQdmCrosswalk(
  tx: Tx,
  row: StagedFhirResourceRow,
  qdmEventId: number,
  resourceCrosswalkId: number | null,
  qdm: QdmElement,
): Promise<void> {
  await tx.unsafe(
    `
    INSERT INTO phm_edw.fhir_qdm_crosswalk
      (qdm_event_id, ehr_tenant_id, source_staging_id, resource_crosswalk_id,
       fhir_resource_type, fhir_resource_id, fhir_path, fhir_profile,
       mapping_method, mapping_version, mapping_confidence, metadata)
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      'fhir-to-qdm',
      $9,
      $10,
      $11::jsonb
    )
    ON CONFLICT ON CONSTRAINT uq_fhir_qdm_event_resource
    DO UPDATE SET
      source_staging_id = EXCLUDED.source_staging_id,
      resource_crosswalk_id = EXCLUDED.resource_crosswalk_id,
      fhir_profile = EXCLUDED.fhir_profile,
      mapping_version = EXCLUDED.mapping_version,
      mapping_confidence = EXCLUDED.mapping_confidence,
      metadata = EXCLUDED.metadata,
      mapped_at = NOW()
    `,
    [
      qdmEventId,
      Number(row.ehr_tenant_id),
      Number(row.id),
      resourceCrosswalkId,
      row.resource_type,
      row.resource_id,
      qdm.id,
      qdm.source.profiles[0] ?? null,
      QDM_MAPPING_VERSION,
      0.95,
      asUnsafeJson({
        qdmCategory: qdm.category,
        qdmDatatype: qdm.datatype,
        sourceHash: row.content_hash,
      }),
    ],
  );
}

async function markStagedResourceNormalized(tx: Tx, stagingId: number): Promise<void> {
  await tx.unsafe(
    `
    UPDATE phm_edw.fhir_ingest_staging
    SET status = 'normalized',
        normalized = true,
        normalization_error = NULL,
        error_message = NULL,
        errors = '[]'::jsonb,
        updated_at = NOW()
    WHERE id = $1
    `,
    [stagingId],
  );
}

async function markStagedResourceSkipped(tx: Tx, stagingId: number, message: string): Promise<void> {
  await tx.unsafe(
    `
    UPDATE phm_edw.fhir_ingest_staging
    SET status = 'skipped',
        normalized = false,
        normalization_error = $2,
        error_message = $2,
        errors = $3::jsonb,
        updated_at = NOW()
    WHERE id = $1
    `,
    [stagingId, message, asUnsafeJson([{ message }])],
  );
}

async function markStagedResourceFailed(stagingId: number, message: string): Promise<void> {
  await sql`
    UPDATE phm_edw.fhir_ingest_staging
    SET status = 'failed',
        normalized = false,
        normalization_error = ${message},
        error_message = ${message},
        errors = ${sql.json(asSqlJson([{ message }]))},
        updated_at = NOW()
    WHERE id = ${stagingId}
  `;
}

function qdmEventKey(staged: StagedFhirResourceRow, qdm: QdmElement): string {
  return `qdm-${sha256({
    qdmVersion: qdm.qdmVersion,
    datatype: qdm.datatype,
    qdmId: qdm.id,
    ehrTenantId: staged.ehr_tenant_id,
    resourceType: staged.resource_type,
    resourceId: staged.resource_id,
    contentHash: staged.content_hash,
  })}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : canonicalize(item)));
  }

  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) {
        normalized[key] = canonicalize(child);
      }
    }
    return normalized;
  }

  return String(value);
}

function patientResourceIdFromRow(row: StagedFhirResourceRow): string | null {
  if (row.resource_type === 'Patient') return row.resource_id;
  const ref = row.patient_ref;
  if (!ref) return null;
  const parts = ref.split('/').filter(Boolean);
  return parts.at(-1) ?? null;
}

function referenceFromString(ref: string): { reference: string; type?: string; id?: string } {
  const parts = ref.split('/').filter(Boolean);
  return {
    reference: ref,
    type: parts.length > 1 ? parts[0] : undefined,
    id: parts.at(-1),
  };
}

function nullableNumber(value: number | string | null): number | null {
  return value == null ? null : Number(value);
}

function firstCode(value: unknown): { system?: string; code?: string } | null {
  if (!Array.isArray(value)) return null;
  const first = value.find(isRecord);
  if (!first) return null;
  return {
    system: typeof first['system'] === 'string' ? first['system'] : undefined,
    code: typeof first['code'] === 'string' ? first['code'] : undefined,
  };
}

function valueText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value)) {
    if (typeof value['text'] === 'string') return value['text'];
    if (typeof value['display'] === 'string') return value['display'];
    if (typeof value['code'] === 'string') return value['code'];
  }
  return null;
}

function fhirIdentifierArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
