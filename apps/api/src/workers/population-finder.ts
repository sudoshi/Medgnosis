// =============================================================================
// Medgnosis API — Population Finder Worker (BullMQ)
// Runs the two-pass population finder over the problem-list cohort. Unlike the
// rules worker this is a SINGLE self-scoping job (not per-patient fan-out) —
// runFinder iterates the cohort internally.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { connection } from './rules-engine.js';
import { runFinder } from '../services/populationFinder.js';

export const FINDER_QUEUE_NAME = 'medgnosis-finder';

export const finderQueue = new Queue(FINDER_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
  },
});

export interface FinderJobData {
  cohortLimit?: number;
  triggeredBy: 'nightly_batch' | 'manual';
}

async function processFinderJob(job: { data: FinderJobData }): Promise<void> {
  const { cohortLimit } = job.data;
  const result = await runFinder({ cohortLimit });
  console.info(
    `[finder] Done — scanned ${result.scanned}, ${result.candidates} new candidates`,
    result.byType,
  );
}

export function startPopulationFinderWorker(): Worker<FinderJobData> {
  const worker = new Worker<FinderJobData>(
    FINDER_QUEUE_NAME,
    processFinderJob,
    { connection, concurrency: 1 }, // one cohort sweep at a time
  );

  worker.on('completed', (job) => {
    console.info(`[finder] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[finder] Job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}
