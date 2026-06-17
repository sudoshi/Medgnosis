// =============================================================================
// Medgnosis API — CDS Hooks Service (Tier 6: FHIR Clinical Decision Support)
// Implements HL7 CDS Hooks 2.0.1:
//   - GET  /cds-services              → Discovery endpoint
//   - POST /cds-services/:id          → service hook handlers
// =============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from '@medgnosis/db';
import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { authorizeCdsHookRequest } from '../../services/cds/fhirAuthorization.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CdsHookRequest {
  hook: string;
  hookInstance: string;
  fhirAuthorization?: {
    access_token?: string;
    token_type?: string;
    scope?: string;
  };
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

interface CdsCoding {
  system: string;
  code: string;
  display?: string;
}

interface CdsCard {
  uuid: string;
  summary: string;
  detail?: string;
  indicator: 'info' | 'warning' | 'critical';
  source: { label: string; url?: string; topic?: CdsCoding };
  overrideReasons?: CdsCoding[];
  suggestions?: {
    label: string;
    uuid: string;
    actions: {
      type: 'create' | 'update' | 'delete';
      description: string;
      resource: Record<string, unknown>;
    }[];
  }[];
  links?: { label: string; url: string; type: 'absolute' | 'smart' }[];
}

interface CareGapRow {
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
}

const MEDGNOSIS_SOURCE_URL = 'https://medgnosis.app';
const CDS_TOPIC_SYSTEM = 'https://medgnosis.app/cds-hooks/topics';
const CDS_OVERRIDE_REASON_SYSTEM = 'https://medgnosis.app/cds-hooks/override-reasons';

const CARE_GAP_TOPIC: CdsCoding = {
  system: CDS_TOPIC_SYSTEM,
  code: 'care-gap',
  display: 'Care gap',
};

const PROBLEM_LIST_TOPIC: CdsCoding = {
  system: CDS_TOPIC_SYSTEM,
  code: 'problem-list',
  display: 'Problem list',
};

const INTERRUPTIVE_OVERRIDE_REASONS: CdsCoding[] = [
  { system: CDS_OVERRIDE_REASON_SYSTEM, code: 'already-addressed', display: 'Already addressed' },
  { system: CDS_OVERRIDE_REASON_SYSTEM, code: 'not-clinically-indicated', display: 'Not clinically indicated' },
  { system: CDS_OVERRIDE_REASON_SYSTEM, code: 'patient-declined', display: 'Patient declined' },
];

function medgnosisSource(topic: CdsCoding): CdsCard['source'] {
  return { label: 'Medgnosis PHM', url: MEDGNOSIS_SOURCE_URL, topic };
}

function interruptiveOverrideReasons(indicator: CdsCard['indicator']): CdsCoding[] | undefined {
  return indicator === 'warning' || indicator === 'critical' ? INTERRUPTIVE_OVERRIDE_REASONS : undefined;
}

function draftLoincCodes(body: CdsHookRequest): Set<string> {
  const codes = new Set<string>();
  for (const entry of body.context.draftOrders?.entry ?? []) {
    const codings = entry.resource?.code?.coding ?? [];
    for (const c of codings) {
      if (c.code) codes.add(c.code);
    }
  }
  return codes;
}

async function loadCareGapRows(patientId: string, fastify: FastifyInstance): Promise<CareGapRow[]> {
  return sql<CareGapRow[]>`
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
    fastify.log.error({ err }, 'CDS Hooks: care-gap query failed');
    return [];
  });
}

function buildCareGapCards(rows: CareGapRow[], patientId: string, currentDraftLoincCodes: Set<string>): CdsCard[] {
  const cards: CdsCard[] = [];

  for (const row of rows) {
    // Skip if the order's LOINC is already in draft orders.
    if (row.loinc_code && currentDraftLoincCodes.has(row.loinc_code)) continue;
    // Skip gaps without an orderable action.
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
      source: medgnosisSource(CARE_GAP_TOPIC),
      overrideReasons: interruptiveOverrideReasons(indicator),
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

  return cards;
}

async function handleCareGapHook(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  expectedHook: 'order-sign' | 'order-select',
) {
  if (!(await authorizeCdsHookRequest(request, reply, { cardsResponse: true }))) return reply;

  const body = request.body as CdsHookRequest;

  if (body.hook !== expectedHook) {
    return reply.status(400).send({
      cards: [],
      _error: `Only ${expectedHook} hook is supported`,
    });
  }

  const patientId = body.context?.patientId;
  if (!patientId) {
    return reply.send({ cards: [] });
  }

  const rows = await loadCareGapRows(patientId, fastify);
  return reply.send({ cards: buildCareGapCards(rows, patientId, draftLoincCodes(body)) });
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
            'CDS Hooks 2.0.1 order-sign service that identifies open care gaps and suggests clinical orders with LOINC/CPT codes to close them.',
          id: 'medgnosis-care-gaps',
          usageRequirements:
            'Service POSTs require CDS Hooks client JWT authentication in production, unless shared-secret compatibility is explicitly approved.',
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
            conditions: 'Condition?patient={{context.patientId}}&clinical-status=active',
          },
        },
        {
          hook: 'order-select',
          title: 'Medgnosis Care Gap Recommendations',
          description:
            'CDS Hooks 2.0.1 order-select service that surfaces open care gaps while draft orders are being selected.',
          id: 'medgnosis-order-select',
          usageRequirements:
            'Service POSTs require CDS Hooks client JWT authentication in production, unless shared-secret compatibility is explicitly approved.',
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
            conditions: 'Condition?patient={{context.patientId}}&clinical-status=active',
          },
        },
        {
          hook: 'patient-view',
          title: 'Medgnosis Problem List Recommendations',
          description:
            'CDS Hooks 2.0.1 patient-view service that surfaces lab/vitals-evident conditions missing from or generic on the problem list.',
          id: 'medgnosis-problem-list',
          usageRequirements:
            'Service POSTs require CDS Hooks client JWT authentication in production, unless shared-secret compatibility is explicitly approved.',
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
          },
        },
      ],
    });
  });

  // =========================================================================
  // POST /cds-services/medgnosis-care-gaps — order-sign hook handler
  // =========================================================================
  fastify.post('/medgnosis-care-gaps', async (request, reply) => {
    return handleCareGapHook(fastify, request, reply, 'order-sign');
  });

  // =========================================================================
  // POST /cds-services/medgnosis-order-select — order-select hook handler
  // =========================================================================
  fastify.post('/medgnosis-order-select', async (request, reply) => {
    return handleCareGapHook(fastify, request, reply, 'order-select');
  });

  // =========================================================================
  // POST /cds-services/medgnosis-problem-list — patient-view hook handler
  // Respectful CDS: surface the evidence, propose the add, delegate the
  // judgment. Dismissal ("does not have X") is first-class — handled in-app
  // via the linked Population Finder.
  // =========================================================================
  fastify.post('/medgnosis-problem-list', async (request, reply) => {
    if (!(await authorizeCdsHookRequest(request, reply, { cardsResponse: true }))) return reply;

    const body = request.body as CdsHookRequest;
    if (body.hook !== 'patient-view') {
      return reply.status(400).send({ cards: [], _error: 'Only patient-view hook is supported' });
    }
    const patientId = body.context?.patientId;
    if (!patientId) {
      return reply.send({ cards: [] });
    }

    const rows = await sql<{
      candidate_id: number;
      finding_type: string;
      current_icd10: string | null;
      suggested_icd10: string;
      suggested_name: string;
      evidence: { egfr?: number; bmi?: number; observed_at?: string | null };
    }[]>`
      SELECT candidate_id, finding_type, current_icd10, suggested_icd10, suggested_name, evidence
      FROM phm_edw.population_finder_candidate
      WHERE patient_id = ${patientId}::int AND status = 'pending'
      ORDER BY pass, candidate_id
      LIMIT 20
    `.catch((err) => {
      fastify.log.error({ err }, 'CDS Hooks: problem-list query failed');
      return [];
    });

    const finderUrl = `${config.webAppUrl}/population-finder`;
    const cards: CdsCard[] = rows.map((row) => {
      const ev =
        row.evidence?.egfr != null
          ? `eGFR ${row.evidence.egfr}`
          : row.evidence?.bmi != null
            ? `BMI ${row.evidence.bmi}`
            : 'clinical data';
      const when = row.evidence?.observed_at
        ? ` (${new Date(row.evidence.observed_at).toISOString().slice(0, 10)})`
        : '';
      const context = row.current_icd10
        ? `currently coded generically as ${row.current_icd10}`
        : 'not currently on the problem list';

      return {
        uuid: randomUUID(),
        summary: `Evidence suggests ${row.suggested_name}`,
        detail: `${ev}${when} supports ${row.suggested_icd10} — ${context}. Add it, or mark "does not have" in the Population Finder.`,
        indicator: 'info',
        source: medgnosisSource(PROBLEM_LIST_TOPIC),
        suggestions: [
          {
            label: `Add ${row.suggested_icd10} to problem list`,
            uuid: randomUUID(),
            actions: [
              {
                type: 'create',
                description: `Add ${row.suggested_name} (${row.suggested_icd10})`,
                resource: {
                  resourceType: 'Condition',
                  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
                  code: {
                    coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: row.suggested_icd10, display: row.suggested_name }],
                  },
                  subject: { reference: `Patient/${patientId}` },
                },
              },
            ],
          },
        ],
        links: [{ label: 'Review in Population Finder', url: finderUrl, type: 'absolute' }],
      };
    });

    return reply.send({ cards });
  });
}
