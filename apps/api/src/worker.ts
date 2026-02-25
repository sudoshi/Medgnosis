// =============================================================================
// Medgnosis API — Worker entrypoint
// Starts all BullMQ workers for background job processing.
// Run separately from the API server: npm run dev:worker
// =============================================================================

import { startRulesWorker } from './workers/rules-engine.js';
import { startAiInsightsWorker } from './workers/ai-insights-worker.js';
import { startMeasureCalculatorWorker } from './workers/measure-calculator.js';
import { startNightlyScheduler } from './workers/nightly-scheduler.js';

console.info('[worker] Starting Medgnosis background workers...');

const workers = [
  startRulesWorker(),
  startAiInsightsWorker(),
  startMeasureCalculatorWorker(),
  startNightlyScheduler(),
];

console.info(`[worker] ${workers.length} workers started.`);

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.info(`[worker] ${signal} received — closing workers...`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
