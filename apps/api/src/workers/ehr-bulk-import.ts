// =============================================================================
// Medgnosis API - EHR Bulk Data import worker
// Orchestrates Bulk kickoff, vendor-safe polling, and completed NDJSON imports
// with runtime backend-services credentials.
// =============================================================================

import { createHash } from 'node:crypto';
import { Queue, Worker, type JobsOptions } from 'bullmq';
import {
  kickoffBulkExportWithBackendServices,
  importCompletedBulkExportJob,
  pollBulkExportJobWithBackendServices,
  type BackendBulkExportResult,
  type BulkExportLevel,
  type ImportCompletedBulkExportJobResult,
} from '../services/ehr/bulkData.js';
import {
  listDueBulkSchedules,
  markBulkScheduleBulkJob,
  markBulkScheduleEnqueued,
  markBulkScheduleFailure,
  markBulkScheduleSuccess,
  type EhrBulkSchedule,
} from '../services/ehr/bulkSchedules.js';
import { getVendorAdapter } from '../services/ehr/vendorAdapters/index.js';

export const EHR_BULK_IMPORT_QUEUE_NAME = 'medgnosis-ehr-bulk-import';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 2000 },
};

let bulkImportQueue: Queue<EhrBulkQueueJobData> | null = null;

export interface EhrBulkKickoffJobData {
  scheduleId?: string;
  ehrTenantId: number;
  orgId?: number | null;
  vendor?: string | null;
  exportLevel: BulkExportLevel;
  resourceTypes: string[];
  groupId?: string | null;
  patientId?: string | null;
  since?: string | null;
  typeFilters?: string[];
  triggeredBy: 'manual' | 'scheduled';
  maxResourcesPerFile?: number;
}

export interface EhrBulkImportJobData {
  scheduleId?: string;
  ehrTenantId: number;
  orgId?: number | null;
  vendor?: string | null;
  bulkJobId: string;
  triggeredBy: 'manual' | 'poll_completion' | 'scheduled';
  maxResourcesPerFile?: number;
  resumeFailedOnly?: boolean;
}

export interface EhrBulkPollJobData {
  scheduleId?: string;
  ehrTenantId: number;
  orgId?: number | null;
  vendor?: string | null;
  bulkJobId: string;
  maxResourcesPerFile?: number;
}

type EhrBulkQueueJobData =
  | (EhrBulkKickoffJobData & { action: 'kickoff' })
  | (EhrBulkPollJobData & { action: 'poll' })
  | (EhrBulkImportJobData & { action: 'import' });

export interface EnqueueEhrBulkImportResult {
  enqueued: boolean;
  queueName: string;
  jobId?: string;
  reason?: string;
}

export interface EnqueueDueEhrBulkExportsResult {
  examined: number;
  enqueued: number;
  skipped: number;
  failed: number;
  queueName: string;
}

export async function enqueueEhrBulkExport(
  data: EhrBulkKickoffJobData,
  options: JobsOptions = {},
): Promise<EnqueueEhrBulkImportResult> {
  if (!bulkImportQueueEnabled()) {
    return {
      enqueued: false,
      queueName: EHR_BULK_IMPORT_QUEUE_NAME,
      reason: 'disabled',
    };
  }

  const resourceTypes = normalizeResourceTypes(data.resourceTypes);
  if (resourceTypes.length === 0) {
    return {
      enqueued: false,
      queueName: EHR_BULK_IMPORT_QUEUE_NAME,
      reason: 'missing_resource_types',
    };
  }

  const queue = getBulkImportQueue();
  const job = await queue.add(
    'ehr-bulk-kickoff',
    {
      ...data,
      action: 'kickoff',
      resourceTypes,
      typeFilters: normalizeStringList(data.typeFilters ?? []),
      groupId: nullableString(data.groupId),
      patientId: nullableString(data.patientId),
      since: nullableString(data.since),
    },
    {
      jobId: kickoffJobId(data, resourceTypes),
      ...options,
    },
  );

  return {
    enqueued: true,
    queueName: EHR_BULK_IMPORT_QUEUE_NAME,
    jobId: job.id,
  };
}

export async function enqueueDueEhrBulkExports(now = new Date()): Promise<EnqueueDueEhrBulkExportsResult> {
  const schedules = await listDueBulkSchedules({ now });
  const result: EnqueueDueEhrBulkExportsResult = {
    examined: schedules.length,
    enqueued: 0,
    skipped: 0,
    failed: 0,
    queueName: EHR_BULK_IMPORT_QUEUE_NAME,
  };

  for (const schedule of schedules) {
    try {
      const enqueued = await enqueueEhrBulkExport({
        scheduleId: schedule.id,
        ehrTenantId: schedule.ehrTenantId,
        orgId: schedule.orgId,
        exportLevel: schedule.exportLevel,
        resourceTypes: schedule.resourceTypes,
        groupId: schedule.groupId,
        patientId: schedule.patientId,
        since: scheduledSince(schedule),
        typeFilters: schedule.typeFilters,
        triggeredBy: 'scheduled',
        maxResourcesPerFile: schedule.maxResourcesPerFile ?? undefined,
      });

      if (enqueued.enqueued) {
        await markBulkScheduleEnqueued(schedule.id, enqueued.jobId ?? null);
        result.enqueued += 1;
      } else {
        await markBulkScheduleFailure(schedule.id, enqueued.reason ?? 'queue_not_enqueued');
        result.skipped += 1;
      }
    } catch (err) {
      await markBulkScheduleFailure(schedule.id, errorMessage(err));
      result.failed += 1;
    }
  }

  return result;
}

export async function enqueueEhrBulkImport(
  data: EhrBulkImportJobData,
  options: JobsOptions = {},
): Promise<EnqueueEhrBulkImportResult> {
  if (!bulkImportQueueEnabled()) {
    return {
      enqueued: false,
      queueName: EHR_BULK_IMPORT_QUEUE_NAME,
      reason: 'disabled',
    };
  }

  const bulkJobId = data.bulkJobId.trim();
  if (!bulkJobId) {
    return {
      enqueued: false,
      queueName: EHR_BULK_IMPORT_QUEUE_NAME,
      reason: 'missing_bulk_job_id',
    };
  }

  const queue = getBulkImportQueue();
  const job = await queue.add(
    'ehr-bulk-import',
    {
      ...data,
      action: 'import',
      bulkJobId,
    },
    {
      ...(data.triggeredBy === 'poll_completion' ? { jobId: bulkImportJobId(data.ehrTenantId, bulkJobId) } : {}),
      ...options,
    },
  );

  return {
    enqueued: true,
    queueName: EHR_BULK_IMPORT_QUEUE_NAME,
    jobId: job.id,
  };
}

export function startEhrBulkImportWorker(): Worker<EhrBulkQueueJobData> {
  const worker = new Worker<EhrBulkQueueJobData>(
    EHR_BULK_IMPORT_QUEUE_NAME,
    async (job) => processBulkQueueJob(job.data),
    {
      connection: redisConnection(),
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    console.info(`[ehr-bulk-import] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ehr-bulk-import] Job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}

async function processBulkQueueJob(
  data: EhrBulkQueueJobData,
): Promise<BackendBulkExportResult | ImportCompletedBulkExportJobResult> {
  try {
    return await processBulkQueueJobInternal(data);
  } catch (err) {
    if (data.scheduleId && !(err instanceof BulkImportIncompleteError)) {
      await markScheduleFailureSafe(data.scheduleId, errorMessage(err));
    }
    throw err;
  }
}

async function processBulkQueueJobInternal(
  data: EhrBulkQueueJobData,
): Promise<BackendBulkExportResult | ImportCompletedBulkExportJobResult> {
  if (data.action === 'kickoff') {
    const result = await kickoffBulkExportWithBackendServices({
      ehrTenantId: data.ehrTenantId,
      exportLevel: data.exportLevel,
      resourceTypes: data.resourceTypes,
      groupId: data.groupId,
      patientId: data.patientId,
      since: data.since,
      typeFilters: data.typeFilters,
      metadata: {
        triggeredBy: data.triggeredBy,
        queueName: EHR_BULK_IMPORT_QUEUE_NAME,
        scheduleId: data.scheduleId ?? null,
      },
    });
    if (data.scheduleId) {
      await markBulkScheduleBulkJob(data.scheduleId, result.job.id);
    }
    await enqueueEhrBulkPoll({
      scheduleId: data.scheduleId,
      ehrTenantId: data.ehrTenantId,
      orgId: data.orgId,
      vendor: data.vendor ?? result.tenant.vendor ?? null,
      bulkJobId: result.job.id,
      maxResourcesPerFile: data.maxResourcesPerFile,
    }, {
      delay: pollDelayMs(result.job.retryAfterSeconds, data.vendor ?? result.tenant.vendor),
    });
    console.info(
      `[ehr-bulk-import] kickoff tenant=${data.ehrTenantId} bulkJob=${result.job.id}` +
        ` status=${result.job.status}`,
    );
    return result;
  }

  if (data.action === 'poll') {
    const result = await pollBulkExportJobWithBackendServices({
      ehrTenantId: data.ehrTenantId,
      bulkJobId: data.bulkJobId,
    });
    if (result.job.status === 'completed') {
      await enqueueEhrBulkImport({
        scheduleId: data.scheduleId,
        ehrTenantId: data.ehrTenantId,
        orgId: data.orgId,
        vendor: data.vendor ?? result.tenant.vendor ?? null,
        bulkJobId: result.job.id,
        triggeredBy: 'poll_completion',
        maxResourcesPerFile: data.maxResourcesPerFile,
        resumeFailedOnly: true,
      });
    } else if (result.job.status === 'accepted' || result.job.status === 'in_progress') {
      await enqueueEhrBulkPoll({
        ...data,
        vendor: data.vendor ?? result.tenant.vendor ?? null,
      }, {
        delay: pollDelayMs(result.job.retryAfterSeconds, data.vendor ?? result.tenant.vendor),
      });
    } else if (data.scheduleId && (result.job.status === 'failed' || result.job.status === 'canceled')) {
      await markScheduleFailureSafe(data.scheduleId, `Bulk export ended with status=${result.job.status}`);
    }
    console.info(
      `[ehr-bulk-import] poll tenant=${data.ehrTenantId} bulkJob=${result.job.id}` +
        ` status=${result.job.status}`,
    );
    return result;
  }

  const result = await importCompletedBulkExportJob({
    ehrTenantId: data.ehrTenantId,
    bulkJobId: data.bulkJobId,
    maxResourcesPerFile: data.maxResourcesPerFile,
    resumeFailedOnly: data.resumeFailedOnly ?? data.triggeredBy !== 'manual',
  });
  console.info(
    `[ehr-bulk-import] import tenant=${data.ehrTenantId} bulkJob=${data.bulkJobId}` +
      ` ingestRun=${result.ingestRun.id} status=${result.ingestRun.status}` +
      ` staged=${result.resourcesStaged} failed=${result.resourcesFailed}`,
  );
  if (result.resourcesFailed > 0 || result.ingestRun.status === 'failed') {
    if (data.scheduleId) {
      await markScheduleFailureSafe(
        data.scheduleId,
        `Bulk import incomplete: status=${result.ingestRun.status} resourcesFailed=${result.resourcesFailed}`,
      );
    }
    throw new BulkImportIncompleteError(
      data.ehrTenantId,
      data.bulkJobId,
      result.resourcesFailed,
      result.ingestRun.status,
    );
  }
  if (data.scheduleId) {
    await markBulkScheduleSuccess(data.scheduleId, data.bulkJobId, bulkJobTransactionTime(result.job));
  }
  return result;
}

class BulkImportIncompleteError extends Error {
  constructor(
    ehrTenantId: number,
    bulkJobId: string,
    resourcesFailed: number,
    ingestStatus: string,
  ) {
    super(
      `Bulk Data import incomplete for tenant=${ehrTenantId} bulkJob=${bulkJobId}` +
        ` ingestStatus=${ingestStatus} resourcesFailed=${resourcesFailed}`,
    );
    this.name = 'BulkImportIncompleteError';
  }
}

async function enqueueEhrBulkPoll(data: EhrBulkPollJobData, options: JobsOptions = {}): Promise<void> {
  const queue = getBulkImportQueue();
  await queue.add(
    'ehr-bulk-poll',
    {
      ...data,
      action: 'poll',
    },
    {
      jobId: `ehr-bulk-poll:${data.ehrTenantId}:${data.bulkJobId}:${Date.now()}`,
      ...options,
    },
  );
}

function getBulkImportQueue(): Queue<EhrBulkQueueJobData> {
  bulkImportQueue ??= new Queue<EhrBulkQueueJobData>(
    EHR_BULK_IMPORT_QUEUE_NAME,
    {
      connection: redisConnection(),
      defaultJobOptions,
    },
  );
  return bulkImportQueue;
}

function bulkImportQueueEnabled(): boolean {
  const value = process.env['EHR_BULK_IMPORT_QUEUE_ENABLED'];
  if (value) return value.toLowerCase() === 'true';
  return process.env['NODE_ENV'] !== 'test';
}

function scheduledSince(schedule: EhrBulkSchedule): string | null {
  if (schedule.sinceMode === 'none') return null;
  if (schedule.sinceMode === 'fixed') return schedule.since;
  return schedule.lastSuccessAt ?? schedule.since;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function markScheduleFailureSafe(scheduleId: string, message: string): Promise<void> {
  try {
    await markBulkScheduleFailure(scheduleId, message);
  } catch (err) {
    console.error(`[ehr-bulk-import] failed to mark schedule=${scheduleId} failed:`, errorMessage(err));
  }
}

function bulkJobTransactionTime(job: ImportCompletedBulkExportJobResult['job']): string | null {
  const manifest = job.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  const transactionTime = manifest['transactionTime'];
  if (typeof transactionTime !== 'string') return null;
  const parsed = new Date(transactionTime);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function redisConnection(): { host: string; port: number } {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
  };
}

function bulkImportJobId(ehrTenantId: number, bulkJobId: string): string {
  return `ehr-bulk-import:${ehrTenantId}:${bulkJobId}`;
}

function kickoffJobId(data: EhrBulkKickoffJobData, resourceTypes: string[]): string {
  const hash = createHash('sha256')
    .update(JSON.stringify({
      ehrTenantId: data.ehrTenantId,
      scheduleId: nullableString(data.scheduleId),
      exportLevel: data.exportLevel,
      resourceTypes,
      groupId: nullableString(data.groupId),
      patientId: nullableString(data.patientId),
      since: nullableString(data.since),
      typeFilters: normalizeStringList(data.typeFilters ?? []),
      maxResourcesPerFile: data.maxResourcesPerFile ?? null,
    }))
    .digest('hex')
    .slice(0, 16);
  return `ehr-bulk-kickoff:${data.ehrTenantId}:${hash}`;
}

function pollDelayMs(retryAfterSeconds: number | null, vendor: string | null | undefined): number {
  const capabilities = getVendorAdapter(vendor ?? undefined).bulkCapabilities;
  const minSeconds = capabilities.pollingMinSeconds;
  const maxSeconds = capabilities.pollingMaxSeconds;
  const seconds = retryAfterSeconds ?? minSeconds;
  return Math.max(minSeconds, Math.min(seconds, maxSeconds)) * 1000;
}

function normalizeResourceTypes(values: readonly string[]): string[] {
  const normalized = normalizeStringList(values);
  return normalized.filter((value) => /^[A-Z][A-Za-z0-9]+$/.test(value));
}

function normalizeStringList(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function nullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
