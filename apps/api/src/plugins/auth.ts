// =============================================================================
// Medgnosis API — Auth plugin (JWT verification + RBAC)
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config.js';
import type { UserRole } from '@medgnosis/shared';

function extractToken(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (auth && /^Bearer\s/i.test(auth)) {
    const parts = auth.split(' ');
    return parts.length === 2 ? parts[1] : undefined;
  }
  // Query-param fallback for WebSocket upgrade requests
  const q = request.query as Record<string, string | undefined>;
  return q['token'];
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  org_id: string;
  mfa_pending?: boolean;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      roles: UserRole[],
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: config.jwtAccessExpiry,
    },
    verify: { extractToken },
  });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify<JwtPayload>();
      } catch {
        await reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
        });
      }
    },
  );

  fastify.decorate(
    'requireRole',
    (roles: UserRole[]) =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        await fastify.authenticate(request, reply);
        if (!roles.includes(request.user.role)) {
          await reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `Role '${request.user.role}' is not permitted to access this resource`,
            },
          });
        }
      },
  );
}

export default fp(authPlugin, { name: 'auth' });
