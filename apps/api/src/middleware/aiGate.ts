// =============================================================================
// Medgnosis API — AI Gate middleware
// Requires explicit consent before AI features are used
// =============================================================================

import type { FastifyRequest, FastifyReply } from 'fastify';
import { sql } from '@medgnosis/db';

export async function aiGateMiddleware(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = (req.user as unknown as { id: number }).id;

  // Check if user has given AI consent
  const [consent] = await sql`
    SELECT ai_consent_given_at
    FROM app_users
    WHERE id = ${userId}
  `;

  if (!consent?.ai_consent_given_at) {
    return reply.status(403).send({
      success: false,
      error: {
        code: 'AI_CONSENT_REQUIRED',
        message:
          'AI features require explicit consent. Please enable AI features in your settings.',
      },
    });
  }
}
