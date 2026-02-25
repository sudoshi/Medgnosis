// =============================================================================
// Medgnosis API — Error handler plugin
// Normalizes all errors into a consistent { success, error } envelope.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

async function errorHandlerPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Log server errors at error level; client errors at warn
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Server error');
    } else {
      request.log.warn({ err: error }, 'Client error');
    }

    return reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message:
          statusCode >= 500 ? 'An internal server error occurred' : error.message,
      },
    });
  });

  // 404 handler
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    });
  });
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
