// =============================================================================
// Medgnosis API — CDS alert-burden API (Phase 3 Epic 3.3)
// GET /api/cds/burden[?serviceId=...] — per-service (or global) accepted /
// overridden counts + override-rate + reason histogram, from the CDS Hooks
// 2.0.1 feedback loop (phm_edw.cds_alert_feedback). The data behind the open
// alert-burden dashboard: Bates' "monitor and respond," operationalized.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { serviceBurden } from '../../services/cds/feedback.js';

export default async function cdsBurdenRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get<{ Querystring: { serviceId?: string } }>('/burden', async (request, reply) => {
    const data = await serviceBurden(request.query.serviceId);
    return reply.send({ success: true, data });
  });
}
