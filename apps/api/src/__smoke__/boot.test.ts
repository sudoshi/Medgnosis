// =============================================================================
// Boot smoke — buildApp().ready() registers EVERY plugin + route.
// This is the gate that the unit tests and `turbo build` do NOT provide: they
// type-check and exercise handlers in isolation but never start the real app,
// so a plugin/route-registration crash (e.g. a `const fn = fastify.get`
// this-binding bug in the websocket plugin) ships straight to prod. Calling
// app.ready() runs all deferred plugin registration without listening or
// touching a live DB — catching that whole class of boot-time failure in CI.
// =============================================================================

import { describe, it, expect } from 'vitest';

// config.ts require()s these at module load; ready() performs no queries, so
// dummy values are fine. Set before the dynamic import of the app factory.
process.env['DATABASE_URL'] ??= 'postgres://smoke:smoke@127.0.0.1:5432/smoke';
process.env['JWT_SECRET'] ??= 'boot-smoke-secret-not-used-for-anything-real';
process.env['NODE_ENV'] ??= 'test';

describe('app boot smoke', () => {
  it('buildApp().ready() registers all plugins + routes without crashing', async () => {
    const { buildApp } = await import('../app.js');
    const app = await buildApp();
    try {
      // Runs every deferred plugin registration (helmet, cors, rate-limit,
      // auth, audit, websocket, solr) + all route registration. Throws on any
      // registration failure — that's the smoke.
      await app.ready();
      const routes = app.printRoutes();
      expect(routes).toMatch(/health/);
      expect(routes).toMatch(/ws/); // the websocket route whose registration crashed prod
    } finally {
      await app.close();
    }
  });
});
