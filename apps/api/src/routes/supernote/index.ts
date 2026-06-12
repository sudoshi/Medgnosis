// =============================================================================
// Medgnosis API — SuperNote routes (assemble + finalize)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { superNoteFinalizeSchema } from '@medgnosis/shared';
import { assembleSuperNote, finalizeSuperNote, type ApEntry } from '../../services/superNote.js';

export default async function superNoteRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /supernote/:patientId — the pre-assembled note
  fastify.get<{ Params: { patientId: string } }>('/:patientId', async (request, reply) => {
    const note = await assembleSuperNote(parseInt(request.params.patientId, 10));
    if (!note) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
    }
    return reply.send({ success: true, data: note });
  });

  // POST /supernote/:patientId/finalize — write the note + code the A&P diagnoses
  fastify.post<{ Params: { patientId: string } }>('/:patientId/finalize', async (request, reply) => {
    const parsed = superNoteFinalizeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid SuperNote payload', details: parsed.error.flatten().fieldErrors },
      });
    }
    const patientId = parseInt(request.params.patientId, 10);
    const authorUserId = request.user.sub;

    const result = await finalizeSuperNote(
      patientId,
      authorUserId,
      parsed.data.chief_complaint ?? null,
      parsed.data.ap as ApEntry[],
    );

    await request.auditLog('finalize', 'supernote', result.note_id, { coded: result.coded });
    return reply.send({ success: true, data: result });
  });
}
