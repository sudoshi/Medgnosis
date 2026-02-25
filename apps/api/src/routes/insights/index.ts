// =============================================================================
// Medgnosis API — AI Insights routes
// Server-side AI integration (Anthropic + Ollama)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { generateChat } from '../../services/llmClient.js';

export default async function insightsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // POST /insights/chat — AI assistant chat (server-mediated)
  fastify.post('/chat', async (request, reply) => {
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
      history?: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!body.message) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_MESSAGE', message: 'message is required' },
      });
    }

    const systemPrompt = `You are Abby, an AI clinical assistant for the Medgnosis Population Health Management platform.
You help healthcare providers with:
- Patient risk analysis and care gap identification
- Quality measure interpretation (eCQM/MIPS)
- Clinical decision support
- Population health trends

IMPORTANT: This is a clinical decision SUPPORT tool. Never produce definitive diagnoses or replace clinical judgment.
All patient data is de-identified. Refer to patients by ID only.`;

    const messages = [
      ...(body.history ?? []),
      { role: 'user' as const, content: body.message },
    ];

    const result = await generateChat(systemPrompt, messages, {
      maxTokens: 1024,
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
      },
    });
  });
}
