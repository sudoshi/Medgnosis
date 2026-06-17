import type { FastifyInstance } from 'fastify';
import {
  BackendJwksError,
  loadBackendPublicJwksFromEnvironment,
} from '../../services/ehr/backendJwks.js';

export default async function ehrJwksRoutes(app: FastifyInstance): Promise<void> {
  app.get('/jwks.json', async (_request, reply) => {
    try {
      const jwks = loadBackendPublicJwksFromEnvironment();
      if (!jwks) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'EHR_BACKEND_JWKS_NOT_CONFIGURED',
            message: 'SMART Backend Services public JWKS is not configured',
          },
        });
      }

      return reply
        .header('cache-control', 'public, max-age=300, must-revalidate')
        .send(jwks);
    } catch (error) {
      if (error instanceof BackendJwksError) {
        return reply.code(error.statusCode).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }
      throw error;
    }
  });
}
