// =============================================================================
// Medgnosis API — Admin identity steward review routes (mounted under /admin).
// Inherits the parent admin plugin's authenticate + requireRole('admin') hooks.
// =============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  dismissReview,
  listOpenReviews,
  loadPersonSummaries,
  mergeReview,
} from '../../services/identity/identityReview.js';

function stewardId(req: FastifyRequest): string {
  return req.user?.email ?? req.user?.sub ?? 'unknown';
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message } });
}

export default async function identityReviewRoutes(app: FastifyInstance) {
  app.get('/reviews', async () => {
    const reviews = await listOpenReviews();
    return { success: true, data: { reviews } };
  });

  app.get('/persons/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(reply, 'invalid person id');
    const [person] = await loadPersonSummaries([id]);
    if (!person) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Person not found' } });
    return { success: true, data: { person } };
  });

  app.post('/reviews/:id/merge', async (req, reply) => {
    const reviewId = Number((req.params as { id: string }).id);
    const { survivorPersonId } = (req.body ?? {}) as { survivorPersonId?: number };
    if (!Number.isInteger(reviewId) || reviewId <= 0) return badRequest(reply, 'invalid review id');
    if (!Number.isInteger(survivorPersonId) || (survivorPersonId as number) <= 0) {
      return badRequest(reply, 'survivorPersonId is required');
    }
    try {
      const result = await mergeReview({ reviewId, survivorPersonId: survivorPersonId as number, performedBy: stewardId(req) });
      await req.auditLog('identity_review_merge', 'person', String(survivorPersonId), {
        reviewId,
        mergedPersonIds: result.mergedPersonIds,
        movedPatientLinks: result.movedPatientLinks,
      });
      return { success: true, data: result };
    } catch (err) {
      return badRequest(reply, err instanceof Error ? err.message : 'merge failed');
    }
  });

  app.post('/reviews/:id/dismiss', async (req, reply) => {
    const reviewId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) return badRequest(reply, 'invalid review id');
    try {
      await dismissReview(reviewId, stewardId(req));
      await req.auditLog('identity_review_dismiss', 'identity_review', String(reviewId), {});
      return { success: true };
    } catch (err) {
      return badRequest(reply, err instanceof Error ? err.message : 'dismiss failed');
    }
  });
}
