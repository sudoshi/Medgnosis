// =============================================================================
// Medgnosis API — MPI feed worker.
//
// Moves the per-ingest MPI registration off the request path. When a new person
// is created, resolvePatientIdentity enqueues a feed job; this worker registers
// the demographics with SanteMPI, learns the MDM master id via a self-$match,
// and stores it on the person so a future $match re-resolves to it. Best-effort
// with BullMQ retries — never blocks or breaks ingestion.
// =============================================================================

import { Queue, Worker, type JobsOptions } from 'bullmq';
import type { NormalizedDemographics, NormalizedIdentifier } from '../services/ehr/identity/identityKeys.js';
import { buildMpiClientFromEnv, type MpiClientConfig } from '../services/ehr/identity/mpiConfig.js';
import { identityRepository } from '../services/ehr/identity/identityRepository.js';

export const MPI_FEED_QUEUE_NAME = 'medgnosis-mpi-feed';

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 2000 },
};

export interface MpiFeedJobData {
  personId: number;
  demographics: NormalizedDemographics;
  ehrTenantId: number;
}

interface AttachIdentifiersRepo {
  attachIdentifiers(
    personId: number,
    identifiers: NormalizedIdentifier[],
    sourceSystem: string,
    ehrTenantId: number,
  ): Promise<void>;
}

export interface ProcessMpiFeedDeps {
  config?: MpiClientConfig;
  repository?: AttachIdentifiersRepo;
}

export interface ProcessMpiFeedResult {
  fed: boolean;
  masterStored: boolean;
}

/**
 * Register one person with the MPI and store its master id. Pure of BullMQ so it
 * is unit-testable; the worker supplies the live config + repository.
 */
export async function processMpiFeed(
  data: MpiFeedJobData,
  deps: ProcessMpiFeedDeps = {},
): Promise<ProcessMpiFeedResult> {
  const config = deps.config ?? buildMpiClientFromEnv();
  if (!config) return { fed: false, masterStored: false };
  const repository = deps.repository ?? identityRepository;

  await config.client.feed(data.demographics);
  const candidates = await config.client.match(data.demographics);
  const master = candidates[0]?.masterIdentifier;
  if (!master) return { fed: true, masterStored: false };

  await repository.attachIdentifiers(
    data.personId,
    [{ system: master.system, value: master.value, typeCode: null, strong: true }],
    'mpi-feed',
    data.ehrTenantId,
  );
  return { fed: true, masterStored: true };
}

let mpiFeedQueue: Queue<MpiFeedJobData> | null = null;

function mpiFeedQueueEnabled(): boolean {
  if (process.env['NODE_ENV'] === 'test') return false;
  return process.env['MPI_ENABLED'] === 'true';
}

function redisConnection(): { host: string; port: number } {
  const url = new URL(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  return { host: url.hostname, port: Number(url.port || 6379) };
}

function getMpiFeedQueue(): Queue<MpiFeedJobData> {
  mpiFeedQueue ??= new Queue<MpiFeedJobData>(MPI_FEED_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions,
  });
  return mpiFeedQueue;
}

export interface EnqueueMpiFeedResult {
  enqueued: boolean;
  reason?: string;
}

/** Enqueue a best-effort MPI registration for a newly created person. */
export async function enqueueMpiFeed(data: MpiFeedJobData): Promise<EnqueueMpiFeedResult> {
  if (!mpiFeedQueueEnabled()) return { enqueued: false, reason: 'disabled' };
  await getMpiFeedQueue().add('mpi-feed', data, { jobId: `mpi-feed:${data.personId}` });
  return { enqueued: true };
}

export function startMpiFeedWorker(): Worker<MpiFeedJobData> {
  return new Worker<MpiFeedJobData>(
    MPI_FEED_QUEUE_NAME,
    async (job) => processMpiFeed(job.data),
    { connection: redisConnection(), concurrency: 4 },
  );
}
