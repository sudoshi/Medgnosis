// =============================================================================
// SMART Bulk Data export orchestration
// Kicks off and polls async FHIR Bulk Data jobs while persisting only job
// metadata and manifest descriptors. Raw bearer tokens and NDJSON payloads are
// never stored here.
// =============================================================================

import { createHash } from 'node:crypto';
import { sql } from '@medgnosis/db';
import {
  loadBackendServicesConfig as loadBackendServicesConfigDefault,
  requestBackendServiceToken as requestBackendServiceTokenDefault,
  type BackendServicesConfig,
} from './backendServices.js';
import {
  failIngestRun as failIngestRunDefault,
  finishIngestRunWithQdmBridge as finishIngestRunWithQdmBridgeDefault,
  startIngestRun as startIngestRunDefault,
  type EhrIngestRun,
} from './ingestRuns.js';
import {
  drainStagedRunToEdw as drainStagedRunToEdwDefault,
  softDeleteByCrosswalk as softDeleteByCrosswalkDefault,
  type HydrateStagedRunToEdwResult,
} from './edwHydration.js';
import {
  stageFhirResource as stageFhirResourceDefault,
} from './resourceStaging.js';
import type { EhrTenantRef, FetchLike, FhirAccessTokenRef, FhirResource } from './types.js';
import type { NormalizeStagedRunToQdmResult } from './qdmBridge.js';
import { getVendorAdapter } from './vendorAdapters/index.js';

export type BulkExportLevel = 'system' | 'group' | 'patient';
export type BulkJobStatus = 'accepted' | 'in_progress' | 'completed' | 'failed' | 'canceled';
export type JsonObject = Record<string, unknown>;

export interface BulkManifestOutput {
  type: string;
  url: string;
  count?: number;
  checksum?: string;
  size?: number;
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

export interface CancelBulkExportJobInput {
  job: EhrBulkJob;
  token: FhirAccessTokenRef;
  metadata?: JsonObject;
  fetchImpl?: FetchLike;
}

export interface ImportBulkExportJobInput {
  tenant: EhrTenantRef & { id: number; orgId?: number | null };
  job: EhrBulkJob;
  manifest?: BulkManifest;
  token?: FhirAccessTokenRef;
  fetchImpl?: FetchLike;
  maxResourcesPerFile?: number;
  resumeFailedOnly?: boolean;
  stageFhirResource?: typeof stageFhirResourceDefault;
  startIngestRun?: typeof startIngestRunDefault;
  finishIngestRun?: typeof finishIngestRunWithQdmBridgeDefault;
  failIngestRun?: typeof failIngestRunDefault;
  drainStagedRunToEdw?: typeof drainStagedRunToEdwDefault;
  softDeleteByCrosswalk?: typeof softDeleteByCrosswalkDefault;
}

export interface ImportCompletedBulkExportJobInput {
  ehrTenantId: number;
  bulkJobId: string;
  maxResourcesPerFile?: number;
  resumeFailedOnly?: boolean;
  fetchImpl?: FetchLike;
}

export interface KickoffBulkExportWithBackendServicesInput {
  ehrTenantId: number;
  exportLevel: BulkExportLevel;
  resourceTypes: readonly string[];
  groupId?: string | null;
  patientId?: string | null;
  since?: string | Date | null;
  typeFilters?: readonly string[];
  metadata?: JsonObject;
  fetchImpl?: FetchLike;
}

export interface PollBulkExportJobWithBackendServicesInput {
  ehrTenantId: number;
  bulkJobId: string;
  fetchImpl?: FetchLike;
}

export interface CancelBulkExportJobWithBackendServicesInput {
  ehrTenantId: number;
  bulkJobId: string;
  metadata?: JsonObject;
  fetchImpl?: FetchLike;
}

export interface BackendBulkExportResult {
  tenant: BackendServicesConfig['tenant'];
  job: EhrBulkJob;
  tokenMetadataId: string | null;
}

export interface ListBulkJobsInput {
  ehrTenantId: number;
  status?: BulkJobStatus;
  limit?: number;
}

export interface BulkImportFileResult {
  resourceType: string;
  fileUrlHash: string;
  fileUrlRedacted: string;
  manifestCount: number | null;
  bytesRead?: number;
  checksumSha256?: string;
  rowsRead: number;
  resourcesStaged: number;
  errorCount: number;
  status: 'completed' | 'failed' | 'skipped';
  errorMessage?: string;
}

export interface ImportBulkExportJobResult {
  job: EhrBulkJob;
  ingestRun: EhrIngestRun;
  files: BulkImportFileResult[];
  resourcesRead: number;
  resourcesStaged: number;
  resourcesFailed: number;
  edwHydration: HydrateStagedRunToEdwResult | null;
  qdmBridge: NormalizeStagedRunToQdmResult | null;
}

export interface ImportCompletedBulkExportJobResult extends ImportBulkExportJobResult {
  tokenMetadataId: string | null;
}

export interface EhrBulkImportFile {
  id: string;
  bulkJobId: string;
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string | null;
  resourceType: string;
  fileUrlHash: string;
  fileUrlRedacted: string;
  manifestCount: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  rowsRead: number;
  resourcesStaged: number;
  errorCount: number;
  error: JsonObject | null;
  startedAt: string | null;
  completedAt: string | null;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface EhrBulkJobSummary extends EhrBulkJob {
  importFiles: EhrBulkImportFile[];
}

interface ImportCompletedBulkExportJobDeps {
  loadBackendServicesConfig?: typeof loadBackendServicesConfigDefault;
  requestBackendServiceToken?: typeof requestBackendServiceTokenDefault;
  getBulkJob?: typeof getBulkJob;
  importBulkExportJob?: typeof importBulkExportJob;
}

interface BackendBulkExportDeps {
  loadBackendServicesConfig?: typeof loadBackendServicesConfigDefault;
  requestBackendServiceToken?: typeof requestBackendServiceTokenDefault;
  getBulkJob?: typeof getBulkJob;
  kickoffBulkExport?: typeof kickoffBulkExport;
  pollBulkExportJob?: typeof pollBulkExportJob;
  cancelBulkExportJob?: typeof cancelBulkExportJob;
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

interface BulkImportFileRow {
  id: string;
}

interface BulkImportFileListRow {
  id: string;
  bulk_job_id: string;
  org_id: number | string | null;
  ehr_tenant_id: number | string;
  ingest_run_id: string | null;
  resource_type: string;
  file_url_hash: string;
  file_url_redacted: string;
  manifest_count: number | string | null;
  status: EhrBulkImportFile['status'];
  rows_read: number | string;
  resources_staged: number | string;
  error_count: number | string;
  error: JsonObject | null;
  started_at: string | null;
  completed_at: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

interface BulkOutputFileIdentity {
  fileUrlHash: string;
  fileUrlRedacted: string;
}

interface BulkOutputDownloadValidation extends JsonObject {
  bytesRead: number;
  sha256: string;
  expectedSize: number | null;
  expectedChecksum: string | null;
  checksumAlgorithm: 'sha256' | null;
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

function mapBulkImportFile(row: BulkImportFileListRow): EhrBulkImportFile {
  return {
    id: row.id,
    bulkJobId: row.bulk_job_id,
    orgId: mapNullableDbNumber(row.org_id),
    ehrTenantId: mapDbNumber(row.ehr_tenant_id),
    ingestRunId: row.ingest_run_id,
    resourceType: row.resource_type,
    fileUrlHash: row.file_url_hash,
    fileUrlRedacted: row.file_url_redacted,
    manifestCount: mapNullableDbNumber(row.manifest_count),
    status: row.status,
    rowsRead: mapDbNumber(row.rows_read),
    resourcesStaged: mapDbNumber(row.resources_staged),
    errorCount: mapDbNumber(row.error_count),
    error: row.error,
    startedAt: row.started_at,
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

  // FHIR Bulk Data kickoff with parameters in the query string uses GET (the
  // POST form requires a Parameters resource body, which we do not send). Epic
  // returns 405 for POST on Group/[id]/$export.
  const response = await fetchImpl(request.requestUrl, {
    method: 'GET',
    headers: {
      // Bulk Data kickoff SHALL send Accept: application/fhir+json (a single
      // value); Epic rejects a multi-value Accept with HTTP 400.
      accept: 'application/fhir+json',
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
  validateBulkStatusUrl(input.tenant, request.requestUrl, statusUrl);

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

export async function cancelBulkExportJob(input: CancelBulkExportJobInput): Promise<EhrBulkJob> {
  if (input.job.status === 'canceled') return input.job;
  if (input.job.status !== 'accepted' && input.job.status !== 'in_progress') {
    throw new BulkDataError(
      'bulk_job_terminal',
      'Only accepted or in-progress Bulk Data jobs can be canceled',
      409,
    );
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new BulkDataError('bulk_fetch_unavailable', 'Bulk Data cancellation requires a fetch implementation', 500);
  }

  const response = await fetchImpl(input.job.statusUrl, {
    method: 'DELETE',
    headers: {
      accept: 'application/fhir+json, application/json',
      authorization: `${input.token.tokenType ?? 'Bearer'} ${input.token.accessToken}`,
    },
  });

  if (response.status === 200 || response.status === 202 || response.status === 204) {
    return markBulkJobCanceled(input.job.id, {
      source: 'ehr-bulk-data-cancel',
      ...(input.metadata ?? {}),
    });
  }

  const body = await parseResponseBody(response);
  throw new BulkDataError(
    'bulk_cancel_failed',
    bulkErrorMessage(body, `Bulk Data cancellation failed with HTTP ${response.status}`),
    response.status,
  );
}

export async function kickoffBulkExportWithBackendServices(
  input: KickoffBulkExportWithBackendServicesInput,
  deps: BackendBulkExportDeps = {},
): Promise<BackendBulkExportResult> {
  const loadBackendServicesConfig = deps.loadBackendServicesConfig ?? loadBackendServicesConfigDefault;
  const requestBackendServiceToken = deps.requestBackendServiceToken ?? requestBackendServiceTokenDefault;
  const runKickoff = deps.kickoffBulkExport ?? kickoffBulkExport;
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const backendConfig = await loadBackendServicesConfig(input.ehrTenantId, fetchImpl);
  if (!backendConfig) {
    throw new BulkDataError(
      'bulk_backend_services_config_missing',
      'Bulk Data kickoff requires an enabled SMART Backend Services client registration',
      409,
    );
  }

  const tokenResult = await requestBackendServiceToken({
    config: backendConfig,
    scope: backendBulkImportScope(backendConfig, input.resourceTypes),
    fetchImpl,
  });
  const job = await runKickoff({
    tenant: backendConfig.tenant,
    token: tokenResult.accessToken,
    exportLevel: input.exportLevel,
    resourceTypes: input.resourceTypes,
    groupId: input.groupId,
    patientId: input.patientId,
    since: input.since,
    typeFilters: input.typeFilters,
    metadata: {
      source: 'ehr-bulk-data-orchestration',
      kickoffTriggeredBy: 'worker',
      ...(input.metadata ?? {}),
      tokenMetadataId: tokenResult.tokenMetadata?.id ?? null,
    },
    fetchImpl,
  });

  return {
    tenant: backendConfig.tenant,
    job: sanitizeBulkJobForResult(job),
    tokenMetadataId: tokenResult.tokenMetadata?.id ?? null,
  };
}

export async function pollBulkExportJobWithBackendServices(
  input: PollBulkExportJobWithBackendServicesInput,
  deps: BackendBulkExportDeps = {},
): Promise<BackendBulkExportResult> {
  const loadBackendServicesConfig = deps.loadBackendServicesConfig ?? loadBackendServicesConfigDefault;
  const requestBackendServiceToken = deps.requestBackendServiceToken ?? requestBackendServiceTokenDefault;
  const loadBulkJob = deps.getBulkJob ?? getBulkJob;
  const runPoll = deps.pollBulkExportJob ?? pollBulkExportJob;
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const [backendConfig, job] = await Promise.all([
    loadBackendServicesConfig(input.ehrTenantId, fetchImpl),
    loadBulkJob(input.bulkJobId, input.ehrTenantId),
  ]);
  if (!backendConfig) {
    throw new BulkDataError(
      'bulk_backend_services_config_missing',
      'Bulk Data polling requires an enabled SMART Backend Services client registration',
      409,
    );
  }
  if (!job) {
    throw new BulkDataError('bulk_job_not_found', 'Bulk Data export job not found for tenant', 404);
  }
  assertBulkJobTenant(backendConfig.tenant, job);
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') {
    return {
      tenant: backendConfig.tenant,
      job: sanitizeBulkJobForResult(job),
      tokenMetadataId: null,
    };
  }

  const tokenResult = await requestBackendServiceToken({
    config: backendConfig,
    scope: backendBulkImportScope(backendConfig, job.resourceTypes),
    fetchImpl,
  });
  const polledJob = await runPoll({
    job,
    token: tokenResult.accessToken,
    fetchImpl,
  });

  return {
    tenant: backendConfig.tenant,
    job: sanitizeBulkJobForResult(polledJob),
    tokenMetadataId: tokenResult.tokenMetadata?.id ?? null,
  };
}

export async function cancelBulkExportJobWithBackendServices(
  input: CancelBulkExportJobWithBackendServicesInput,
  deps: BackendBulkExportDeps = {},
): Promise<BackendBulkExportResult> {
  const loadBackendServicesConfig = deps.loadBackendServicesConfig ?? loadBackendServicesConfigDefault;
  const requestBackendServiceToken = deps.requestBackendServiceToken ?? requestBackendServiceTokenDefault;
  const loadBulkJob = deps.getBulkJob ?? getBulkJob;
  const runCancel = deps.cancelBulkExportJob ?? cancelBulkExportJob;
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const [backendConfig, job] = await Promise.all([
    loadBackendServicesConfig(input.ehrTenantId, fetchImpl),
    loadBulkJob(input.bulkJobId, input.ehrTenantId),
  ]);
  if (!backendConfig) {
    throw new BulkDataError(
      'bulk_backend_services_config_missing',
      'Bulk Data cancellation requires an enabled SMART Backend Services client registration',
      409,
    );
  }
  if (!job) {
    throw new BulkDataError('bulk_job_not_found', 'Bulk Data export job not found for tenant', 404);
  }
  assertBulkJobTenant(backendConfig.tenant, job);
  if (job.status === 'canceled') {
    return {
      tenant: backendConfig.tenant,
      job: sanitizeBulkJobForResult(job),
      tokenMetadataId: null,
    };
  }
  if (job.status !== 'accepted' && job.status !== 'in_progress') {
    throw new BulkDataError(
      'bulk_job_terminal',
      'Only accepted or in-progress Bulk Data jobs can be canceled',
      409,
    );
  }

  const tokenResult = await requestBackendServiceToken({
    config: backendConfig,
    scope: backendBulkImportScope(backendConfig, job.resourceTypes),
    fetchImpl,
  });
  const canceledJob = await runCancel({
    job,
    token: tokenResult.accessToken,
    metadata: input.metadata,
    fetchImpl,
  });

  return {
    tenant: backendConfig.tenant,
    job: sanitizeBulkJobForResult(canceledJob),
    tokenMetadataId: tokenResult.tokenMetadata?.id ?? null,
  };
}

export async function getBulkJob(id: string, ehrTenantId?: number): Promise<EhrBulkJob | null> {
  const rows = await sql<BulkJobRow[]>`
    SELECT id::text AS id,
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
    FROM phm_edw.ehr_bulk_job
    WHERE id = ${id}::uuid
      AND (${ehrTenantId ?? null}::integer IS NULL OR ehr_tenant_id = ${ehrTenantId ?? null})
    LIMIT 1
  `;
  return rows[0] ? mapBulkJob(rows[0]) : null;
}

export async function listBulkJobs(input: ListBulkJobsInput): Promise<EhrBulkJobSummary[]> {
  const limit = boundedListLimit(input.limit, 10, 1, 50);
  const rows = await sql<BulkJobRow[]>`
    SELECT id::text AS id,
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
    FROM phm_edw.ehr_bulk_job
    WHERE ehr_tenant_id = ${input.ehrTenantId}
      AND (${input.status ?? null}::text IS NULL OR status = ${input.status ?? null})
    ORDER BY requested_at DESC, created_at DESC
    LIMIT ${limit}
  `;
  const jobs = rows.map(mapBulkJob);
  if (jobs.length === 0) return [];

  const jobIds = jobs.map((job) => job.id);
  const fileRows = await sql<BulkImportFileListRow[]>`
    SELECT id::text AS id,
           bulk_job_id::text AS bulk_job_id,
           org_id,
           ehr_tenant_id,
           ingest_run_id::text AS ingest_run_id,
           resource_type,
           file_url_hash,
           file_url_redacted,
           manifest_count,
           status,
           rows_read,
           resources_staged,
           error_count,
           error,
           started_at::text AS started_at,
           completed_at::text AS completed_at,
           metadata,
           created_at::text AS created_at,
           updated_at::text AS updated_at
    FROM phm_edw.ehr_bulk_import_file
    WHERE bulk_job_id = ANY(${jobIds}::uuid[])
    ORDER BY created_at DESC
  `;
  const filesByJob = new Map<string, EhrBulkImportFile[]>();
  for (const file of fileRows.map(mapBulkImportFile)) {
    const current = filesByJob.get(file.bulkJobId) ?? [];
    current.push(file);
    filesByJob.set(file.bulkJobId, current);
  }

  return jobs.map((job) => ({
    ...sanitizeBulkJobForResult(job),
    importFiles: filesByJob.get(job.id) ?? [],
  }));
}

export async function importCompletedBulkExportJob(
  input: ImportCompletedBulkExportJobInput,
  deps: ImportCompletedBulkExportJobDeps = {},
): Promise<ImportCompletedBulkExportJobResult> {
  const loadBackendServicesConfig = deps.loadBackendServicesConfig ?? loadBackendServicesConfigDefault;
  const requestBackendServiceToken = deps.requestBackendServiceToken ?? requestBackendServiceTokenDefault;
  const loadBulkJob = deps.getBulkJob ?? getBulkJob;
  const runImport = deps.importBulkExportJob ?? importBulkExportJob;
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);

  const [backendConfig, job] = await Promise.all([
    loadBackendServicesConfig(input.ehrTenantId, fetchImpl),
    loadBulkJob(input.bulkJobId, input.ehrTenantId),
  ]);

  if (!backendConfig) {
    throw new BulkDataError(
      'bulk_backend_services_config_missing',
      'Bulk Data import requires an enabled SMART Backend Services client registration',
      409,
    );
  }
  if (!job) {
    throw new BulkDataError('bulk_job_not_found', 'Bulk Data export job not found for tenant', 404);
  }
  if (job.status !== 'completed') {
    throw new BulkDataError('bulk_job_not_completed', 'Bulk Data import requires a completed export job', 409);
  }

  const storedManifest = parseBulkManifest(job.manifest);
  assertBulkJobTenant(backendConfig.tenant, job);
  assertManifestOutputsRequested(job, storedManifest);
  const tokenResult = await requestBackendServiceToken({
    config: backendConfig,
    scope: backendBulkImportScope(backendConfig, storedManifest.output.map((output) => output.type)),
    fetchImpl,
  });
  const importManifest = await loadImportManifest({
    job,
    storedManifest,
    token: tokenResult.accessToken,
    fetchImpl,
  });

  const importInput: ImportBulkExportJobInput = {
    tenant: backendConfig.tenant,
    job,
    manifest: importManifest,
    token: tokenResult?.accessToken,
    fetchImpl,
    maxResourcesPerFile: input.maxResourcesPerFile,
  };
  if (input.resumeFailedOnly !== undefined) importInput.resumeFailedOnly = input.resumeFailedOnly;
  const result = await runImport(importInput);

  return {
    ...sanitizeImportResult(result),
    tokenMetadataId: tokenResult?.tokenMetadata?.id ?? null,
  };
}

export async function importBulkExportJob(
  input: ImportBulkExportJobInput,
): Promise<ImportBulkExportJobResult> {
  if (input.job.status !== 'completed') {
    throw new BulkDataError('bulk_job_not_completed', 'Bulk Data import requires a completed export job', 409);
  }
  assertBulkJobTenant(input.tenant, input.job);
  const manifest = input.manifest ?? parseBulkManifest(input.job.manifest);
  if (manifest.output.length === 0) {
    throw new BulkDataError('bulk_manifest_empty', 'Bulk Data manifest has no output files', 409);
  }
  assertManifestOutputsRequested(input.job, manifest);
  if (manifestHasRedactedOutputUrls(manifest)) {
    throw new BulkDataError(
      'bulk_manifest_urls_redacted',
      'Bulk Data import requires raw manifest output URLs fetched at execution time',
      409,
    );
  }
  if (manifest.requiresAccessToken && !input.token?.accessToken) {
    throw new BulkDataError('bulk_import_token_required', 'Bulk Data output requires an access token', 401);
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new BulkDataError('bulk_fetch_unavailable', 'Bulk Data import requires a fetch implementation', 500);
  }

  const startIngestRun = input.startIngestRun ?? startIngestRunDefault;
  const finishIngestRun = input.finishIngestRun ?? finishIngestRunWithQdmBridgeDefault;
  const failIngestRun = input.failIngestRun ?? failIngestRunDefault;
  const drainStagedRunToEdw = input.drainStagedRunToEdw ?? drainStagedRunToEdwDefault;
  const stageFhirResource = input.stageFhirResource ?? stageFhirResourceDefault;
  const softDeleteByCrosswalk = input.softDeleteByCrosswalk ?? softDeleteByCrosswalkDefault;

  const ingestRun = await startIngestRun({
    orgId: input.tenant.orgId ?? input.job.orgId ?? null,
    ehrTenantId: input.tenant.id,
    mode: 'bulk',
    metadata: {
      source: 'ehr-bulk-data-import',
      bulkJobId: input.job.id,
      exportLevel: input.job.exportLevel,
      manifest: {
        transactionTime: manifest.transactionTime,
        request: manifest.request,
        outputCount: manifest.output.length,
      },
    },
  });
  const linkedJob = await linkBulkJobIngestRun(input.job.id, ingestRun.id);

  const files: BulkImportFileResult[] = [];
  for (const output of manifest.output) {
    const fileResult = await importBulkOutputFile({
      tenant: input.tenant,
      job: linkedJob,
      ingestRunId: ingestRun.id,
      manifest,
      output,
      token: input.token,
      fetchImpl,
      maxResourcesPerFile: input.maxResourcesPerFile,
      resumeFailedOnly: input.resumeFailedOnly ?? false,
      stageFhirResource,
    });
    files.push(fileResult);
  }

  const resourcesRead = files.reduce((sum, file) => sum + file.rowsRead, 0);
  const resourcesStaged = files.reduce((sum, file) => sum + file.resourcesStaged, 0);
  const resourcesFailed = files.reduce((sum, file) => sum + file.errorCount, 0);

  const edwHydration = resourcesStaged > 0 && resourcesFailed === 0
    ? await drainStagedRunToEdw({
        orgId: input.tenant.orgId ?? input.job.orgId ?? null,
        ehrTenantId: input.tenant.id,
        ingestRunId: ingestRun.id,
      })
    : null;
  const deletions = (manifest.deleted?.length ?? 0) > 0
    ? await processBulkDeletions({
        tenant: input.tenant,
        job: linkedJob,
        manifest,
        token: input.token,
        fetchImpl,
        softDeleteByCrosswalk,
      })
    : null;

  const errorCount = resourcesFailed + (edwHydration?.resourcesFailed ?? 0);
  const metadata = {
    bulkJobId: input.job.id,
    bulkImport: {
      files,
      resourcesRead,
      resourcesStaged,
      resourcesFailed,
      edwHydration,
      deletions,
    },
  };

  if (errorCount > 0) {
    const failedRun = await failIngestRun({
      id: ingestRun.id,
      orgId: input.tenant.orgId ?? input.job.orgId ?? null,
      ehrTenantId: input.tenant.id,
      resourcesReceived: resourcesRead,
      resourcesStaged,
      resourcesUpdated: edwHydration?.resourcesHydrated ?? 0,
      errorCount,
      errorMessage: `Bulk Data import completed with ${errorCount} error(s)`,
      errors: files.filter((file) => file.errorCount > 0),
      metadata,
    });
    return {
      job: linkedJob,
      ingestRun: failedRun,
      files,
      resourcesRead,
      resourcesStaged,
      resourcesFailed,
      edwHydration,
      qdmBridge: null,
    };
  }

  const finished = await finishIngestRun({
    id: ingestRun.id,
    orgId: input.tenant.orgId ?? input.job.orgId ?? null,
    ehrTenantId: input.tenant.id,
    resourcesReceived: resourcesRead,
    resourcesStaged,
    resourcesUpdated: edwHydration?.resourcesHydrated ?? 0,
    errorCount,
    metadata,
    qdmBridge: {
      enabled: true,
      limit: Math.max(resourcesStaged, 1),
      sourceSystem: 'ehr-bulk-data',
      failOnError: false,
    },
  });

  return {
    job: linkedJob,
    ingestRun: finished.run,
    files,
    resourcesRead,
    resourcesStaged,
    resourcesFailed,
    edwHydration,
    qdmBridge: finished.qdmBridge,
  };
}

export interface ProcessBulkDeletionsInput {
  tenant: EhrTenantRef & { id: number; orgId?: number | null };
  job: EhrBulkJob;
  manifest: BulkManifest;
  token: FhirAccessTokenRef | undefined;
  fetchImpl: FetchLike;
  softDeleteByCrosswalk: typeof softDeleteByCrosswalkDefault;
}

export interface BulkDeletionsResult {
  filesProcessed: number;
  entriesSeen: number;
  softDeleted: number;
  errorCount: number;
}

// Processes the Bulk Data `deleted` manifest outputs (NDJSON of FHIR Bundles
// whose entries carry request.method=DELETE and request.url=ResourceType/id) and
// soft-deletes each referenced resource via the crosswalk. Per-file errors are
// counted, not thrown, so a deleted-output transport failure never fails an
// otherwise-successful import.
export async function processBulkDeletions(input: ProcessBulkDeletionsInput): Promise<BulkDeletionsResult> {
  const deleted = input.manifest.deleted ?? [];
  let filesProcessed = 0;
  let entriesSeen = 0;
  let softDeleted = 0;
  let errorCount = 0;

  for (const output of deleted) {
    try {
      validateBulkOutputUrl(input.tenant, input.job, output.url, input.manifest.requiresAccessToken);
      const response = await input.fetchImpl(output.url, {
        method: 'GET',
        headers: bulkOutputHeaders(input.manifest, input.token),
      });
      if (!response.ok) {
        throw new BulkDataError(
          'bulk_deleted_fetch_failed',
          `Bulk Data deleted-output fetch failed with HTTP ${response.status}`,
          response.status,
        );
      }
      validateNdjsonContentType(response.headers.get('content-type'));

      let lineNumber = 0;
      for await (const line of responseNdjsonLines(response, new BulkOutputDownloadDigest())) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        lineNumber += 1;
        const bundle = parseNdjsonResource(trimmed, 'Bundle', lineNumber);
        for (const ref of extractDeletedReferences(bundle)) {
          entriesSeen += 1;
          const removed = await input.softDeleteByCrosswalk(input.tenant.id, ref.resourceType, ref.id, 'bulk-deleted');
          if (removed) softDeleted += 1;
        }
      }
      filesProcessed += 1;
    } catch {
      errorCount += 1;
    }
  }

  return { filesProcessed, entriesSeen, softDeleted, errorCount };
}

export function extractDeletedReferences(bundle: FhirResource): Array<{ resourceType: string; id: string }> {
  const refs: Array<{ resourceType: string; id: string }> = [];
  const entries = Array.isArray(bundle['entry']) ? bundle['entry'] : [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const request = isRecord(entry['request']) ? entry['request'] : null;
    const method = typeof request?.['method'] === 'string' ? request['method'].toUpperCase() : null;
    const url = typeof request?.['url'] === 'string' ? request['url'] : null;
    if (method !== 'DELETE' || !url) continue;
    const parts = url.split('/').filter(Boolean);
    if (parts.length >= 2) {
      refs.push({ resourceType: parts[parts.length - 2]!, id: parts[parts.length - 1]! });
    }
  }
  return refs;
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

async function loadImportManifest(input: {
  job: EhrBulkJob;
  storedManifest: BulkManifest;
  token: FhirAccessTokenRef;
  fetchImpl: FetchLike;
}): Promise<BulkManifest> {
  if (!manifestHasRedactedOutputUrls(input.storedManifest)) {
    return input.storedManifest;
  }

  const response = await input.fetchImpl(input.job.statusUrl, {
    method: 'GET',
    headers: {
      accept: 'application/fhir+json, application/json',
      authorization: `${input.token.tokenType ?? 'Bearer'} ${input.token.accessToken}`,
    },
  });
  if (response.status === 202) {
    throw new BulkDataError('bulk_job_not_completed', 'Bulk Data export job is not complete yet', 409);
  }

  const body = await parseResponseBody(response);
  if (!response.ok) {
    throw new BulkDataError(
      'bulk_status_failed',
      bulkErrorMessage(body, `Bulk Data status failed with HTTP ${response.status}`),
      response.status,
    );
  }

  const manifest = parseBulkManifest(body);
  assertManifestOutputsRequested(input.job, manifest);
  return manifest;
}

function assertBulkJobTenant(
  tenant: EhrTenantRef & { id: number; orgId?: number | null },
  job: EhrBulkJob,
): void {
  const tenantId = Number(tenant.id);
  if (!Number.isInteger(tenantId) || tenantId !== job.ehrTenantId) {
    throw new BulkDataError('bulk_job_tenant_mismatch', 'Bulk Data job does not belong to the selected EHR tenant', 403);
  }
  const tenantOrgId = tenant.orgId ?? null;
  if (tenantOrgId !== null && job.orgId !== null && tenantOrgId !== job.orgId) {
    throw new BulkDataError('bulk_job_tenant_mismatch', 'Bulk Data job organization does not match the selected tenant', 403);
  }
}

function assertManifestOutputsRequested(job: EhrBulkJob, manifest: BulkManifest): void {
  const requested = new Set(job.resourceTypes);
  const unexpected = manifest.output
    .map((output) => output.type)
    .filter((resourceType) => !requested.has(resourceType));
  if (unexpected.length > 0) {
    throw new BulkDataError(
      'bulk_manifest_output_unrequested',
      `Bulk Data manifest includes unrequested output types: ${[...new Set(unexpected)].join(', ')}`,
      409,
    );
  }
}

function sanitizeImportResult(result: ImportBulkExportJobResult): ImportBulkExportJobResult {
  return {
    ...result,
    job: sanitizeBulkJobForResult(result.job),
    files: result.files.map((file) => ({ ...file })),
  };
}

function sanitizeBulkJobForResult(job: EhrBulkJob): EhrBulkJob {
  let manifest = job.manifest;
  try {
    manifest = sanitizeBulkManifestForPersistence(parseBulkManifest(job.manifest)) as unknown as JsonObject;
  } catch {
    // Preserve malformed stored metadata as-is; the raw fetch path has already succeeded.
  }

  return {
    ...job,
    requestUrl: redactBulkUrl(job.requestUrl),
    statusUrl: redactBulkUrl(job.statusUrl),
    manifest,
    outputFiles: job.outputFiles.map(sanitizeBulkOutputForPersistence),
  };
}

function sanitizeBulkManifestForPersistence(manifest: BulkManifest): BulkManifest {
  const sanitized: BulkManifest = {
    ...manifest,
    request: redactBulkUrl(manifest.request),
    output: manifest.output.map(sanitizeBulkOutputForPersistence),
  };
  if (manifest.error) sanitized.error = manifest.error.map(sanitizeBulkOutputForPersistence);
  if (manifest.deleted) sanitized.deleted = manifest.deleted.map(sanitizeBulkOutputForPersistence);
  return sanitized;
}

function sanitizeBulkOutputForPersistence(
  output: BulkManifestOutput,
): BulkManifestOutput & BulkOutputFileIdentity {
  const identity = bulkOutputFileIdentity(output.url);
  return {
    ...output,
    url: identity.fileUrlRedacted,
    ...identity,
  };
}

function manifestHasRedactedOutputUrls(manifest: BulkManifest): boolean {
  return manifest.output.some((output) => isRedactedBulkUrl(output.url));
}

function bulkOutputFileIdentity(url: string): BulkOutputFileIdentity {
  const fileUrlHash = createHash('sha256').update(url).digest('hex');
  return {
    fileUrlHash,
    fileUrlRedacted: redactBulkUrl(url, fileUrlHash),
  };
}

function redactBulkUrl(value: string, existingHash?: string): string {
  const hash = existingHash ?? createHash('sha256').update(value).digest('hex');
  try {
    const parsed = new URL(value);
    return `${parsed.origin}/__bulk_output__/${hash.slice(0, 16)}`;
  } catch {
    return `invalid-url/__bulk_output__/${hash.slice(0, 16)}`;
  }
}

function isRedactedBulkUrl(value: string): boolean {
  try {
    return new URL(value).pathname.includes('/__bulk_output__/');
  } catch {
    return value.includes('/__bulk_output__/');
  }
}

async function importBulkOutputFile(input: {
  tenant: EhrTenantRef & { id: number; orgId?: number | null };
  job: EhrBulkJob;
  ingestRunId: string;
  manifest: BulkManifest;
  output: BulkManifestOutput;
  token?: FhirAccessTokenRef;
  fetchImpl: FetchLike;
  maxResourcesPerFile?: number;
  resumeFailedOnly: boolean;
  stageFhirResource: typeof stageFhirResourceDefault;
}): Promise<BulkImportFileResult> {
  const fileIdentity = bulkOutputFileIdentity(input.output.url);
  if (input.resumeFailedOnly) {
    const existingFile = await getBulkImportFileByHash(input.job.id, fileIdentity.fileUrlHash);
    if (existingFile?.status === 'completed') {
      return {
        resourceType: input.output.type,
        fileUrlHash: fileIdentity.fileUrlHash,
        fileUrlRedacted: fileIdentity.fileUrlRedacted,
        manifestCount: input.output.count ?? null,
        rowsRead: 0,
        resourcesStaged: 0,
        errorCount: 0,
        status: 'skipped',
      };
    }
  }

  await startBulkImportFile(input.job, input.ingestRunId, input.output, fileIdentity);

  let rowsRead = 0;
  let resourcesStaged = 0;
  const manifestCount = input.output.count ?? null;
  let downloadValidation: BulkOutputDownloadValidation | null = null;

  try {
    const checksumExpectation = bulkOutputChecksumExpectation(input.output);
    validateBulkOutputUrl(input.tenant, input.job, input.output.url, input.manifest.requiresAccessToken);
    if (input.token?.scope && !scopeAllowsBulkResource(input.token.scope, input.output.type)) {
      throw new BulkDataError(
        'bulk_import_scope_denied',
        `Bulk Data token scope does not allow ${input.output.type} output import`,
        403,
      );
    }

    const response = await input.fetchImpl(input.output.url, {
      method: 'GET',
      headers: bulkOutputHeaders(input.manifest, input.token),
    });
    if (!response.ok) {
      throw new BulkDataError(
        'bulk_output_fetch_failed',
        `Bulk Data output fetch failed with HTTP ${response.status}`,
        response.status,
      );
    }
    validateNdjsonContentType(response.headers.get('content-type'));

    const downloadDigest = new BulkOutputDownloadDigest();
    for await (const line of responseNdjsonLines(response, downloadDigest)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      rowsRead += 1;
      if (input.maxResourcesPerFile && rowsRead > input.maxResourcesPerFile) {
        throw new BulkDataError(
          'bulk_output_resource_limit',
          `Bulk Data output ${input.output.type} exceeded the per-file import limit`,
          413,
        );
      }

      const resource = parseNdjsonResource(trimmed, input.output.type, rowsRead);
      await input.stageFhirResource({
        orgId: input.tenant.orgId ?? input.job.orgId ?? null,
        ehrTenantId: input.tenant.id,
        ingestRunId: input.ingestRunId,
        resource,
      });
      resourcesStaged += 1;
    }

    downloadValidation = bulkOutputDownloadValidation(input.output, downloadDigest, checksumExpectation);
    validateBulkOutputDownload(input.output, downloadValidation);

    await completeBulkImportFile(input.job.id, fileIdentity.fileUrlHash, {
      rowsRead,
      resourcesStaged,
      errorCount: 0,
      metadata: bulkFileMetadata(manifestCount, downloadValidation),
    });
    return {
      resourceType: input.output.type,
      fileUrlHash: fileIdentity.fileUrlHash,
      fileUrlRedacted: fileIdentity.fileUrlRedacted,
      manifestCount,
      bytesRead: downloadValidation.bytesRead,
      checksumSha256: downloadValidation.sha256,
      rowsRead,
      resourcesStaged,
      errorCount: 0,
      status: 'completed',
    };
  } catch (err) {
    const message = errorMessage(err);
    await failBulkImportFile(input.job.id, fileIdentity.fileUrlHash, {
      rowsRead,
      resourcesStaged,
      errorCount: 1,
      error: normalizedErrorBody({ error: message }, err instanceof BulkDataError ? err.status : 500),
      metadata: bulkFileMetadata(manifestCount, downloadValidation),
    });
    return {
      resourceType: input.output.type,
      fileUrlHash: fileIdentity.fileUrlHash,
      fileUrlRedacted: fileIdentity.fileUrlRedacted,
      manifestCount,
      ...(downloadValidation ? {
        bytesRead: downloadValidation.bytesRead,
        checksumSha256: downloadValidation.sha256,
      } : {}),
      rowsRead,
      resourcesStaged,
      errorCount: 1,
      status: 'failed',
      errorMessage: message,
    };
  }
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
  const persistedManifest = sanitizeBulkManifestForPersistence(manifest);
  const rows = await sql<BulkJobRow[]>`
    UPDATE phm_edw.ehr_bulk_job
    SET status = 'completed',
        manifest = ${sql.json(asSqlJson(persistedManifest))},
        output_files = ${sql.json(asSqlJson(persistedManifest.output))},
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

async function markBulkJobCanceled(id: string, metadata: JsonObject): Promise<EhrBulkJob> {
  const rows = await sql<BulkJobRow[]>`
    UPDATE phm_edw.ehr_bulk_job
    SET status = 'canceled',
        completed_at = COALESCE(completed_at, NOW()),
        next_poll_at = NULL,
        metadata = metadata || ${sql.json(asSqlJson({ cancel: metadata }))},
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
  return requireBulkJob(rows, 'mark canceled');
}

async function linkBulkJobIngestRun(id: string, ingestRunId: string): Promise<EhrBulkJob> {
  const rows = await sql<BulkJobRow[]>`
    UPDATE phm_edw.ehr_bulk_job
    SET ingest_run_id = ${ingestRunId}::uuid,
        metadata = metadata || ${sql.json(asSqlJson({ importIngestRunId: ingestRunId }))},
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
  return requireBulkJob(rows, 'link ingest run');
}

async function startBulkImportFile(
  job: EhrBulkJob,
  ingestRunId: string,
  output: BulkManifestOutput,
  identity: BulkOutputFileIdentity = bulkOutputFileIdentity(output.url),
): Promise<BulkOutputFileIdentity> {
  await sql<BulkImportFileRow[]>`
    INSERT INTO phm_edw.ehr_bulk_import_file
      (bulk_job_id, org_id, ehr_tenant_id, ingest_run_id, resource_type,
       file_url_hash, file_url_redacted, manifest_count, status, started_at, metadata)
    VALUES (
      ${job.id}::uuid,
      ${job.orgId},
      ${job.ehrTenantId},
      ${ingestRunId}::uuid,
      ${output.type},
      ${identity.fileUrlHash},
      ${identity.fileUrlRedacted},
      ${output.count ?? null},
      'running',
      NOW(),
      ${sql.json(asSqlJson({
        manifestOutput: {
          type: output.type,
          count: output.count ?? null,
          checksum: output.checksum ?? null,
          size: output.size ?? null,
          fileUrlHash: identity.fileUrlHash,
          fileUrlRedacted: identity.fileUrlRedacted,
        },
      }))}
    )
    ON CONFLICT ON CONSTRAINT uq_ehr_bulk_import_file_url_hash
    DO UPDATE SET
      ingest_run_id = EXCLUDED.ingest_run_id,
      resource_type = EXCLUDED.resource_type,
      file_url_redacted = EXCLUDED.file_url_redacted,
      manifest_count = EXCLUDED.manifest_count,
      status = 'running',
      rows_read = 0,
      resources_staged = 0,
      error_count = 0,
      error = NULL,
      started_at = NOW(),
      completed_at = NULL,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING id::text AS id
  `;
  return identity;
}

async function getBulkImportFileByHash(
  bulkJobId: string,
  fileUrlHash: string,
): Promise<EhrBulkImportFile | null> {
  const rows = await sql<BulkImportFileListRow[]>`
    SELECT id::text AS id,
           bulk_job_id::text AS bulk_job_id,
           org_id,
           ehr_tenant_id,
           ingest_run_id::text AS ingest_run_id,
           resource_type,
           file_url_hash,
           file_url_redacted,
           manifest_count,
           status,
           rows_read,
           resources_staged,
           error_count,
           error,
           started_at::text AS started_at,
           completed_at::text AS completed_at,
           metadata,
           created_at::text AS created_at,
           updated_at::text AS updated_at
    FROM phm_edw.ehr_bulk_import_file
    WHERE bulk_job_id = ${bulkJobId}::uuid
      AND file_url_hash = ${fileUrlHash}
    LIMIT 1
  `;
  return rows[0] ? mapBulkImportFile(rows[0]) : null;
}

async function completeBulkImportFile(
  bulkJobId: string,
  fileUrlHash: string,
  input: {
    rowsRead: number;
    resourcesStaged: number;
    errorCount: number;
    metadata: JsonObject;
  },
): Promise<void> {
  await sql<BulkImportFileRow[]>`
    UPDATE phm_edw.ehr_bulk_import_file
    SET status = 'completed',
        rows_read = ${input.rowsRead},
        resources_staged = ${input.resourcesStaged},
        error_count = ${input.errorCount},
        error = NULL,
        completed_at = NOW(),
        metadata = metadata || ${sql.json(asSqlJson(input.metadata))},
        updated_at = NOW()
    WHERE bulk_job_id = ${bulkJobId}::uuid
      AND file_url_hash = ${fileUrlHash}
    RETURNING id::text AS id
  `;
}

async function failBulkImportFile(
  bulkJobId: string,
  fileUrlHash: string,
  input: {
    rowsRead: number;
    resourcesStaged: number;
    errorCount: number;
    error: JsonObject;
    metadata?: JsonObject;
  },
): Promise<void> {
  await sql<BulkImportFileRow[]>`
    UPDATE phm_edw.ehr_bulk_import_file
    SET status = 'failed',
        rows_read = ${input.rowsRead},
        resources_staged = ${input.resourcesStaged},
        error_count = ${input.errorCount},
        error = ${sql.json(asSqlJson(input.error))},
        completed_at = NOW(),
        metadata = metadata || ${sql.json(asSqlJson(input.metadata ?? {}))},
        updated_at = NOW()
    WHERE bulk_job_id = ${bulkJobId}::uuid
      AND file_url_hash = ${fileUrlHash}
    RETURNING id::text AS id
  `;
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

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
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

function boundedListLimit(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(value, max));
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
  if (value.checksum !== undefined) {
    output.checksum = stringField(value.checksum, `${label}.checksum`);
  }
  if (value.size !== undefined) {
    if (typeof value.size !== 'number' || !Number.isInteger(value.size) || value.size < 0) {
      throw new BulkDataError('bulk_manifest_invalid', `Bulk Data manifest ${label}.size must be a non-negative integer`, 502);
    }
    output.size = value.size;
  }
  return output;
}

function isBulkOutput(value: unknown): value is BulkManifestOutput {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    typeof value.url === 'string' &&
    (value.count === undefined || (typeof value.count === 'number' && Number.isInteger(value.count) && value.count >= 0)) &&
    (value.checksum === undefined || typeof value.checksum === 'string') &&
    (value.size === undefined || (typeof value.size === 'number' && Number.isInteger(value.size) && value.size >= 0))
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

function bulkOutputHeaders(manifest: BulkManifest, token: FhirAccessTokenRef | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/fhir+ndjson, application/ndjson, application/x-ndjson, application/octet-stream, text/plain',
  };
  if (manifest.requiresAccessToken && token?.accessToken) {
    headers.authorization = `${token.tokenType ?? 'Bearer'} ${token.accessToken}`;
  }
  return headers;
}

function validateBulkStatusUrl(tenant: EhrTenantRef, requestUrl: string, statusUrl: string): void {
  const parsed = parseBulkHttpUrl(statusUrl, 'bulk_status_url_invalid', 'Bulk Data status URL must be absolute http(s)');
  if (parsed.protocol !== 'https:' && !isLocalhost(parsed.hostname)) {
    throw new BulkDataError('bulk_status_url_insecure', 'Bulk Data status URL must use HTTPS outside localhost', 502);
  }

  const allowedOrigins = new Set<string>();
  for (const candidate of [tenant.fhirBaseUrl, requestUrl]) {
    try {
      allowedOrigins.add(new URL(candidate).origin);
    } catch {
      // Ignore malformed configured values; the status URL still must match a valid origin.
    }
  }
  if (!allowedOrigins.has(parsed.origin)) {
    throw new BulkDataError(
      'bulk_status_origin_denied',
      'Bulk Data status URL origin does not match tenant FHIR request origin',
      502,
    );
  }
}

function validateBulkOutputUrl(
  tenant: EhrTenantRef,
  job: EhrBulkJob,
  url: string,
  _sendsAccessToken: boolean,
): void {
  const parsed = parseBulkHttpUrl(url, 'bulk_output_url_invalid', 'Bulk Data output URL must be absolute http(s)');
  if (parsed.protocol !== 'https:' && !isLocalhost(parsed.hostname)) {
    throw new BulkDataError('bulk_output_url_insecure', 'Bulk Data output URL must use HTTPS outside localhost', 502);
  }

  const allowedOrigins = new Set<string>();
  for (const candidate of [tenant.fhirBaseUrl, job.statusUrl, job.requestUrl]) {
    try {
      allowedOrigins.add(new URL(candidate).origin);
    } catch {
      // Ignore malformed stored values; at least one valid origin must match.
    }
  }
  if (!allowedOrigins.has(parsed.origin)) {
    throw new BulkDataError(
      'bulk_output_origin_denied',
      'Bulk Data output URL origin does not match tenant FHIR or Bulk status endpoint origin',
      502,
    );
  }
}

function parseBulkHttpUrl(value: string, code: string, message: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BulkDataError(code, message, 502);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BulkDataError(code, message, 502);
  }
  return parsed;
}

function validateNdjsonContentType(value: string | null): void {
  if (!value) return;
  const normalized = value.toLowerCase();
  if (
    normalized.includes('ndjson') ||
    normalized.includes('application/octet-stream') ||
    normalized.includes('text/plain')
  ) {
    return;
  }
  throw new BulkDataError('bulk_output_content_type_invalid', `Unsupported Bulk Data output content type: ${value}`, 415);
}

class BulkOutputDownloadDigest {
  private readonly hash = createHash('sha256');
  private finalized = false;
  bytesRead = 0;

  update(value: Uint8Array | string): void {
    if (this.finalized) {
      throw new BulkDataError('bulk_output_digest_finalized', 'Bulk Data output digest has already been finalized', 500);
    }
    if (typeof value === 'string') {
      const encoded = new TextEncoder().encode(value);
      this.bytesRead += encoded.byteLength;
      this.hash.update(encoded);
      return;
    }
    this.bytesRead += value.byteLength;
    this.hash.update(value);
  }

  digestHex(): string {
    if (this.finalized) {
      throw new BulkDataError('bulk_output_digest_finalized', 'Bulk Data output digest has already been finalized', 500);
    }
    this.finalized = true;
    return this.hash.digest('hex');
  }
}

function bulkOutputChecksumExpectation(output: BulkManifestOutput): string | null {
  if (output.checksum === undefined) return null;
  const checksum = output.checksum.trim();
  const unprefixed = checksum.match(/^[a-f0-9]{64}$/i);
  if (unprefixed) return checksum.toLowerCase();

  const prefixed = checksum.match(/^(?:sha-?256)[:=]([a-f0-9]{64})$/i);
  if (prefixed?.[1]) return prefixed[1].toLowerCase();

  throw new BulkDataError(
    'bulk_output_checksum_unsupported',
    `Bulk Data output ${output.type} checksum must be a SHA-256 hex digest`,
    422,
  );
}

function bulkOutputDownloadValidation(
  output: BulkManifestOutput,
  digest: BulkOutputDownloadDigest,
  expectedChecksum: string | null,
): BulkOutputDownloadValidation {
  return {
    bytesRead: digest.bytesRead,
    sha256: digest.digestHex(),
    expectedSize: output.size ?? null,
    expectedChecksum,
    checksumAlgorithm: expectedChecksum ? 'sha256' : null,
  };
}

function validateBulkOutputDownload(
  output: BulkManifestOutput,
  validation: BulkOutputDownloadValidation,
): void {
  if (validation.expectedSize !== null && validation.bytesRead !== validation.expectedSize) {
    throw new BulkDataError(
      'bulk_output_size_mismatch',
      `Bulk Data output ${output.type} size mismatch: expected ${validation.expectedSize} bytes, received ${validation.bytesRead}`,
      422,
    );
  }
  if (validation.expectedChecksum !== null && validation.sha256 !== validation.expectedChecksum) {
    throw new BulkDataError(
      'bulk_output_checksum_mismatch',
      `Bulk Data output ${output.type} checksum mismatch`,
      422,
    );
  }
}

function bulkFileMetadata(
  manifestCount: number | null,
  downloadValidation: BulkOutputDownloadValidation | null,
): JsonObject {
  const metadata: JsonObject = { manifestCount };
  if (downloadValidation) metadata.downloadValidation = downloadValidation;
  return metadata;
}

async function* responseNdjsonLines(
  response: Response,
  downloadDigest?: BulkOutputDownloadDigest,
): AsyncGenerator<string> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await response.text();
    downloadDigest?.update(text);
    for (const line of text.split(/\r?\n/)) yield line;
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    downloadDigest?.update(value);
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.search(/\r?\n/);
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      const newlineLength = buffer[newlineIndex] === '\r' && buffer[newlineIndex + 1] === '\n' ? 2 : 1;
      buffer = buffer.slice(newlineIndex + newlineLength);
      yield line;
      newlineIndex = buffer.search(/\r?\n/);
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) yield buffer;
}

function parseNdjsonResource(line: string, expectedResourceType: string, lineNumber: number): FhirResource {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    throw new BulkDataError('bulk_output_ndjson_invalid', `Bulk Data NDJSON line ${lineNumber} is not valid JSON`, 422);
  }
  if (!isRecord(parsed)) {
    throw new BulkDataError('bulk_output_resource_invalid', `Bulk Data NDJSON line ${lineNumber} is not an object`, 422);
  }
  if (parsed['resourceType'] !== expectedResourceType) {
    throw new BulkDataError(
      'bulk_output_resource_type_mismatch',
      `Bulk Data NDJSON line ${lineNumber} has resourceType ${String(parsed['resourceType'])}, expected ${expectedResourceType}`,
      422,
    );
  }
  return parsed as FhirResource;
}

function scopeAllowsBulkResource(scope: string, resourceType: string): boolean {
  const scopes = scope.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  return scopes.some((item) => {
    const slashIndex = item.indexOf('/');
    const dotIndex = item.lastIndexOf('.');
    if (slashIndex <= 0 || dotIndex <= slashIndex + 1) return false;
    const context = item.slice(0, slashIndex);
    if (context !== 'system' && context !== 'patient') return false;
    const scopedResource = item.slice(slashIndex + 1, dotIndex);
    if (scopedResource !== resourceType && scopedResource !== '*') return false;
    const access = item.slice(dotIndex + 1).toLowerCase();
    return scopeAccessAllowsRead(access);
  });
}

function scopeAccessAllowsRead(access: string): boolean {
  if (access === '*' || access === 'read') return true;
  if (!/^[cruds]+$/.test(access)) return false;
  return access.includes('r') || access.includes('s');
}

function backendBulkImportScope(config: BackendServicesConfig, resourceTypes: readonly string[]): string {
  const wantedResources = new Set(normalizeResourceTypes(resourceTypes));
  const requested = scopeItems(config.scopesRequested);
  const granted = scopeItems(config.scopesGranted);
  const candidates = requested.filter((scope) => {
    if (granted.length > 0 && !granted.includes(scope)) return false;
    if (!scope.startsWith('system/')) return false;
    return [...wantedResources].some((resourceType) => scopeAllowsBulkResource(scope, resourceType));
  });

  const missing = [...wantedResources].filter(
    (resourceType) => !candidates.some((scope) => scopeAllowsBulkResource(scope, resourceType)),
  );
  if (missing.length > 0) {
    throw new BulkDataError(
      'bulk_import_scope_missing',
      `SMART Backend Services registration is missing Bulk Data read scopes for: ${missing.join(', ')}`,
      409,
    );
  }
  return candidates.join(' ');
}

function scopeItems(scope: string | undefined): string[] {
  return typeof scope === 'string'
    ? scope.split(/\s+/).map((item) => item.trim()).filter(Boolean)
    : [];
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

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Bulk Data import failed';
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

function isLocalhost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
