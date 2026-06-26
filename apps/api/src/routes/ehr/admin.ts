import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  cancelBulkExportJobWithBackendServices,
  listBulkJobs,
  type BulkExportLevel,
  type BulkJobStatus,
} from '../../services/ehr/bulkData.js';
import {
  listIngestRuns,
  recordQdmReplayResult,
  type EhrIngestRunMode,
  type EhrIngestRunStatus,
  type ListEhrIngestRunsInput,
} from '../../services/ehr/ingestRuns.js';
import {
  BulkScheduleOwnershipError,
  listBulkSchedules,
  MAX_BULK_SCHEDULE_INTERVAL_MINUTES,
  MIN_BULK_SCHEDULE_INTERVAL_MINUTES,
  upsertBulkSchedule,
  type BulkScheduleSinceMode,
} from '../../services/ehr/bulkSchedules.js';
import {
  getLatestCapabilitySnapshot,
  getTenant,
  listClientRegistrations,
  listTenants,
  saveCapabilitySnapshot,
  type EhrClientApprovalStatus,
  type EhrClientAuthMethod,
  type EhrClientType,
  type EhrEnvironment,
  type EhrVendor,
  type JsonObject,
  type ListEhrTenantsFilter,
  type SanitizedEhrClientRegistration,
} from '../../services/ehr/tenantRegistry.js';
import {
  BackendServicesError,
  loadBackendServicesConfig,
  requestBackendServiceToken,
} from '../../services/ehr/backendServices.js';
import { discoverSmartConfiguration } from '../../services/ehr/smartDiscovery.js';
import { buildEhrOnboardingProfile } from '../../services/ehr/onboardingProfile.js';
import {
  applyEhrOnboardingRegistration,
  type EhrOnboardingClientInput,
  type EhrOnboardingRegistrationInput,
} from '../../services/ehr/onboardingRegistration.js';
import { normalizeStagedRunToQdm } from '../../services/ehr/qdmBridge.js';
import { getTenantReadinessEvidence } from '../../services/ehr/readinessEvidence.js';
import { getTenantSyncStatus } from '../../services/ehr/syncStatus.js';
import {
  loadQdmEventsToCqlEngine,
  type LoadQdmEventsToCqlEngineInput,
  type LoadQdmEventsToCqlEngineResult,
} from '../../services/qdm/index.js';
import { enqueueEhrBulkExport, enqueueEhrBulkImport } from '../../workers/ehr-bulk-import.js';
import { enqueueSmartPatientContextRefresh } from '../../workers/ehr-patient-context-refresh.js';

const VENDORS = new Set<EhrVendor>(['epic', 'oracle_cerner', 'smart_generic', 'hapi', 'other']);
const ENVIRONMENTS = new Set<EhrEnvironment>(['sandbox', 'staging', 'production']);
const BULK_JOB_STATUSES = new Set<BulkJobStatus>(['accepted', 'in_progress', 'completed', 'failed', 'canceled']);
const BULK_EXPORT_LEVELS = new Set<BulkExportLevel>(['system', 'group', 'patient']);
const BULK_SCHEDULE_SINCE_MODES = new Set<BulkScheduleSinceMode>(['none', 'fixed', 'last_success']);
const INGEST_RUN_STATUSES = new Set<EhrIngestRunStatus>(['running', 'succeeded', 'failed', 'canceled']);
const INGEST_RUN_MODES = new Set<EhrIngestRunMode>(['incremental', 'backfill', 'bulk', 'manual']);
const AUTH_METHODS = new Set<EhrClientAuthMethod>([
  'public_pkce',
  'client_secret_post',
  'client_secret_basic',
  'private_key_jwt',
  'fhir_authorization_jwt',
  'shared_secret',
]);
const APPROVAL_STATUSES = new Set<EhrClientApprovalStatus>([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'expired',
  'revoked',
  'unknown',
]);

interface TenantListQuery {
  vendor?: string | string[];
  environment?: string | string[];
  status?: string | string[];
}

interface IngestRunListQuery {
  status?: string | string[];
  mode?: string | string[];
  resourceType?: string | string[];
  resource_type?: string | string[];
  limit?: string | string[];
}

interface BulkJobListQuery {
  status?: string | string[];
  limit?: string | string[];
}

interface OnboardingProfileQuery {
  vendor?: string | string[];
  environment?: string | string[];
  name?: string | string[];
  fhirBaseUrl?: string | string[];
  fhir_base_url?: string | string[];
  apiBaseUrl?: string | string[];
  api_base_url?: string | string[];
  tenantId?: string | string[];
  tenant_id?: string | string[];
  orgId?: string | string[];
  org_id?: string | string[];
  status?: string | string[];
  smartClientId?: string | string[];
  smart_client_id?: string | string[];
  backendClientId?: string | string[];
  backend_client_id?: string | string[];
  cdsClientId?: string | string[];
  cds_client_id?: string | string[];
}

interface UpsertTenantBody {
  tenant?: unknown;
  apiBaseUrl?: unknown;
  api_base_url?: unknown;
  smartLaunch?: unknown;
  smart_launch?: unknown;
  backendServices?: unknown;
  backend_services?: unknown;
  cdsHooks?: unknown;
  cds_hooks?: unknown;
}

interface TenantIdParams {
  id: string;
}

interface BulkJobActionParams extends TenantIdParams {
  bulkJobId: string;
}

interface IngestRunQdmParams extends TenantIdParams {
  runId: string;
}

interface IngestRunQdmBody {
  limit?: unknown;
  sourceSystem?: unknown;
  source_system?: unknown;
}

interface TenantQdmCqlLoadBody {
  ingestRunId?: unknown;
  ingest_run_id?: unknown;
  qdmEventIds?: unknown;
  qdm_event_ids?: unknown;
  patientIds?: unknown;
  patient_ids?: unknown;
  patientRefs?: unknown;
  patient_refs?: unknown;
  qdmDatatypes?: unknown;
  qdm_datatypes?: unknown;
  periodStart?: unknown;
  period_start?: unknown;
  periodEnd?: unknown;
  period_end?: unknown;
  engineBaseUrl?: unknown;
  engine_base_url?: unknown;
  includePatientRecords?: unknown;
  include_patient_records?: unknown;
  limit?: unknown;
}

interface PatientContextRefreshBody {
  patientResourceId?: unknown;
  patient_resource_id?: unknown;
  localPatientId?: unknown;
  local_patient_id?: unknown;
  requestedSince?: unknown;
  requested_since?: unknown;
  resourceTypes?: unknown;
  resource_types?: unknown;
  pageSize?: unknown;
  page_size?: unknown;
  maxPages?: unknown;
  max_pages?: unknown;
}

interface BulkImportBody {
  bulkJobId?: unknown;
  bulk_job_id?: unknown;
  maxResourcesPerFile?: unknown;
  max_resources_per_file?: unknown;
  resumeFailedOnly?: unknown;
  resume_failed_only?: unknown;
}

interface BulkExportBody {
  exportLevel?: unknown;
  export_level?: unknown;
  resourceTypes?: unknown;
  resource_types?: unknown;
  groupId?: unknown;
  group_id?: unknown;
  patientId?: unknown;
  patient_id?: unknown;
  since?: unknown;
  typeFilters?: unknown;
  type_filters?: unknown;
  maxResourcesPerFile?: unknown;
  max_resources_per_file?: unknown;
}

interface BackendTokenCheckBody {
  scope?: unknown;
}

interface BulkScheduleBody extends BulkExportBody {
  id?: unknown;
  enabled?: unknown;
  intervalMinutes?: unknown;
  interval_minutes?: unknown;
  sinceMode?: unknown;
  since_mode?: unknown;
  nextRunAt?: unknown;
  next_run_at?: unknown;
}

export default async function ehrAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole(['admin']));

  app.get<{ Querystring: TenantListQuery }>('/tenants', async (request, reply) => {
    const parsedFilter = parseTenantListFilter(request.query);
    if ('error' in parsedFilter) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: parsedFilter.error },
      });
    }

    const tenants = await listTenants(parsedFilter.filter);
    return reply.send({
      success: true,
      data: {
        tenants,
        count: tenants.length,
      },
    });
  });

  app.post<{ Body: UpsertTenantBody }>('/tenants', async (request, reply) => {
    const parsed = parseUpsertTenantBody(request.body);
    if ('error' in parsed) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: parsed.error },
      });
    }

    const result = await applyEhrOnboardingRegistration(parsed.input);
    await request.auditLog('ehr_tenant_upsert', 'ehr_tenant', String(result.tenant.id), {
      tenantId: result.tenant.id,
      orgId: result.tenant.orgId,
      vendor: result.tenant.vendor,
      environment: result.tenant.environment,
      status: result.tenant.status,
      clientCount: result.clients.length,
      clientTypes: result.clients.map((client) => client.clientType),
      enabledClientCount: result.clients.filter((client) => client.enabled).length,
    });
    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  app.get<{ Params: TenantIdParams }>('/tenants/:id', async (request, reply) => {
    const tenantId = parseTenantId(request.params.id);
    if (tenantId === undefined) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
      });
    }

    const tenant = await getTenant(tenantId);
    if (!tenant) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
      });
    }

    const [clientRegistrations, latestCapabilitySnapshot] = await Promise.all([
      listClientRegistrations(tenantId),
      getLatestCapabilitySnapshot(tenantId),
    ]);

    return reply.send({
      success: true,
      data: {
        tenant,
        clientRegistrations,
        latestCapabilitySnapshot,
        readiness: {
          clients: clientRegistrations.map((client) => buildClientReadiness(client.clientType, client)),
        },
      },
    });
  });

  app.get<{ Params: TenantIdParams }>('/tenants/:id/capabilities', async (request, reply) => {
    const tenantId = parseTenantId(request.params.id);
    if (tenantId === undefined) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
      });
    }

    const tenant = await getTenant(tenantId);
    if (!tenant) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
      });
    }

    const latestCapabilitySnapshot = await getLatestCapabilitySnapshot(tenantId);
    return reply.send({
      success: true,
      data: {
        tenant,
        latestCapabilitySnapshot,
        resourceSupport: latestCapabilitySnapshot?.resourceSupport ?? {},
      },
    });
  });

  app.get<{ Params: TenantIdParams }>('/tenants/:id/readiness-evidence', async (request, reply) =>
    sendTenantReadinessEvidence(request, reply),
  );

  app.get<{ Querystring: OnboardingProfileQuery }>('/onboarding-profile', async (request, reply) => {
    const parsed = parseOnboardingProfileQuery(request.query);
    if ('error' in parsed) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: parsed.error },
      });
    }

    return reply.send({
      success: true,
      data: {
        profile: buildEhrOnboardingProfile(parsed.input),
      },
    });
  });

  app.post<{ Params: TenantIdParams }>('/tenants/:id/discover', async (request, reply) =>
    sendTenantDiagnostics(request, reply),
  );

  app.post<{ Params: TenantIdParams }>('/tenants/:id/test-connection', async (request, reply) =>
    sendTenantDiagnostics(request, reply),
  );

  app.get<{ Params: TenantIdParams }>('/tenants/:id/diagnostics', async (request, reply) =>
    sendTenantDiagnostics(request, reply),
  );

  app.post<{ Params: TenantIdParams; Body: BackendTokenCheckBody }>(
    '/tenants/:id/backend-token-check',
    async (request, reply) => sendTenantBackendTokenCheck(request, reply),
  );

  app.get<{ Params: TenantIdParams; Querystring: IngestRunListQuery }>(
    '/tenants/:id/ingest-runs',
    async (request, reply) => sendTenantIngestRuns(request, reply),
  );

  app.get<{ Params: TenantIdParams }>(
    '/tenants/:id/sync-status',
    async (request, reply) => sendTenantSyncStatus(request, reply),
  );

  app.post<{ Params: IngestRunQdmParams; Body: IngestRunQdmBody }>(
    '/tenants/:id/ingest-runs/:runId/qdm-normalization',
    async (request, reply) => sendQdmNormalizationReplay(request, reply),
  );

  app.post<{ Params: TenantIdParams; Body: TenantQdmCqlLoadBody }>(
    '/tenants/:id/qdm/cql-load',
    async (request, reply) => sendTenantQdmCqlLoad(request, reply),
  );

  app.post<{ Params: TenantIdParams; Body: PatientContextRefreshBody }>(
    '/tenants/:id/patient-context-refresh',
    async (request, reply) => sendTenantPatientContextRefresh(request, reply),
  );

  app.get<{ Params: TenantIdParams; Querystring: BulkJobListQuery }>(
    '/tenants/:id/bulk-jobs',
    async (request, reply) => sendTenantBulkJobs(request, reply),
  );

  app.get<{ Params: TenantIdParams }>(
    '/tenants/:id/bulk-schedules',
    async (request, reply) => sendTenantBulkSchedules(request, reply),
  );

  app.post<{ Params: TenantIdParams; Body: BulkScheduleBody }>(
    '/tenants/:id/bulk-schedules',
    async (request, reply) => sendTenantBulkScheduleUpsert(request, reply),
  );

  app.post<{ Params: TenantIdParams; Body: BulkExportBody }>(
    '/tenants/:id/bulk-exports',
    async (request, reply) => sendTenantBulkExport(request, reply),
  );

  app.post<{ Params: TenantIdParams; Body: BulkImportBody }>(
    '/tenants/:id/bulk-imports',
    async (request, reply) => sendTenantBulkImport(request, reply),
  );

  app.post<{ Params: BulkJobActionParams }>(
    '/tenants/:id/bulk-jobs/:bulkJobId/cancel',
    async (request, reply) => sendTenantBulkJobCancel(request, reply),
  );
}

async function sendTenantBackendTokenCheck(
  request: FastifyRequest<{ Params: TenantIdParams; Body: BackendTokenCheckBody }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const parsedBody = parseBackendTokenCheckBody(request.body ?? {});
  if ('error' in parsedBody) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: parsedBody.error },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const config = await loadBackendServicesConfig(tenant.id);
  if (!config) {
    return reply.status(409).send({
      success: false,
      error: {
        code: 'BACKEND_SERVICES_NOT_CONFIGURED',
        message: 'No enabled SMART Backend Services client registration exists for this tenant',
      },
    });
  }

  try {
    const result = await requestBackendServiceToken({
      config,
      scope: parsedBody.input.scope,
    });
    const scopeCount = splitScopes(result.accessToken.scope).length;
    await request.auditLog('ehr_backend_token_check', 'ehr_tenant', String(tenant.id), {
      tenantId: tenant.id,
      orgId: tenant.orgId,
      authMethod: config.authMethod,
      scopeCount,
      tokenType: result.accessToken.tokenType,
      expiresAt: result.accessToken.expiresAt ?? null,
      tokenMetadataId: result.tokenMetadata?.id ?? null,
    });

    return reply.send({
      success: true,
      data: {
        tenant,
        backendTokenCheck: {
          status: 'succeeded',
          authMethod: config.authMethod,
          tokenType: result.accessToken.tokenType,
          scope: result.accessToken.scope ?? null,
          scopeCount,
          expiresAt: result.accessToken.expiresAt ?? null,
          tokenMetadataId: result.tokenMetadata?.id ?? null,
        },
      },
    });
  } catch (error) {
    const statusCode = error instanceof BackendServicesError ? error.status : 502;
    const code = error instanceof BackendServicesError ? error.code : 'backend_token_check_failed';
    await request.auditLog('ehr_backend_token_check_failed', 'ehr_tenant', String(tenant.id), {
      tenantId: tenant.id,
      orgId: tenant.orgId,
      authMethod: config.authMethod,
      errorCode: code,
      error: errorMessage(error),
    });
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: code.toUpperCase(),
        message: errorMessage(error),
      },
    });
  }
}

async function sendTenantReadinessEvidence(
  request: FastifyRequest<{ Params: TenantIdParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const readinessEvidence = await getTenantReadinessEvidence(tenant);
  return reply.send({
    success: true,
    data: {
      tenant,
      readinessEvidence,
    },
  });
}

async function sendTenantDiagnostics(
  request: FastifyRequest<{ Params: TenantIdParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  try {
    const diagnostics = await discoverSmartConfiguration(tenant);
    const snapshot = await saveCapabilitySnapshot({
      ehrTenantId: tenant.id,
      smartConfiguration: discoveryDocumentToJson(diagnostics.smartConfiguration),
      capabilityStatement: discoveryDocumentToJson(diagnostics.capabilityStatement),
      resourceSupport: diagnostics.capabilityStatement.summary?.resourceSupport ?? {},
    });
    await request.auditLog('ehr_diagnostics_run', 'ehr_tenant', String(tenant.id), {
      tenantId: tenant.id,
      orgId: tenant.orgId,
      vendor: tenant.vendor,
      environment: tenant.environment,
      snapshotId: snapshot.id,
      smartOk: diagnostics.smartConfiguration.ok,
      capabilityOk: diagnostics.capabilityStatement.ok,
      resourceSupportCount: Object.keys(diagnostics.capabilityStatement.summary?.resourceSupport ?? {}).length,
      smartStatus: diagnostics.smartConfiguration.status ?? null,
      capabilityStatus: diagnostics.capabilityStatement.status ?? null,
    });
    return reply.send({
      success: true,
      data: {
        tenant,
        diagnostics,
        snapshot,
      },
    });
  } catch (error) {
    request.log.error({ err: error, tenantId }, '[ehr-admin] SMART discovery failed');
    await request.auditLog('ehr_diagnostics_failed', 'ehr_tenant', String(tenant.id), {
      tenantId: tenant.id,
      orgId: tenant.orgId,
      vendor: tenant.vendor,
      environment: tenant.environment,
      error: errorMessage(error),
    });
    return reply.status(502).send({
      success: false,
      error: {
        code: 'EHR_DISCOVERY_FAILED',
        message: errorMessage(error),
      },
    });
  }
}

async function sendTenantIngestRuns(
  request: FastifyRequest<{ Params: TenantIdParams; Querystring: IngestRunListQuery }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const parsedQuery = parseIngestRunListQuery(request.query);
  if ('error' in parsedQuery) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: parsedQuery.error },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const ingestRuns = await listIngestRuns({
    ehrTenantId: tenant.id,
    ...parsedQuery.filter,
  });

  return reply.send({
    success: true,
    data: {
      tenant,
      ingestRuns,
      latest: ingestRuns[0] ?? null,
      count: ingestRuns.length,
    },
  });
}

async function sendQdmNormalizationReplay(
  request: FastifyRequest<{ Params: IngestRunQdmParams; Body: IngestRunQdmBody }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const runId = parseUuid(request.params.runId);
  if (!runId) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Ingest run id must be a UUID' },
    });
  }

  const parsedBody = parseQdmReplayBody(request.body ?? {});
  if ('error' in parsedBody) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: parsedBody.error },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const result = await normalizeStagedRunToQdm({
    ingestRunId: runId,
    ehrTenantId: tenant.id,
    orgId: tenant.orgId,
    limit: parsedBody.input.limit,
    sourceSystem: parsedBody.input.sourceSystem ?? 'ehr-admin-qdm-replay',
  });
  await recordQdmReplayResult({
    id: runId,
    ehrTenantId: tenant.id,
    result,
    limit: parsedBody.input.limit,
    sourceSystem: parsedBody.input.sourceSystem ?? 'ehr-admin-qdm-replay',
  });
  await request.auditLog('ehr_qdm_normalization_replay', 'ehr_ingest_run', runId, {
    tenantId: tenant.id,
    orgId: tenant.orgId,
    limit: parsedBody.input.limit ?? null,
    sourceSystem: parsedBody.input.sourceSystem ?? 'ehr-admin-qdm-replay',
    resourcesSeen: numberDetail(result, 'resourcesSeen'),
    resourcesNormalized: numberDetail(result, 'resourcesNormalized'),
    resourcesFailed: numberDetail(result, 'resourcesFailed'),
    eventsUpserted: numberDetail(result, 'eventsUpserted'),
  });

  return reply.send({
    success: true,
    data: {
      tenant,
      ingestRunId: runId,
      qdm: result,
    },
  });
}

async function sendTenantQdmCqlLoad(
  request: FastifyRequest<{ Params: TenantIdParams; Body: TenantQdmCqlLoadBody }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const parsedBody = parseQdmCqlLoadBody(request.body ?? {});
  if ('error' in parsedBody) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: parsedBody.error },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const result = await loadQdmEventsToCqlEngine({
    ...parsedBody.input,
    ehrTenantId: tenant.id,
    orgId: tenant.orgId,
  });
  await request.auditLog('ehr_qdm_cql_load', 'ehr_tenant', String(tenant.id), qdmCqlLoadAuditDetails({
    tenantId: tenant.id,
    orgId: tenant.orgId,
    input: parsedBody.input,
    result,
  }));

  return reply.send({
    success: true,
    data: {
      tenant,
      qdmCqlLoad: result,
    },
  });
}

async function sendTenantPatientContextRefresh(
  request: FastifyRequest<{ Params: TenantIdParams; Body: PatientContextRefreshBody }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const parsedBody = parsePatientContextRefreshBody(request.body ?? {});
  if ('error' in parsedBody) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: parsedBody.error },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const refresh = await enqueueSmartPatientContextRefresh({
    ehrTenantId: tenant.id,
    orgId: tenant.orgId,
    triggeredBy: 'manual',
    ...parsedBody.input,
  });
  await request.auditLog('ehr_patient_context_refresh_enqueue', 'ehr_tenant', String(tenant.id), {
    tenantId: tenant.id,
    orgId: tenant.orgId,
    triggeredBy: 'manual',
    hasLocalPatientId: parsedBody.input.localPatientId !== undefined,
    requestedSinceProvided: parsedBody.input.requestedSince !== undefined,
    resourceTypeCount: parsedBody.input.resourceTypes?.length ?? 0,
    pageSize: parsedBody.input.pageSize ?? null,
    maxPages: parsedBody.input.maxPages ?? null,
    enqueued: refresh.enqueued,
    queueName: refresh.queueName,
    hasQueueJobId: Boolean(refresh.jobId),
    reason: refresh.reason ?? null,
  });

  return reply.status(refresh.enqueued ? 202 : 200).send({
    success: true,
    data: {
      tenant,
      refresh,
    },
  });
}

async function sendTenantBulkJobs(
  request: FastifyRequest<{ Params: TenantIdParams; Querystring: BulkJobListQuery }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const parsedQuery = parseBulkJobListQuery(request.query);
  if ('error' in parsedQuery) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: parsedQuery.error },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const bulkJobs = await listBulkJobs({
    ehrTenantId: tenant.id,
    ...parsedQuery.filter,
  });

  return reply.send({
    success: true,
    data: {
      tenant,
      bulkJobs,
      latest: bulkJobs[0] ?? null,
      count: bulkJobs.length,
    },
  });
}

async function sendTenantBulkSchedules(
  request: FastifyRequest<{ Params: TenantIdParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const bulkSchedules = await listBulkSchedules({ ehrTenantId: tenant.id });
  return reply.send({
    success: true,
    data: {
      tenant,
      bulkSchedules,
      latest: bulkSchedules[0] ?? null,
      count: bulkSchedules.length,
    },
  });
}

async function sendTenantBulkScheduleUpsert(
  request: FastifyRequest<{ Params: TenantIdParams; Body: BulkScheduleBody }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const parsedBody = parseBulkScheduleBody(request.body ?? {});
  if ('error' in parsedBody) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: parsedBody.error },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  let bulkSchedule: Awaited<ReturnType<typeof upsertBulkSchedule>>;
  try {
    bulkSchedule = await upsertBulkSchedule({
      ehrTenantId: tenant.id,
      orgId: tenant.orgId,
      ...parsedBody.input,
    });
  } catch (error) {
    if (error instanceof BulkScheduleOwnershipError) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Bulk schedule not found for tenant' },
      });
    }
    throw error;
  }
  await request.auditLog('ehr_bulk_schedule_upsert', 'ehr_bulk_schedule', bulkSchedule.id, {
    tenantId: tenant.id,
    orgId: tenant.orgId,
    enabled: bulkSchedule.enabled,
    exportLevel: bulkSchedule.exportLevel,
    resourceTypes: bulkSchedule.resourceTypes,
    hasGroupId: Boolean(bulkSchedule.groupId),
    hasPatientId: Boolean(bulkSchedule.patientId),
    sinceMode: bulkSchedule.sinceMode,
    intervalMinutes: bulkSchedule.intervalMinutes,
    typeFilterCount: bulkSchedule.typeFilters.length,
  });

  return reply.status(201).send({
    success: true,
    data: {
      tenant,
      bulkSchedule,
    },
  });
}

async function sendTenantBulkExport(
  request: FastifyRequest<{ Params: TenantIdParams; Body: BulkExportBody }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const parsedBody = parseBulkExportBody(request.body ?? {});
  if ('error' in parsedBody) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: parsedBody.error },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const bulkExport = await enqueueEhrBulkExport({
    ehrTenantId: tenant.id,
    orgId: tenant.orgId,
    vendor: tenant.vendor,
    triggeredBy: 'manual',
    ...parsedBody.input,
  });
  await request.auditLog('ehr_bulk_export_enqueue', 'ehr_tenant', String(tenant.id), {
    tenantId: tenant.id,
    orgId: tenant.orgId,
    vendor: tenant.vendor,
    exportLevel: parsedBody.input.exportLevel,
    resourceTypes: parsedBody.input.resourceTypes,
    hasGroupId: Boolean(parsedBody.input.groupId),
    hasPatientId: Boolean(parsedBody.input.patientId),
    sinceProvided: Boolean(parsedBody.input.since),
    typeFilterCount: parsedBody.input.typeFilters?.length ?? 0,
    maxResourcesPerFile: parsedBody.input.maxResourcesPerFile ?? null,
    enqueued: bulkExport.enqueued,
    queueName: bulkExport.queueName,
    queueJobId: bulkExport.jobId ?? null,
    reason: bulkExport.reason ?? null,
  });

  return reply.status(bulkExport.enqueued ? 202 : 200).send({
    success: true,
    data: {
      tenant,
      bulkExport,
    },
  });
}

async function sendTenantBulkImport(
  request: FastifyRequest<{ Params: TenantIdParams; Body: BulkImportBody }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const parsedBody = parseBulkImportBody(request.body ?? {});
  if ('error' in parsedBody) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: parsedBody.error },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const bulkImport = await enqueueEhrBulkImport({
    ehrTenantId: tenant.id,
    orgId: tenant.orgId,
    triggeredBy: 'manual',
    ...parsedBody.input,
  });
  await request.auditLog('ehr_bulk_import_enqueue', 'ehr_bulk_job', parsedBody.input.bulkJobId, {
    tenantId: tenant.id,
    orgId: tenant.orgId,
    resumeFailedOnly: parsedBody.input.resumeFailedOnly ?? false,
    maxResourcesPerFile: parsedBody.input.maxResourcesPerFile ?? null,
    enqueued: bulkImport.enqueued,
    queueName: bulkImport.queueName,
    queueJobId: bulkImport.jobId ?? null,
    reason: bulkImport.reason ?? null,
  });

  return reply.status(bulkImport.enqueued ? 202 : 200).send({
    success: true,
    data: {
      tenant,
      bulkImport,
    },
  });
}

async function sendTenantBulkJobCancel(
  request: FastifyRequest<{ Params: BulkJobActionParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const bulkJobId = request.params.bulkJobId.trim();
  if (!parseUuid(bulkJobId)) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'bulkJobId must be a UUID' },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const bulkCancel = await cancelBulkExportJobWithBackendServices({
    ehrTenantId: tenant.id,
    bulkJobId,
    metadata: { triggeredBy: 'manual' },
  });
  await request.auditLog('ehr_bulk_cancel', 'ehr_bulk_job', bulkJobId, {
    tenantId: tenant.id,
    orgId: tenant.orgId,
    status: bulkCancel.job.status,
    tokenMetadataId: bulkCancel.tokenMetadataId ?? null,
  });

  return reply.send({
    success: true,
    data: {
      tenant,
      bulkCancel,
    },
  });
}

async function sendTenantSyncStatus(
  request: FastifyRequest<{ Params: TenantIdParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  const syncStatus = await getTenantSyncStatus(tenant.id);
  return reply.send({
    success: true,
    data: {
      tenant,
      syncStatus,
    },
  });
}

function parseUpsertTenantBody(
  body: UpsertTenantBody,
): { input: EhrOnboardingRegistrationInput } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object' };
  if (!isRecord(body.tenant)) return { error: 'tenant is required' };

  const tenant = parseTenantPayload(body.tenant);
  if ('error' in tenant) return tenant;

  const smartLaunch = parseClientPayload('smartLaunch', body.smartLaunch ?? body.smart_launch);
  if ('error' in smartLaunch) return smartLaunch;
  const backendServices = parseClientPayload('backendServices', body.backendServices ?? body.backend_services);
  if ('error' in backendServices) return backendServices;
  const cdsHooks = parseClientPayload('cdsHooks', body.cdsHooks ?? body.cds_hooks);
  if ('error' in cdsHooks) return cdsHooks;

  const input: EhrOnboardingRegistrationInput = {
    tenant: tenant.value,
    apiBaseUrl: optionalString(body.apiBaseUrl ?? body.api_base_url),
  };
  if (smartLaunch.value !== undefined) input.smartLaunch = smartLaunch.value;
  if (backendServices.value !== undefined) input.backendServices = backendServices.value;
  if (cdsHooks.value !== undefined) input.cdsHooks = cdsHooks.value;
  return { input };
}

function parseTenantPayload(
  value: Record<string, unknown>,
): { value: EhrOnboardingRegistrationInput['tenant'] } | { error: string } {
  const vendor = requiredString(value.vendor, 'tenant.vendor');
  if ('error' in vendor) return vendor;
  if (!isEhrVendor(vendor.value)) return { error: `Unsupported EHR vendor '${vendor.value}'` };

  const environment = requiredString(value.environment, 'tenant.environment');
  if ('error' in environment) return environment;
  if (!isEhrEnvironment(environment.value)) {
    return { error: `Unsupported EHR environment '${environment.value}'` };
  }

  const name = requiredString(value.name, 'tenant.name');
  if ('error' in name) return name;
  const fhirBaseUrl = requiredString(value.fhirBaseUrl ?? value.fhir_base_url, 'tenant.fhirBaseUrl');
  if ('error' in fhirBaseUrl) return fhirBaseUrl;

  return {
    value: {
      id: optionalPositiveInt(value.id),
      orgId: optionalNullablePositiveInt(value.orgId ?? value.org_id),
      vendor: vendor.value,
      name: name.value,
      environment: environment.value,
      fhirBaseUrl: fhirBaseUrl.value,
      smartConfigUrl: optionalNullableString(value.smartConfigUrl ?? value.smart_config_url),
      issuer: optionalNullableString(value.issuer),
      audience: optionalNullableString(value.audience),
      status: optionalString(value.status),
    },
  };
}

function parseClientPayload(
  label: string,
  value: unknown,
): { value: EhrOnboardingClientInput | null | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (value === null) return { value: null };
  if (!isRecord(value)) return { error: `${label} must be an object or null` };

  const clientId = requiredString(value.clientId ?? value.client_id, `${label}.clientId`);
  if ('error' in clientId) return clientId;

  const authMethod = optionalString(value.authMethod ?? value.auth_method);
  let parsedAuthMethod: EhrClientAuthMethod | undefined;
  if (authMethod) {
    if (!isAuthMethod(authMethod)) {
      return { error: `Unsupported ${label}.authMethod '${authMethod}'` };
    }
    parsedAuthMethod = authMethod;
  }
  const approvalStatus = optionalString(value.approvalStatus ?? value.approval_status);
  let parsedApprovalStatus: EhrClientApprovalStatus | undefined;
  if (approvalStatus) {
    if (!isApprovalStatus(approvalStatus)) {
      return { error: `Unsupported ${label}.approvalStatus '${approvalStatus}'` };
    }
    parsedApprovalStatus = approvalStatus;
  }

  const redirectUris = optionalStringArray(value.redirectUris ?? value.redirect_uris);
  if ('error' in redirectUris) return { error: `${label}.${redirectUris.error}` };
  const approvalEvidence = optionalJsonObject(value.approvalEvidence ?? value.approval_evidence);
  if ('error' in approvalEvidence) return { error: `${label}.${approvalEvidence.error}` };

  return {
    value: {
      clientId: clientId.value,
      clientSlot: optionalString(value.clientSlot ?? value.client_slot),
      clientSecretRef: optionalNullableString(value.clientSecretRef ?? value.client_secret_ref),
      jwksUrl: optionalNullableString(value.jwksUrl ?? value.jwks_url),
      privateKeyRef: optionalNullableString(value.privateKeyRef ?? value.private_key_ref),
      redirectUris: redirectUris.value,
      launchUrl: optionalNullableString(value.launchUrl ?? value.launch_url),
      scopesRequested: optionalString(value.scopesRequested ?? value.scopes_requested),
      scopesGranted: optionalString(value.scopesGranted ?? value.scopes_granted),
      authMethod: parsedAuthMethod,
      profileId: optionalNullableString(value.profileId ?? value.profile_id),
      profileVersion: optionalNullableString(value.profileVersion ?? value.profile_version),
      portalAppId: optionalNullableString(value.portalAppId ?? value.portal_app_id),
      approvalStatus: parsedApprovalStatus,
      approvalEvidence: approvalEvidence.value,
      enabled: optionalBoolean(value.enabled),
    },
  };
}

function parseOnboardingProfileQuery(
  query: OnboardingProfileQuery,
): { input: Parameters<typeof buildEhrOnboardingProfile>[0] } | { error: string } {
  const vendor = singleQueryValue(query.vendor);
  const environment = singleQueryValue(query.environment);
  const fhirBaseUrl = singleQueryValue(query.fhirBaseUrl) ?? singleQueryValue(query.fhir_base_url);
  const tenantId = positiveQueryInt(singleQueryValue(query.tenantId) ?? singleQueryValue(query.tenant_id));
  const orgId = positiveQueryInt(singleQueryValue(query.orgId) ?? singleQueryValue(query.org_id));

  if (!vendor) return { error: 'vendor is required' };
  if (!isEhrVendor(vendor)) return { error: `Unsupported EHR vendor '${vendor}'` };
  let parsedEnvironment: EhrEnvironment | undefined;
  if (environment) {
    if (!isEhrEnvironment(environment)) {
      return { error: `Unsupported EHR environment '${environment}'` };
    }
    parsedEnvironment = environment;
  }
  if (!fhirBaseUrl) return { error: 'fhirBaseUrl is required' };

  return {
    input: {
      vendor,
      environment: parsedEnvironment,
      name: singleQueryValue(query.name),
      fhirBaseUrl,
      apiBaseUrl: singleQueryValue(query.apiBaseUrl) ?? singleQueryValue(query.api_base_url),
      tenantId: tenantId ?? undefined,
      orgId,
      status: singleQueryValue(query.status),
      smartClientId: singleQueryValue(query.smartClientId) ?? singleQueryValue(query.smart_client_id),
      backendClientId: singleQueryValue(query.backendClientId) ?? singleQueryValue(query.backend_client_id),
      cdsClientId: singleQueryValue(query.cdsClientId) ?? singleQueryValue(query.cds_client_id),
    },
  };
}

function parseQdmReplayBody(
  body: IngestRunQdmBody,
): { input: { limit?: number; sourceSystem?: string } } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object' };

  const limit = optionalPositiveInt(body.limit);
  if (body.limit !== undefined && limit === undefined) {
    return { error: 'limit must be a positive integer' };
  }

  const sourceSystem = optionalString(body.sourceSystem ?? body.source_system);
  const input: { limit?: number; sourceSystem?: string } = {};
  if (limit !== undefined) input.limit = limit;
  if (sourceSystem !== undefined) input.sourceSystem = sourceSystem;
  return { input };
}

function parseBackendTokenCheckBody(
  body: BackendTokenCheckBody,
): { input: { scope?: string } } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object' };
  const scope = optionalString(body.scope);
  if (body.scope !== undefined && scope === undefined) {
    return { error: 'scope must be a non-empty string' };
  }
  return { input: scope ? { scope } : {} };
}

function parseQdmCqlLoadBody(
  body: TenantQdmCqlLoadBody,
): { input: NonNullable<Parameters<typeof loadQdmEventsToCqlEngine>[0]> } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object' };

  const limit = optionalPositiveInt(body.limit);
  if (body.limit !== undefined && limit === undefined) {
    return { error: 'limit must be a positive integer' };
  }

  const ingestRunId = optionalString(body.ingestRunId ?? body.ingest_run_id);
  if (ingestRunId !== undefined && !parseUuid(ingestRunId)) {
    return { error: 'ingestRunId must be a UUID' };
  }

  const qdmEventIds = optionalPositiveIntList(body.qdmEventIds ?? body.qdm_event_ids, 'qdmEventIds');
  if ('error' in qdmEventIds) return qdmEventIds;
  const patientIds = optionalPositiveIntList(body.patientIds ?? body.patient_ids, 'patientIds');
  if ('error' in patientIds) return patientIds;
  const patientRefs = optionalStringList(body.patientRefs ?? body.patient_refs, 'patientRefs');
  if ('error' in patientRefs) return patientRefs;
  const qdmDatatypes = optionalStringList(body.qdmDatatypes ?? body.qdm_datatypes, 'qdmDatatypes');
  if ('error' in qdmDatatypes) return qdmDatatypes;

  const periodStart = optionalDateString(body.periodStart ?? body.period_start, 'periodStart');
  if ('error' in periodStart) return periodStart;
  const periodEnd = optionalDateString(body.periodEnd ?? body.period_end, 'periodEnd');
  if ('error' in periodEnd) return periodEnd;
  if (periodStart.value && periodEnd.value && periodEnd.value < periodStart.value) {
    return { error: 'periodEnd must be on or after periodStart' };
  }

  const engineBaseUrl = optionalHttpUrl(body.engineBaseUrl ?? body.engine_base_url, 'engineBaseUrl');
  if ('error' in engineBaseUrl) return engineBaseUrl;
  const includePatientRecords = optionalBoolean(body.includePatientRecords ?? body.include_patient_records);
  if (
    (body.includePatientRecords !== undefined || body.include_patient_records !== undefined) &&
    includePatientRecords === undefined
  ) {
    return { error: 'includePatientRecords must be a boolean' };
  }

  const input: NonNullable<Parameters<typeof loadQdmEventsToCqlEngine>[0]> = {};
  if (limit !== undefined) input.limit = limit;
  if (ingestRunId !== undefined) input.ingestRunId = ingestRunId;
  if (qdmEventIds.value !== undefined) input.qdmEventIds = qdmEventIds.value;
  if (patientIds.value !== undefined) input.patientIds = patientIds.value;
  if (patientRefs.value !== undefined) input.patientRefs = patientRefs.value;
  if (qdmDatatypes.value !== undefined) input.qdmDatatypes = qdmDatatypes.value;
  if (periodStart.value !== undefined) input.periodStart = periodStart.value;
  if (periodEnd.value !== undefined) input.periodEnd = periodEnd.value;
  if (engineBaseUrl.value !== undefined) input.engineBaseUrl = engineBaseUrl.value;
  if (includePatientRecords !== undefined) input.includePatientRecords = includePatientRecords;
  return { input };
}

function parsePatientContextRefreshBody(
  body: PatientContextRefreshBody,
): { input: Omit<Parameters<typeof enqueueSmartPatientContextRefresh>[0], 'ehrTenantId' | 'orgId' | 'triggeredBy'> } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object' };

  const patientResourceId = requiredString(
    body.patientResourceId ?? body.patient_resource_id,
    'patientResourceId',
  );
  if ('error' in patientResourceId) return patientResourceId;

  const localPatientId = optionalPositiveInt(body.localPatientId ?? body.local_patient_id);
  if ((body.localPatientId !== undefined || body.local_patient_id !== undefined) && localPatientId === undefined) {
    return { error: 'localPatientId must be a positive integer' };
  }

  const requestedSince = optionalTimestampString(
    body.requestedSince ?? body.requested_since,
    'requestedSince',
  );
  if ('error' in requestedSince) return requestedSince;

  const resourceTypes = optionalStringList(body.resourceTypes ?? body.resource_types, 'resourceTypes');
  if ('error' in resourceTypes) return resourceTypes;

  const pageSize = optionalPositiveInt(body.pageSize ?? body.page_size);
  if ((body.pageSize !== undefined || body.page_size !== undefined) && pageSize === undefined) {
    return { error: 'pageSize must be a positive integer' };
  }

  const maxPages = optionalPositiveInt(body.maxPages ?? body.max_pages);
  if ((body.maxPages !== undefined || body.max_pages !== undefined) && maxPages === undefined) {
    return { error: 'maxPages must be a positive integer' };
  }

  const input: Omit<Parameters<typeof enqueueSmartPatientContextRefresh>[0], 'ehrTenantId' | 'orgId' | 'triggeredBy'> = {
    patientResourceId: patientResourceId.value,
  };
  if (localPatientId !== undefined) input.localPatientId = localPatientId;
  if (requestedSince.value !== undefined) input.requestedSince = requestedSince.value;
  if (resourceTypes.value !== undefined) input.resourceTypes = resourceTypes.value;
  if (pageSize !== undefined) input.pageSize = pageSize;
  if (maxPages !== undefined) input.maxPages = maxPages;
  return { input };
}

function parseBulkJobListQuery(
  query: BulkJobListQuery,
): { filter: { status?: BulkJobStatus; limit?: number } } | { error: string } {
  const status = singleQueryValue(query.status);
  const limitValue = singleQueryValue(query.limit);
  const filter: { status?: BulkJobStatus; limit?: number } = {};

  if (status) {
    if (!BULK_JOB_STATUSES.has(status as BulkJobStatus)) {
      return { error: `Unsupported Bulk Data job status '${status}'` };
    }
    filter.status = status as BulkJobStatus;
  }
  if (limitValue !== undefined) {
    const limit = positiveQueryInt(limitValue);
    if (limit === null) return { error: 'limit must be a positive integer' };
    filter.limit = Math.min(limit, 50);
  }
  return { filter };
}

function parseBulkExportBody(
  body: BulkExportBody,
): { input: Omit<Parameters<typeof enqueueEhrBulkExport>[0], 'ehrTenantId' | 'orgId' | 'vendor' | 'triggeredBy'> } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object' };

  const exportLevel = requiredString(body.exportLevel ?? body.export_level, 'exportLevel');
  if ('error' in exportLevel) return exportLevel;
  if (!BULK_EXPORT_LEVELS.has(exportLevel.value as BulkExportLevel)) {
    return { error: `Unsupported Bulk Data exportLevel '${exportLevel.value}'` };
  }

  const resourceTypes = optionalStringList(body.resourceTypes ?? body.resource_types, 'resourceTypes');
  if ('error' in resourceTypes) return resourceTypes;
  if (!resourceTypes.value || resourceTypes.value.length === 0) {
    return { error: 'resourceTypes is required' };
  }
  const invalidResourceType = resourceTypes.value.find((value) => !/^[A-Z][A-Za-z0-9]+$/.test(value));
  if (invalidResourceType) {
    return { error: `Invalid FHIR resource type '${invalidResourceType}'` };
  }

  const groupId = optionalString(body.groupId ?? body.group_id);
  const patientId = optionalString(body.patientId ?? body.patient_id);
  if (exportLevel.value === 'group' && !groupId) return { error: 'groupId is required for group exports' };
  if (exportLevel.value === 'patient' && !patientId) return { error: 'patientId is required for patient exports' };
  if (exportLevel.value === 'system' && (groupId || patientId)) {
    return { error: 'groupId and patientId are not allowed for system exports' };
  }

  const since = optionalTimestampString(body.since, 'since');
  if ('error' in since) return since;
  const typeFilters = optionalStringList(body.typeFilters ?? body.type_filters, 'typeFilters');
  if ('error' in typeFilters) return typeFilters;
  const maxResourcesPerFile = optionalPositiveInt(body.maxResourcesPerFile ?? body.max_resources_per_file);
  if (
    (body.maxResourcesPerFile !== undefined || body.max_resources_per_file !== undefined) &&
    maxResourcesPerFile === undefined
  ) {
    return { error: 'maxResourcesPerFile must be a positive integer' };
  }

  const input: Omit<Parameters<typeof enqueueEhrBulkExport>[0], 'ehrTenantId' | 'orgId' | 'vendor' | 'triggeredBy'> = {
    exportLevel: exportLevel.value as BulkExportLevel,
    resourceTypes: resourceTypes.value,
  };
  if (groupId !== undefined) input.groupId = groupId;
  if (patientId !== undefined) input.patientId = patientId;
  if (since.value !== undefined) input.since = since.value;
  if (typeFilters.value !== undefined) input.typeFilters = typeFilters.value;
  if (maxResourcesPerFile !== undefined) input.maxResourcesPerFile = maxResourcesPerFile;
  return { input };
}

function parseBulkScheduleBody(
  body: BulkScheduleBody,
): { input: Omit<Parameters<typeof upsertBulkSchedule>[0], 'ehrTenantId' | 'orgId'> } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object' };

  const exportBody = parseBulkExportBody(body);
  if ('error' in exportBody) return exportBody;

  const id = optionalString(body.id);
  if (id !== undefined && !parseUuid(id)) {
    return { error: 'id must be a UUID' };
  }

  const enabled = optionalBoolean(body.enabled);
  if (body.enabled !== undefined && enabled === undefined) {
    return { error: 'enabled must be a boolean' };
  }

  const intervalMinutes = optionalPositiveInt(body.intervalMinutes ?? body.interval_minutes);
  if (
    (body.intervalMinutes !== undefined || body.interval_minutes !== undefined) &&
    intervalMinutes === undefined
  ) {
    return { error: 'intervalMinutes must be a positive integer' };
  }
  if (intervalMinutes === undefined) {
    return { error: 'intervalMinutes is required' };
  }
  if (intervalMinutes < MIN_BULK_SCHEDULE_INTERVAL_MINUTES) {
    return { error: `intervalMinutes must be at least ${MIN_BULK_SCHEDULE_INTERVAL_MINUTES}` };
  }
  if (intervalMinutes > MAX_BULK_SCHEDULE_INTERVAL_MINUTES) {
    return { error: `intervalMinutes must be at most ${MAX_BULK_SCHEDULE_INTERVAL_MINUTES}` };
  }

  const sinceModeValue = optionalString(body.sinceMode ?? body.since_mode);
  const sinceMode = sinceModeValue ?? 'last_success';
  if (!BULK_SCHEDULE_SINCE_MODES.has(sinceMode as BulkScheduleSinceMode)) {
    return { error: `Unsupported Bulk Data sinceMode '${sinceMode}'` };
  }
  if (sinceMode === 'fixed' && exportBody.input.since === undefined) {
    return { error: 'since is required when sinceMode is fixed' };
  }

  const nextRunAt = optionalTimestampString(body.nextRunAt ?? body.next_run_at, 'nextRunAt');
  if ('error' in nextRunAt) return nextRunAt;

  return {
    input: {
      ...exportBody.input,
      ...(id !== undefined ? { id } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      intervalMinutes,
      sinceMode: sinceMode as BulkScheduleSinceMode,
      ...(nextRunAt.value !== undefined ? { nextRunAt: nextRunAt.value } : {}),
    },
  };
}

function parseBulkImportBody(
  body: BulkImportBody,
): { input: Omit<Parameters<typeof enqueueEhrBulkImport>[0], 'ehrTenantId' | 'orgId' | 'triggeredBy'> } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object' };

  const bulkJobId = requiredString(body.bulkJobId ?? body.bulk_job_id, 'bulkJobId');
  if ('error' in bulkJobId) return bulkJobId;
  if (!parseUuid(bulkJobId.value)) {
    return { error: 'bulkJobId must be a UUID' };
  }

  const maxResourcesPerFile = optionalPositiveInt(body.maxResourcesPerFile ?? body.max_resources_per_file);
  if (
    (body.maxResourcesPerFile !== undefined || body.max_resources_per_file !== undefined) &&
    maxResourcesPerFile === undefined
  ) {
    return { error: 'maxResourcesPerFile must be a positive integer' };
  }
  const resumeFailedOnly = optionalBoolean(body.resumeFailedOnly ?? body.resume_failed_only);
  if (
    (body.resumeFailedOnly !== undefined || body.resume_failed_only !== undefined) &&
    resumeFailedOnly === undefined
  ) {
    return { error: 'resumeFailedOnly must be a boolean' };
  }

  const input: Omit<Parameters<typeof enqueueEhrBulkImport>[0], 'ehrTenantId' | 'orgId' | 'triggeredBy'> = {
    bulkJobId: bulkJobId.value,
  };
  if (maxResourcesPerFile !== undefined) input.maxResourcesPerFile = maxResourcesPerFile;
  if (resumeFailedOnly !== undefined) input.resumeFailedOnly = resumeFailedOnly;
  return { input };
}

function parseTenantListFilter(
  query: TenantListQuery,
): { filter: ListEhrTenantsFilter } | { error: string } {
  const vendor = singleQueryValue(query.vendor);
  const environment = singleQueryValue(query.environment);
  const status = singleQueryValue(query.status);
  let parsedVendor: EhrVendor | undefined;
  let parsedEnvironment: EhrEnvironment | undefined;

  if (vendor) {
    if (!isEhrVendor(vendor)) {
      return { error: `Unsupported EHR vendor '${vendor}'` };
    }
    parsedVendor = vendor;
  }
  if (environment) {
    if (!isEhrEnvironment(environment)) {
      return { error: `Unsupported EHR environment '${environment}'` };
    }
    parsedEnvironment = environment;
  }

  const filter: ListEhrTenantsFilter = {};
  if (parsedVendor) filter.vendor = parsedVendor;
  if (parsedEnvironment) filter.environment = parsedEnvironment;
  if (status) filter.status = status;

  return {
    filter,
  };
}

function parseIngestRunListQuery(
  query: IngestRunListQuery,
): { filter: Omit<ListEhrIngestRunsInput, 'ehrTenantId'> } | { error: string } {
  const status = singleQueryValue(query.status);
  const mode = singleQueryValue(query.mode);
  const resourceType = singleQueryValue(query.resourceType) ?? singleQueryValue(query.resource_type);
  const limitValue = singleQueryValue(query.limit);

  const filter: Omit<ListEhrIngestRunsInput, 'ehrTenantId'> = {};
  if (status) {
    if (!INGEST_RUN_STATUSES.has(status as EhrIngestRunStatus)) {
      return { error: `Unsupported ingest run status '${status}'` };
    }
    filter.status = status as EhrIngestRunStatus;
  }
  if (mode) {
    if (!INGEST_RUN_MODES.has(mode as EhrIngestRunMode)) {
      return { error: `Unsupported ingest run mode '${mode}'` };
    }
    filter.mode = mode as EhrIngestRunMode;
  }
  if (resourceType) filter.resourceType = resourceType;
  if (limitValue !== undefined) {
    const limit = positiveQueryInt(limitValue);
    if (limit === null) return { error: 'limit must be a positive integer' };
    filter.limit = Math.min(limit, 100);
  }
  return { filter };
}

function parseTenantId(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseUuid(value: string): string | undefined {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

function positiveQueryInt(value: string | undefined): number | null {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function singleQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isEhrVendor(value: string): value is EhrVendor {
  return VENDORS.has(value as EhrVendor);
}

function isEhrEnvironment(value: string): value is EhrEnvironment {
  return ENVIRONMENTS.has(value as EhrEnvironment);
}

function isAuthMethod(value: string): value is EhrClientAuthMethod {
  return AUTH_METHODS.has(value as EhrClientAuthMethod);
}

function isApprovalStatus(value: string): value is EhrClientApprovalStatus {
  return APPROVAL_STATUSES.has(value as EhrClientApprovalStatus);
}

function requiredString(value: unknown, label: string): { value: string } | { error: string } {
  const parsed = optionalString(value);
  return parsed ? { value: parsed } : { error: `${label} is required` };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function splitScopes(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return optionalString(value);
}

function optionalStringArray(value: unknown): { value: string[] | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (!Array.isArray(value)) return { error: 'redirectUris must be an array of strings' };
  const parsed = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return { value: parsed };
}

function optionalPositiveIntList(
  value: unknown,
  label: string,
): { value: number[] | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (!Array.isArray(value)) return { error: `${label} must be an array of positive integers` };
  const parsed: number[] = [];
  for (const item of value) {
    const next = optionalPositiveInt(item);
    if (next === undefined) return { error: `${label} must be an array of positive integers` };
    parsed.push(next);
  }
  return { value: Array.from(new Set(parsed)) };
}

function optionalStringList(
  value: unknown,
  label: string,
): { value: string[] | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  const raw = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(raw)) return { error: `${label} must be an array of strings` };
  const parsed = raw.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  if (parsed.length !== raw.length) return { error: `${label} must be an array of strings` };
  return { value: Array.from(new Set(parsed)) };
}

function optionalDateString(
  value: unknown,
  label: string,
): { value: string | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  const parsed = optionalString(value);
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    return { error: `${label} must be a YYYY-MM-DD date` };
  }
  return { value: parsed };
}

function optionalTimestampString(
  value: unknown,
  label: string,
): { value: string | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  const parsed = optionalString(value);
  if (!parsed || Number.isNaN(new Date(parsed).getTime())) {
    return { error: `${label} must be a valid timestamp` };
  }
  return { value: new Date(parsed).toISOString() };
}

function optionalHttpUrl(
  value: unknown,
  label: string,
): { value: string | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  const parsed = optionalString(value);
  if (!parsed) return { error: `${label} must be an absolute http(s) URL` };
  try {
    const url = new URL(parsed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { error: `${label} must be an absolute http(s) URL` };
    }
    return { value: parsed };
  } catch {
    return { error: `${label} must be an absolute http(s) URL` };
  }
}

function optionalJsonObject(value: unknown): { value: JsonObject | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (!isRecord(value) || Array.isArray(value)) {
    return { error: 'approvalEvidence must be an object' };
  }
  return { value: value as JsonObject };
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalNullablePositiveInt(value: unknown): number | null | undefined {
  if (value === null) return null;
  return optionalPositiveInt(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildClientReadiness(
  clientType: EhrClientType,
  client: SanitizedEhrClientRegistration,
): {
  clientSlot: string;
  clientType: EhrClientType;
  clientId: string;
  authMethod: EhrClientAuthMethod;
  status: 'ready' | 'blocked';
  missing: string[];
} {
  const missing: string[] = [];
  if (!client.enabled) missing.push('enabled');
  if (!client.clientId.trim()) missing.push('clientId');
  if (!client.scopesRequested.trim()) missing.push('scopesRequested');

  if (clientType === 'smart_launch') {
    if (client.redirectUris.length === 0) missing.push('redirectUris');
    if (!client.launchUrl) missing.push('launchUrl');
    addCredentialReadiness(client, missing);
  } else if (clientType === 'backend_services') {
    addBackendCredentialReadiness(client, missing);
  } else if (clientType === 'cds_hooks') {
    addCdsCredentialReadiness(client, missing);
  }

  return {
    clientSlot: client.clientSlot,
    clientType,
    clientId: client.clientId,
    authMethod: client.authMethod,
    status: missing.length === 0 ? 'ready' : 'blocked',
    missing,
  };
}

function addCredentialReadiness(
  client: SanitizedEhrClientRegistration,
  missing: string[],
): void {
  if ((client.authMethod === 'client_secret_basic' || client.authMethod === 'client_secret_post') && !client.hasClientSecretRef) {
    missing.push('clientSecretRef');
  }
  if (client.authMethod === 'private_key_jwt') {
    if (!client.hasPrivateKeyRef) missing.push('privateKeyRef');
    if (!client.jwksUrl) missing.push('jwksUrl');
  }
}

function addBackendCredentialReadiness(
  client: SanitizedEhrClientRegistration,
  missing: string[],
): void {
  if (client.authMethod === 'private_key_jwt') {
    if (!client.hasPrivateKeyRef) missing.push('privateKeyRef');
    if (!client.jwksUrl) missing.push('jwksUrl');
    return;
  }
  if (client.authMethod === 'client_secret_basic' || client.authMethod === 'client_secret_post') {
    if (!client.hasClientSecretRef) missing.push('clientSecretRef');
    return;
  }
  missing.push(`unsupportedAuthMethod:${client.authMethod}`);
}

function addCdsCredentialReadiness(
  client: SanitizedEhrClientRegistration,
  missing: string[],
): void {
  if (client.authMethod === 'shared_secret' && !client.hasClientSecretRef) {
    missing.push('clientSecretRef');
  }
  if (client.authMethod === 'fhir_authorization_jwt' && !client.jwksUrl && !client.hasClientSecretRef) {
    missing.push('jwksUrlOrClientSecretRef');
  }
}

function discoveryDocumentToJson(document: {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  summary?: unknown;
}): JsonObject {
  return {
    url: document.url,
    ok: document.ok,
    status: document.status,
    error: document.error,
    summary: isRecord(document.summary) ? document.summary : {},
  };
}

function numberDetail(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const detail = value[key];
  return typeof detail === 'number' && Number.isFinite(detail) ? detail : null;
}

function qdmCqlLoadAuditDetails(input: {
  tenantId: number;
  orgId: number | null;
  input: LoadQdmEventsToCqlEngineInput;
  result: LoadQdmEventsToCqlEngineResult;
}): Record<string, unknown> {
  return {
    tenantId: input.tenantId,
    orgId: input.orgId,
    ingestRunIdPresent: input.input.ingestRunId !== undefined,
    qdmEventFilterCount: input.input.qdmEventIds?.length ?? 0,
    patientIdFilterCount: input.input.patientIds?.length ?? 0,
    patientRefFilterCount: input.input.patientRefs?.length ?? 0,
    qdmDatatypeFilterCount: input.input.qdmDatatypes?.length ?? 0,
    periodStart: input.input.periodStart ?? null,
    periodEnd: input.input.periodEnd ?? null,
    includePatientRecords: input.input.includePatientRecords !== false,
    engineBaseUrlConfigured: input.input.engineBaseUrl !== undefined,
    limit: input.input.limit ?? null,
    qdmEventsSelected: input.result.qdmEventsSelected,
    qdmEventsIncluded: input.result.qdmEventsIncluded,
    qdmEventsProjected: input.result.qdmEventsProjected,
    qdmEventsSkipped: input.result.qdmEventsSkipped,
    bundleEntries: input.result.bundleEntries,
    load: input.result.load
      ? {
          total: input.result.load.total,
          created: input.result.load.created,
          ok: input.result.load.ok,
          failed: input.result.load.failed,
        }
      : null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'Unable to run EHR discovery diagnostics';
}
