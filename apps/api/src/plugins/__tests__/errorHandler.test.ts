// =============================================================================
// Unit tests — Error handler plugin
// =============================================================================

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import errorHandlerPlugin from '../error-handler.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);

  // Route that throws a generic server error
  app.get('/throw-500', async () => {
    throw new Error('Something went wrong');
  });

  // Route that throws a client error with statusCode
  app.get('/throw-400', async (_req, reply) => {
    const err: Error & { statusCode?: number; code?: string } = new Error('Bad input');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  });

  // Route that throws a 422 with code (simulates Zod-style validation)
  app.get('/throw-422', async () => {
    const err: Error & { statusCode?: number; code?: string } = new Error('Validation failed');
    err.statusCode = 422;
    err.code = 'FST_ERR_VALIDATION';
    throw err;
  });

  // Route that throws with no statusCode set
  app.get('/throw-unknown', async () => {
    throw { message: 'mystery error' };
  });

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('error handler plugin', () => {
  // -------------------------------------------------------------------------
  // 500 errors
  // -------------------------------------------------------------------------

  describe('server errors (500)', () => {
    it('returns 500 with safe message for unhandled errors', async () => {
      const response = await app.inject({ method: 'GET', url: '/throw-500' });
      expect(response.statusCode).toBe(500);

      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.message).toBe('An internal server error occurred');
      // Must NOT leak the actual error message
      expect(body.error.message).not.toContain('Something went wrong');
    });

    it('includes error code in 500 response', async () => {
      const response = await app.inject({ method: 'GET', url: '/throw-500' });
      const body = response.json();
      expect(body.error.code).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Client errors
  // -------------------------------------------------------------------------

  describe('client errors (4xx)', () => {
    it('returns the original status code for client errors', async () => {
      const response = await app.inject({ method: 'GET', url: '/throw-400' });
      expect(response.statusCode).toBe(400);
    });

    it('includes the actual error message for client errors', async () => {
      const response = await app.inject({ method: 'GET', url: '/throw-400' });
      const body = response.json();
      expect(body.error.message).toBe('Bad input');
    });

    it('includes the error code from the thrown error', async () => {
      const response = await app.inject({ method: 'GET', url: '/throw-400' });
      const body = response.json();
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    it('returns 422 for validation-style errors', async () => {
      const response = await app.inject({ method: 'GET', url: '/throw-422' });
      expect(response.statusCode).toBe(422);

      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FST_ERR_VALIDATION');
      expect(body.error.message).toBe('Validation failed');
    });
  });

  // -------------------------------------------------------------------------
  // Envelope format
  // -------------------------------------------------------------------------

  describe('response envelope', () => {
    it('always returns { success, error } shape', async () => {
      const response = await app.inject({ method: 'GET', url: '/throw-500' });
      const body = response.json();
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('error');
      expect(body.success).toBe(false);
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  // 404 handler
  // -------------------------------------------------------------------------

  describe('not found handler', () => {
    it('returns 404 with standard envelope for unknown routes', async () => {
      const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
      expect(response.statusCode).toBe(404);

      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('The requested resource was not found');
    });

    it('returns 404 for various HTTP methods on unknown routes', async () => {
      const response = await app.inject({ method: 'POST', url: '/nope' });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });
  });
});
