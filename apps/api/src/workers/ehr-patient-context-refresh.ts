// =============================================================================
// Medgnosis API - EHR patient-context refresh worker
// Queues broader SMART patient-context refreshes after callback completion.
// =============================================================================

import { createHash } from 'node:crypto';
import { Queue, Worker, type JobsOptions } from 'bullmq';
import {
  refreshSmartPatientContext,
  type PatientContextRefreshContinuation,
} from '../services/ehr/patientContextRefresh.js';

export const EHR_PATIENT_CONTEXT_REFRESH_QUEUE_NAME = 'medgnosis-ehr-patient-context-refresh';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 2000 },
};
const MAX_CONTINUATION_DEPTH = 100;

let patientContextRefreshQueue: Queue<SmartPatientContextRefreshJobData> | null = null;

export interface SmartPatientContextRefreshJobData {
  ehrTenantId: number;
  orgId?: number | null;
  patientResourceId: string;
  localPatientId?: number | null;
  requestedSince?: string | null;
  resourceTypes?: string[];
  continuation?: PatientContextRefreshContinuation[];
  continuationDepth?: number;
  smartLaunchSessionId?: string | null;
  triggeredBy: 'smart_launch' | 'manual' | 'nightly_batch';
  pageSize?: number;
  maxPages?: number;
}

export interface EnqueueSmartPatientContextRefreshResult {
  enqueued: boolean;
  queueName: string;
  jobId?: string;
  reason?: string;
}

export async function enqueueSmartPatientContextRefresh(
  data: SmartPatientContextRefreshJobData,
  options: JobsOptions = {},
): Promise<EnqueueSmartPatientContextRefreshResult> {
  if (!patientContextRefreshQueueEnabled()) {
    return {
      enqueued: false,
      queueName: EHR_PATIENT_CONTEXT_REFRESH_QUEUE_NAME,
      reason: 'disabled',
    };
  }

  const patientResourceId = data.patientResourceId.trim();
  if (!patientResourceId) {
    return {
      enqueued: false,
      queueName: EHR_PATIENT_CONTEXT_REFRESH_QUEUE_NAME,
      reason: 'missing_patient_resource_id',
    };
  }

  const queue = getPatientContextRefreshQueue();
  const job = await queue.add(
    'smart-patient-context-refresh',
    {
      ...data,
      patientResourceId,
    },
    {
      jobId: refreshJobId(data, patientResourceId),
      ...options,
    },
  );

  return {
    enqueued: true,
    queueName: EHR_PATIENT_CONTEXT_REFRESH_QUEUE_NAME,
    jobId: job.id,
  };
}

export function startEhrPatientContextRefreshWorker(): Worker<SmartPatientContextRefreshJobData> {
  const worker = new Worker<SmartPatientContextRefreshJobData>(
    EHR_PATIENT_CONTEXT_REFRESH_QUEUE_NAME,
    async (job) => {
      const result = await refreshSmartPatientContext(job.data);
      if (result.status === 'failed') {
        throw new Error(result.errorMessage ?? 'SMART patient-context refresh failed');
      }
      const continuation = result.contextResources?.remainingNextUrls ?? [];
      if (result.status === 'succeeded' && continuation.length > 0) {
        await enqueueContinuationRefresh(job.data, continuation);
      }
      console.info(
        `[ehr-refresh] ${result.status} tenant=${result.ehrTenantId} patient=${result.patientResourceId}` +
          (result.ingestRunId ? ` ingestRun=${result.ingestRunId}` : ''),
      );
      return result;
    },
    {
      connection: redisConnection(),
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    console.info(`[ehr-refresh] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ehr-refresh] Job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}

async function enqueueContinuationRefresh(
  data: SmartPatientContextRefreshJobData,
  continuation: PatientContextRefreshContinuation[],
): Promise<void> {
  const continuationDepth = (data.continuationDepth ?? 0) + 1;
  if (continuationDepth > MAX_CONTINUATION_DEPTH) {
    console.warn(
      `[ehr-refresh] continuation depth cap reached tenant=${data.ehrTenantId} patient=${data.patientResourceId}`,
    );
    return;
  }

  const resourceTypes = [...new Set(continuation.map((item) => item.resourceType))];
  const queued = await enqueueSmartPatientContextRefresh({
    ...data,
    resourceTypes,
    continuation,
    continuationDepth,
    requestedSince: null,
  });
  if (queued.enqueued) {
    console.info(
      `[ehr-refresh] queued continuation job ${queued.jobId} tenant=${data.ehrTenantId} patient=${data.patientResourceId}`,
    );
  }
}

function getPatientContextRefreshQueue(): Queue<SmartPatientContextRefreshJobData> {
  patientContextRefreshQueue ??= new Queue<SmartPatientContextRefreshJobData>(
    EHR_PATIENT_CONTEXT_REFRESH_QUEUE_NAME,
    {
      connection: redisConnection(),
      defaultJobOptions,
    },
  );
  return patientContextRefreshQueue;
}

function patientContextRefreshQueueEnabled(): boolean {
  const value = process.env['EHR_PATIENT_CONTEXT_REFRESH_QUEUE_ENABLED'];
  if (value) return value.toLowerCase() === 'true';
  return process.env['NODE_ENV'] !== 'test';
}

function redisConnection(): { host: string; port: number } {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
  };
}

function refreshJobId(data: SmartPatientContextRefreshJobData, patientResourceId: string): string {
  if (data.continuation && data.continuation.length > 0) {
    return `smart-patient-context-refresh:${data.ehrTenantId}:${patientResourceId}:continuation:${data.continuationDepth ?? 0}:${continuationHash(data.continuation)}`;
  }
  const sessionPart = data.smartLaunchSessionId ?? `${Date.now()}`;
  return `smart-patient-context-refresh:${data.ehrTenantId}:${patientResourceId}:${sessionPart}`;
}

function continuationHash(continuation: PatientContextRefreshContinuation[]): string {
  return createHash('sha256')
    .update(JSON.stringify(continuation))
    .digest('hex')
    .slice(0, 16);
}
