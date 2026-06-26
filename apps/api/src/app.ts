// =============================================================================
// Medgnosis API — Fastify application factory
// Separated from server.ts to enable testing without starting a server.
// =============================================================================

import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import auditPlugin from './plugins/audit.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import websocketPlugin from './plugins/websocket.js';
import solrPlugin from './plugins/solr.js';
import { registerRoutes } from './routes/index.js';
import { logRedactionOptions } from './observability/redaction.js';
import { initSentry } from './observability/sentry.js';
import { buildHelmetOptions, shouldRegisterSwagger } from './security/http.js';

export async function buildApp() {
  initSentry({ dsn: config.sentryDsn, environment: config.nodeEnv });

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
            redact: logRedactionOptions,
          }),
    },
    // Trust X-Forwarded-For in production (behind load balancer)
    trustProxy: config.isProd,
  });

  // ------------------------------------------------------------------
  // Security headers
  // ------------------------------------------------------------------
  await fastify.register(fastifyHelmet, buildHelmetOptions(config));

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
    errorResponseBuilder: (_request: FastifyRequest, context: { after: string }) => ({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Retry after ${String(context.after)}.`,
      },
    }),
  });

  // ------------------------------------------------------------------
  // OpenAPI / Swagger documentation
  // ------------------------------------------------------------------
  if (shouldRegisterSwagger(config)) {
    await fastify.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'Medgnosis API',
          description: 'Population Health Management API',
          version: '1.0.0',
        },
        servers: [{ url: '/' }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
    });

    await fastify.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }

  // ------------------------------------------------------------------
  // Plugins
  // ------------------------------------------------------------------
  await fastify.register(errorHandlerPlugin);
  await fastify.register(authPlugin);
  await fastify.register(auditPlugin);
  await fastify.register(websocketPlugin);
  await fastify.register(solrPlugin);

  // ------------------------------------------------------------------
  // Routes
  // ------------------------------------------------------------------
  await registerRoutes(fastify);

  return fastify;
}
