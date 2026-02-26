// =============================================================================
// Medgnosis API — Measure Calculator Worker (BullMQ)
// Nightly recalculation of eCQM results.
// Executes the 48+ measure SQL definitions against the EDW.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { connection } from './rules-engine.js';
import { executeMeasure, executeAllMeasures } from '../services/measureEngine.js';

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
  measureCode?: string; // specific measure code (e.g. 'CMS122v12'), or omit for all
  triggerType: 'nightly' | 'manual';
}

async function processMeasureJob(job: { data: MeasureJobData }): Promise<void> {
  const { measureCode, triggerType } = job.data;
  console.info(`[measure-calc] ${triggerType} calculation starting...`);

  if (measureCode) {
    const result = await executeMeasure(measureCode);
    if (result) {
      console.info(`[measure-calc] ${measureCode}: denom=${result.denominator}, numer=${result.numerator}, rate=${result.performanceRate}%`);
    } else {
      console.warn(`[measure-calc] ${measureCode}: no result (SQL file missing or error)`);
    }
  } else {
    const results = await executeAllMeasures();
    console.info(`[measure-calc] All measures complete: ${results.length} succeeded.`);
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
