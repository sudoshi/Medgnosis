// =============================================================================
// SMART Bulk Data export orchestration
// Kicks off and polls async FHIR Bulk Data jobs while persisting only job
// metadata and manifest descriptors. Raw bearer tokens and NDJSON payloads are
// never stored here.
// =============================================================================

import { sql } from '@medgnosis/db';
import type { EhrTenantRef, FetchLike, FhirAccessTokenRef } from './types.js';
import { getVendorAdapter } from './vendorAdapters/index.js';

export type BulkExportLevel = 'system' | 'group' | 'patient';
export type BulkJobStatus = 'accepted' | 'in_progress' | 'completed' | 'failed' | 'canceled';
export type JsonObject = Record<string, unknown>;

export interface BulkManifestOutput {
  type: string;
  url: string;
  count?: number;
}

export interface BulkManifest {
  transactionTime: string;
  request: string;
  requiresAccessToken: boolean;
  output: BulkManifestOutput[];
  error?: BulkManifestOutput[];
  deleted?: BulkManifestOutput[];
}

export interface EhrBulkJob {
  id: string;
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string | null;
  exportLevel: BulkExportLevel;
  groupId: string | null;
  patientId: string | null;
  status: BulkJobStatus;
  resourceTypes: string[];
  since: string | null;
  typeFilters: string[];
  requestUrl: string;
  statusUrl: string;
  manifest: JsonObject | null;
  outputFiles: BulkManifestOutput[];
  error: JsonObject | null;
  retryAfterSeconds: number | null;
  pollCount: number;
  requestedAt: string;
  nextPollAt: string | null;
  completedAt: string | null;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface KickoffBulkExportInput {
  tenant: EhrTenantRef & { id: number; orgId?: number | null };
  token: FhirAccessTokenRef;
  exportLevel: BulkExportLevel;
  resourceTypes: readonly string[];
  groupId?: string | null;
  patientId?: string | null;
  since?: string | Date | null;
  typeFilters?: readonly string[];
  ingestRunId?: string | null;
  metadata?: JsonObject;
  fetchImpl?: FetchLike;
}

export interface PollBulkExportJobInput {
  job: Pick<EhrBulkJob, 'id' | 'statusUrl'>;
  token: FhirAccessTokenRef;
  fetchImpl?: FetchLike;
}

interface BulkJobRow {
  id: string;
  org_id: number | null;
  ehr_tenant_id: number;
  ingest_run_id: string | null;
  export_level: BulkExportLevel;
  group_id: string | null;
  patient_id: string | null;
  status: BulkJobStatus;
  resource_types: string[];
  since: string | null;
  type_filters: unknown;
  request_url: string;
  status_url: string;
  manifest: JsonObject | null;
  output_files: unknown;
  error: JsonObject | null;
  retry_after_seconds: number | null;
  poll_count: number;
  requested_at: string;
  next_poll_at: string | null;
  completed_at: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

interface BulkRequestParts {
  requestUrl: string;
  resourceTypes: string[];
  typeFilters: string[];
  since: string | null;
  groupId: string | null;
  patientId: string | null;
}

export class BulkDataError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'BulkDataError';
    this.code = code;
    this.status = status;
  }
}

function asSqlJson(value: unknown): Parameters<typeof sql.json>[0] {
  return value as Parameters<typeof sql.json>[0];
}

function mapDbNumber(value: number | string): number {
  return Number(value);
}

function mapNullableDbNumber(value: number | string | null): number | null {
  return value == null ? null : mapDbNumber(value);
}

function mapBulkJob(row: BulkJobRow): EhrBulkJob {
  return {
    id: row.id,
    orgId: mapNullableDbNumber(row.org_id),
    ehrTenantId: mapDbNumber(row.ehr_tenant_id),
    ingestRunId: row.ingest_run_id,
    exportLevel: row.export_level,
    groupId: row.group_id,
    patientId: row.patient_id,
    status: row.status,
    resourceTypes: Array.isArray(row.resource_types) ? row.resource_types : [],
    since: row.since,
    typeFilters: stringArray(row.type_filters),
    requestUrl: row.request_url,
    statusUrl: row.status_url,
    manifest: row.manifest,
    outputFiles: outputArray(row.output_files),
    error: row.error,
    retryAfterSeconds: mapNullableDbNumber(row.retry_after_seconds),
    pollCount: mapDbNumber(row.poll_count),
    requestedAt: row.requested_at,
    nextPollAt: row.next_poll_at,
    completedAt: row.completed_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function kickoffBulkExport(input: KickoffBulkExportInput): Promise<EhrBulkJob> {
  const request = buildBulkExportRequest(input);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new BulkDataError('bulk_fetch_unavailable', 'Bulk Data kickoff requires a fetch implementation', 500);
  }

  const response = await fetchImpl(request.requestUrl, {
    method: 'POST',
    headers: {
      accept: 'application/fhir+json, application/json',
      authorization: `${input.token.tokenType ?? 'Bearer'} ${input.token.accessToken}`,
      prefer: 'respond-async',
    },
  });

  if (response.status !== 202) {
    const body = await parseResponseBody(response);
    throw new BulkDataError(
      'bulk_kickoff_failed',
      bulkErrorMessage(body, `Bulk Data kickoff failed with HTTP ${response.status}`),
      response.status,
    );
  }

  const statusUrl = response.headers.get('content-location');
  if (!statusUrl) {
    throw new BulkDataError(
      'bulk_content_location_missing',
      'Bulk Data kickoff response did not include Content-Location',
      502,
    );
  }

  return insertBulkJob({
    tenant: input.tenant,
    ingestRunId: input.ingestRunId ?? null,
    exportLevel: input.exportLevel,
    request,
    statusUrl,
    retryAfterSeconds: retryAfterSeconds(response.headers.get('retry-after')),
    metadata: input.metadata ?? {},
  });
}

export async function pollBulkExportJob(input: PollBulkExportJobInput): Promise<EhrBulkJob> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new BulkDataError('bulk_fetch_unavailable', 'Bulk Data polling requires a fetch implementation', 500);
  }

  const response = await fetchImpl(input.job.statusUrl, {
    method: 'GET',
    headers: {
      accept: 'application/fhir+json, application/json',
      authorization: `${input.token.tokenType ?? 'Bearer'} ${input.token.accessToken}`,
    },
  });

  if (response.status === 202) {
    return markBulkJobInProgress(input.job.id, retryAfterSeconds(response.headers.get('retry-after')));
  }

  const body = await parseResponseBody(response);
  if (response.ok) {
    const manifest = parseBulkManifest(body);
    return markBulkJobCompleted(input.job.id, manifest);
  }

  const error = normalizedErrorBody(body, response.status);
  await markBulkJobFailed(input.job.id, error);
  throw new BulkDataError(
    'bulk_status_failed',
    bulkErrorMessage(body, `Bulk Data status failed with HTTP ${response.status}`),
    response.status,
  );
}

export function buildBulkExportRequest(input: KickoffBulkExportInput): BulkRequestParts {
  assertBulkAllowed(input.tenant, input.exportLevel);
  const resourceTypes = normalizeResourceTypes(input.resourceTypes);
  const typeFilters = normalizeStringList(input.typeFilters ?? []);
  const since = timestampInput(input.since);
  const groupId = optionalString(input.groupId);
  const patientId = optionalString(input.patientId);
  const url = bulkExportUrl(input.tenant.fhirBaseUrl, input.exportLevel, groupId, patientId);

  url.searchParams.set('_type', resourceTypes.join(','));
  if (since) url.searchParams.set('_since', since);
  for (const filter of typeFilters) {
    url.searchParams.append('_typeFilter', filter);
  }

  return {
    requestUrl: url.toString(),
    resourceTypes,
    typeFilters,
    since,
    groupId,
    patientId,
  };
}

export function parseBulkManifest(value: unknown): BulkManifest {
  if (!isRecord(value)) {
    throw new BulkDataError('bulk_manifest_invalid', 'Bulk Data manifest must be a JSON object', 502);
  }

  const transactionTime = stringField(value.transactionTime, 'transactionTime');
  const request = stringField(value.request, 'request');
  const requiresAccessToken = booleanField(value.requiresAccessToken, 'requiresAccessToken');
  const output = outputArrayRequired(value.output, 'output');
  const error = value.error === undefined ? undefined : outputArrayRequired(value.error, 'error');
  const deleted = value.deleted === undefined ? undefined : outputArrayRequired(value.deleted, 'deleted');

  return {
    transactionTime,
    request,
    requiresAccessToken,
    output,
    error,
    deleted,
  };
}

async function insertBulkJob(input: {
  tenant: EhrTenantRef & { id: number; orgId?: number | null };
  ingestRunId: string | null;
  exportLevel: BulkExportLevel;
  request: BulkRequestParts;
  statusUrl: string;
  retryAfterSeconds: number | null;
  metadata: JsonObject;
}): Promise<EhrBulkJob> {
  const rows = await sql<BulkJobRow[]>`
    INSERT INTO phm_edw.ehr_bulk_job
      (org_id, ehr_tenant_id, ingest_run_id, export_level, group_id, patient_id,
       resource_types, since, type_filters, request_url, status_url,
       retry_after_seconds, next_poll_at, metadata)
    VALUES (
      ${input.tenant.orgId ?? null},
      ${input.tenant.id},
      ${input.ingestRunId}::uuid,
      ${input.exportLevel},
      ${input.request.groupId},
      ${input.request.patientId},
      ${input.request.resourceTypes},
      ${input.request.since}::timestamptz,
      ${sql.json(asSqlJson(input.request.typeFilters))},
      ${input.request.requestUrl},
      ${input.statusUrl},
      ${input.retryAfterSeconds},
      ${nextPollAt(input.retryAfterSeconds)}::timestamptz,
      ${sql.json(asSqlJson(input.metadata))}
    )
    RETURNING id::text AS id,
              org_id,
              ehr_tenant_id,
              ingest_run_id::text AS ingest_run_id,
              export_level,
              group_id,
              patient_id,
              status,
              resource_types,
              since::text AS since,
              type_filters,
              request_url,
              status_url,
              manifest,
              output_files,
              error,
              retry_after_seconds,
              poll_count,
              requested_at::text AS requested_at,
              next_poll_at::text AS next_poll_at,
              completed_at::text AS completed_at,
              metadata,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return requireBulkJob(rows, 'insert');
}

async function markBulkJobInProgress(id: string, retryAfter: number | null): Promise<EhrBulkJob> {
  const rows = await sql<BulkJobRow[]>`
    UPDATE phm_edw.ehr_bulk_job
    SET status = 'in_progress',
        retry_after_seconds = ${retryAfter},
        next_poll_at = ${nextPollAt(retryAfter)}::timestamptz,
        poll_count = poll_count + 1,
        updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id::text AS id,
              org_id,
              ehr_tenant_id,
              ingest_run_id::text AS ingest_run_id,
              export_level,
              group_id,
              patient_id,
              status,
              resource_types,
              since::text AS since,
              type_filters,
              request_url,
              status_url,
              manifest,
              output_files,
              error,
              retry_after_seconds,
              poll_count,
              requested_at::text AS requested_at,
              next_poll_at::text AS next_poll_at,
              completed_at::text AS completed_at,
              metadata,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return requireBulkJob(rows, 'mark in progress');
}

async function markBulkJobCompleted(id: string, manifest: BulkManifest): Promise<EhrBulkJob> {
  const rows = await sql<BulkJobRow[]>`
    UPDATE phm_edw.ehr_bulk_job
    SET status = 'completed',
        manifest = ${sql.json(asSqlJson(manifest))},
        output_files = ${sql.json(asSqlJson(manifest.output))},
        completed_at = COALESCE(completed_at, NOW()),
        next_poll_at = NULL,
        poll_count = poll_count + 1,
        updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id::text AS id,
              org_id,
              ehr_tenant_id,
              ingest_run_id::text AS ingest_run_id,
              export_level,
              group_id,
              patient_id,
              status,
              resource_types,
              since::text AS since,
              type_filters,
              request_url,
              status_url,
              manifest,
              output_files,
              error,
              retry_after_seconds,
              poll_count,
              requested_at::text AS requested_at,
              next_poll_at::text AS next_poll_at,
              completed_at::text AS completed_at,
              metadata,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return requireBulkJob(rows, 'mark completed');
}

async function markBulkJobFailed(id: string, error: JsonObject): Promise<EhrBulkJob> {
  const rows = await sql<BulkJobRow[]>`
    UPDATE phm_edw.ehr_bulk_job
    SET status = 'failed',
        error = ${sql.json(asSqlJson(error))},
        completed_at = COALESCE(completed_at, NOW()),
        next_poll_at = NULL,
        poll_count = poll_count + 1,
        updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id::text AS id,
              org_id,
              ehr_tenant_id,
              ingest_run_id::text AS ingest_run_id,
              export_level,
              group_id,
              patient_id,
              status,
              resource_types,
              since::text AS since,
              type_filters,
              request_url,
              status_url,
              manifest,
              output_files,
              error,
              retry_after_seconds,
              poll_count,
              requested_at::text AS requested_at,
              next_poll_at::text AS next_poll_at,
              completed_at::text AS completed_at,
              metadata,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return requireBulkJob(rows, 'mark failed');
}

function requireBulkJob(rows: BulkJobRow[], action: string): EhrBulkJob {
  if (!rows[0]) throw new BulkDataError('bulk_job_not_saved', `Unable to ${action} Bulk Data job`, 500);
  return mapBulkJob(rows[0]);
}

function assertBulkAllowed(tenant: EhrTenantRef, exportLevel: BulkExportLevel): void {
  const adapter = getVendorAdapter(tenant.vendor);
  const capabilities = adapter.bulkCapabilities;
  if (!capabilities.supported || !capabilities.exportLevels.includes(exportLevel)) {
    throw new BulkDataError(
      'bulk_export_not_supported',
      `${adapter.displayName} is not configured for ${exportLevel} Bulk Data export`,
      400,
    );
  }
}

function bulkExportUrl(
  baseUrl: string,
  exportLevel: BulkExportLevel,
  groupId: string | null,
  patientId: string | null,
): URL {
  const base = trimTrailingSlash(baseUrl);
  if (exportLevel === 'system') return new URL(`${base}/$export`);
  if (exportLevel === 'group') {
    if (!groupId) throw new BulkDataError('bulk_group_required', 'Group export requires groupId');
    return new URL(`${base}/Group/${encodeURIComponent(groupId)}/$export`);
  }
  if (!patientId) throw new BulkDataError('bulk_patient_required', 'Patient export requires patientId');
  return new URL(`${base}/Patient/${encodeURIComponent(patientId)}/$export`);
}

function normalizeResourceTypes(values: readonly string[]): string[] {
  const resourceTypes = normalizeStringList(values);
  if (resourceTypes.length === 0) {
    throw new BulkDataError('bulk_resource_types_required', 'Bulk Data export requires at least one _type resource');
  }
  for (const resourceType of resourceTypes) {
    if (!/^[A-Z][A-Za-z0-9]+$/.test(resourceType)) {
      throw new BulkDataError('bulk_resource_type_invalid', `Invalid FHIR resource type '${resourceType}'`);
    }
  }
  return resourceTypes;
}

function normalizeStringList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function timestampInput(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function optionalString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function retryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(Math.ceil((dateMs - Date.now()) / 1000), 0);
  return null;
}

function nextPollAt(retryAfter: number | null): string | null {
  if (retryAfter == null) return null;
  return new Date(Date.now() + retryAfter * 1000).toISOString();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function outputArray(value: unknown): BulkManifestOutput[] {
  return Array.isArray(value) ? value.flatMap((item) => (isBulkOutput(item) ? [item] : [])) : [];
}

function outputArrayRequired(value: unknown, label: string): BulkManifestOutput[] {
  if (!Array.isArray(value)) {
    throw new BulkDataError('bulk_manifest_invalid', `Bulk Data manifest ${label} must be an array`, 502);
  }
  return value.map((item, index) => parseBulkOutput(item, `${label}[${index}]`));
}

function parseBulkOutput(value: unknown, label: string): BulkManifestOutput {
  if (!isRecord(value)) {
    throw new BulkDataError('bulk_manifest_invalid', `Bulk Data manifest ${label} must be an object`, 502);
  }
  const output: BulkManifestOutput = {
    type: stringField(value.type, `${label}.type`),
    url: stringField(value.url, `${label}.url`),
  };
  if (value.count !== undefined) {
    if (typeof value.count !== 'number' || !Number.isInteger(value.count) || value.count < 0) {
      throw new BulkDataError('bulk_manifest_invalid', `Bulk Data manifest ${label}.count must be a non-negative integer`, 502);
    }
    output.count = value.count;
  }
  return output;
}

function isBulkOutput(value: unknown): value is BulkManifestOutput {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    typeof value.url === 'string' &&
    (value.count === undefined || typeof value.count === 'number')
  );
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BulkDataError('bulk_manifest_invalid', `Bulk Data manifest ${label} must be a non-empty string`, 502);
  }
  return value;
}

function booleanField(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BulkDataError('bulk_manifest_invalid', `Bulk Data manifest ${label} must be boolean`, 502);
  }
  return value;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function bulkErrorMessage(body: unknown, fallback: string): string {
  if (isRecord(body)) {
    const issue = Array.isArray(body.issue) ? body.issue[0] : undefined;
    if (isRecord(issue) && typeof issue.diagnostics === 'string') return issue.diagnostics;
    if (typeof body.error_description === 'string') return body.error_description;
    if (typeof body.error === 'string') return body.error;
  }
  return fallback;
}

function normalizedErrorBody(body: unknown, status: number): JsonObject {
  return {
    status,
    body: isRecord(body) ? body : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
