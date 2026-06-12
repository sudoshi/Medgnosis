// =============================================================================
// Medgnosis API — Data Quality + Cohort Flag workers (BullMQ)
// Nightly: scan for anomalies and recompute high-risk cohort flags. Each a
// single self-scoping job over bounded tables.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { connection } from './rules-engine.js';
import { runDqScan } from '../services/dqDetectors.js';
import { runCohortFlags } from '../services/cohortFlags.js';

export const DQ_QUEUE_NAME = 'medgnosis-dq';
export const COHORT_FLAGS_QUEUE_NAME = 'medgnosis-cohort-flags';

const jobOpts = {
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 10000 },
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
};

export const dqQueue = new Queue(DQ_QUEUE_NAME, { connection, defaultJobOptions: jobOpts });
export const cohortFlagsQueue = new Queue(COHORT_FLAGS_QUEUE_NAME, { connection, defaultJobOptions: jobOpts });

export interface DqJobData { triggeredBy: 'nightly_batch' | 'manual' }

export function startDqWorker(): Worker<DqJobData> {
  const w = new Worker<DqJobData>(
    DQ_QUEUE_NAME,
    async () => {
      const r = await runDqScan();
      console.info('[dq] scan complete', r.byDetector);
    },
    { connection, concurrency: 1 },
  );
  w.on('failed', (job, err) => console.error(`[dq] Job ${job?.id ?? '?'} failed:`, err.message));
  return w;
}

export function startCohortFlagsWorker(): Worker<DqJobData> {
  const w = new Worker<DqJobData>(
    COHORT_FLAGS_QUEUE_NAME,
    async () => {
      const r = await runCohortFlags();
      console.info(`[cohort-flags] cohort ${r.cohort}`, r.byFlag);
    },
    { connection, concurrency: 1 },
  );
  w.on('failed', (job, err) => console.error(`[cohort-flags] Job ${job?.id ?? '?'} failed:`, err.message));
  return w;
}
