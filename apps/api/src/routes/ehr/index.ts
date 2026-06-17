import type { FastifyInstance } from 'fastify';
import ehrAdminRoutes from './admin.js';
import ehrSmartLaunchRoutes from './launch.js';

export default async function ehrRoutes(app: FastifyInstance): Promise<void> {
  await app.register(ehrAdminRoutes, { prefix: '/admin' });
  await app.register(ehrSmartLaunchRoutes, { prefix: '/launch' });
}
