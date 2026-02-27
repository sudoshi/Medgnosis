// =============================================================================
// Medgnosis API — Patient routes
// Clinical workspace: patient detail, medications, allergies, observations,
// encounters, flowsheet, trending
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { patientSearchSchema, patientCreateSchema } from '@medgnosis/shared';

export default async function patientRoutes(fastify: FastifyInstance): Promise<void> {
  // All patient routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /patients — List patients with search and pagination
  fastify.get('/', async (request, reply) => {
    const params = patientSearchSchema.parse(request.query);
    const { search, page, per_page, sort_by, sort_order, risk_level: _risk_level } = params;
    const offset = (page - 1) * per_page;

    // Build dynamic query
    let whereClause = `WHERE p.active_ind = 'Y'`;
    const queryParams: unknown[] = [];

    if (search) {
      whereClause += ` AND (p.first_name || ' ' || p.last_name) ILIKE $${queryParams.length + 1}`;
      queryParams.push(`%${search}%`);
    }

    // Provider scoping: restrict to the logged-in provider's PCP panel.
    // Admin users (no provider_id) see all patients.
    const providerId = (request as typeof request & { user: { provider_id?: number } }).user.provider_id;
    const scoped = providerId !== undefined;

    // Run count and page fetch in parallel
    const [[ countResult ], patients] = await Promise.all([
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM phm_edw.patient p
        WHERE p.active_ind = 'Y'
          ${scoped ? sql`AND p.pcp_provider_id = ${providerId}` : sql``}
          ${search ? sql`AND (p.first_name || ' ' || p.last_name) ILIKE ${`%${search}%`}` : sql``}
      `,
      sql`
        SELECT
          p.patient_id AS id,
          p.first_name,
          p.last_name,
          p.mrn,
          p.date_of_birth,
          p.gender,
          p.active_ind
        FROM phm_edw.patient p
        WHERE p.active_ind = 'Y'
          ${scoped ? sql`AND p.pcp_provider_id = ${providerId}` : sql``}
          ${search ? sql`AND (p.first_name || ' ' || p.last_name) ILIKE ${`%${search}%`}` : sql``}
        ORDER BY
          ${sort_by === 'name' ? sql`p.last_name` : sql`p.patient_id`}
          ${sort_order === 'desc' ? sql`DESC` : sql`ASC`}
        LIMIT ${per_page}
        OFFSET ${offset}
      `,
    ]);

    const total = countResult?.total ?? 0;

    return reply.send({
      success: true,
      data: patients,
      meta: {
        page,
        per_page,
        total,
        total_pages: Math.ceil(total / per_page),
      },
    });
  });

  // GET /patients/:id — Enhanced patient detail with PCP, insurance, address, allergies
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    // Fire patient lookup and all sub-resources in parallel — PK lookup is fast,
    // and we avoid a serial round-trip before the parallel fan-out.
    const [patientResult, conditions, encounters, observations, careGaps, pcpInfo, insurance, address, allergySummary] = await Promise.all([
      sql`
        SELECT
          p.patient_id AS id,
          p.first_name,
          p.last_name,
          p.mrn,
          p.date_of_birth,
          p.gender,
          p.race,
          p.ethnicity,
          p.marital_status,
          p.primary_language,
          p.primary_phone,
          p.email,
          p.active_ind
        FROM phm_edw.patient p
        WHERE p.patient_id = ${id}::int AND p.active_ind = 'Y'
      `,
      sql`
        SELECT cd.condition_diagnosis_id AS id, c.condition_code AS code,
               c.condition_name AS name, cd.diagnosis_status AS status,
               cd.diagnosis_type AS type, cd.onset_date, cd.resolution_date,
               cd.primary_indicator, cd.active_ind
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
        WHERE cd.patient_id = ${id}::int AND cd.active_ind = 'Y'
        ORDER BY cd.onset_date DESC
      `,
      sql`
        SELECT e.encounter_id AS id, e.encounter_datetime AS date,
               e.encounter_type AS type, e.encounter_reason AS reason,
               e.status, e.disposition,
               prov.display_name AS provider_name,
               prov.specialty AS provider_specialty,
               org.organization_name AS facility
        FROM phm_edw.encounter e
        LEFT JOIN phm_edw.provider prov ON prov.provider_id = e.provider_id
        LEFT JOIN phm_edw.organization org ON org.org_id = e.org_id
        WHERE e.patient_id = ${id}::int AND e.active_ind = 'Y'
        ORDER BY e.encounter_datetime DESC
        LIMIT 20
      `,
      sql`
        SELECT o.observation_id AS id, o.observation_code AS code,
               o.observation_desc AS description,
               COALESCE(o.value_numeric::text, o.value_text) AS value,
               o.value_numeric, o.units AS unit,
               o.reference_range, o.abnormal_flag,
               o.observation_datetime AS date, o.active_ind
        FROM phm_edw.observation o
        WHERE o.patient_id = ${id}::int AND o.active_ind = 'Y'
        ORDER BY o.observation_datetime DESC
        LIMIT 50
      `,
      sql`
        SELECT cg.care_gap_id AS id, md.measure_name AS measure,
               cg.gap_status AS status, cg.identified_date,
               cg.resolved_date, cg.active_ind
        FROM phm_edw.care_gap cg
        LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
        WHERE cg.patient_id = ${id}::int AND cg.active_ind = 'Y'
        ORDER BY cg.identified_date ASC
      `,
      // PCP info
      sql`
        SELECT prov.display_name AS name, prov.specialty, prov.primary_phone AS phone
        FROM phm_edw.provider prov
        JOIN phm_edw.patient p ON p.pcp_provider_id = prov.provider_id
        WHERE p.patient_id = ${id}::int
      `.catch(() => []),
      // Insurance
      sql`
        SELECT pay.payer_name, pic.policy_number, pic.primary_indicator
        FROM phm_edw.patient_insurance_coverage pic
        JOIN phm_edw.payer pay ON pay.payer_id = pic.payer_id
        WHERE pic.patient_id = ${id}::int AND pic.active_ind = 'Y'
        ORDER BY pic.primary_indicator DESC
        LIMIT 1
      `.catch(() => []),
      // Address
      sql`
        SELECT a.address_line1, a.city, a.state, a.zip
        FROM phm_edw.address a
        JOIN phm_edw.patient p ON p.address_id = a.address_id
        WHERE p.patient_id = ${id}::int
      `.catch(() => []),
      // Allergy summary for banner
      sql`
        SELECT a.allergy_name AS name, pa.severity
        FROM phm_edw.patient_allergy pa
        JOIN phm_edw.allergy a ON a.allergy_id = pa.allergy_id
        WHERE pa.patient_id = ${id}::int AND pa.active_ind = 'Y'
        ORDER BY pa.severity DESC NULLS LAST
      `.catch(() => []),
    ]);

    const patient = patientResult[0];
    if (!patient) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Patient not found' },
      });
    }

    const pcp = pcpInfo[0] || null;
    const ins = insurance[0] || null;
    const addr = address[0] || null;

    await request.auditLog('view', 'patient', id);

    return reply.send({
      success: true,
      data: {
        ...patient,
        pcp: pcp ? { name: pcp.name, specialty: pcp.specialty, phone: pcp.phone } : null,
        insurance: ins ? { payer: ins.payer_name, policy: ins.policy_number } : null,
        address: addr ? { line1: addr.address_line1, city: addr.city, state: addr.state, zip: addr.zip } : null,
        allergies: allergySummary,
        conditions,
        encounters,
        observations,
        care_gaps: careGaps,
      },
    });
  });

  // GET /patients/:id/medications — Active medication orders
  fastify.get<{ Params: { id: string } }>('/:id/medications', async (request, reply) => {
    const { id } = request.params;

    const medications = await sql`
      SELECT
        mo.medication_order_id AS id,
        m.medication_name AS name,
        m.medication_code AS code,
        m.code_system,
        m.form,
        m.strength,
        mo.dosage,
        mo.frequency,
        mo.route,
        mo.prescription_status AS status,
        mo.start_datetime,
        mo.end_datetime,
        mo.refill_count,
        prov.display_name AS prescriber
      FROM phm_edw.medication_order mo
      JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
      LEFT JOIN phm_edw.provider prov ON prov.provider_id = mo.provider_id
      WHERE mo.patient_id = ${id}::int AND mo.active_ind = 'Y'
      ORDER BY mo.start_datetime DESC
    `;

    return reply.send({ success: true, data: medications });
  });

  // GET /patients/:id/allergies — Patient allergies with reactions/severity
  fastify.get<{ Params: { id: string } }>('/:id/allergies', async (request, reply) => {
    const { id } = request.params;

    const allergies = await sql`
      SELECT
        pa.patient_allergy_id AS id,
        a.allergy_name AS name,
        a.allergy_code AS code,
        a.category,
        pa.reaction,
        pa.severity,
        pa.onset_date,
        pa.status
      FROM phm_edw.patient_allergy pa
      JOIN phm_edw.allergy a ON a.allergy_id = pa.allergy_id
      WHERE pa.patient_id = ${id}::int AND pa.active_ind = 'Y'
      ORDER BY pa.severity DESC NULLS LAST, a.allergy_name ASC
    `;

    return reply.send({ success: true, data: allergies });
  });

  // GET /patients/:id/observations — Paginated observations with full metadata
  fastify.get<{ Params: { id: string }; Querystring: { category?: string; limit?: string; offset?: string } }>(
    '/:id/observations',
    async (request, reply) => {
      const { id } = request.params;
      const limit = Math.min(parseInt(request.query.limit || '100', 10), 500);
      const offset = parseInt(request.query.offset || '0', 10);

      const observations = await sql`
        SELECT
          o.observation_id AS id,
          o.observation_code AS code,
          o.observation_desc AS description,
          COALESCE(o.value_numeric::text, o.value_text) AS value,
          o.value_numeric,
          o.units AS unit,
          o.reference_range,
          o.abnormal_flag,
          o.status,
          o.observation_datetime AS date,
          o.encounter_id
        FROM phm_edw.observation o
        WHERE o.patient_id = ${id}::int AND o.active_ind = 'Y'
        ORDER BY o.observation_datetime DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return reply.send({ success: true, data: observations });
    },
  );

  // GET /patients/:id/observations/trending — Time-series for a specific observation code
  fastify.get<{ Params: { id: string }; Querystring: { code: string } }>(
    '/:id/observations/trending',
    async (request, reply) => {
      const { id } = request.params;
      const { code } = request.query;

      if (!code) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Query parameter "code" is required' },
        });
      }

      const data = await sql`
        SELECT
          o.observation_datetime AS date,
          o.value_numeric AS value,
          o.units AS unit,
          o.reference_range,
          o.abnormal_flag
        FROM phm_edw.observation o
        WHERE o.patient_id = ${id}::int
          AND o.observation_code = ${code}
          AND o.active_ind = 'Y'
          AND o.value_numeric IS NOT NULL
        ORDER BY o.observation_datetime ASC
      `;

      return reply.send({ success: true, data });
    },
  );

  // GET /patients/:id/encounters — Enhanced encounters with provider/facility
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; page?: string } }>(
    '/:id/encounters',
    async (request, reply) => {
      const { id } = request.params;
      const limit = Math.min(parseInt(request.query.limit || '50', 10), 200);
      const page = parseInt(request.query.page || '1', 10);
      const offset = (page - 1) * limit;

      const [countResult] = await sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM phm_edw.encounter e
        WHERE e.patient_id = ${id}::int AND e.active_ind = 'Y'
      `;

      const encounters = await sql`
        SELECT
          e.encounter_id AS id,
          e.encounter_datetime AS date,
          e.encounter_type AS type,
          e.encounter_reason AS reason,
          e.status,
          e.disposition,
          prov.display_name AS provider_name,
          prov.specialty AS provider_specialty,
          org.organization_name AS facility
        FROM phm_edw.encounter e
        LEFT JOIN phm_edw.provider prov ON prov.provider_id = e.provider_id
        LEFT JOIN phm_edw.organization org ON org.org_id = e.org_id
        WHERE e.patient_id = ${id}::int AND e.active_ind = 'Y'
        ORDER BY e.encounter_datetime DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return reply.send({
        success: true,
        data: encounters,
        meta: {
          page,
          limit,
          total: countResult?.total ?? 0,
          total_pages: Math.ceil((countResult?.total ?? 0) / limit),
        },
      });
    },
  );

  // GET /patients/:id/flowsheet — Observations for dense grid view
  fastify.get<{ Params: { id: string }; Querystring: { category?: string } }>(
    '/:id/flowsheet',
    async (request, reply) => {
      const { id } = request.params;
      const { category } = request.query;

      // LOINC code sets by category
      const CATEGORY_CODES: Record<string, string[]> = {
        vitals: ['8310-5', '8867-4', '9279-1', '85354-9', '29463-7', '39156-5', '8480-6', '8462-4'],
        bmp: ['2345-7', '6299-2', '2160-0', '3094-0', '2951-2', '2823-3', '2075-0', '1742-6'],
        cbc: ['6690-2', '789-8', '718-7', '4544-3', '787-2', '786-4', '32623-1'],
        lipids: ['2093-3', '2571-8', '2085-9', '13457-7'],
      };

      const codes = category && CATEGORY_CODES[category] ? CATEGORY_CODES[category] : null;

      const data = await sql`
        SELECT
          o.observation_code AS code,
          COALESCE(o.observation_desc, o.observation_code) AS name,
          o.units AS unit,
          o.reference_range,
          o.observation_datetime AS date,
          o.value_numeric,
          o.value_text,
          o.abnormal_flag
        FROM phm_edw.observation o
        WHERE o.patient_id = ${id}::int
          AND o.active_ind = 'Y'
          ${codes ? sql`AND o.observation_code = ANY(${codes})` : sql``}
        ORDER BY o.observation_code, o.observation_datetime DESC
      `;

      return reply.send({ success: true, data });
    },
  );

  // GET /patients/:id/care-bundle — Bundle-grouped care gaps with deduplication
  fastify.get<{ Params: { id: string } }>('/:id/care-bundle', async (request, reply) => {
    const { id } = request.params;

    // 1. Verify patient exists
    const [patient] = await sql<{ patient_id: number }[]>`
      SELECT patient_id FROM phm_edw.patient
      WHERE patient_id = ${id}::int AND active_ind = 'Y'
    `;
    if (!patient) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Patient not found' },
      });
    }

    // 2. Get patient's active ICD-10 codes
    const patientConditions = await sql<{ condition_code: string }[]>`
      SELECT DISTINCT c.condition_code
      FROM phm_edw.condition_diagnosis cd
      JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
      WHERE cd.patient_id = ${id}::int
        AND cd.active_ind = 'Y'
        AND cd.diagnosis_status = 'active'
    `;

    const icdCodes = patientConditions.map((c) => c.condition_code);

    if (icdCodes.length === 0) {
      return reply.send({
        success: true,
        data: {
          patient_id: patient.patient_id,
          total_measures: 0,
          deduplicated_measures: 0,
          overall_compliance_pct: 0,
          bundles: [],
          overlap_deductions: [],
        },
      });
    }

    // 3. Find matching condition bundles via icd10_pattern LIKE matching
    const matchedBundles = await sql<{
      bundle_id: number;
      bundle_code: string;
      condition_name: string;
      bundle_size: number;
      icd10_pattern: string;
    }[]>`
      SELECT cb.bundle_id, cb.bundle_code, cb.condition_name,
             cb.bundle_size, cb.icd10_pattern
      FROM phm_edw.condition_bundle cb
      WHERE cb.active_ind = 'Y'
        AND EXISTS (
          SELECT 1
          FROM unnest(string_to_array(cb.icd10_pattern, ',')) AS pat
          WHERE EXISTS (
            SELECT 1
            FROM unnest(${icdCodes}::text[]) AS code
            WHERE code LIKE trim(pat)
          )
        )
      ORDER BY cb.condition_name
    `;

    if (matchedBundles.length === 0) {
      return reply.send({
        success: true,
        data: {
          patient_id: patient.patient_id,
          total_measures: 0,
          deduplicated_measures: 0,
          overall_compliance_pct: 0,
          bundles: [],
          overlap_deductions: [],
        },
      });
    }

    const bundleIds = matchedBundles.map((b) => b.bundle_id);
    const bundleCodes = matchedBundles.map((b) => b.bundle_code);

    // 4. Fetch all measures for matched bundles
    const bundleMeasures = await sql<{
      bundle_id: number;
      measure_id: number;
      measure_code: string;
      measure_name: string;
      description: string | null;
      frequency: string | null;
      ecqm_reference: string | null;
      ordinal: number;
    }[]>`
      SELECT bm.bundle_id, md.measure_id, md.measure_code, md.measure_name,
             md.description, bm.frequency, bm.ecqm_reference, bm.ordinal
      FROM phm_edw.bundle_measure bm
      JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
      WHERE bm.bundle_id = ANY(${bundleIds})
        AND bm.active_ind = 'Y'
      ORDER BY bm.bundle_id, bm.ordinal
    `;

    // 5. Fetch existing care gap statuses for this patient
    const existingGaps = await sql<{
      care_gap_id: number;
      measure_id: number;
      gap_status: string;
      identified_date: string | null;
      resolved_date: string | null;
      due_date: string | null;
    }[]>`
      SELECT cg.care_gap_id, cg.measure_id, cg.gap_status,
             cg.identified_date::text, cg.resolved_date::text, cg.due_date::text
      FROM phm_edw.care_gap cg
      WHERE cg.patient_id = ${id}::int AND cg.active_ind = 'Y'
    `;

    const gapByMeasure = new Map(existingGaps.map((g) => [g.measure_id, g]));

    // 6. Load and apply overlap rules
    const overlapRules = await sql<{
      rule_code: string;
      shared_domain: string;
      applicable_bundles: string;
      canonical_measure_code: string | null;
      dedup_rule: string;
    }[]>`
      SELECT rule_code, shared_domain, applicable_bundles,
             canonical_measure_code, dedup_rule
      FROM phm_edw.bundle_overlap_rule
      WHERE active_ind = 'Y'
    `;

    // Build set of deduplicated measure codes
    const dedupSet = new Map<string, string>(); // measure_code → dedup_source
    const overlapDeductions: { domain: string; canonical: string; satisfied_for: string[] }[] = [];

    for (const rule of overlapRules) {
      const applicableCodes = rule.applicable_bundles.split(',').map((s) => s.trim());
      const patientApplicable = applicableCodes.filter((c) => bundleCodes.includes(c));

      // Rule only applies if patient has 2+ applicable bundles
      if (patientApplicable.length < 2 || !rule.canonical_measure_code) continue;

      // Find all measures in applicable bundles that share this domain
      // The canonical measure stays; duplicates get marked
      const canonicalCode = rule.canonical_measure_code;
      const satisfiedFor: string[] = [];

      for (const bm of bundleMeasures) {
        const bundle = matchedBundles.find((b) => b.bundle_id === bm.bundle_id);
        if (!bundle || !patientApplicable.includes(bundle.bundle_code)) continue;

        // If this measure is in the shared domain but is NOT the canonical, dedup it
        if (
          bm.measure_code !== canonicalCode &&
          bm.measure_name.toLowerCase().includes(rule.shared_domain.toLowerCase().split(' ')[0].toLowerCase())
        ) {
          dedupSet.set(bm.measure_code, canonicalCode);
          satisfiedFor.push(bm.measure_code);
        }
      }

      if (satisfiedFor.length > 0) {
        overlapDeductions.push({
          domain: rule.shared_domain,
          canonical: canonicalCode,
          satisfied_for: satisfiedFor,
        });
      }
    }

    // 7. Build response bundles
    let totalMeasures = 0;
    let totalDeduped = 0;
    let totalMet = 0;

    const bundles = matchedBundles.map((bundle) => {
      const measures = bundleMeasures
        .filter((bm) => bm.bundle_id === bundle.bundle_id)
        .map((bm) => {
          const gap = gapByMeasure.get(bm.measure_id);
          const isDeduplicated = dedupSet.has(bm.measure_code);
          const status = gap?.gap_status ?? 'not_met';

          return {
            measure_code: bm.measure_code,
            measure_name: bm.measure_name,
            description: bm.description,
            frequency: bm.frequency,
            ecqm_reference: bm.ecqm_reference,
            status,
            due_date: gap?.due_date ?? null,
            identified_date: gap?.identified_date ?? null,
            resolved_date: gap?.resolved_date ?? null,
            care_gap_id: gap?.care_gap_id ?? null,
            is_deduplicated: isDeduplicated,
            dedup_source: isDeduplicated ? dedupSet.get(bm.measure_code)! : null,
          };
        });

      const metCount = measures.filter(
        (m) => !m.is_deduplicated && (m.status === 'met' || m.status === 'closed'),
      ).length;
      const activeCount = measures.filter((m) => !m.is_deduplicated).length;
      const compliancePct = activeCount > 0 ? Math.round((metCount / activeCount) * 100) : 0;

      totalMeasures += measures.length;
      totalDeduped += measures.filter((m) => m.is_deduplicated).length;
      totalMet += metCount;

      return {
        bundle_code: bundle.bundle_code,
        condition_name: bundle.condition_name,
        bundle_size: bundle.bundle_size,
        compliance_pct: compliancePct,
        met_count: metCount,
        measures,
      };
    });

    const activeMeasures = totalMeasures - totalDeduped;
    const overallCompliance = activeMeasures > 0 ? Math.round((totalMet / activeMeasures) * 100) : 0;

    return reply.send({
      success: true,
      data: {
        patient_id: patient.patient_id,
        total_measures: totalMeasures,
        deduplicated_measures: totalDeduped,
        overall_compliance_pct: overallCompliance,
        bundles,
        overlap_deductions: overlapDeductions,
      },
    });
  });

  // GET /patients/:id/notes — Clinical notes for a patient
  fastify.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/:id/notes',
    async (request, reply) => {
      const { id } = request.params;
      const { status } = request.query;

      const notes = await sql`
        SELECT cn.note_id, cn.visit_type, cn.status, cn.chief_complaint,
               cn.finalized_at, cn.created_date, cn.updated_date,
               au.first_name || ' ' || au.last_name AS author_name
        FROM phm_edw.clinical_note cn
        JOIN public.app_users au ON au.id = cn.author_user_id
        WHERE cn.patient_id = ${id}::int
          AND cn.active_ind = 'Y'
          ${status ? sql`AND cn.status = ${status}` : sql``}
        ORDER BY cn.created_date DESC
      `;

      return reply.send({ success: true, data: notes });
    },
  );

  // POST /patients — Create patient
  fastify.post('/', async (request, reply) => {
    const parseResult = patientCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }

    const data = parseResult.data;

    const [patient] = await sql`
      INSERT INTO phm_edw.patient (
        first_name, last_name, mrn,
        date_of_birth, gender, active_ind, created_date, updated_date
      )
      VALUES (
        ${data.first_name}, ${data.last_name}, ${data.mrn},
        ${data.date_of_birth}, ${data.gender}, 'Y', NOW(), NOW()
      )
      RETURNING patient_id AS id, first_name, last_name, mrn
    `;

    await request.auditLog('create', 'patient', String(patient.id));

    return reply.status(201).send({
      success: true,
      data: patient,
    });
  });
}
