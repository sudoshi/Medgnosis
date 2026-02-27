// =============================================================================
// Medgnosis API — CDS Hooks Service (Tier 6: FHIR Clinical Decision Support)
// Implements HL7 CDS Hooks 2.0 specification:
//   - GET  /cds-services              → Discovery endpoint
//   - POST /cds-services/medgnosis-care-gaps → order-sign hook handler
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { randomUUID } from 'node:crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CdsHookRequest {
  hook: string;
  hookInstance: string;
  context: {
    patientId?: string;
    userId?: string;
    draftOrders?: {
      resourceType: 'Bundle';
      entry?: { resource?: { resourceType?: string; code?: { coding?: { code?: string }[] } } }[];
    };
  };
  prefetch?: Record<string, unknown>;
}

interface CdsCard {
  uuid: string;
  summary: string;
  detail?: string;
  indicator: 'info' | 'warning' | 'critical';
  source: { label: string; url?: string };
  suggestions?: {
    label: string;
    uuid: string;
    actions: {
      type: 'create' | 'update' | 'delete';
      description: string;
      resource: Record<string, unknown>;
    }[];
  }[];
}

// ─── Route registration ──────────────────────────────────────────────────────

export default async function cdsHooksRoutes(fastify: FastifyInstance): Promise<void> {

  // =========================================================================
  // GET /cds-services — Discovery endpoint (no auth per CDS Hooks spec)
  // =========================================================================
  fastify.get('/', async (_request, reply) => {
    return reply.send({
      services: [
        {
          hook: 'order-sign',
          title: 'Medgnosis Care Gap Recommendations',
          description:
            'Identifies open care gaps from disease bundles and suggests clinical orders with LOINC/CPT codes to close them.',
          id: 'medgnosis-care-gaps',
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
            conditions: 'Condition?patient={{context.patientId}}&clinical-status=active',
          },
        },
      ],
    });
  });

  // =========================================================================
  // POST /cds-services/medgnosis-care-gaps — order-sign hook handler
  // =========================================================================
  fastify.post('/medgnosis-care-gaps', async (request, reply) => {
    const body = request.body as CdsHookRequest;

    if (body.hook !== 'order-sign') {
      return reply.status(400).send({
        cards: [],
        _error: 'Only order-sign hook is supported',
      });
    }

    const patientId = body.context?.patientId;
    if (!patientId) {
      return reply.send({ cards: [] });
    }

    // Collect LOINC codes from draft orders to avoid duplicating suggestions
    const draftLoincCodes = new Set<string>();
    for (const entry of body.context.draftOrders?.entry ?? []) {
      const codings = entry.resource?.code?.coding ?? [];
      for (const c of codings) {
        if (c.code) draftLoincCodes.add(c.code);
      }
    }

    // Look up patient's open care gaps with available orders
    const rows = await sql<{
      bundle_code: string;
      condition_name: string;
      measure_name: string;
      care_gap_id: number;
      gap_priority: string | null;
      item_name: string | null;
      item_type: string | null;
      loinc_code: string | null;
      loinc_description: string | null;
      cpt_code: string | null;
      cpt_description: string | null;
      frequency: string | null;
    }[]>`
      SELECT
        cb.bundle_code, cb.condition_name,
        md.measure_name,
        cg.care_gap_id, cg.gap_priority,
        osi.item_name, osi.item_type,
        osi.loinc_code, osi.loinc_description,
        osi.cpt_code, osi.cpt_description,
        osi.frequency
      FROM phm_edw.care_gap cg
      JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      JOIN phm_edw.bundle_measure bm ON bm.measure_id = md.measure_id AND bm.active_ind = 'Y'
      JOIN phm_edw.condition_bundle cb ON cb.bundle_id = bm.bundle_id AND cb.active_ind = 'Y'
      LEFT JOIN phm_edw.order_set os ON os.bundle_code = cb.bundle_code AND os.active_ind = 'Y'
      LEFT JOIN phm_edw.order_set_item osi ON osi.order_set_id = os.order_set_id
        AND osi.measure_id = md.measure_id AND osi.active_ind = 'Y'
      WHERE cg.patient_id = ${patientId}::int
        AND cg.active_ind = 'Y'
        AND cg.gap_status IN ('open', 'identified')
      ORDER BY
        CASE cg.gap_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        cb.bundle_code
      LIMIT 20
    `.catch((err) => {
      fastify.log.error({ err }, 'CDS Hooks: query failed');
      return [];
    });

    // Build CDS cards — one card per care gap with orderable action
    const cards: CdsCard[] = [];

    for (const row of rows) {
      // Skip if the order's LOINC is already in draft orders
      if (row.loinc_code && draftLoincCodes.has(row.loinc_code)) continue;
      // Skip gaps without an orderable action
      if (!row.item_name) continue;

      const indicator = row.gap_priority === 'high' ? 'warning' : 'info';

      const coding: { system: string; code: string; display: string }[] = [];
      if (row.loinc_code) {
        coding.push({
          system: 'http://loinc.org',
          code: row.loinc_code,
          display: row.loinc_description ?? row.item_name,
        });
      }
      if (row.cpt_code) {
        coding.push({
          system: 'http://www.ama-assn.org/go/cpt',
          code: row.cpt_code,
          display: row.cpt_description ?? row.item_name,
        });
      }

      const codeStr = row.loinc_code ? ` (LOINC ${row.loinc_code})` : row.cpt_code ? ` (CPT ${row.cpt_code})` : '';

      cards.push({
        uuid: randomUUID(),
        summary: `Open care gap: ${row.measure_name} — ${row.condition_name} Bundle`,
        detail: `Recommended: ${row.item_name}${codeStr}. Frequency: ${row.frequency ?? 'as indicated'}.`,
        indicator,
        source: { label: 'Medgnosis PHM', url: 'https://medgnosis.app' },
        suggestions: [
          {
            label: `Order ${row.item_name}`,
            uuid: randomUUID(),
            actions: [
              {
                type: 'create',
                description: `Order ${row.item_name}${codeStr}`,
                resource: {
                  resourceType: 'ServiceRequest',
                  status: 'draft',
                  intent: 'order',
                  code: coding.length > 0 ? { coding } : { text: row.item_name },
                  subject: { reference: `Patient/${patientId}` },
                },
              },
            ],
          },
        ],
      });
    }

    return reply.send({ cards });
  });
}
