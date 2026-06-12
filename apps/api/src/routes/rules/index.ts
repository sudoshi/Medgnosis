// =============================================================================
// Medgnosis API — Clinical Rules transparency routes
// "Transparency -> trust": show the criteria behind any computation. Read-only.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { explain, listEntities } from '../../services/rulesEngine.js';

const AS_OF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function rulesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /rules — catalog of every (entity, attribute) with rule counts
  fastify.get('/', async (_request, reply) => {
    const entities = await listEntities();
    return reply.send({ success: true, data: entities });
  });

  // GET /rules/:entity/:attribute?as_of=YYYY-MM-DD — the active criteria,
  // optionally time-travelled to a past date.
  fastify.get<{
    Params: { entity: string; attribute: string };
    Querystring: { as_of?: string };
  }>('/:entity/:attribute', async (request, reply) => {
    const { entity, attribute } = request.params;
    const asOf = request.query.as_of;

    if (asOf !== undefined && !AS_OF_PATTERN.test(asOf)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'as_of must be a date in YYYY-MM-DD format',
        },
      });
    }

    const explanation = await explain(entity, attribute, asOf);

    if (explanation.rules.length === 0) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `No active rules for ${entity}/${attribute}${asOf ? ` as of ${asOf}` : ''}`,
        },
      });
    }

    return reply.send({ success: true, data: explanation });
  });
}
