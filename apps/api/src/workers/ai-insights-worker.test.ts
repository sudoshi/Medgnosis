// =============================================================================
// Unit tests — AI insights worker: population_summary job path
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

// BullMQ constructs a Queue at module load — stub it so no Redis is touched.
vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn();
  },
  Worker: class {
    on = vi.fn();
  },
}));

// rules-engine exports the redis `connection` object the queue is built with.
vi.mock('./rules-engine.js', () => ({ connection: { host: 'localhost', port: 6379 } }));

// Deterministic path must run even with the LLM gates off (the default here).
vi.mock('../config.js', () => ({
  config: { aiInsightsEnabled: false, aiProvider: 'ollama', anthropicBaaSigned: false },
}));

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

// Risk-scoring + llmClient are unrelated to this path; stub to keep imports cheap.
vi.mock('../services/riskScoring.js', () => ({
  computeRiskScore: vi.fn(),
  persistRiskScore: vi.fn(),
}));
vi.mock('../services/llmClient.js', () => ({
  generateCompletion: vi.fn(),
  computeCostCents: vi.fn(),
}));

import { runPopulationSummary } from './ai-insights-worker.js';

beforeEach(() => {
  mockSql.mockReset();
});

describe('runPopulationSummary', () => {
  it('computes a deterministic summary and persists it to ai_insights with no PHI', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join(' ');
      if (text.includes('fact_patient_composite')) {
        return Promise.resolve([
          { risk_tier: 'Critical', tier_count: 2 },
          { risk_tier: 'High', tier_count: 5 },
        ]);
      }
      if (text.includes('care_gap')) {
        return Promise.resolve([{ category: 'Diabetes A1c Control', open_gap_count: 8 }]);
      }
      // INSERT INTO ai_insights ... (and nested fragments)
      return Promise.resolve([]);
    });

    await runPopulationSummary({ patientId: '0', type: 'population_summary' });

    const insertCall = mockSql.mock.calls.find((c) =>
      (c[0] as TemplateStringsArray).join(' ').includes('INSERT INTO ai_insights'),
    );
    expect(insertCall).toBeDefined();

    // The serialized summary is interpolated as a value; assert it carries the
    // aggregate fields and no patient identifiers.
    const values = (insertCall ?? []).slice(1) as unknown[];
    const jsonPayload = values.find(
      (v): v is string => typeof v === 'string' && v.includes('riskTierDistribution'),
    );
    expect(jsonPayload).toBeDefined();
    const parsed = JSON.parse(jsonPayload as string) as Record<string, unknown>;
    expect(parsed['patientCount']).toBe(7);
    expect(parsed['schemaVersion']).toBe(1);

    const lowered = (jsonPayload as string).toLowerCase();
    for (const forbidden of ['patient_id', 'first_name', 'last_name', 'mrn']) {
      expect(lowered).not.toContain(forbidden);
    }

    // Persisted as the population sentinel (0) — an interpolated value — and
    // tagged as a local, zero-cost deterministic aggregate (SQL-text literals).
    expect(values).toContain(0);
    const insertText = (insertCall?.[0] as TemplateStringsArray).join(' ');
    expect(insertText).toContain("'deterministic-aggregate'");
    expect(insertText).toContain("'ollama'");
  });

  it('passes provider scope through to the summary queries', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join(' ');
      if (text.includes('fact_patient_composite')) {
        return Promise.resolve([{ risk_tier: 'High', tier_count: 1 }]);
      }
      return Promise.resolve([]);
    });

    await runPopulationSummary({
      patientId: '0',
      type: 'population_summary',
      scope: { providerId: 42 },
    });

    const texts = mockSql.mock.calls.map((c) => (c[0] as TemplateStringsArray).join(' '));
    expect(texts.some((t) => t.includes('dim_provider'))).toBe(true);
  });
});
