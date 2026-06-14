// =============================================================================
// Medgnosis API — FHIR measure operations (Medgnosis-facing)
// Mounted inside the FHIR routes. Exposes the standard Clinical Reasoning
// operations over Medgnosis' own measures:
//   GET /Measure/:id/$evaluate-measure  -> the latest persisted MeasureReport,
//      or a live engine evaluation (proxied via the measure_artifact binding).
// (Epic C extends this file with $care-gaps.)
//
// :id is the EDW measure_code (e.g. CMS122v12); the engine Measure id is resolved
// from the binding. Reuses app.authenticate (the protected app-user flow is
// untouched — additive only).
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { latestMeasureReport } from '../../services/measureReportStore.js';
import { evaluateMeasure } from '../../services/fhir/cqlEngineClient.js';
import { buildGapsInCareBundle, type CareGapInput, type GapStatus } from '../../services/deqm/careGaps.js';

function engineUrl(): string {
  return process.env['CQL_ENGINE_URL'] ?? 'http://cql-engine:8080/fhir';
}

function operationOutcome(code: string, diagnostics: string): Record<string, unknown> {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code, diagnostics }],
  };
}

export default async function measureOps(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { periodStart?: string; periodEnd?: string } }>(
    '/Measure/:id/$evaluate-measure',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params;

      // 1. Serve the latest persisted MeasureReport when present (the nightly
      //    cql evaluation persists these; SQL stays authoritative for rollups).
      const persisted = await latestMeasureReport(id);
      if (persisted) {
        reply.header('X-Measure-Source', 'persisted');
        return persisted.report;
      }

      // 2. Otherwise resolve the artifact binding and evaluate live on the engine.
      const [binding] = await sql<
        { ecqm_id: string | null; period_start: string | null; period_end: string | null }[]
      >`
        SELECT ecqm_id,
               reporting_period_start::text AS period_start,
               reporting_period_end::text   AS period_end
        FROM phm_edw.measure_artifact
        WHERE measure_code = ${id} AND ecqm_id IS NOT NULL
        ORDER BY reporting_period_start DESC NULLS LAST
        LIMIT 1
      `;
      if (!binding?.ecqm_id) {
        return reply
          .status(404)
          .send(operationOutcome('not-found', `No MeasureReport or artifact binding for measure ${id}`));
      }

      const periodStart = req.query.periodStart ?? binding.period_start ?? '2026-01-01';
      const periodEnd = req.query.periodEnd ?? binding.period_end ?? '2026-12-31';
      try {
        const report = await evaluateMeasure(engineUrl(), binding.ecqm_id, {
          periodStart,
          periodEnd,
          reportType: 'population',
        });
        reply.header('X-Measure-Source', 'engine');
        return report;
      } catch (e) {
        return reply
          .status(502)
          .send(operationOutcome('exception', e instanceof Error ? e.message : 'engine evaluation failed'));
      }
    },
  );

  // GET /Measure/$care-gaps?subject=Patient/:id[&status=open|closed|prospective]
  // Da Vinci DEQM Gaps-in-Care over the existing care_gap engine (the 45-bundle
  // care-gap detector remains the source of truth; this is an additional,
  // payer-exchangeable emission). "prospective" = an open gap whose due date is
  // still in the future (closable within the period).
  app.get<{
    Querystring: { subject?: string; status?: GapStatus; periodStart?: string; periodEnd?: string };
  }>('/Measure/$care-gaps', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { subject, status, periodStart, periodEnd } = req.query;
    if (!subject) {
      return reply.status(400).send(operationOutcome('required', 'subject parameter is required'));
    }
    const patientId = subject.replace(/^Patient\//, '');
    // Provider scoping mirrors /care-gaps: a scoped user only sees their panel.
    const providerId = (req.user as { provider_id?: number } | undefined)?.provider_id ?? null;

    const rows = await sql<
      { gap_status: string; due_date: string | null; measure_code: string; fhir_measure_url: string | null }[]
    >`
      SELECT cg.gap_status,
             cg.due_date::text AS due_date,
             md.measure_code,
             ma.fhir_measure_url
      FROM phm_edw.care_gap cg
      JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
      JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      LEFT JOIN phm_edw.measure_artifact ma ON ma.measure_code = md.measure_code
      WHERE cg.patient_id = ${patientId}::int
        AND cg.active_ind = 'Y'
        AND p.active_ind = 'Y'
        AND (${providerId}::int IS NULL OR p.pcp_provider_id = ${providerId}::int)
    `;

    const today = new Date().toISOString().slice(0, 10);
    let gaps: CareGapInput[] = rows.map((r) => {
      const closed = r.gap_status === 'closed' || r.gap_status === 'resolved';
      const prospective = !closed && r.due_date != null && r.due_date > today;
      const gapStatus: GapStatus = closed ? 'closed' : prospective ? 'prospective' : 'open';
      return {
        measureCode: r.measure_code,
        measureUrl: r.fhir_measure_url ?? undefined,
        gapStatus,
        prospective,
      };
    });
    if (status) gaps = gaps.filter((g) => g.gapStatus === status);

    const period =
      periodStart && periodEnd ? { start: periodStart, end: periodEnd } : undefined;
    return buildGapsInCareBundle(subject, gaps, period ? { period } : {});
  });
}
