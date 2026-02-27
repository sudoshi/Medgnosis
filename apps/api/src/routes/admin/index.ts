// =============================================================================
// Medgnosis API — Admin routes
// All routes require authenticated admin role.
// Actual table schemas:
//   app_users: id (uuid), first_name, last_name, email, role, is_active, last_login_at
//   audit_log: id (uuid), user_id (uuid→app_users.id), action, resource_type, resource_id, details (jsonb), ip_address, user_agent, created_at
//   etl_log:   etl_log_id, source_system, load_status, rows_inserted, created_date
//   _migrations: id, name, applied_at
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

  // ---- System Stats ----

  app.get('/stats', async () => {
    const [patients, providers, openGaps, starBundle, starComposite, etlLog] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM phm_edw.patient`,
      sql`SELECT COUNT(*) AS count FROM phm_edw.provider`,
      sql`SELECT COUNT(*) AS count FROM phm_edw.care_gap WHERE resolved_date IS NULL`,
      sql`SELECT COUNT(*) AS count FROM phm_star.fact_patient_bundle`,
      sql`SELECT COUNT(*) AS count FROM phm_star.fact_patient_composite`,
      sql`SELECT load_status, source_system, rows_inserted, created_date
          FROM phm_edw.etl_log ORDER BY created_date DESC LIMIT 1`,
    ]);

    const lastEtl = etlLog[0] ?? null;

    return {
      success: true,
      data: {
        total_providers:        Number(providers[0].count),
        active_patients:        Number(patients[0].count),
        open_care_gaps:         Number(openGaps[0].count),
        star_bundle_rows:       Number(starBundle[0].count),
        star_composite_rows:    Number(starComposite[0].count),
        last_etl_status:        lastEtl?.load_status ?? null,
        last_etl_system:        lastEtl?.source_system ?? null,
        last_etl_rows_inserted: lastEtl ? Number(lastEtl.rows_inserted) : null,
        last_etl_at:            lastEtl?.created_date ?? null,
      },
    };
  });

  // ---- User Management ----

  app.get('/users', async () => {
    const users = await sql`
      SELECT
        u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
        u.created_at, u.last_login_at,
        p.first_name AS provider_first_name,
        p.last_name  AS provider_last_name
      FROM public.app_users u
      LEFT JOIN phm_edw.provider p ON p.email = u.email
      ORDER BY u.created_at DESC
    `;
    return { success: true, data: { users } };
  });

  app.post('/users', async (req, reply) => {
    const { email, first_name, last_name, role } = req.body as {
      email: string;
      first_name: string;
      last_name?: string;
      role?: string;
    };

    if (!email || !first_name) {
      return reply.status(400).send({ success: false, error: { message: 'email and first_name are required' } });
    }

    const validRoles = ['provider', 'analyst', 'admin', 'care_coordinator'];
    const resolvedRole = validRoles.includes(role ?? '') ? role! : 'provider';

    const [existing] = await sql`SELECT id FROM public.app_users WHERE email = ${email}`;
    if (existing) {
      return reply.status(409).send({ success: false, error: { message: 'A user with this email already exists' } });
    }

    const [user] = await sql`
      INSERT INTO public.app_users (email, first_name, last_name, role, password_hash, is_active)
      VALUES (
        ${email},
        ${first_name},
        ${last_name ?? ''},
        ${resolvedRole},
        'INVITE_PENDING',
        TRUE
      )
      RETURNING id, email, first_name, last_name, role, is_active, created_at
    `;

    return { success: true, data: { user } };
  });

  app.patch('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { role, is_active, first_name, last_name } = req.body as {
      role?: string;
      is_active?: boolean;
      first_name?: string;
      last_name?: string;
    };

    if (role === undefined && is_active === undefined && !first_name && !last_name) {
      return reply.status(400).send({ success: false, error: { message: 'No updates provided' } });
    }

    const [updated] = await sql`
      UPDATE public.app_users
      SET
        role       = COALESCE(${role ?? null}, role),
        is_active  = COALESCE(${is_active ?? null}, is_active),
        first_name = COALESCE(${first_name ?? null}, first_name),
        last_name  = COALESCE(${last_name ?? null}, last_name),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, email, first_name, last_name, role, is_active
    `;

    if (!updated) return reply.status(404).send({ success: false, error: { message: 'User not found' } });
    return { success: true, data: { user: updated } };
  });

  app.delete('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const [updated] = await sql`
      UPDATE public.app_users
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, email, is_active
    `;

    if (!updated) return reply.status(404).send({ success: false, error: { message: 'User not found' } });
    return { success: true, data: { user: updated } };
  });

  // ---- FHIR Endpoints ----

  app.get('/fhir-endpoints', async () => {
    const endpoints = await sql`
      SELECT * FROM phm_edw.fhir_endpoint
      WHERE is_active = TRUE
      ORDER BY created_at DESC
    `;
    return { success: true, data: { endpoints } };
  });

  app.post('/fhir-endpoints', async (req) => {
    const { name, ehr_type, base_url, auth_type, version, notes } = req.body as {
      name: string;
      ehr_type: string;
      base_url: string;
      auth_type?: string;
      version?: string;
      notes?: string;
    };

    const [endpoint] = await sql`
      INSERT INTO phm_edw.fhir_endpoint (name, ehr_type, base_url, auth_type, version, notes)
      VALUES (
        ${name}, ${ehr_type}, ${base_url},
        ${auth_type ?? 'oauth2'}, ${version ?? 'R4'}, ${notes ?? null}
      )
      RETURNING *
    `;
    return { success: true, data: { endpoint } };
  });

  app.patch('/fhir-endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, base_url, auth_type, status, version, notes } = req.body as {
      name?: string;
      base_url?: string;
      auth_type?: string;
      status?: string;
      version?: string;
      notes?: string;
    };

    const [endpoint] = await sql`
      UPDATE phm_edw.fhir_endpoint
      SET
        name       = COALESCE(${name ?? null}, name),
        base_url   = COALESCE(${base_url ?? null}, base_url),
        auth_type  = COALESCE(${auth_type ?? null}, auth_type),
        status     = COALESCE(${status ?? null}, status),
        version    = COALESCE(${version ?? null}, version),
        notes      = COALESCE(${notes ?? null}, notes),
        updated_at = NOW()
      WHERE endpoint_id = ${id}
      RETURNING *
    `;

    if (!endpoint) return reply.status(404).send({ success: false, error: { message: 'Endpoint not found' } });
    return { success: true, data: { endpoint } };
  });

  app.delete('/fhir-endpoints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const [endpoint] = await sql`
      UPDATE phm_edw.fhir_endpoint
      SET is_active = FALSE, updated_at = NOW()
      WHERE endpoint_id = ${id}
      RETURNING endpoint_id
    `;

    if (!endpoint) return reply.status(404).send({ success: false, error: { message: 'Endpoint not found' } });
    return { success: true };
  });

  app.post('/fhir-endpoints/:id/sync', async (req, reply) => {
    const { id } = req.params as { id: string };

    const [endpoint] = await sql`
      UPDATE phm_edw.fhir_endpoint
      SET
        last_sync_at = NOW(),
        status       = 'connected',
        updated_at   = NOW()
      WHERE endpoint_id = ${id}
      RETURNING *
    `;

    if (!endpoint) return reply.status(404).send({ success: false, error: { message: 'Endpoint not found' } });
    return { success: true, data: { endpoint } };
  });

  // ---- Audit Log ----
  // Schema: id (uuid), user_id (uuid), action, resource_type, resource_id, details (jsonb), ip_address, user_agent, created_at

  app.get('/audit-log', async (req) => {
    const { limit = '50', offset = '0', event_type } = req.query as {
      limit?: string;
      offset?: string;
      event_type?: string;  // maps to audit_log.action
    };

    const logs = event_type
      ? await sql`
          SELECT
            al.id AS audit_id, al.action AS event_type, al.resource_type AS target_type,
            al.resource_id AS target_id, al.details::text AS description,
            al.ip_address, al.created_at,
            au.email AS user_email, au.first_name AS user_first_name, au.last_name AS user_last_name
          FROM public.audit_log al
          LEFT JOIN public.app_users au ON al.user_id = au.id
          WHERE al.action = ${event_type}
          ORDER BY al.created_at DESC
          LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `
      : await sql`
          SELECT
            al.id AS audit_id, al.action AS event_type, al.resource_type AS target_type,
            al.resource_id AS target_id, al.details::text AS description,
            al.ip_address, al.created_at,
            au.email AS user_email, au.first_name AS user_first_name, au.last_name AS user_last_name
          FROM public.audit_log al
          LEFT JOIN public.app_users au ON al.user_id = au.id
          ORDER BY al.created_at DESC
          LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `;

    const [{ count }] = event_type
      ? await sql`SELECT COUNT(*) AS count FROM public.audit_log WHERE action = ${event_type}`
      : await sql`SELECT COUNT(*) AS count FROM public.audit_log`;

    return { success: true, data: { logs, total: Number(count) } };
  });

  // ---- ETL Status ----

  app.get('/etl-status', async () => {
    const [etlLogs, migrations, starCounts] = await Promise.all([
      sql`
        SELECT source_system, load_status, rows_inserted, created_date AS created_at
        FROM phm_edw.etl_log
        ORDER BY created_date DESC
        LIMIT 10
      `,
      sql`
        SELECT name AS migration_name, applied_at
        FROM public._migrations
        ORDER BY applied_at DESC
      `,
      sql`
        SELECT
          (SELECT COUNT(*) FROM phm_star.fact_patient_composite)    AS composite_rows,
          (SELECT COUNT(*) FROM phm_star.fact_patient_bundle)        AS bundle_rows,
          (SELECT COUNT(*) FROM phm_star.fact_patient_bundle_detail) AS detail_rows,
          (SELECT COUNT(*) FROM phm_star.dim_patient)                AS dim_patient_rows,
          (SELECT COUNT(*) FROM phm_star.dim_provider)               AS dim_provider_rows,
          (SELECT COUNT(*) FROM phm_star.dim_bundle)                 AS dim_bundle_rows
      `,
    ]);

    return {
      success: true,
      data: {
        etl_logs:    etlLogs,
        migrations,
        star_counts: starCounts[0] ?? {},
      },
    };
  });

  // ---- Refresh Materialized Views ----

  app.post('/refresh-mat-views', async (_, reply) => {
    // REFRESH CONCURRENTLY cannot run inside a transaction — iterate sequentially
    const views = [
      'phm_star.mv_patient_dashboard',
      'phm_star.mv_bundle_compliance_by_provider',
      'phm_star.mv_population_overview',
      'phm_star.mv_care_gap_worklist',
      'phm_star.mv_population_by_condition',
      'phm_star.mv_provider_scorecard',
      'phm_star.mv_patient_risk_tier',
    ];

    const results: Array<{ view: string; status: string; error?: string }> = [];
    for (const view of views) {
      try {
        await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
        results.push({ view, status: 'ok' });
      } catch (err) {
        results.push({ view, status: 'error', error: String(err) });
      }
    }

    const allOk = results.every((r) => r.status === 'ok');
    return reply
      .status(allOk ? 200 : 207)
      .send({ success: allOk, data: { results } });
  });

  // ---- Analytics Overview (legacy endpoint — kept for backwards compatibility) ----

  app.get('/analytics/overview', async () => {
    const [patients, conditions, encounters, measures] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM phm_edw.patient`,
      sql`SELECT COUNT(*) AS count FROM phm_edw.condition_diagnosis`,
      sql`
        SELECT COUNT(*) AS count FROM phm_edw.encounter
        WHERE encounter_datetime >= NOW() - INTERVAL '30 days'
      `,
      sql`SELECT COUNT(DISTINCT measure_id) AS count FROM phm_star.fact_measure_result`,
    ]);

    return {
      success: true,
      data: {
        total_patients:    Number(patients[0].count),
        active_conditions: Number(conditions[0].count),
        recent_encounters: Number(encounters[0].count),
        active_measures:   Number(measures[0].count),
      },
    };
  });
}
