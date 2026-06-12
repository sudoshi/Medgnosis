// =============================================================================
// Medgnosis API — Anticipatory-care workers (BullMQ)
// Auto-Orders generation (monthly), AMP sweep + MTM scan (nightly). Each is a
// single self-scoping job iterating its bounded cohort internally.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { connection } from './rules-engine.js';
import { generateForEnrollments } from '../services/autoOrders.js';
import { runAmpSweep } from '../services/ampEngine.js';
import { runMtmScan } from '../services/mtmReferral.js';

export const AUTOORDERS_QUEUE_NAME = 'medgnosis-autoorders';
export const AMP_QUEUE_NAME = 'medgnosis-amp';
export const MTM_QUEUE_NAME = 'medgnosis-mtm';

const jobOpts = {
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 10000 },
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
};

export const autoOrdersQueue = new Queue(AUTOORDERS_QUEUE_NAME, { connection, defaultJobOptions: jobOpts });
export const ampQueue = new Queue(AMP_QUEUE_NAME, { connection, defaultJobOptions: jobOpts });
export const mtmQueue = new Queue(MTM_QUEUE_NAME, { connection, defaultJobOptions: jobOpts });

export interface AnticipatoryJobData { triggeredBy: 'nightly_batch' | 'monthly_batch' | 'manual' }

export function startAutoOrdersWorker(): Worker<AnticipatoryJobData> {
  const w = new Worker<AnticipatoryJobData>(
    AUTOORDERS_QUEUE_NAME,
    async () => {
      const r = await generateForEnrollments();
      console.info(`[autoorders] Done — ${r.enrollments} enrollments, ${r.generated} orders generated`);
    },
    { connection, concurrency: 1 },
  );
  w.on('failed', (job, err) => console.error(`[autoorders] Job ${job?.id ?? '?'} failed:`, err.message));
  return w;
}

export function startAmpWorker(): Worker<AnticipatoryJobData> {
  const w = new Worker<AnticipatoryJobData>(
    AMP_QUEUE_NAME,
    async () => {
      const r = await runAmpSweep();
      console.info(`[amp] Done — ${r.inserted} new outreach rows`, r.byTier);
    },
    { connection, concurrency: 1 },
  );
  w.on('failed', (job, err) => console.error(`[amp] Job ${job?.id ?? '?'} failed:`, err.message));
  return w;
}

export function startMtmWorker(): Worker<AnticipatoryJobData> {
  const w = new Worker<AnticipatoryJobData>(
    MTM_QUEUE_NAME,
    async () => {
      const r = await runMtmScan();
      console.info(`[mtm] Done — cohort ${r.cohort}, referred ${r.referred}, advanced ${r.advanced}`);
    },
    { connection, concurrency: 1 },
  );
  w.on('failed', (job, err) => console.error(`[mtm] Job ${job?.id ?? '?'} failed:`, err.message));
  return w;
}
