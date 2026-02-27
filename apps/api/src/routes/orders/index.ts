// =============================================================================
// Medgnosis API — Order routes (Tier 6: CDS Hooks Order Placement)
// Worklist, recommendations, and order placement via FHIR ServiceRequest
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { placeOrderSchema, placeOrderBatchSchema } from '@medgnosis/shared';

// ─── FHIR ServiceRequest builder ─────────────────────────────────────────────

function buildFhirServiceRequest(order: {
  order_id: number;
  patient_id: number;
  patient_name: string;
  order_name: string;
  item_type: string;
  loinc_code: string | null;
  loinc_description: string | null;
  cpt_code: string | null;
  cpt_description: string | null;
  priority: string;
  instructions: string | null;
}) {
  const coding: { system: string; code: string; display: string }[] = [];

  if (order.loinc_code) {
    coding.push({
      system: 'http://loinc.org',
      code: order.loinc_code,
      display: order.loinc_description || order.order_name,
    });
  }
  if (order.cpt_code) {
    coding.push({
      system: 'http://www.ama-assn.org/go/cpt',
      code: order.cpt_code,
      display: order.cpt_description || order.order_name,
    });
  }

  // Map item_type to SNOMED category
  const categoryMap: Record<string, { code: string; display: string }> = {
    lab: { code: '108252007', display: 'Laboratory procedure' },
    imaging: { code: '363679005', display: 'Imaging' },
    procedure: { code: '387713003', display: 'Surgical procedure' },
    referral: { code: '3457005', display: 'Patient referral' },
    medication: { code: '182832007', display: 'Procedure related to management of drug administration' },
  };
  const cat = categoryMap[order.item_type] ?? categoryMap.procedure;

  return {
    resourceType: 'ServiceRequest',
    id: `order-${order.order_id}`,
    identifier: [{ system: 'urn:medgnosis:orders', value: String(order.order_id) }],
    status: 'draft',
    intent: 'order',
    priority: order.priority === 'stat' ? 'stat' : order.priority === 'urgent' ? 'urgent' : 'routine',
    category: [{ coding: [{ system: 'http://snomed.info/sct', ...cat }] }],
    code: coding.length > 0 ? { coding } : { text: order.order_name },
    subject: { reference: `Patient/${order.patient_id}`, display: order.patient_name },
    authoredOn: new Date().toISOString(),
    note: order.instructions ? [{ text: order.instructions }] : undefined,
  };
}

// ─── Route registration ──────────────────────────────────────────────────────

export default async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // =========================================================================
  // GET /orders/worklist — Population-level order worklist for Care Lists page
  // =========================================================================
  fastify.get('/worklist', async (request, reply) => {
    const query = request.query as {
      search?: string;
      bundle?: string;
      page?: string;
      per_page?: string;
    };

    const page = parseInt(query.page ?? '1', 10);
    const perPage = parseInt(query.per_page ?? '20', 10);
    const offset = (page - 1) * perPage;

    // Step 1: Get distinct patients with open care gaps (paginated)
    const [patients, [countResult]] = await Promise.all([
      sql<{ patient_id: number; first_name: string; last_name: string; mrn: string }[]>`
        SELECT DISTINCT ON (p.patient_id)
          p.patient_id, p.first_name, p.last_name, p.mrn
        FROM phm_edw.care_gap cg
        JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
        WHERE cg.active_ind = 'Y' AND cg.gap_status IN ('open', 'identified')
          ${query.search
            ? sql`AND (p.first_name || ' ' || p.last_name) ILIKE ${'%' + query.search + '%'}`
            : sql``}
        ORDER BY p.patient_id
        LIMIT ${perPage} OFFSET ${offset}
      `,
      sql<{ total: number }[]>`
        SELECT COUNT(DISTINCT cg.patient_id)::int AS total
        FROM phm_edw.care_gap cg
        JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
        WHERE cg.active_ind = 'Y' AND cg.gap_status IN ('open', 'identified')
          ${query.search
            ? sql`AND (p.first_name || ' ' || p.last_name) ILIKE ${'%' + query.search + '%'}`
            : sql``}
      `,
    ]);

    if (patients.length === 0) {
      return reply.send({
        success: true,
        data: [],
        meta: { page, per_page: perPage, total: 0, total_pages: 0 },
      });
    }

    const patientIds = patients.map((p) => p.patient_id);

    // Step 2: Get all open care gaps for these patients with bundle + order info
    const rows = await sql<{
      patient_id: number;
      bundle_code: string;
      condition_name: string;
      measure_code: string;
      measure_name: string;
      care_gap_id: number;
      gap_status: string;
      gap_priority: string | null;
      due_date: string | null;
      item_id: number | null;
      item_name: string | null;
      item_type: string | null;
      loinc_code: string | null;
      loinc_description: string | null;
      cpt_code: string | null;
      cpt_description: string | null;
      frequency: string | null;
      guideline_source: string | null;
      ordinal: number;
    }[]>`
      SELECT
        cg.patient_id,
        cb.bundle_code, cb.condition_name,
        md.measure_code, md.measure_name,
        cg.care_gap_id, cg.gap_status, cg.gap_priority, cg.due_date::text,
        osi.item_id, osi.item_name, osi.item_type,
        osi.loinc_code, osi.loinc_description,
        osi.cpt_code, osi.cpt_description,
        osi.frequency, osi.guideline_source,
        bm.ordinal
      FROM phm_edw.care_gap cg
      JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      JOIN phm_edw.bundle_measure bm ON bm.measure_id = md.measure_id AND bm.active_ind = 'Y'
      JOIN phm_edw.condition_bundle cb ON cb.bundle_id = bm.bundle_id AND cb.active_ind = 'Y'
      LEFT JOIN phm_edw.order_set os ON os.bundle_code = cb.bundle_code AND os.active_ind = 'Y'
      LEFT JOIN phm_edw.order_set_item osi ON osi.order_set_id = os.order_set_id
        AND osi.measure_id = md.measure_id AND osi.active_ind = 'Y'
      WHERE cg.patient_id = ANY(${patientIds})
        AND cg.active_ind = 'Y'
        AND cg.gap_status IN ('open', 'identified', 'in_progress')
        ${query.bundle ? sql`AND cb.bundle_code = ${query.bundle}` : sql``}
      ORDER BY cg.patient_id, cb.bundle_code, bm.ordinal
    `;

    // Step 3: Group by patient → bundle → measure
    const patientMap = new Map(patients.map((p) => [
      p.patient_id,
      {
        patient_id: p.patient_id,
        patient_name: `${p.first_name} ${p.last_name}`,
        mrn: p.mrn,
        bundles: new Map<string, {
          bundle_code: string;
          condition_name: string;
          measures: Map<string, {
            measure_code: string;
            measure_name: string;
            care_gap_id: number;
            gap_status: string;
            gap_priority: string | null;
            due_date: string | null;
            orders: { item_id: number; item_name: string; item_type: string; loinc_code: string | null; loinc_description: string | null; cpt_code: string | null; cpt_description: string | null; frequency: string | null; guideline_source: string | null }[];
          }>;
        }>(),
      },
    ]));

    for (const row of rows) {
      const patient = patientMap.get(row.patient_id);
      if (!patient) continue;

      if (!patient.bundles.has(row.bundle_code)) {
        patient.bundles.set(row.bundle_code, {
          bundle_code: row.bundle_code,
          condition_name: row.condition_name,
          measures: new Map(),
        });
      }
      const bundle = patient.bundles.get(row.bundle_code)!;

      if (!bundle.measures.has(row.measure_code)) {
        bundle.measures.set(row.measure_code, {
          measure_code: row.measure_code,
          measure_name: row.measure_name,
          care_gap_id: row.care_gap_id,
          gap_status: row.gap_status,
          gap_priority: row.gap_priority,
          due_date: row.due_date,
          orders: [],
        });
      }
      const measure = bundle.measures.get(row.measure_code)!;

      if (row.item_id) {
        // Avoid duplicate order items
        if (!measure.orders.some((o) => o.item_id === row.item_id)) {
          measure.orders.push({
            item_id: row.item_id,
            item_name: row.item_name!,
            item_type: row.item_type!,
            loinc_code: row.loinc_code,
            loinc_description: row.loinc_description,
            cpt_code: row.cpt_code,
            cpt_description: row.cpt_description,
            frequency: row.frequency,
            guideline_source: row.guideline_source,
          });
        }
      }
    }

    // Serialize maps to arrays
    const data = patients.map((p) => {
      const pm = patientMap.get(p.patient_id)!;
      const bundleArr = [...pm.bundles.values()].map((b) => ({
        ...b,
        measures: [...b.measures.values()],
      }));
      const totalGaps = bundleArr.reduce((sum, b) => sum + b.measures.length, 0);
      const actionableOrders = bundleArr.reduce(
        (sum, b) => sum + b.measures.filter((m) => m.orders.length > 0).length, 0,
      );
      return {
        patient_id: pm.patient_id,
        patient_name: pm.patient_name,
        mrn: pm.mrn,
        total_open_gaps: totalGaps,
        actionable_orders: actionableOrders,
        bundles: bundleArr,
      };
    });

    const total = countResult?.total ?? 0;
    return reply.send({
      success: true,
      data,
      meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // =========================================================================
  // GET /orders/recommendations/:patientId — Patient-level order recommendations
  // =========================================================================
  fastify.get<{ Params: { patientId: string } }>(
    '/recommendations/:patientId',
    async (request, reply) => {
      const patientId = parseInt(request.params.patientId, 10);

      // Verify patient
      const [patient] = await sql<{ patient_id: number; first_name: string; last_name: string }[]>`
        SELECT patient_id, first_name, last_name
        FROM phm_edw.patient
        WHERE patient_id = ${patientId} AND active_ind = 'Y'
      `;
      if (!patient) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Patient not found' },
        });
      }

      // Get open care gaps with bundle + order catalog info
      const rows = await sql<{
        bundle_code: string;
        condition_name: string;
        measure_code: string;
        measure_name: string;
        care_gap_id: number;
        gap_status: string;
        gap_priority: string | null;
        due_date: string | null;
        item_id: number | null;
        item_name: string | null;
        item_type: string | null;
        loinc_code: string | null;
        loinc_description: string | null;
        cpt_code: string | null;
        cpt_description: string | null;
        frequency: string | null;
        guideline_source: string | null;
        ordinal: number;
      }[]>`
        SELECT
          cb.bundle_code, cb.condition_name,
          md.measure_code, md.measure_name,
          cg.care_gap_id, cg.gap_status, cg.gap_priority, cg.due_date::text,
          osi.item_id, osi.item_name, osi.item_type,
          osi.loinc_code, osi.loinc_description,
          osi.cpt_code, osi.cpt_description,
          osi.frequency, osi.guideline_source,
          bm.ordinal
        FROM phm_edw.care_gap cg
        JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
        JOIN phm_edw.bundle_measure bm ON bm.measure_id = md.measure_id AND bm.active_ind = 'Y'
        JOIN phm_edw.condition_bundle cb ON cb.bundle_id = bm.bundle_id AND cb.active_ind = 'Y'
        LEFT JOIN phm_edw.order_set os ON os.bundle_code = cb.bundle_code AND os.active_ind = 'Y'
        LEFT JOIN phm_edw.order_set_item osi ON osi.order_set_id = os.order_set_id
          AND osi.measure_id = md.measure_id AND osi.active_ind = 'Y'
        WHERE cg.patient_id = ${patientId}
          AND cg.active_ind = 'Y'
          AND cg.gap_status IN ('open', 'identified', 'in_progress')
        ORDER BY cb.bundle_code, bm.ordinal
      `;

      // Group by bundle → measure
      const bundleMap = new Map<string, {
        bundle_code: string;
        condition_name: string;
        measures: Map<string, {
          measure_code: string;
          measure_name: string;
          care_gap_id: number;
          gap_status: string;
          gap_priority: string | null;
          due_date: string | null;
          orders: { item_id: number; item_name: string; item_type: string; loinc_code: string | null; loinc_description: string | null; cpt_code: string | null; cpt_description: string | null; frequency: string | null; guideline_source: string | null }[];
        }>;
      }>();

      for (const row of rows) {
        if (!bundleMap.has(row.bundle_code)) {
          bundleMap.set(row.bundle_code, {
            bundle_code: row.bundle_code,
            condition_name: row.condition_name,
            measures: new Map(),
          });
        }
        const bundle = bundleMap.get(row.bundle_code)!;

        if (!bundle.measures.has(row.measure_code)) {
          bundle.measures.set(row.measure_code, {
            measure_code: row.measure_code,
            measure_name: row.measure_name,
            care_gap_id: row.care_gap_id,
            gap_status: row.gap_status,
            gap_priority: row.gap_priority,
            due_date: row.due_date,
            orders: [],
          });
        }

        if (row.item_id) {
          const measure = bundle.measures.get(row.measure_code)!;
          if (!measure.orders.some((o) => o.item_id === row.item_id)) {
            measure.orders.push({
              item_id: row.item_id,
              item_name: row.item_name!,
              item_type: row.item_type!,
              loinc_code: row.loinc_code,
              loinc_description: row.loinc_description,
              cpt_code: row.cpt_code,
              cpt_description: row.cpt_description,
              frequency: row.frequency,
              guideline_source: row.guideline_source,
            });
          }
        }
      }

      const bundles = [...bundleMap.values()].map((b) => ({
        ...b,
        measures: [...b.measures.values()],
      }));

      return reply.send({
        success: true,
        data: {
          patient_id: patient.patient_id,
          patient_name: `${patient.first_name} ${patient.last_name}`,
          bundles,
        },
      });
    },
  );

  // =========================================================================
  // POST /orders/place — Place a clinical order + generate FHIR ServiceRequest
  // =========================================================================
  fastify.post('/place', async (request, reply) => {
    const parseResult = placeOrderSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parseResult.error.flatten() },
      });
    }

    const { patient_id, care_gap_id, order_set_item_id, priority, instructions } = parseResult.data;

    // Validate all references exist
    const [[patient], [gap], [item]] = await Promise.all([
      sql<{ patient_id: number; first_name: string; last_name: string }[]>`
        SELECT patient_id, first_name, last_name FROM phm_edw.patient
        WHERE patient_id = ${patient_id} AND active_ind = 'Y'
      `,
      sql<{ care_gap_id: number; gap_status: string }[]>`
        SELECT care_gap_id, gap_status FROM phm_edw.care_gap
        WHERE care_gap_id = ${care_gap_id} AND active_ind = 'Y'
      `,
      sql<{
        item_id: number; order_set_id: number; item_name: string; item_type: string;
        loinc_code: string | null; loinc_description: string | null;
        cpt_code: string | null; cpt_description: string | null;
        icd10_indication: string | null;
      }[]>`
        SELECT item_id, order_set_id, item_name, item_type,
               loinc_code, loinc_description, cpt_code, cpt_description,
               icd10_indication
        FROM phm_edw.order_set_item
        WHERE item_id = ${order_set_item_id} AND active_ind = 'Y'
      `,
    ]);

    if (!patient) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
    }
    if (!gap) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Care gap not found' } });
    }
    if (!item) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Order set item not found' } });
    }

    // Create clinical order
    const [order] = await sql<{ order_id: number; order_datetime: string }[]>`
      INSERT INTO phm_edw.clinical_order (
        patient_id, order_set_id, order_type, order_name,
        loinc_code, cpt_code, icd10_indication,
        priority, order_status, order_source, instructions
      ) VALUES (
        ${patient_id}, ${item.order_set_id}, ${item.item_type}, ${item.item_name},
        ${item.loinc_code}, ${item.cpt_code}, ${item.icd10_indication},
        ${priority ?? 'routine'}, 'Ordered', 'order_set', ${instructions ?? null}
      )
      RETURNING order_id, order_datetime::text
    `;

    // Update care gap status to in_progress (order placed, not yet resulted)
    await sql`
      UPDATE phm_edw.care_gap
      SET gap_status = 'in_progress', updated_date = NOW()
      WHERE care_gap_id = ${care_gap_id} AND active_ind = 'Y'
    `;

    // Build FHIR ServiceRequest
    const fhirServiceRequest = buildFhirServiceRequest({
      order_id: order.order_id,
      patient_id,
      patient_name: `${patient.first_name} ${patient.last_name}`,
      order_name: item.item_name,
      item_type: item.item_type,
      loinc_code: item.loinc_code,
      loinc_description: item.loinc_description,
      cpt_code: item.cpt_code,
      cpt_description: item.cpt_description,
      priority: priority ?? 'routine',
      instructions: instructions ?? null,
    });

    await request.auditLog('create', 'clinical_order', String(order.order_id), {
      patient_id, care_gap_id, order_set_item_id, priority,
    });

    return reply.status(201).send({
      success: true,
      data: {
        order: {
          order_id: order.order_id,
          patient_id,
          order_name: item.item_name,
          order_type: item.item_type,
          loinc_code: item.loinc_code,
          cpt_code: item.cpt_code,
          priority: priority ?? 'routine',
          order_status: 'Ordered',
          order_datetime: order.order_datetime,
        },
        fhir_service_request: fhirServiceRequest,
        care_gap_updated: { care_gap_id, new_status: 'in_progress' },
      },
    });
  });

  // =========================================================================
  // POST /orders/place-batch — Place multiple orders at once ("Order All")
  // =========================================================================
  fastify.post('/place-batch', async (request, reply) => {
    const parseResult = placeOrderBatchSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parseResult.error.flatten() },
      });
    }

    const { patient_id, priority, orders } = parseResult.data;

    // Validate patient
    const [patient] = await sql<{ patient_id: number; first_name: string; last_name: string }[]>`
      SELECT patient_id, first_name, last_name FROM phm_edw.patient
      WHERE patient_id = ${patient_id} AND active_ind = 'Y'
    `;
    if (!patient) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
    }

    const patientName = `${patient.first_name} ${patient.last_name}`;
    const careGapIds = orders.map((o) => o.care_gap_id);
    const itemIds = orders.map((o) => o.order_set_item_id);

    // Validate all care gaps exist
    const gaps = await sql<{ care_gap_id: number; gap_status: string }[]>`
      SELECT care_gap_id, gap_status FROM phm_edw.care_gap
      WHERE care_gap_id = ANY(${careGapIds}) AND active_ind = 'Y'
    `;
    const gapMap = new Map(gaps.map((g) => [g.care_gap_id, g]));
    const missingGaps = careGapIds.filter((id) => !gapMap.has(id));
    if (missingGaps.length > 0) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Care gap(s) not found: ${missingGaps.join(', ')}` },
      });
    }

    // Validate all order set items exist
    const items = await sql<{
      item_id: number; order_set_id: number; item_name: string; item_type: string;
      loinc_code: string | null; loinc_description: string | null;
      cpt_code: string | null; cpt_description: string | null;
      icd10_indication: string | null;
    }[]>`
      SELECT item_id, order_set_id, item_name, item_type,
             loinc_code, loinc_description, cpt_code, cpt_description,
             icd10_indication
      FROM phm_edw.order_set_item
      WHERE item_id = ANY(${itemIds}) AND active_ind = 'Y'
    `;
    const itemMap = new Map(items.map((i) => [i.item_id, i]));
    const missingItems = itemIds.filter((id) => !itemMap.has(id));
    if (missingItems.length > 0) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Order set item(s) not found: ${missingItems.join(', ')}` },
      });
    }

    // Place all orders in a single transaction
    const results: {
      order: { order_id: number; order_name: string; order_type: string; loinc_code: string | null; cpt_code: string | null; order_datetime: string };
      fhir_service_request: ReturnType<typeof buildFhirServiceRequest>;
      care_gap_id: number;
    }[] = [];

    await sql.begin(async (tx) => {
      for (const { care_gap_id, order_set_item_id } of orders) {
        const item = itemMap.get(order_set_item_id)!;

        // Insert clinical order
        const [order] = await tx.unsafe<{ order_id: number; order_datetime: string }[]>(
          `INSERT INTO phm_edw.clinical_order (
            patient_id, order_set_id, order_type, order_name,
            loinc_code, cpt_code, icd10_indication,
            priority, order_status, order_source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Ordered', 'order_set')
          RETURNING order_id, order_datetime::text`,
          [patient_id, item.order_set_id, item.item_type, item.item_name,
           item.loinc_code, item.cpt_code, item.icd10_indication,
           priority ?? 'routine'],
        );

        // Update care gap to in_progress
        await tx.unsafe(
          `UPDATE phm_edw.care_gap SET gap_status = 'in_progress', updated_date = NOW()
           WHERE care_gap_id = $1 AND active_ind = 'Y'`,
          [care_gap_id],
        );

        const fhir = buildFhirServiceRequest({
          order_id: order.order_id,
          patient_id,
          patient_name: patientName,
          order_name: item.item_name,
          item_type: item.item_type,
          loinc_code: item.loinc_code,
          loinc_description: item.loinc_description,
          cpt_code: item.cpt_code,
          cpt_description: item.cpt_description,
          priority: priority ?? 'routine',
          instructions: null,
        });

        results.push({
          order: {
            order_id: order.order_id,
            order_name: item.item_name,
            order_type: item.item_type,
            loinc_code: item.loinc_code,
            cpt_code: item.cpt_code,
            order_datetime: order.order_datetime,
          },
          fhir_service_request: fhir,
          care_gap_id,
        });
      }
    });

    await request.auditLog('create', 'clinical_order', `batch-${results.length}`, {
      patient_id, order_count: results.length, priority,
      order_ids: results.map((r) => r.order.order_id),
    });

    return reply.status(201).send({
      success: true,
      data: {
        patient_id,
        patient_name: patientName,
        order_count: results.length,
        priority: priority ?? 'routine',
        orders: results,
      },
    });
  });
}
