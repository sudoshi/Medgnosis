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
      await request.auditLog(
        'cds_feedback_record',
        'cds_service',
        request.params.id,
        summarizeFeedbackForAudit(request.body, recorded),
      );
      return reply.send({ recorded });
    } catch (e) {
      return reply.status(400).send({ _error: e instanceof Error ? e.message : 'invalid feedback' });
    }
  });
}

function summarizeFeedbackForAudit(payload: unknown, recorded: number): Record<string, unknown> {
  const feedback = (payload as { feedback?: unknown })?.feedback;
  const items = Array.isArray(feedback) ? feedback : [];

  let accepted = 0;
  let overridden = 0;
  let overrideReasonCount = 0;
  let acceptedSuggestionCount = 0;

  for (const raw of items) {
    const item = raw as {
      outcome?: unknown;
      acceptedSuggestions?: unknown;
      overrideReason?: unknown;
    };
    if (item.outcome === 'accepted') accepted += 1;
    if (item.outcome === 'overridden') overridden += 1;
    if (item.overrideReason && typeof item.overrideReason === 'object') {
      overrideReasonCount += 1;
    }
    if (Array.isArray(item.acceptedSuggestions)) {
      acceptedSuggestionCount += item.acceptedSuggestions.length;
    }
  }

  return {
    recorded,
    feedback_count: items.length,
    accepted_count: accepted,
    overridden_count: overridden,
    override_reason_count: overrideReasonCount,
    accepted_suggestion_count: acceptedSuggestionCount,
  };
}
