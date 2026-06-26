// =============================================================================
// Medgnosis API — Worker entrypoint
// Starts all BullMQ workers for background job processing.
// Run separately from the API server: npm run dev:worker
// =============================================================================

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface WorkerHandle {
  close(): Promise<unknown>;
}

export interface WorkerLogger {
  info(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

export interface WorkerRegistration {
  name: string;
  start(): WorkerHandle | Promise<WorkerHandle>;
}

export const WORKER_REGISTRY: readonly WorkerRegistration[] = [
  {
    name: 'rules-engine',
    start: async () => (await import('./workers/rules-engine.js')).startRulesWorker(),
  },
  {
    name: 'ai-insights',
    start: async () => (await import('./workers/ai-insights-worker.js')).startAiInsightsWorker(),
  },
  {
    name: 'measure-calculator',
    start: async () => (await import('./workers/measure-calculator.js')).startMeasureCalculatorWorker(),
  },
  {
    name: 'population-finder',
    start: async () => (await import('./workers/population-finder.js')).startPopulationFinderWorker(),
  },
  {
    name: 'close-the-loop',
    start: async () => (await import('./workers/close-the-loop.js')).startCloseTheLoopWorker(),
  },
  {
    name: 'risk-model',
    start: async () => (await import('./workers/close-the-loop.js')).startRiskModelWorker(),
  },
  {
    name: 'auto-orders',
    start: async () => (await import('./workers/anticipatory.js')).startAutoOrdersWorker(),
  },
  {
    name: 'amp',
    start: async () => (await import('./workers/anticipatory.js')).startAmpWorker(),
  },
  {
    name: 'mtm',
    start: async () => (await import('./workers/anticipatory.js')).startMtmWorker(),
  },
  {
    name: 'surveillance',
    start: async () => (await import('./workers/surveillance.js')).startSurveillanceWorker(),
  },
  {
    name: 'data-quality',
    start: async () => (await import('./workers/data-quality.js')).startDqWorker(),
  },
  {
    name: 'cohort-flags',
    start: async () => (await import('./workers/data-quality.js')).startCohortFlagsWorker(),
  },
  {
    name: 'ehr-bulk-import',
    start: async () => (await import('./workers/ehr-bulk-import.js')).startEhrBulkImportWorker(),
  },
  {
    name: 'ehr-patient-context-refresh',
    start: async () => (
      await import('./workers/ehr-patient-context-refresh.js')
    ).startEhrPatientContextRefreshWorker(),
  },
  {
    name: 'mpi-feed',
    start: async () => (await import('./workers/mpi-feed.js')).startMpiFeedWorker(),
  },
  {
    name: 'nightly-scheduler',
    start: async () => (await import('./workers/nightly-scheduler.js')).startNightlyScheduler(),
  },
] as const;

export async function startBackgroundWorkers(
  registry: readonly WorkerRegistration[] = WORKER_REGISTRY,
  logger: WorkerLogger = console,
): Promise<WorkerHandle[]> {
  logger.info('[worker] Starting Medgnosis background workers...');
  const workers: WorkerHandle[] = [];

  for (const registration of registry) {
    try {
      workers.push(await registration.start());
    } catch (err) {
      logger.error(`[worker] Failed to start ${registration.name}:`, err);
      await closeBackgroundWorkers(workers, 'startup-failure', logger);
      throw err;
    }
  }

  logger.info(`[worker] ${workers.length} workers started.`);
  return workers;
}

export async function closeBackgroundWorkers(
  workers: readonly WorkerHandle[],
  signal: string,
  logger: WorkerLogger = console,
): Promise<void> {
  logger.info(`[worker] ${signal} received - closing workers...`);
  await Promise.all(workers.map((worker) => worker.close()));
}

export interface ShutdownProcess {
  on(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  exit(code?: number): unknown;
}

export function installGracefulShutdown(
  workers: readonly WorkerHandle[],
  logger: WorkerLogger = console,
  processLike: ShutdownProcess = process,
): (signal: string) => Promise<void> {
  const shutdown = async (signal: string): Promise<void> => {
    await closeBackgroundWorkers(workers, signal, logger);
    processLike.exit(0);
  };

  processLike.on('SIGINT', () => void shutdown('SIGINT'));
  processLike.on('SIGTERM', () => void shutdown('SIGTERM'));
  return shutdown;
}

export async function runWorkerProcess(): Promise<WorkerHandle[]> {
  const workers = await startBackgroundWorkers();
  installGracefulShutdown(workers);
  return workers;
}

function isWorkerEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href);
}

if (isWorkerEntrypoint()) {
  void runWorkerProcess().catch((err) => {
    console.error('[worker] Failed to start Medgnosis background workers:', err);
    process.exit(1);
  });
}
