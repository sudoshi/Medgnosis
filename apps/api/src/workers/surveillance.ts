// =============================================================================
// Medgnosis API — Surveillance ingestion worker (BullMQ, repeatable)
// A tick every 5 minutes drives ONE ingestion cycle through the configured
// SurveillanceSource (factory): the synthetic streamer in demo mode, or a real
// HL7 v2 ORU feed when SURVEILLANCE_SOURCE=hl7v2. Scoring + escalation are
// identical regardless of source — the abstraction sits entirely upstream.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { connection } from './rules-engine.js';
import {
  runSurveillanceIngest,
  configuredSourceMode,
} from '../services/surveillance/factory.js';

export const SURVEILLANCE_QUEUE_NAME = 'medgnosis-surveillance';

export const surveillanceQueue = new Queue(SURVEILLANCE_QUEUE_NAME, {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
});

export function startSurveillanceWorker(): Worker {
  const mode = configuredSourceMode();
  const worker = new Worker(
    SURVEILLANCE_QUEUE_NAME,
    async () => {
      const r = await runSurveillanceIngest();
      console.info(
        `[surveillance] tick (${mode}) — ${r.ticked} beds scored, ${r.events} events, ${r.alerts} escalations`,
      );
    },
    { connection, concurrency: 1 },
  );

  // Continuous monitoring: tick every 5 minutes.
  surveillanceQueue
    .add('stream-tick', {}, { repeat: { pattern: '*/5 * * * *' } })
    .then(() => console.info(`[surveillance] ingestion registered (source=${mode}): every 5 min`))
    .catch((err) => console.error('[surveillance] failed to register ingestion:', err));

  worker.on('failed', (job, err) => console.error(`[surveillance] Job ${job?.id ?? '?'} failed:`, err.message));
  return worker;
}
