// =============================================================================
// Medgnosis API — Coding & HCC analytics routes (read-only reporting)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { hccCaptureByProvider, emDistribution, missedOpportunities } from '../../services/hccAnalytics.js';

export default async function codingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /coding/hcc-capture — capture % per provider + overall
  fastify.get('/hcc-capture', async (_request, reply) => {
    const data = await hccCaptureByProvider();
    return reply.send({ success: true, data });
  });

  // GET /coding/em-distribution — E&M visit-level distribution per provider + overall
  fastify.get('/em-distribution', async (_request, reply) => {
    const data = await emDistribution();
    return reply.send({ success: true, data });
  });

  // GET /coding/missed-opportunities — lab-evident-uncoded + uncoded HCC residue
  fastify.get('/missed-opportunities', async (_request, reply) => {
    const data = await missedOpportunities();
    return reply.send({ success: true, data });
  });
}
