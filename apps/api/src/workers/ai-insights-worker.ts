// =============================================================================
// Medgnosis API — AI Insights Worker (BullMQ)
// Processes AI inference jobs for clinical decision support.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { sql } from '@medgnosis/db';
import { config } from '../config.js';
import { connection } from './rules-engine.js';
import { generateCompletion, computeCostCents } from '../services/llmClient.js';
import { computeRiskScore, persistRiskScore } from '../services/riskScoring.js';
import {
  buildPopulationSummary,
  POPULATION_SUMMARY_INSIGHT_TYPE,
  POPULATION_SCOPE_PATIENT_ID,
  type PopulationSummaryScope,
  type SqlTag,
} from '../services/populationSummary.js';

export const AI_INSIGHTS_QUEUE_NAME = 'medgnosis-ai-insights';

export const aiInsightsQueue = new Queue(AI_INSIGHTS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
  },
});

export type InsightJobType =
  | 'risk_stratification'
  | 'care_gap_analysis'
  | 'population_summary';

export interface InsightJobData {
  patientId: string;
  type: InsightJobType;
  // Population-level scope for 'population_summary' jobs. Ignored by the
  // patient-scoped job types. When absent the summary covers the whole panel.
  scope?: PopulationSummaryScope;
}

async function processInsightJob(job: { data: InsightJobData }): Promise<void> {
  const { patientId, type } = job.data;

  if (type === 'risk_stratification') {
    const result = await computeRiskScore(patientId);
    await persistRiskScore(patientId, result);
    return;
  }

  // Deterministic, PHI-safe population aggregate. Runs UNCONDITIONALLY — it does
  // not call an LLM, so it must not be gated behind the BAA/provider checks below.
  if (type === 'population_summary') {
    await runPopulationSummary(job.data);
    return;
  }

  if (!config.aiInsightsEnabled) return;
  // Ollama (local inference) doesn't require a BAA; Anthropic (cloud) does
  if (config.aiProvider === 'anthropic' && !config.anthropicBaaSigned) return;

  if (type === 'care_gap_analysis') {
    const gaps = await sql`
      SELECT md.measure_name, cg.gap_status, cg.identified_date
      FROM phm_edw.care_gap cg
      LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      WHERE cg.patient_id = ${patientId}::int AND cg.active_ind = 'Y'
    `;

    if (gaps.length === 0) return;

    const prompt = `You are a population health clinical analyst. Analyze the following care gaps for patient ${patientId} and provide prioritized recommendations.

Care gaps:
${gaps.map((g) => `- ${g.measure_name}: ${g.gap_status} (identified: ${g.identified_date})`).join('\n')}

Respond with JSON: { "priority_actions": [...], "summary": "..." }`;

    const result = await generateCompletion(prompt, { maxTokens: 512, jsonMode: true });
    const cost = computeCostCents(result);

    await sql`
      INSERT INTO ai_insights (patient_id, insight_type, content, model_id, provider, input_tokens, output_tokens, cost_cents)
      VALUES (${patientId}::int, 'care_recommendation', ${result.text}, ${result.modelId}, ${result.provider}, ${result.inputTokens}, ${result.outputTokens}, ${cost})
    `;
  }
}

/**
 * Compute and persist a deterministic population summary for the job's scope.
 * Exported for unit testing; the live worker calls it via processInsightJob.
 */
export async function runPopulationSummary(data: InsightJobData): Promise<void> {
  const summary = await buildPopulationSummary(data.scope ?? {}, {
    sql: sql as unknown as SqlTag,
  });
  await persistPopulationSummary(summary);
}

async function persistPopulationSummary(
  summary: Awaited<ReturnType<typeof buildPopulationSummary>>,
): Promise<void> {
  // Population summaries are aggregate (non-PHI) and require no LLM, so they
  // persist as a local-provider row keyed on the population sentinel patient_id.
  await sql`
    INSERT INTO ai_insights (patient_id, insight_type, content, model_id, provider, input_tokens, output_tokens, cost_cents)
    VALUES (
      ${POPULATION_SCOPE_PATIENT_ID}::int,
      ${POPULATION_SUMMARY_INSIGHT_TYPE},
      ${JSON.stringify(summary)},
      'deterministic-aggregate',
      'ollama',
      0,
      0,
      0
    )
  `;
}

export function startAiInsightsWorker(): Worker<InsightJobData> {
  const worker = new Worker<InsightJobData>(
    AI_INSIGHTS_QUEUE_NAME,
    processInsightJob,
    { connection, concurrency: 2 },
  );

  worker.on('completed', (job) => {
    console.info(`[ai-insights] Job ${job.id} completed — ${job.data.type}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ai-insights] Job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}
