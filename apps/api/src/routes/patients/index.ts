// =============================================================================
// Medgnosis API — Patient routes
// Ported from backend/app/Http/Controllers/PatientController.php
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { patientSearchSchema, patientCreateSchema, PAGINATION } from '@medgnosis/shared';

export default async function patientRoutes(fastify: FastifyInstance): Promise<void> {
  // All patient routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /patients — List patients with search and pagination
  fastify.get('/', async (request, reply) => {
    const params = patientSearchSchema.parse(request.query);
    const { search, page, per_page, sort_by, sort_order, risk_level } = params;
    const offset = (page - 1) * per_page;

    // Build dynamic query
    let whereClause = `WHERE p.active_ind = 'Y'`;
    const queryParams: unknown[] = [];

    if (search) {
      whereClause += ` AND (p.first_name || ' ' || p.last_name) ILIKE $${queryParams.length + 1}`;
      queryParams.push(`%${search}%`);
    }

    // Count total
    const [countResult] = await sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM phm_edw.patient p
      WHERE p.active_ind = 'Y'
        ${search ? sql`AND (p.first_name || ' ' || p.last_name) ILIKE ${`%${search}%`}` : sql``}
    `;

    const total = countResult?.total ?? 0;

    // Fetch page
    const patients = await sql`
      SELECT
        p.patient_id AS id,
        p.first_name,
        p.last_name,
        p.medical_record_number AS mrn,
        p.date_of_birth,
        p.gender,
        p.active_ind
      FROM phm_edw.patient p
      WHERE p.active_ind = 'Y'
        ${search ? sql`AND (p.first_name || ' ' || p.last_name) ILIKE ${`%${search}%`}` : sql``}
      ORDER BY
        ${sort_by === 'name' ? sql`p.last_name` : sql`p.patient_id`}
        ${sort_order === 'desc' ? sql`DESC` : sql`ASC`}
      LIMIT ${per_page}
      OFFSET ${offset}
    `;

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

  // GET /patients/:id — Patient detail
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const [patient] = await sql`
      SELECT
        p.patient_id AS id,
        p.first_name,
        p.last_name,
        p.medical_record_number AS mrn,
        p.date_of_birth,
        p.gender,
        p.ssn_encrypted,
        p.phone_encrypted,
        p.email_encrypted,
        p.active_ind
      FROM phm_edw.patient p
      WHERE p.patient_id = ${id}::int AND p.active_ind = 'Y'
    `;

    if (!patient) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Patient not found' },
      });
    }

    // Fetch related data in parallel
    const [conditions, encounters, observations, careGaps] = await Promise.all([
      sql`
        SELECT cd.condition_diagnosis_id AS id, c.condition_code AS code,
               c.condition_name AS name, cd.condition_status AS status,
               cd.onset_date, cd.diagnosis_date, cd.active_ind
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
        WHERE cd.patient_id = ${id}::int AND cd.active_ind = 'Y'
        ORDER BY cd.diagnosis_date DESC
      `,
      sql`
        SELECT e.encounter_id AS id, e.encounter_date AS date,
               e.encounter_type AS type, e.encounter_reason AS reason,
               e.active_ind
        FROM phm_edw.encounter e
        WHERE e.patient_id = ${id}::int AND e.active_ind = 'Y'
        ORDER BY e.encounter_date DESC
        LIMIT 20
      `,
      sql`
        SELECT o.observation_id AS id, o.observation_type AS name,
               o.observation_value AS value, o.observation_unit AS unit,
               o.observation_date AS date, o.active_ind
        FROM phm_edw.observation o
        WHERE o.patient_id = ${id}::int AND o.active_ind = 'Y'
        ORDER BY o.observation_date DESC
        LIMIT 50
      `,
      sql`
        SELECT cg.care_gap_id AS id, md.measure_name AS measure,
               cg.gap_status AS status, cg.identified_date,
               cg.due_date, cg.active_ind
        FROM phm_edw.care_gap cg
        LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
        WHERE cg.patient_id = ${id}::int AND cg.active_ind = 'Y'
        ORDER BY cg.due_date ASC
      `,
    ]);

    await request.auditLog('view', 'patient', id);

    return reply.send({
      success: true,
      data: {
        ...patient,
        conditions,
        encounters,
        observations,
        care_gaps: careGaps,
      },
    });
  });

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
        first_name, last_name, medical_record_number,
        date_of_birth, gender, active_ind, created_date, updated_date
      )
      VALUES (
        ${data.first_name}, ${data.last_name}, ${data.mrn},
        ${data.date_of_birth}, ${data.gender}, 'Y', NOW(), NOW()
      )
      RETURNING patient_id AS id, first_name, last_name, medical_record_number AS mrn
    `;

    await request.auditLog('create', 'patient', String(patient.id));

    return reply.status(201).send({
      success: true,
      data: patient,
    });
  });
}
