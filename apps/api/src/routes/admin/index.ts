// =============================================================================
// Medgnosis API — Admin routes (OMOP export, analytics, user management)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import {
  exportPatientsToOmop,
  exportConditionsToOmop,
  exportMeasurementsToOmop,
  generateDeidentifiedCohort,
} from '../../services/omopExport.js';
import { sql } from '@medgnosis/db';

export default async function adminRoutes(app: FastifyInstance) {
  // Require admin role for all admin routes
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole(['admin']));

  // ---- OMOP CDM Export ----

  app.get('/omop/persons', async () => {
    const data = await exportPatientsToOmop();
    return { success: true, data: { persons: data, count: data.length } };
  });

  app.get('/omop/conditions', async (req) => {
    const { patient_id } = req.query as { patient_id?: string };
    const data = await exportConditionsToOmop(
      patient_id ? Number(patient_id) : undefined,
    );
    return { success: true, data: { conditions: data, count: data.length } };
  });

  app.get('/omop/measurements', async (req) => {
    const { patient_id } = req.query as { patient_id?: string };
    const data = await exportMeasurementsToOmop(
      patient_id ? Number(patient_id) : undefined,
    );
    return { success: true, data: { measurements: data, count: data.length } };
  });

  app.post('/omop/cohort', async (req) => {
    const criteria = req.body as {
      min_age?: number;
      max_age?: number;
      conditions?: string[];
    };
    const data = await generateDeidentifiedCohort(criteria);
    return { success: true, data: { cohort: data, count: data.length } };
  });

  // ---- User Management ----

  app.get('/users', async () => {
    const users = await sql`
      SELECT id, email, first_name, last_name, role, is_active, created_at, last_login_at
      FROM app_users
      ORDER BY created_at DESC
    `;
    return { success: true, data: { users } };
  });

  app.patch('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { role, is_active } = req.body as {
      role?: string;
      is_active?: boolean;
    };

    const updates: string[] = [];
    if (role) updates.push('role');
    if (is_active !== undefined) updates.push('is_active');

    if (updates.length === 0) {
      return reply.status(400).send({ success: false, error: { message: 'No updates provided' } });
    }

    const [updated] = await sql`
      UPDATE app_users
      SET
        role = COALESCE(${role ?? null}, role),
        is_active = COALESCE(${is_active ?? null}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, email, first_name, last_name, role, is_active
    `;

    if (!updated) return reply.status(404).send({ success: false, error: { message: 'User not found' } });
    return { success: true, data: { user: updated } };
  });

  // ---- Audit Log ----

  app.get('/audit-log', async (req) => {
    const { limit = '50', offset = '0' } = req.query as {
      limit?: string;
      offset?: string;
    };
    const logs = await sql`
      SELECT al.*, au.email as user_email
      FROM audit_log al
      LEFT JOIN app_users au ON al.user_id = au.id
      ORDER BY al.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM audit_log`;
    return { success: true, data: { logs, total: Number(count) } };
  });

  // ---- Analytics Overview ----

  app.get('/analytics/overview', async () => {
    const [patients, conditions, encounters, measures] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM phm_edw.patient`,
      sql`SELECT COUNT(*) as count FROM phm_edw.condition WHERE status = 'active'`,
      sql`
        SELECT COUNT(*) as count FROM phm_edw.encounter
        WHERE encounter_date >= NOW() - INTERVAL '30 days'
      `,
      sql`SELECT COUNT(DISTINCT measure_id) as count FROM phm_star.fact_measure_result`,
    ]);

    return {
      success: true,
      data: {
        total_patients: Number(patients[0].count),
        active_conditions: Number(conditions[0].count),
        recent_encounters: Number(encounters[0].count),
        active_measures: Number(measures[0].count),
      },
    };
  });
}
