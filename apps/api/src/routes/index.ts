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
import bundleRoutes from './bundles/index.js';
import clinicalNoteRoutes from './clinical-notes/index.js';
import orderRoutes from './orders/index.js';
import cdsHooksRoutes from './cds-hooks/index.js';
import cdsFeedbackRoutes from './cds-hooks/feedback.js';
import cdsBurdenRoutes from './cds/burden.js';
import rulesRoutes from './rules/index.js';
import valueSetRoutes from './value-sets/index.js';
import problemListRoutes from './problem-list/index.js';
import populationFinderRoutes from './population-finder/index.js';
import closeTheLoopRoutes from './close-the-loop/index.js';
import riskModelRoutes from './risk-models/index.js';
import autoOrdersRoutes from './auto-orders/index.js';
import ampRoutes from './amp/index.js';
import mtmRoutes from './mtm/index.js';
import surveillanceRoutes from './surveillance/index.js';
import glucometricsRoutes from './glucometrics/index.js';
import superNoteRoutes from './supernote/index.js';
import dataQualityRoutes from './data-quality/index.js';
import cohortRoutes from './cohorts/index.js';
import codingRoutes from './coding/index.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check — no prefix, no auth
  await fastify.register(healthRoutes);

  // CDS Hooks — mounted at root (no API prefix, no auth per HL7 spec)
  await fastify.register(cdsHooksRoutes, { prefix: '/cds-services' });
  // CDS Hooks 2.0.1 feedback loop — same prefix, separate plugin
  await fastify.register(cdsFeedbackRoutes, { prefix: '/cds-services' });

  // Versioned API routes
  await fastify.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(patientRoutes, { prefix: '/patients' });
      await api.register(dashboardRoutes, { prefix: '/dashboard' });
      await api.register(measureRoutes, { prefix: '/measures' });
      await api.register(careGapRoutes, { prefix: '/care-gaps' });
      await api.register(alertRoutes, { prefix: '/alerts' });
      await api.register(cdsBurdenRoutes, { prefix: '/cds' });
      await api.register(insightsRoutes, { prefix: '/insights' });
      await api.register(searchRoutes, { prefix: '/search' });
      await api.register(fhirRoutes, { prefix: '/fhir' });
      await api.register(adminRoutes, { prefix: '/admin' });
      await api.register(bundleRoutes, { prefix: '/bundles' });
      await api.register(clinicalNoteRoutes, { prefix: '/clinical-notes' });
      await api.register(orderRoutes, { prefix: '/orders' });
      await api.register(rulesRoutes, { prefix: '/rules' });
      await api.register(valueSetRoutes, { prefix: '/value-sets' });
      await api.register(problemListRoutes, { prefix: '/problem-list' });
      await api.register(populationFinderRoutes, { prefix: '/population-finder' });
      await api.register(closeTheLoopRoutes, { prefix: '/close-the-loop' });
      await api.register(riskModelRoutes, { prefix: '/risk-models' });
      await api.register(autoOrdersRoutes, { prefix: '/auto-orders' });
      await api.register(ampRoutes, { prefix: '/amp' });
      await api.register(mtmRoutes, { prefix: '/mtm' });
      await api.register(surveillanceRoutes, { prefix: '/surveillance' });
      await api.register(glucometricsRoutes, { prefix: '/glucometrics' });
      await api.register(superNoteRoutes, { prefix: '/supernote' });
      await api.register(dataQualityRoutes, { prefix: '/data-quality' });
      await api.register(cohortRoutes, { prefix: '/cohorts' });
      await api.register(codingRoutes, { prefix: '/coding' });
    },
    { prefix: API_PREFIX },
  );
}
