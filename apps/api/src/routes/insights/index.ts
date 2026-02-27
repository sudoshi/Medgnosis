// =============================================================================
// Medgnosis API — AI Insights routes
// Server-side AI integration (Anthropic + Ollama)
// Supports generic chat + patient-context chat (when patient_id provided)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { config } from '../../config.js';
import { generateChat, generateCompletion } from '../../services/llmClient.js';
import { aiGateMiddleware } from '../../middleware/aiGate.js';
import {
  getPatientClinicalContext,
  formatContextForPrompt,
} from '../../services/patientContext.js';

// ─── System Prompts ─────────────────────────────────────────────────────────

const GENERIC_SYSTEM_PROMPT = `You are Abby, an AI clinical assistant for the Medgnosis Population Health Management platform.
You help healthcare providers with:
- Patient risk analysis and care gap identification
- Quality measure interpretation (eCQM/MIPS)
- Clinical decision support
- Population health trends

IMPORTANT: This is a clinical decision SUPPORT tool. Never produce definitive diagnoses or replace clinical judgment.
Keep responses concise and clinically relevant.`;

function buildPatientSystemPrompt(patientId: number, contextSummary: string): string {
  return `You are Abby, an AI clinical assistant for the Medgnosis Population Health Management platform.
You are reviewing the chart of Patient #${patientId}.

## Patient Clinical Summary
${contextSummary}

## Your Role
- Answer questions about THIS patient's clinical data shown above
- Highlight relevant care gaps and suggest interventions
- Support quality measure compliance (eCQM/MIPS)
- Flag potential drug interactions or clinical concerns
- Summarize clinical findings when asked

IMPORTANT: This is clinical decision SUPPORT only. Never produce definitive diagnoses or replace clinical judgment.
Keep responses concise (2-3 paragraphs max). Use clinical terminology appropriately.`;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export default async function insightsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // POST /insights/chat — AI assistant chat (server-mediated)
  // Optional patient_id: when provided, injects EHR context into system prompt
  fastify.post(
    '/chat',
    { preHandler: [aiGateMiddleware] },
    async (request, reply) => {
      if (!config.aiInsightsEnabled) {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'AI_DISABLED',
            message: 'AI insights are not enabled. Set AI_INSIGHTS_ENABLED=true.',
          },
        });
      }

      const body = request.body as {
        message: string;
        patient_id?: number;
        history?: { role: 'user' | 'assistant'; content: string }[];
      };

      if (!body.message) {
        return reply.status(400).send({
          success: false,
          error: { code: 'MISSING_MESSAGE', message: 'message is required' },
        });
      }

      // Build system prompt — patient-aware or generic
      let systemPrompt = GENERIC_SYSTEM_PROMPT;
      let contextSummary: string | undefined;

      if (body.patient_id) {
        // Verify patient exists
        const [patient] = await sql`
          SELECT patient_id FROM phm_edw.patient
          WHERE patient_id = ${body.patient_id} AND active_ind = 'Y'
        `;

        if (!patient) {
          return reply.status(404).send({
            success: false,
            error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' },
          });
        }

        // Fetch clinical context and build enriched prompt
        const ctx = await getPatientClinicalContext(body.patient_id);
        contextSummary = formatContextForPrompt(ctx);
        systemPrompt = buildPatientSystemPrompt(body.patient_id, contextSummary);
      }

      // Cap history to last 16 turns to respect token budget
      const trimmedHistory = (body.history ?? []).slice(-16);

      const messages = [
        ...trimmedHistory,
        { role: 'user' as const, content: body.message },
      ];

      const result = await generateChat(systemPrompt, messages, {
        maxTokens: body.patient_id ? 768 : 1024,
        temperature: 0.3,
      });

      return reply.send({
        success: true,
        data: {
          response: result.text,
          model: result.modelId,
          provider: result.provider,
          usage: {
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
          },
          ...(contextSummary ? { context_summary: contextSummary } : {}),
        },
      });
    },
  );

  // POST /insights/morning-briefing — AI-generated clinician morning briefing
  fastify.post(
    '/morning-briefing',
    { preHandler: [aiGateMiddleware] },
    async (request, reply) => {
      if (!config.aiInsightsEnabled) {
        return reply.status(503).send({
          success: false,
          error: { code: 'AI_DISABLED', message: 'AI insights are not enabled.' },
        });
      }

      type R = Record<string, unknown>;

      // Provider scoping: filter to logged-in provider's panel; admin sees all
      const providerId = request.user.provider_id;
      const scoped = providerId !== undefined;

      // Fetch high-risk patients, schedule count, and critical alerts in parallel
      const [highRiskPatients, scheduleResult, alertResult] = await Promise.all([
        // Top 5 high-priority patients from star schema — scoped by provider_key
        sql`
          SELECT
            dp.first_name || ' ' || dp.last_name AS patient_name,
            fpc.age,
            fpc.gender,
            fpc.risk_tier,
            fpc.abigail_priority_score,
            fpc.worst_bundle_code,
            fpc.worst_bundle_pct,
            fpc.chronic_condition_count,
            fpc.overall_compliance_pct
          FROM phm_star.fact_patient_composite fpc
          JOIN phm_star.dim_patient dp ON dp.patient_key = fpc.patient_key
          WHERE fpc.risk_tier IN ('Critical', 'High')
            ${scoped ? sql`AND fpc.provider_key = (
                SELECT provider_key FROM phm_star.dim_provider
                WHERE provider_id = ${providerId} LIMIT 1
              )` : sql``}
          ORDER BY fpc.abigail_priority_score DESC NULLS LAST
          LIMIT 5
        `.catch((err) => {
          fastify.log.error({ err }, 'Morning briefing: high-risk query failed');
          return [];
        }),

        // Today's schedule count — scoped to provider's own appointments
        // Range predicate avoids ::date cast so index on encounter_datetime is usable
        sql<{ count: number }[]>`
          SELECT COUNT(*)::int AS count
          FROM phm_edw.encounter
          WHERE active_ind = 'Y'
            AND encounter_datetime >= CURRENT_DATE::timestamp
            AND encounter_datetime <  (CURRENT_DATE + 1)::timestamp
            ${scoped ? sql`AND provider_id = ${providerId}` : sql``}
        `.catch(() => [{ count: 0 }]),

        // Critical alert count — scoped to provider's patients
        sql<{ count: number }[]>`
          SELECT COUNT(*)::int AS count
          FROM public.clinical_alerts ca
          ${scoped ? sql`LEFT JOIN phm_edw.patient p ON p.patient_id = ca.patient_id` : sql``}
          WHERE ca.acknowledged_at IS NULL
            AND ca.auto_resolved = FALSE
            AND ca.severity = 'critical'
            ${scoped ? sql`AND (ca.patient_id IS NULL OR p.pcp_provider_id = ${providerId})` : sql``}
        `.catch(() => [{ count: 0 }]),
      ]);

      const scheduleCount = (scheduleResult as { count: number }[])[0]?.count ?? 0;
      const criticalAlerts = (alertResult as { count: number }[])[0]?.count ?? 0;
      const patients = highRiskPatients as R[];

      // Build patient summary lines for the prompt
      const patientLines = patients.length > 0
        ? patients.map((p) =>
            `- ${p.patient_name}, ${p.age}y ${p.gender}, Risk: ${p.risk_tier}, ` +
            `Priority: ${p.abigail_priority_score ?? 'N/A'}/100, ` +
            `Worst Bundle: ${p.worst_bundle_code ?? 'N/A'} (${p.worst_bundle_pct ?? 'N/A'}% compliance), ` +
            `${p.chronic_condition_count ?? 0} chronic conditions`,
          ).join('\n')
        : '- No high-risk patients flagged today';

      const userName = request.user.email?.split('@')[0] ?? 'Doctor';
      const todayStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });

      const prompt = `You are Abby, the AI clinical assistant for Dr. ${userName}.
Generate a concise morning briefing (2-3 short paragraphs) based on this clinical data:

Today's Date: ${todayStr}
Scheduled Visits: ${scheduleCount}
Critical Alerts: ${criticalAlerts}
High-Risk Patients Requiring Attention:
${patientLines}

Focus on:
1. Which patients need the most urgent attention today and why
2. Key care gaps or compliance concerns to address
3. A brief encouraging note for the day

Keep it concise and actionable. Use clinical language appropriate for a physician.`;

      try {
        const result = await generateCompletion(prompt, {
          maxTokens: 512,
          temperature: 0.4,
        });

        return reply.send({
          success: true,
          data: {
            briefing: result.text,
            generated_at: new Date().toISOString(),
            high_risk_count: patients.length,
            schedule_count: scheduleCount,
            critical_alerts: criticalAlerts,
          },
        });
      } catch (err) {
        fastify.log.error({ err }, 'Morning briefing: LLM generation failed');
        return reply.status(503).send({
          success: false,
          error: { code: 'LLM_UNAVAILABLE', message: 'AI service is temporarily unavailable.' },
        });
      }
    },
  );
}
