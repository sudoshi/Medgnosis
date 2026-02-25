// =============================================================================
// Medgnosis API — Route registry
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { API_PREFIX } from '@medgnosis/shared';
import healthRoutes from './health.js';
import authRoutes from './auth/index.js';
import patientRoutes from './patients/index.js';
import dashboardRoutes from './dashboard/index.js';
import measureRoutes from './measures/index.js';
import careGapRoutes from './care-gaps/index.js';
import alertRoutes from './alerts/index.js';
import insightsRoutes from './insights/index.js';
import searchRoutes from './search/index.js';
import fhirRoutes from './fhir/index.js';
import adminRoutes from './admin/index.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check — no prefix, no auth
  await fastify.register(healthRoutes);

  // Versioned API routes
  await fastify.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(patientRoutes, { prefix: '/patients' });
      await api.register(dashboardRoutes, { prefix: '/dashboard' });
      await api.register(measureRoutes, { prefix: '/measures' });
      await api.register(careGapRoutes, { prefix: '/care-gaps' });
      await api.register(alertRoutes, { prefix: '/alerts' });
      await api.register(insightsRoutes, { prefix: '/insights' });
      await api.register(searchRoutes, { prefix: '/search' });
      await api.register(fhirRoutes, { prefix: '/fhir' });
      await api.register(adminRoutes, { prefix: '/admin' });
    },
    { prefix: API_PREFIX },
  );
}
