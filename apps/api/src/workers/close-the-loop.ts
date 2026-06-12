// =============================================================================
// Medgnosis API — Close the Loop + Risk Model Workers (BullMQ)
// Two single self-scoping jobs (each iterates its bounded cohort internally).
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { connection } from './rules-engine.js';
import { runLoopScan } from '../services/closeTheLoop.js';
import { runRiskModels } from '../services/runRiskModels.js';

export const LOOPS_QUEUE_NAME = 'medgnosis-loops';
export const RISK_QUEUE_NAME = 'medgnosis-risk';

const jobOpts = {
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 10000 },
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
};

export const loopsQueue = new Queue(LOOPS_QUEUE_NAME, { connection, defaultJobOptions: jobOpts });
export const riskQueue = new Queue(RISK_QUEUE_NAME, { connection, defaultJobOptions: jobOpts });

export interface LoopsJobData { triggeredBy: 'nightly_batch' | 'manual' }
export interface RiskJobData { triggeredBy: 'nightly_batch' | 'manual' }

export function startCloseTheLoopWorker(): Worker<LoopsJobData> {
  const worker = new Worker<LoopsJobData>(
    LOOPS_QUEUE_NAME,
    async () => {
      const r = await runLoopScan();
      console.info(`[loops] Done — scanned ${r.scanned}, open ${r.open}, closed ${r.closed}`);
    },
    { connection, concurrency: 1 },
  );
  worker.on('failed', (job, err) => console.error(`[loops] Job ${job?.id ?? '?'} failed:`, err.message));
  return worker;
}

export function startRiskModelWorker(): Worker<RiskJobData> {
  const worker = new Worker<RiskJobData>(
    RISK_QUEUE_NAME,
    async () => {
      const r = await runRiskModels();
      console.info(`[risk] Done — cohort ${r.cohort}, scored ${r.scored}, gaps ${r.gaps}`, r.byModel);
    },
    { connection, concurrency: 1 },
  );
  worker.on('failed', (job, err) => console.error(`[risk] Job ${job?.id ?? '?'} failed:`, err.message));
  return worker;
}
