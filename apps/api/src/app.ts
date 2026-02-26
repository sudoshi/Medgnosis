// =============================================================================
// Medgnosis API — Fastify application factory
// Separated from server.ts to enable testing without starting a server.
// =============================================================================

import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import auditPlugin from './plugins/audit.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import websocketPlugin from './plugins/websocket.js';
import { registerRoutes } from './routes/index.js';

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.isDev ? 'debug' : 'info',
      // Pino pretty-print in development
      ...(config.isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
            },
          }
        : {
            // Production: redact PHI fields from structured logs
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.access_token',
                'req.body.refresh_token',
                'req.body.email',
                'req.body.ssn',
                'req.body.phone',
              ],
              censor: '[Redacted]',
            },
          }),
    },
    // Trust X-Forwarded-For in production (behind load balancer)
    trustProxy: config.isProd,
  });

  // ------------------------------------------------------------------
  // Security headers
  // ------------------------------------------------------------------
  await fastify.register(fastifyHelmet, {
    hsts: config.isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    noSniff: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  await fastify.register(fastifyCors, {
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ------------------------------------------------------------------
  // Global rate limiting
  // ------------------------------------------------------------------
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    allowList: (request: FastifyRequest, _key: string) =>
      request.headers['upgrade'] === 'websocket',
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Retry after ${String(context.after)}.`,
      },
    }),
  });

  // ------------------------------------------------------------------
  // Plugins
  // ------------------------------------------------------------------
  await fastify.register(errorHandlerPlugin);
  await fastify.register(authPlugin);
  await fastify.register(auditPlugin);
  await fastify.register(websocketPlugin);

  // ------------------------------------------------------------------
  // Routes
  // ------------------------------------------------------------------
  await registerRoutes(fastify);

  return fastify;
}
