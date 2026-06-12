// =============================================================================
// Medgnosis API — Surveillance streamer worker (BullMQ, repeatable)
// Simulates the real-time lane: a tick every 5 minutes appends vitals/glucose
// and re-scores the census. A real MLLP source would replace the streamer; the
// scoring + escalation stay the same.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { connection } from './rules-engine.js';
import { streamTick } from '../services/surveillance.js';

export const SURVEILLANCE_QUEUE_NAME = 'medgnosis-surveillance';

export const surveillanceQueue = new Queue(SURVEILLANCE_QUEUE_NAME, {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
});

export function startSurveillanceWorker(): Worker {
  const worker = new Worker(
    SURVEILLANCE_QUEUE_NAME,
    async () => {
      const r = await streamTick();
      console.info(`[surveillance] tick — ${r.ticked} beds scored, ${r.alerts} escalations`);
    },
    { connection, concurrency: 1 },
  );

  // Continuous monitoring: tick every 5 minutes.
  surveillanceQueue
    .add('stream-tick', {}, { repeat: { pattern: '*/5 * * * *' } })
    .then(() => console.info('[surveillance] streamer registered: every 5 min'))
    .catch((err) => console.error('[surveillance] failed to register streamer:', err));

  worker.on('failed', (job, err) => console.error(`[surveillance] Job ${job?.id ?? '?'} failed:`, err.message));
  return worker;
}
