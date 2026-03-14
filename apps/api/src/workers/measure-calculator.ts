// =============================================================================
// Medgnosis API — Measure Calculator Worker (BullMQ)
// Triggers star-schema-based measure result refresh.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { connection } from './rules-engine.js';
import { refreshMeasureResults } from '../services/measureCalculatorV2.js';

export const MEASURE_QUEUE_NAME = 'medgnosis-measure-calc';

export const measureQueue = new Queue(MEASURE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 300_000 }, // retry once after 5 min
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export interface MeasureJobData {
  triggerType: 'nightly' | 'manual';
}

async function processMeasureJob(job: { data: MeasureJobData }): Promise<void> {
  const { triggerType } = job.data;
  console.info(`[measure-calc] ${triggerType} refresh starting...`);

  const result = await refreshMeasureResults();
  console.info(
    `[measure-calc] ${triggerType} refresh complete: ${result.rowCount} rows in ${result.durationMs}ms`,
  );
}

export function startMeasureCalculatorWorker(): Worker<MeasureJobData> {
  const worker = new Worker<MeasureJobData>(
    MEASURE_QUEUE_NAME,
    processMeasureJob,
    { connection, concurrency: 1 },
  );

  worker.on('completed', (job) => {
    console.info(`[measure-calc] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[measure-calc] Job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}
