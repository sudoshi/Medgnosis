// =============================================================================
// Medgnosis API — Health check route
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    let dbOk = false;
    try {
      await sql`SELECT 1`;
      dbOk = true;
    } catch {
      // db unreachable
    }

    const status = dbOk ? 'healthy' : 'degraded';
    const statusCode = dbOk ? 200 : 503;

    return reply.status(statusCode).send({
      status,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'up' : 'down',
      },
    });
  });
}
