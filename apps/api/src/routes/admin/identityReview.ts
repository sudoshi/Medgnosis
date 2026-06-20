// =============================================================================
// Medgnosis API — Admin identity steward review routes (mounted under /admin).
// Inherits the parent admin plugin's authenticate + requireRole('admin') hooks.
// =============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  dismissReview,
  listOpenReviews,
  listRecentMerges,
  loadPersonSummaries,
  mergeReview,
  unmergeMerge,
} from '../../services/identity/identityReview.js';
import { getEmpiMetrics } from '../../services/identity/empiMetrics.js';

function stewardId(req: FastifyRequest): string {
  return req.user?.email ?? req.user?.sub ?? 'unknown';
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message } });
}

export default async function identityReviewRoutes(app: FastifyInstance) {
  app.get('/metrics', async () => {
    const metrics = await getEmpiMetrics();
    return { success: true, data: { metrics } };
  });

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

  app.get('/merges', async () => {
    const merges = await listRecentMerges();
    return { success: true, data: { merges } };
  });

  app.post('/merges/:id/unmerge', async (req, reply) => {
    const mergeLogId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(mergeLogId) || mergeLogId <= 0) return badRequest(reply, 'invalid merge id');
    try {
      const result = await unmergeMerge(mergeLogId, stewardId(req));
      await req.auditLog('identity_unmerge', 'person', String(result.restoredPersonId), { mergeLogId });
      return { success: true, data: result };
    } catch (err) {
      return badRequest(reply, err instanceof Error ? err.message : 'un-merge failed');
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
