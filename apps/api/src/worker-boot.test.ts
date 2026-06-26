// =============================================================================
// Worker-boot smoke — every entry in WORKER_REGISTRY constructs a real worker.
//
// worker.test.ts proves the registry's NAME LIST and the startBackgroundWorkers
// ORCHESTRATION (via synthetic registrations). What it does NOT prove is that
// each real `start()` factory — which dynamically imports a workers/*.ts module
// that builds BullMQ Queues/Workers at load time — can be invoked without
// throwing. A typo in a dynamic import path, a missing export, or a top-level
// module crash would only surface when the worker process boots in prod.
//
// This smoke drives the real WORKER_REGISTRY through startBackgroundWorkers with
// BullMQ stubbed (no Redis is opened) and asserts every factory constructs a
// closeable handle. It is the worker-side analogue of __smoke__/boot.test.ts.
// =============================================================================

import { afterAll, describe, expect, it, vi } from 'vitest';

// workers/*.ts require these at module load (config.redisUrl, db client URL).
// No queries run here, so dummy values are sufficient. Set BEFORE any import of
// the worker entrypoint so the dynamic worker imports see them.
process.env['DATABASE_URL'] ??= 'postgres://smoke:smoke@127.0.0.1:5432/smoke';
process.env['REDIS_URL'] ??= 'redis://127.0.0.1:6379';
process.env['JWT_SECRET'] ??= 'worker-boot-smoke-secret-not-used-for-anything-real';
process.env['NODE_ENV'] ??= 'test';

// BullMQ constructs Queue instances at worker-module load and Worker instances
// inside each start() — stub both so no Redis connection is ever opened. `add`
// returns a resolved thenable because some workers (e.g. nightly-scheduler)
// register a repeatable job with `.add(...).then().catch()` at start time.
vi.mock('bullmq', () => {
  class StubQueue {
    add = vi.fn().mockResolvedValue(undefined);
    addBulk = vi.fn().mockResolvedValue([]);
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
    waitUntilReady = vi.fn().mockResolvedValue(undefined);
  }
  class StubWorker {
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
    waitUntilReady = vi.fn().mockResolvedValue(undefined);
  }
  return { Queue: StubQueue, Worker: StubWorker };
});

describe('worker-boot smoke', () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('constructs every WORKER_REGISTRY factory without opening Redis', async () => {
    const { WORKER_REGISTRY, startBackgroundWorkers, closeBackgroundWorkers } = await import(
      './worker.js'
    );
    const logger = { info: vi.fn(), error: vi.fn() };

    const workers = await startBackgroundWorkers(WORKER_REGISTRY, logger);

    try {
      // One closeable handle per registered worker — proves every dynamic import
      // resolved and every start() factory returned a Worker, none threw.
      expect(workers).toHaveLength(WORKER_REGISTRY.length);
      for (const handle of workers) {
        expect(typeof handle.close).toBe('function');
      }
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        `[worker] ${WORKER_REGISTRY.length} workers started.`,
      );
    } finally {
      await closeBackgroundWorkers(workers, 'smoke-teardown', logger);
    }
  });

  it('registers a uniquely-named worker for every expected queue', async () => {
    const { WORKER_REGISTRY } = await import('./worker.js');

    const names = WORKER_REGISTRY.map((registration) => registration.name);
    // No accidental duplicate registration (which would mask an unregistered
    // worker behind a name collision in the orchestration loop).
    expect(new Set(names).size).toBe(names.length);
    // Every registration exposes a callable factory.
    for (const registration of WORKER_REGISTRY) {
      expect(typeof registration.start).toBe('function');
    }
  });
});
