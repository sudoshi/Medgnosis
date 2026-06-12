// =============================================================================
// Medgnosis API — VSAC value set transparency routes
// Show the authoritative CMS code lists behind any measure. Read-only.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import {
  listValueSets,
  getValueSetCodes,
  getMeasureValueSets,
} from '../../services/vsacService.js';

export default async function valueSetRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /value-sets?search= — catalog with code counts
  fastify.get<{ Querystring: { search?: string } }>('/', async (request, reply) => {
    const valueSets = await listValueSets(request.query.search);
    return reply.send({ success: true, data: valueSets });
  });

  // GET /value-sets/measure/:measureCode — value sets bridged to a measure
  // (registered before /:oid so "measure" is not swallowed as an OID)
  fastify.get<{ Params: { measureCode: string } }>(
    '/measure/:measureCode',
    async (request, reply) => {
      const valueSets = await getMeasureValueSets(request.params.measureCode);
      if (valueSets.length === 0) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `No value sets bridged to measure ${request.params.measureCode}`,
          },
        });
      }
      return reply.send({ success: true, data: valueSets });
    },
  );

  // GET /value-sets/:oid/codes?code_system= — the flattened expansion
  fastify.get<{
    Params: { oid: string };
    Querystring: { code_system?: string };
  }>('/:oid/codes', async (request, reply) => {
    const codes = await getValueSetCodes(request.params.oid, request.query.code_system);
    if (codes.length === 0) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `No codes for value set ${request.params.oid}${
            request.query.code_system ? ` in ${request.query.code_system}` : ''
          }`,
        },
      });
    }
    return reply.send({ success: true, data: codes });
  });
}
