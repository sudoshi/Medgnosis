// =============================================================================
// Medgnosis API — AI Insights routes
// Server-side AI integration (Anthropic + Ollama)
// Supports generic chat + patient-context chat (when patient_id provided)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { config } from '../../config.js';
import { generateChat } from '../../services/llmClient.js';
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
}
