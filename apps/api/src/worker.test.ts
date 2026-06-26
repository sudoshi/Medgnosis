import { describe, expect, it, vi } from 'vitest';
import {
  WORKER_REGISTRY,
  closeBackgroundWorkers,
  installGracefulShutdown,
  startBackgroundWorkers,
  type WorkerRegistration,
} from './worker.js';

function handle() {
  return { close: vi.fn().mockResolvedValue(undefined) };
}

describe('worker entrypoint registry', () => {
  it('lists every production worker registered by the entrypoint', () => {
    expect(WORKER_REGISTRY.map((worker) => worker.name)).toEqual([
      'rules-engine',
      'ai-insights',
      'measure-calculator',
      'population-finder',
      'close-the-loop',
      'risk-model',
      'auto-orders',
      'amp',
      'mtm',
      'surveillance',
      'data-quality',
      'cohort-flags',
      'ehr-bulk-import',
      'ehr-patient-context-refresh',
      'mpi-feed',
      'nightly-scheduler',
    ]);
  });

  it('starts all registered workers and returns their close handles', async () => {
    const first = handle();
    const second = handle();
    const registry: WorkerRegistration[] = [
      { name: 'first', start: vi.fn().mockResolvedValue(first) },
      { name: 'second', start: vi.fn().mockReturnValue(second) },
    ];
    const logger = { info: vi.fn(), error: vi.fn() };

    const workers = await startBackgroundWorkers(registry, logger);

    expect(workers).toEqual([first, second]);
    expect(registry[0]?.start).toHaveBeenCalledOnce();
    expect(registry[1]?.start).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith('[worker] Starting Medgnosis background workers...');
    expect(logger.info).toHaveBeenCalledWith('[worker] 2 workers started.');
  });

  it('closes already-started workers when a later worker fails to start', async () => {
    const started = handle();
    const startupError = new Error('redis unavailable');
    const registry: WorkerRegistration[] = [
      { name: 'started', start: vi.fn().mockResolvedValue(started) },
      { name: 'broken', start: vi.fn().mockRejectedValue(startupError) },
    ];
    const logger = { info: vi.fn(), error: vi.fn() };

    await expect(startBackgroundWorkers(registry, logger)).rejects.toThrow(startupError);

    expect(started.close).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith('[worker] Failed to start broken:', startupError);
    expect(logger.info).toHaveBeenCalledWith('[worker] startup-failure received - closing workers...');
  });

  it('closes worker handles for shutdown signals', async () => {
    const first = handle();
    const second = handle();
    const logger = { info: vi.fn(), error: vi.fn() };

    await closeBackgroundWorkers([first, second], 'SIGTERM', logger);

    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith('[worker] SIGTERM received - closing workers...');
  });

  it('installs SIGINT and SIGTERM handlers that close workers before exit', async () => {
    const worker = handle();
    const logger = { info: vi.fn(), error: vi.fn() };
    const processLike = {
      on: vi.fn(),
      exit: vi.fn(),
    };

    const shutdown = installGracefulShutdown([worker], logger, processLike);
    await shutdown('SIGINT');

    expect(processLike.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(processLike.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(worker.close).toHaveBeenCalledOnce();
    expect(processLike.exit).toHaveBeenCalledWith(0);
  });
});
