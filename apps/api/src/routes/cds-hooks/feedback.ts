// =============================================================================
// Medgnosis API — CDS Hooks 2.0.1 feedback endpoint
// POST /cds-services/:id/feedback — the closed feedback loop. Kept in a separate
// plugin (registered under the same /cds-services prefix) so it does not collide
// with concurrent edits to cds-hooks/index.ts. Authenticated with the same CDS
// Hooks client JWT / configured compatibility fallback as service POSTs.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { authorizeCdsHookRequest } from '../../services/cds/fhirAuthorization.js';
import { recordFeedback } from '../../services/cds/feedback.js';

export default async function cdsFeedbackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { id: string } }>('/:id/feedback', async (request, reply) => {
    if (!(await authorizeCdsHookRequest(request, reply))) return reply;
    try {
      const recorded = await recordFeedback(request.params.id, request.body);
      return reply.send({ recorded });
    } catch (e) {
      return reply.status(400).send({ _error: e instanceof Error ? e.message : 'invalid feedback' });
    }
  });
}
