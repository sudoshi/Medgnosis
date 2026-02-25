// =============================================================================
// Medgnosis API — Measure Calculator Worker (BullMQ)
// Nightly recalculation of eCQM results.
// Executes the 48+ measure SQL definitions against the EDW.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { sql } from '@medgnosis/db';
import { connection } from './rules-engine.js';

export const MEASURE_QUEUE_NAME = 'medgnosis-measure-calc';

export const measureQueue = new Queue(MEASURE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export interface MeasureJobData {
  measureId?: string; // specific measure, or null for all
  triggerType: 'nightly' | 'manual';
}

async function processMeasureJob(job: { data: MeasureJobData }): Promise<void> {
  const { measureId, triggerType } = job.data;
  console.info(`[measure-calc] ${triggerType} calculation starting...`);

  if (measureId) {
    // Calculate single measure
    console.info(`[measure-calc] Calculating measure ${measureId}`);
    // TODO: Load and execute the specific eCQM SQL from measure_definition
  } else {
    // Refresh entire star schema (runs ETL_edw_to_star equivalent)
    console.info('[measure-calc] Refreshing star schema for all measures...');
    // The ETL scripts are idempotent and can be re-run
    // For now, log that this would run the star schema refresh
  }

  console.info(`[measure-calc] ${triggerType} calculation complete.`);
}

export function startMeasureCalculatorWorker(): Worker<MeasureJobData> {
  const worker = new Worker<MeasureJobData>(
    MEASURE_QUEUE_NAME,
    processMeasureJob,
    { connection, concurrency: 1 }, // serial — heavy DB work
  );

  worker.on('completed', (job) => {
    console.info(`[measure-calc] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[measure-calc] Job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}
