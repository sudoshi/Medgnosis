// =============================================================================
// Medgnosis API — Nightly Scheduler Worker
// Runs on a cron schedule and enqueues batch jobs for:
//   - Rule evaluation for all active patients
//   - Risk score recalculation
//   - Measure recalculation
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { sql } from '@medgnosis/db';
import { connection, rulesQueue, type RulesJobData } from './rules-engine.js';
import { aiInsightsQueue, type InsightJobData } from './ai-insights-worker.js';
import { measureQueue, type MeasureJobData } from './measure-calculator.js';
import { finderQueue, type FinderJobData } from './population-finder.js';
import { loopsQueue, riskQueue, type LoopsJobData, type RiskJobData } from './close-the-loop.js';
import { ampQueue, mtmQueue, autoOrdersQueue, type AnticipatoryJobData } from './anticipatory.js';
import { dqQueue, cohortFlagsQueue, type DqJobData } from './data-quality.js';

export const SCHEDULER_QUEUE_NAME = 'medgnosis-nightly';

export const schedulerQueue = new Queue(SCHEDULER_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 100 },
  },
});

async function processNightlyJob(): Promise<void> {
  console.info('[nightly] Starting nightly batch...');

  // 1. Get all active patients
  const patients = await sql<{ patient_id: number; org_id: number | null }[]>`
    SELECT patient_id, NULL::int AS org_id
    FROM phm_edw.patient
    WHERE active_ind = 'Y'
    LIMIT 10000
  `;

  console.info(`[nightly] Processing ${patients.length} active patients`);

  // 2. Enqueue rules evaluation for each patient
  const rulesJobs = patients.map((p) => ({
    name: `rules-${p.patient_id}`,
    data: {
      patientId: String(p.patient_id),
      orgId: String(p.org_id ?? ''),
      triggeredBy: 'nightly_batch' as const,
    } satisfies RulesJobData,
  }));

  if (rulesJobs.length > 0) {
    await rulesQueue.addBulk(rulesJobs);
    console.info(`[nightly] Enqueued ${rulesJobs.length} rules jobs`);
  }

  // 3. Enqueue risk score recalculation for each patient
  const riskJobs = patients.map((p) => ({
    name: `risk-${p.patient_id}`,
    data: {
      patientId: String(p.patient_id),
      type: 'risk_stratification' as const,
    } satisfies InsightJobData,
  }));

  if (riskJobs.length > 0) {
    await aiInsightsQueue.addBulk(riskJobs);
    console.info(`[nightly] Enqueued ${riskJobs.length} risk score jobs`);
  }

  // 4. Enqueue measure recalculation
  await measureQueue.add('nightly-measures', {
    triggerType: 'nightly',
  } satisfies MeasureJobData);

  // 5. Enqueue a single population-finder sweep (self-scopes to the cohort)
  await finderQueue.add('nightly-finder', {
    triggeredBy: 'nightly_batch',
  } satisfies FinderJobData);
  console.info('[nightly] Enqueued population-finder sweep');

  // 6. Close-the-Loop scan + population risk-model run (single self-scoping jobs)
  await loopsQueue.add('nightly-loops', { triggeredBy: 'nightly_batch' } satisfies LoopsJobData);
  await riskQueue.add('nightly-risk', { triggeredBy: 'nightly_batch' } satisfies RiskJobData);
  console.info('[nightly] Enqueued Close-the-Loop scan + risk-model run');

  // 7. Anticipatory care: AMP sweep + MTM scan nightly; Auto-Orders generation
  // on the 1st of the month (orders are future-dated, so monthly cadence suffices).
  await ampQueue.add('nightly-amp', { triggeredBy: 'nightly_batch' } satisfies AnticipatoryJobData);
  await mtmQueue.add('nightly-mtm', { triggeredBy: 'nightly_batch' } satisfies AnticipatoryJobData);
  if (new Date().getUTCDate() === 1) {
    await autoOrdersQueue.add('monthly-autoorders', { triggeredBy: 'monthly_batch' } satisfies AnticipatoryJobData);
    console.info('[nightly] Enqueued monthly Auto-Orders generation');
  }
  console.info('[nightly] Enqueued AMP sweep + MTM scan');

  // 8. Data-quality anomaly scan + cohort high-risk flag computation
  await dqQueue.add('nightly-dq', { triggeredBy: 'nightly_batch' } satisfies DqJobData);
  await cohortFlagsQueue.add('nightly-cohort-flags', { triggeredBy: 'nightly_batch' } satisfies DqJobData);
  console.info('[nightly] Enqueued DQ scan + cohort flags');

  console.info('[nightly] Nightly batch complete.');
}

export function startNightlyScheduler(): Worker {
  const worker = new Worker(
    SCHEDULER_QUEUE_NAME,
    processNightlyJob,
    { connection, concurrency: 1 },
  );

  // Schedule nightly run at 2 AM
  schedulerQueue
    .add(
      'nightly',
      {},
      {
        repeat: {
          pattern: '0 2 * * *', // 2:00 AM daily
        },
      },
    )
    .then(() => console.info('[nightly] Scheduler registered: 2 AM daily'))
    .catch((err) => console.error('[nightly] Failed to register schedule:', err));

  worker.on('completed', (job) => {
    console.info(`[nightly] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[nightly] Job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}
