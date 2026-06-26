// =============================================================================
// Unit tests — deterministic, PHI-safe population summary
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable mock config so each test can flip the BAA/provider gates. Declared via
// vi.hoisted so the (hoisted) vi.mock factory can safely close over it.
const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    aiInsightsEnabled: false,
    aiProvider: 'ollama' as 'ollama' | 'anthropic',
    anthropicBaaSigned: false,
  },
}));
vi.mock('../config.js', () => ({ config: mockConfig }));

import {
  buildPopulationSummary,
  enrichWithNarrative,
  isLlmNarrativeEnabled,
  PopulationSummaryLlmNotEnabledError,
  POPULATION_SUMMARY_INSIGHT_TYPE,
  POPULATION_SCOPE_PATIENT_ID,
  type PopulationSummaryResult,
  type SqlTag,
} from './populationSummary.js';

// ---------------------------------------------------------------------------
// SQL stub — routes each tagged-template query by its text fingerprint and
// returns fixed aggregate rows. Nested fragments (provider scope) resolve to a
// sentinel object so the outer query can still be fingerprinted.
// ---------------------------------------------------------------------------

function fakeSql(rows: {
  tiers: { risk_tier: string | null; tier_count: number }[];
  gaps: { category: string | null; open_gap_count: number }[];
}): SqlTag {
  const tag = ((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join(' ');
    if (text.includes('fact_patient_composite')) {
      return Promise.resolve(rows.tiers);
    }
    if (text.includes('care_gap')) {
      return Promise.resolve(rows.gaps);
    }
    // Nested fragment (provider scope / empty sql``) — not awaited as a result.
    return Promise.resolve([]);
  }) as unknown as SqlTag;
  return tag;
}

const FIXED_NOW = new Date('2026-06-26T12:00:00.000Z');

beforeEach(() => {
  mockConfig.aiInsightsEnabled = false;
  mockConfig.aiProvider = 'ollama';
  mockConfig.anthropicBaaSigned = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildPopulationSummary — deterministic aggregate', () => {
  it('produces a stable summary for a sample cohort', async () => {
    const sql = fakeSql({
      tiers: [
        { risk_tier: 'Critical', tier_count: 3 },
        { risk_tier: 'High', tier_count: 7 },
        { risk_tier: 'Medium', tier_count: 12 },
        { risk_tier: 'Low', tier_count: 20 },
      ],
      gaps: [
        { category: 'Diabetes A1c Control', open_gap_count: 14 },
        { category: 'Hypertension BP Control', open_gap_count: 9 },
        { category: 'Colorectal Cancer Screening', open_gap_count: 4 },
      ],
    });

    const result = await buildPopulationSummary({}, { sql, now: () => FIXED_NOW });

    expect(result.schemaVersion).toBe(1);
    expect(result.scope).toEqual({ providerId: null });
    expect(result.generatedAt).toBe(FIXED_NOW.toISOString());
    expect(result.patientCount).toBe(42);
    expect(result.riskTierDistribution).toEqual([
      { tier: 'Critical', count: 3 },
      { tier: 'High', count: 7 },
      { tier: 'Medium', count: 12 },
      { tier: 'Low', count: 20 },
    ]);
    expect(result.openCareGapTotal).toBe(27);
    expect(result.topOpenCareGapCategories[0]).toEqual({
      category: 'Diabetes A1c Control',
      openGapCount: 14,
    });
  });

  it('always returns all four tiers (zero-filled) and folds legacy casing', async () => {
    const sql = fakeSql({
      tiers: [
        { risk_tier: 'critical', tier_count: 1 }, // lowercase legacy
        { risk_tier: 'moderate', tier_count: 5 }, // riskScoring band → Medium
        { risk_tier: null, tier_count: 99 }, // null dropped
      ],
      gaps: [],
    });

    const result = await buildPopulationSummary({}, { sql, now: () => FIXED_NOW });

    expect(result.riskTierDistribution).toEqual([
      { tier: 'Critical', count: 1 },
      { tier: 'High', count: 0 },
      { tier: 'Medium', count: 5 },
      { tier: 'Low', count: 0 },
    ]);
    expect(result.patientCount).toBe(6); // null row excluded
  });

  it('caps top care-gap categories to the requested count', async () => {
    const sql = fakeSql({
      tiers: [{ risk_tier: 'Low', tier_count: 1 }],
      gaps: [
        { category: 'A', open_gap_count: 5 },
        { category: 'B', open_gap_count: 4 },
        { category: 'C', open_gap_count: 3 },
        { category: 'D', open_gap_count: 2 },
      ],
    });

    const result = await buildPopulationSummary(
      { topGapCategories: 2 },
      { sql, now: () => FIXED_NOW },
    );

    expect(result.topOpenCareGapCategories).toHaveLength(2);
    expect(result.topOpenCareGapCategories.map((g) => g.category)).toEqual(['A', 'B']);
    expect(result.openCareGapTotal).toBe(14); // total spans ALL categories, not just top-N
  });

  it('threads provider scope through to the queries', async () => {
    const spy = vi.fn((strings: TemplateStringsArray) => {
      const text = strings.join(' ');
      if (text.includes('fact_patient_composite')) {
        return Promise.resolve([{ risk_tier: 'High', tier_count: 2 }]);
      }
      if (text.includes('care_gap')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const sql = spy as unknown as SqlTag;

    const result = await buildPopulationSummary(
      { providerId: 7 },
      { sql, now: () => FIXED_NOW },
    );

    expect(result.scope).toEqual({ providerId: 7 });
    // Provider-scoped run interpolates the dim_provider sub-select + pcp join.
    const calledTexts = spy.mock.calls.map((c) => (c[0] as TemplateStringsArray).join(' '));
    expect(calledTexts.some((t) => t.includes('dim_provider'))).toBe(true);
    expect(calledTexts.some((t) => t.includes('pcp_provider_id'))).toBe(true);
  });

  it('emits NO patient identifiers anywhere in the output (PHI policy)', async () => {
    const sql = fakeSql({
      tiers: [{ risk_tier: 'Critical', tier_count: 2 }],
      gaps: [{ category: 'Diabetes A1c Control', open_gap_count: 3 }],
    });

    const result = await buildPopulationSummary({ providerId: 9 }, { sql, now: () => FIXED_NOW });

    const serialized = JSON.stringify(result).toLowerCase();
    for (const forbidden of [
      'patient_id',
      'patientid',
      'first_name',
      'last_name',
      'mrn',
      'date_of_birth',
      'dob',
      'ssn',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // The only keys present are aggregate/category fields.
    expect(Object.keys(result).sort()).toEqual(
      [
        'generatedAt',
        'openCareGapTotal',
        'patientCount',
        'riskTierDistribution',
        'schemaVersion',
        'scope',
        'topOpenCareGapCategories',
      ].sort(),
    );
  });
});

describe('LLM narrative enrichment gate (defaults OFF)', () => {
  const baseSummary: PopulationSummaryResult = {
    schemaVersion: 1,
    scope: { providerId: null },
    generatedAt: FIXED_NOW.toISOString(),
    patientCount: 1,
    riskTierDistribution: [{ tier: 'Low', count: 1 }],
    topOpenCareGapCategories: [],
    openCareGapTotal: 0,
  };

  it('is disabled by default (aiInsightsEnabled=false)', () => {
    expect(isLlmNarrativeEnabled()).toBe(false);
  });

  it('throws a typed not-enabled error when AI insights are disabled', () => {
    expect(() => enrichWithNarrative(baseSummary)).toThrow(PopulationSummaryLlmNotEnabledError);
    try {
      enrichWithNarrative(baseSummary);
    } catch (err) {
      expect((err as PopulationSummaryLlmNotEnabledError).code).toBe(
        'POPULATION_SUMMARY_LLM_NOT_ENABLED',
      );
    }
  });

  it('throws when the Anthropic (cloud) provider has no signed BAA', () => {
    mockConfig.aiInsightsEnabled = true;
    mockConfig.aiProvider = 'anthropic';
    mockConfig.anthropicBaaSigned = false;

    expect(isLlmNarrativeEnabled()).toBe(false);
    expect(() => enrichWithNarrative(baseSummary)).toThrow(/signed BAA/);
  });

  it('permits the gate once Anthropic has a signed BAA, but never calls an external API', () => {
    mockConfig.aiInsightsEnabled = true;
    mockConfig.aiProvider = 'anthropic';
    mockConfig.anthropicBaaSigned = true;

    expect(isLlmNarrativeEnabled()).toBe(true);
    // Enabled BAA path is a no-op stub — returns undefined, makes no network call.
    expect(enrichWithNarrative(baseSummary)).toBeUndefined();
  });
});

describe('storage-target constants', () => {
  it('persists population summaries to an allowed ai_insights insight_type', () => {
    expect(POPULATION_SUMMARY_INSIGHT_TYPE).toBe('weekly_summary');
  });

  it('uses the population sentinel patient_id (non-PHI marker)', () => {
    expect(POPULATION_SCOPE_PATIENT_ID).toBe(0);
  });
});
