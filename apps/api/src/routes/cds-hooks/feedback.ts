// =============================================================================
// Medgnosis API — CDS Hooks 2.0.1 feedback endpoint
// POST /cds-services/:id/feedback — the closed feedback loop. Kept in a separate
// plugin (registered under the same /cds-services prefix) so it does not collide
// with concurrent edits to cds-hooks/index.ts; the card-overrideReasons + 2.0.1
// relabel hardening lands in that file once it is free. Authenticated with the
// same shared secret as the service POSTs — never unauthenticated in prod.
// =============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../../config.js';
import { recordFeedback } from '../../services/cds/feedback.js';

function safeSecretEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Mirrors the service POST auth: dev w/o a configured secret is open; otherwise
// a matching bearer / X-Medgnosis-CDS-Secret is required.
function authorized(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.isProd && !config.cdsHooksSecret) return true;
  if (!config.cdsHooksSecret) {
    reply.status(503).send({ _error: 'CDS Hooks secret is not configured' });
    return false;
  }
  const authorization = request.headers.authorization;
  const bearer =
    typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
  const secretHeader = request.headers['x-medgnosis-cds-secret'];
  const supplied = bearer || (Array.isArray(secretHeader) ? secretHeader[0] : secretHeader) || '';
  if (!safeSecretEqual(supplied, config.cdsHooksSecret)) {
    reply.status(401).send({ _error: 'Unauthorized' });
    return false;
  }
  return true;
}

export default async function cdsFeedbackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { id: string } }>('/:id/feedback', async (request, reply) => {
    if (!authorized(request, reply)) return reply;
    try {
      const recorded = await recordFeedback(request.params.id, request.body);
      return reply.send({ recorded });
    } catch (e) {
      return reply.status(400).send({ _error: e instanceof Error ? e.message : 'invalid feedback' });
    }
  });
}
