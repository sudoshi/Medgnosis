// =============================================================================
// Medgnosis API - bounded EDW to QDM backfill
// Builds canonical QDM events from existing EDW rows for explicit patient cohorts.
// This is the reverse bridge needed for QDM-backed CQL and analytics lineage.
// =============================================================================

import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { sql } from '@medgnosis/db';
import {
  mapConditionToFHIR,
  mapEncounterToFHIR,
  mapObservationToFHIR,
  mapPatientToFHIR,
} from '../fhir/mappers.js';
import { normalizeFhirToQdm } from './fhirToQdm.js';
import type { QdmElement, QdmNormalizationContext } from './model.js';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

type Tx = postgres.TransactionSql;
type UnsafeParameter = NonNullable<Parameters<Tx['unsafe']>[1]>[number];

export interface BackfillQdmFromEdwInput {
  patientIds: readonly number[];
  periodStart?: string;
  periodEnd?: string;
  orgId?: number | null;
  conditionCodes?: readonly string[];
  observationCodes?: readonly string[];
  includePatients?: boolean;
  includeConditions?: boolean;
  includeEncounters?: boolean;
  includeObservations?: boolean;
  encounterLimitPerPatient?: number;
  observationLimitPerPatient?: number;
  limit?: number;
  statementTimeoutMs?: number;
  sourceSystem?: string;
}

export interface BackfillQdmFromEdwResult {
  patientsSeen: number;
  rowsSeen: number;
  eventsUpserted: number;
  byDatatype: Record<string, number>;
}

interface EdwSourceRow {
  sourceTable: string;
  sourceId: number;
  patientId: number;
  encounterId: number | null;
  providerId: number | null;
  orgId: number | null;
  resource: Record<string, unknown>;
}

interface QdmEventRowInput {
  qdmEventKey: string;
  orgId: number | null;
  patientId: number;
  patientRef: string;
  encounterId: number | null;
  providerId: number | null;
  sourceTable: string;
  sourceId: number;
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

export async function backfillQdmFromEdw(
  input: BackfillQdmFromEdwInput,
): Promise<BackfillQdmFromEdwResult> {
  const patientIds = normalizePositiveInts(input.patientIds).slice(0, clampLimit(input.limit));
  if (patientIds.length === 0) {
    return { patientsSeen: 0, rowsSeen: 0, eventsUpserted: 0, byDatatype: {} };
  }
  validatePeriod(input);

  return sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL statement_timeout = '${statementTimeoutMs(input)}ms'`);

    const rows = await selectEdwRows(tx, patientIds, input);
    const result: BackfillQdmFromEdwResult = {
      patientsSeen: patientIds.length,
      rowsSeen: rows.length,
      eventsUpserted: 0,
      byDatatype: {},
    };

    for (const row of rows) {
      const context: QdmNormalizationContext = {
        sourceSystem: input.sourceSystem ?? 'edw-qdm-backfill',
        patient: { reference: `Patient/${row.patientId}`, type: 'Patient', id: String(row.patientId) },
        provenance: {
          sourceTable: row.sourceTable,
          sourceId: row.sourceId,
          patientId: row.patientId,
        },
      };
      const elements = normalizeFhirToQdm(row.resource, context);
      for (const qdm of elements) {
        await upsertQdmEvent(tx, buildEventInput(row, qdm, input.orgId));
        result.eventsUpserted += 1;
        result.byDatatype[qdm.datatype] = (result.byDatatype[qdm.datatype] ?? 0) + 1;
      }
    }

    return result;
  });
}

async function selectEdwRows(
  tx: Tx,
  patientIds: readonly number[],
  input: BackfillQdmFromEdwInput,
): Promise<EdwSourceRow[]> {
  const groups = await Promise.all([
    input.includePatients === false ? [] : selectPatientRows(tx, patientIds, input),
    input.includeConditions === false ? [] : selectConditionRows(tx, patientIds, input),
    input.includeEncounters === false ? [] : selectEncounterRows(tx, patientIds, input),
    input.includeObservations === false ? [] : selectObservationRows(tx, patientIds, input),
  ]);
  return groups.flat();
}

async function selectPatientRows(
  tx: Tx,
  patientIds: readonly number[],
  input: BackfillQdmFromEdwInput,
): Promise<EdwSourceRow[]> {
  const rows = await tx.unsafe<Record<string, unknown>[]>(
    `
    SELECT patient_id, first_name, last_name, date_of_birth, gender, race, ethnicity, mrn
    FROM phm_edw.patient
    WHERE patient_id = ANY($1::int[])
      AND active_ind = 'Y'
    ORDER BY patient_id
    `,
    [patientIds as UnsafeParameter],
  );

  return rows.map((row) => {
    const patientId = Number(row['patient_id']);
    return {
      sourceTable: 'phm_edw.patient',
      sourceId: patientId,
      patientId,
      encounterId: null,
      providerId: null,
      orgId: input.orgId ?? null,
      resource: mapPatientToFHIR(row),
    };
  });
}

async function selectConditionRows(
  tx: Tx,
  patientIds: readonly number[],
  input: BackfillQdmFromEdwInput,
): Promise<EdwSourceRow[]> {
  const conditionCodes = normalizeStrings(input.conditionCodes ?? []);
  const rows = await tx.unsafe<Record<string, unknown>[]>(
    `
    SELECT cd.condition_diagnosis_id, cd.patient_id, cd.encounter_id, cd.provider_id,
           c.condition_name, c.condition_code, cd.onset_date, cd.resolution_date,
           cd.diagnosis_status
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
    WHERE cd.patient_id = ANY($1::int[])
      AND cd.active_ind = 'Y'
      AND ($2::text[] IS NULL OR c.condition_code = ANY($2::text[]))
    ORDER BY cd.patient_id, cd.condition_diagnosis_id
    `,
    [patientIds as UnsafeParameter, nullableArray(conditionCodes)],
  );

  return rows.map((row) => {
    const patientId = Number(row['patient_id']);
    return {
      sourceTable: 'phm_edw.condition_diagnosis',
      sourceId: Number(row['condition_diagnosis_id']),
      patientId,
      encounterId: nullableNumber(row['encounter_id']),
      providerId: nullableNumber(row['provider_id']),
      orgId: input.orgId ?? null,
      resource: mapConditionToFHIR(row, String(patientId)),
    };
  });
}

async function selectEncounterRows(
  tx: Tx,
  patientIds: readonly number[],
  input: BackfillQdmFromEdwInput,
): Promise<EdwSourceRow[]> {
  const perPatientLimit = clampPerPatientLimit(input.encounterLimitPerPatient ?? 20);
  const rows = await tx.unsafe<Record<string, unknown>[]>(
    `
    SELECT e.encounter_id, e.patient_id, e.provider_id, e.org_id, e.encounter_type,
           e.encounter_datetime, e.discharge_datetime, e.status
    FROM unnest($1::int[]) AS cohort(patient_id)
    JOIN LATERAL (
      SELECT enc.encounter_id, enc.patient_id, enc.provider_id, enc.org_id,
             enc.encounter_type, enc.encounter_datetime, enc.discharge_datetime, enc.status
      FROM phm_edw.encounter enc
      WHERE enc.patient_id = cohort.patient_id
        AND enc.active_ind = 'Y'
        AND ($2::date IS NULL OR enc.encounter_datetime >= $2::date)
        AND ($3::date IS NULL OR enc.encounter_datetime < ($3::date + 1))
      ORDER BY enc.encounter_datetime DESC NULLS LAST, enc.encounter_id DESC
      LIMIT $4
    ) e ON true
    ORDER BY e.patient_id, e.encounter_datetime DESC NULLS LAST, e.encounter_id DESC
    `,
    [
      patientIds as UnsafeParameter,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      perPatientLimit,
    ],
  );

  return rows.map((row) => {
    const patientId = Number(row['patient_id']);
    return {
      sourceTable: 'phm_edw.encounter',
      sourceId: Number(row['encounter_id']),
      patientId,
      encounterId: Number(row['encounter_id']),
      providerId: nullableNumber(row['provider_id']),
      orgId: nullableNumber(row['org_id']) ?? input.orgId ?? null,
      resource: mapEncounterToFHIR(row, String(patientId)),
    };
  });
}

async function selectObservationRows(
  tx: Tx,
  patientIds: readonly number[],
  input: BackfillQdmFromEdwInput,
): Promise<EdwSourceRow[]> {
  const observationCodes = normalizeStrings(input.observationCodes ?? []);
  const perPatientLimit = clampPerPatientLimit(input.observationLimitPerPatient ?? 50);
  const rows = await tx.unsafe<Record<string, unknown>[]>(
    `
    SELECT o.observation_id, o.patient_id, o.encounter_id, o.provider_id,
           o.observation_desc, o.observation_code, o.value_numeric, o.value_text,
           o.units, o.observation_datetime, o.status
    FROM unnest($1::int[]) AS cohort(patient_id)
    JOIN LATERAL (
      SELECT obs.observation_id, obs.patient_id, obs.encounter_id, obs.provider_id,
             obs.observation_desc, obs.observation_code, obs.value_numeric, obs.value_text,
             obs.units, obs.observation_datetime, obs.status
      FROM phm_edw.observation obs
      WHERE obs.patient_id = cohort.patient_id
        AND obs.active_ind = 'Y'
        AND ($2::date IS NULL OR obs.observation_datetime >= $2::date)
        AND ($3::date IS NULL OR obs.observation_datetime < ($3::date + 1))
        AND ($4::text[] IS NULL OR obs.observation_code = ANY($4::text[]))
      ORDER BY obs.observation_datetime DESC, obs.observation_id DESC
      LIMIT $5
    ) o ON true
    ORDER BY o.patient_id, o.observation_datetime DESC, o.observation_id DESC
    `,
    [
      patientIds as UnsafeParameter,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      nullableArray(observationCodes),
      perPatientLimit,
    ],
  );

  return rows.map((row) => {
    const patientId = Number(row['patient_id']);
    return {
      sourceTable: 'phm_edw.observation',
      sourceId: Number(row['observation_id']),
      patientId,
      encounterId: nullableNumber(row['encounter_id']),
      providerId: nullableNumber(row['provider_id']),
      orgId: input.orgId ?? null,
      resource: mapObservationToFHIR(row, String(patientId)),
    };
  });
}

function buildEventInput(
  row: EdwSourceRow,
  qdm: QdmElement,
  fallbackOrgId: number | null | undefined,
): QdmEventRowInput {
  const value = qdm.attributes['value'];
  const quantity = isRecord(value) ? value : undefined;
  const negationRationale = firstCode(qdm.attributes['negationRationale']);
  const relevantPeriod = qdm.timing.relevantPeriod ?? qdm.timing.prevalencePeriod;
  return {
    qdmEventKey: qdmEventKey(row, qdm),
    orgId: row.orgId ?? fallbackOrgId ?? null,
    patientId: row.patientId,
    patientRef: qdm.subject?.reference ?? `Patient/${row.patientId}`,
    encounterId: row.encounterId,
    providerId: row.providerId,
    sourceTable: row.sourceTable,
    sourceId: row.sourceId,
    qdmCategory: qdm.category,
    qdmDatatype: qdm.datatype,
    qdmStatus: qdm.status ?? null,
    codeSystem: qdm.code?.system ?? null,
    code: qdm.code?.code ?? null,
    codeDisplay: qdm.code?.display ?? qdm.code?.text ?? null,
    relevantStartAt: qdm.timing.relevantDateTime ?? relevantPeriod?.start ?? qdm.timing.birthDate ?? null,
    relevantEndAt: relevantPeriod?.end ?? null,
    authorDatetime: qdm.timing.authorDateTime ?? null,
    resultDatetime: qdm.timing.resultDateTime ?? null,
    valueNumeric: typeof quantity?.['value'] === 'number' ? quantity['value'] : null,
    valueText: valueText(value),
    valueUnit: typeof quantity?.['unit'] === 'string' ? quantity['unit'] : null,
    negationRationaleCode: negationRationale?.code ?? null,
    negationRationaleSystem: negationRationale?.system ?? null,
    attributes: qdm.attributes,
    sourcePayload: qdm,
  };
}

async function upsertQdmEvent(tx: Tx, event: QdmEventRowInput): Promise<void> {
  await tx.unsafe(
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
      NULL,
      NULL,
      $7,
      $8,
      NULL,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      $15::timestamptz,
      $16::timestamptz,
      $17::timestamptz,
      $18::timestamptz,
      $19,
      $20,
      $21,
      $22,
      $23,
      $24::jsonb,
      $25::jsonb
    )
    ON CONFLICT ON CONSTRAINT uq_qdm_event_key
    DO UPDATE SET
      org_id = EXCLUDED.org_id,
      patient_id = EXCLUDED.patient_id,
      patient_ref = EXCLUDED.patient_ref,
      encounter_id = EXCLUDED.encounter_id,
      provider_id = EXCLUDED.provider_id,
      source_table = EXCLUDED.source_table,
      source_id = EXCLUDED.source_id,
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
    `,
    [
      event.qdmEventKey,
      event.orgId,
      event.patientId,
      event.patientRef,
      event.encounterId,
      event.providerId,
      event.sourceTable,
      event.sourceId,
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
      event.attributes as UnsafeParameter,
      event.sourcePayload as unknown as UnsafeParameter,
    ],
  );
}

function validatePeriod(input: BackfillQdmFromEdwInput): void {
  if (input.periodStart && input.periodEnd && input.periodEnd < input.periodStart) {
    throw new Error('periodEnd must be on or after periodStart');
  }
}

function qdmEventKey(row: EdwSourceRow, qdm: QdmElement): string {
  return `qdm-${sha256({
    qdmVersion: qdm.qdmVersion,
    datatype: qdm.datatype,
    qdmId: qdm.id,
    sourceTable: row.sourceTable,
    sourceId: row.sourceId,
    patientId: row.patientId,
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
      if (child !== undefined) normalized[key] = canonicalize(child);
    }
    return normalized;
  }
  return String(value);
}

function statementTimeoutMs(input: BackfillQdmFromEdwInput): number {
  return Math.max(1000, Math.min(input.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS, 300_000));
}

function clampLimit(value: number | undefined): number {
  return Math.max(1, Math.min(value ?? DEFAULT_LIMIT, MAX_LIMIT));
}

function clampPerPatientLimit(value: number): number {
  return Math.max(1, Math.min(value, 500));
}

function normalizePositiveInts(values: readonly number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0)));
}

function normalizeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function nullableArray(values: string[]): UnsafeParameter {
  return (values.length > 0 ? values : null) as UnsafeParameter;
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
