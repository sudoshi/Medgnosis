// =============================================================================
// Unit tests — Risk Scoring Service
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @medgnosis/db — intercept every SQL tagged-template call
// ---------------------------------------------------------------------------

type SqlRow = Record<string, unknown>;
const mockSql = vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>>();
mockSql.mockResolvedValue([]);

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, {
    unsafe: vi.fn().mockResolvedValue([]),
  }),
}));

// Import AFTER mocking
import { computeRiskScore, type RiskScoreResult } from '../riskScoring.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configure mock responses for each factor evaluation query.
 * The service runs 7 queries in parallel (Promise.all), so the mock
 * receives calls in a non-deterministic order. We match on SQL content.
 */
function configureMocks(overrides: {
  age?: number | null;
  activeConditions?: number;
  vitals?: Array<{ observation_code: string; value_numeric: number }>;
  abnormalLabs?: number;
  openGaps?: number;
  encounters?: number;
  activeMeds?: number;
} = {}): void {
  const {
    age = 45,
    activeConditions = 0,
    vitals = [],
    abnormalLabs = 0,
    openGaps = 0,
    encounters = 3,
    activeMeds = 1,
  } = overrides;

  mockSql.mockImplementation(((strings: TemplateStringsArray) => {
    const query = strings.join('');

    if (query.includes('EXTRACT(YEAR FROM AGE')) {
      return Promise.resolve([{ age }]);
    }
    if (query.includes('condition_diagnosis')) {
      return Promise.resolve([{ active_count: activeConditions }]);
    }
    if (query.includes('observation_code IN')) {
      return Promise.resolve(vitals);
    }
    if (query.includes('abnormal_flag')) {
      return Promise.resolve([{ abnormal_count: abnormalLabs }]);
    }
    if (query.includes('care_gap')) {
      return Promise.resolve([{ open_gaps: openGaps }]);
    }
    if (query.includes('encounter')) {
      return Promise.resolve([{ encounter_count: encounters }]);
    }
    if (query.includes('medication_order')) {
      return Promise.resolve([{ med_count: activeMeds }]);
    }

    return Promise.resolve([]);
  }) as typeof mockSql);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeRiskScore', () => {
  it('returns a score between 0 and 100', async () => {
    configureMocks();
    const result = await computeRiskScore('1');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns all 7 risk factors', async () => {
    configureMocks();
    const result = await computeRiskScore('1');
    expect(result.factors).toHaveLength(7);

    const rules = result.factors.map((f) => f.rule);
    expect(rules).toContain('AGE_RISK');
    expect(rules).toContain('CONDITION_BURDEN');
    expect(rules).toContain('VITAL_SIGNS');
    expect(rules).toContain('LAB_ABNORMALITIES');
    expect(rules).toContain('CARE_GAPS');
    expect(rules).toContain('ENCOUNTER_FREQUENCY');
    expect(rules).toContain('MEDICATION_COMPLEXITY');
  });

  it('includes computed_at as a valid ISO date', async () => {
    configureMocks();
    const result = await computeRiskScore('1');
    expect(new Date(result.computed_at).toISOString()).toBe(result.computed_at);
  });

  // -------------------------------------------------------------------------
  // Band classification
  // -------------------------------------------------------------------------

  describe('risk band classification', () => {
    it('returns "low" when score < 25', async () => {
      configureMocks({ age: 30, activeConditions: 0, encounters: 3, activeMeds: 0 });
      const result = await computeRiskScore('1');
      expect(result.band).toBe('low');
    });

    it('returns "moderate" when score is 25-49', async () => {
      // Age >= 65 → 15, 2 conditions → 12 = 27
      configureMocks({ age: 67, activeConditions: 2, encounters: 3 });
      const result = await computeRiskScore('1');
      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(result.score).toBeLessThan(50);
      expect(result.band).toBe('moderate');
    });

    it('returns "high" when score is 50-74', async () => {
      // Age >= 80 → 20, 5+ conditions → 25, 1+ gaps → 5 = 50
      configureMocks({ age: 82, activeConditions: 5, openGaps: 1, encounters: 3 });
      const result = await computeRiskScore('1');
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.score).toBeLessThan(75);
      expect(result.band).toBe('high');
    });

    it('returns "critical" when score >= 75', async () => {
      configureMocks({
        age: 85,
        activeConditions: 5,
        vitals: [
          { observation_code: 'systolic_bp', value_numeric: 190 },
          { observation_code: 'bmi', value_numeric: 42 },
        ],
        abnormalLabs: 6,
        openGaps: 5,
        encounters: 15,
        activeMeds: 12,
      });
      const result = await computeRiskScore('1');
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.band).toBe('critical');
    });
  });

  // -------------------------------------------------------------------------
  // Individual factor logic
  // -------------------------------------------------------------------------

  describe('age factor (F01)', () => {
    it('assigns 0 for healthy middle-aged patient', async () => {
      configureMocks({ age: 30 });
      const result = await computeRiskScore('1');
      const ageFactor = result.factors.find((f) => f.rule === 'AGE_RISK')!;
      expect(ageFactor.contribution).toBe(0);
    });

    it('assigns 12 for infant (< 2 years)', async () => {
      configureMocks({ age: 1 });
      const result = await computeRiskScore('1');
      const ageFactor = result.factors.find((f) => f.rule === 'AGE_RISK')!;
      expect(ageFactor.contribution).toBe(12);
    });

    it('assigns 20 for patient aged >= 80', async () => {
      configureMocks({ age: 85 });
      const result = await computeRiskScore('1');
      const ageFactor = result.factors.find((f) => f.rule === 'AGE_RISK')!;
      expect(ageFactor.contribution).toBe(20);
    });

    it('handles null age gracefully (defaults to 0)', async () => {
      configureMocks({ age: null });
      const result = await computeRiskScore('1');
      const ageFactor = result.factors.find((f) => f.rule === 'AGE_RISK')!;
      // null age → 0 → falls into < 2 bracket
      expect(ageFactor.contribution).toBe(12);
    });
  });

  describe('encounter frequency (F06)', () => {
    it('flags zero utilization with contribution 10', async () => {
      configureMocks({ encounters: 0 });
      const result = await computeRiskScore('1');
      const factor = result.factors.find((f) => f.rule === 'ENCOUNTER_FREQUENCY')!;
      expect(factor.contribution).toBe(10);
    });

    it('flags high utilization (>= 12) with contribution 15', async () => {
      configureMocks({ encounters: 14 });
      const result = await computeRiskScore('1');
      const factor = result.factors.find((f) => f.rule === 'ENCOUNTER_FREQUENCY')!;
      expect(factor.contribution).toBe(15);
    });
  });

  describe('medication complexity (F07)', () => {
    it('flags polypharmacy (>= 10 meds) with contribution 15', async () => {
      configureMocks({ activeMeds: 12 });
      const result = await computeRiskScore('1');
      const factor = result.factors.find((f) => f.rule === 'MEDICATION_COMPLEXITY')!;
      expect(factor.contribution).toBe(15);
    });
  });

  // -------------------------------------------------------------------------
  // Capping
  // -------------------------------------------------------------------------

  describe('score capping', () => {
    it('caps score at 100 even when raw exceeds 100', async () => {
      configureMocks({
        age: 85,
        activeConditions: 5,
        vitals: [
          { observation_code: 'systolic_bp', value_numeric: 200 },
          { observation_code: 'bmi', value_numeric: 45 },
          { observation_code: 'heart_rate', value_numeric: 130 },
        ],
        abnormalLabs: 10,
        openGaps: 8,
        encounters: 20,
        activeMeds: 15,
      });
      const result = await computeRiskScore('1');
      expect(result.score).toBe(100);
      expect(result.raw_score).toBeGreaterThan(100);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty DB rows (all queries return empty)', async () => {
      mockSql.mockResolvedValue([]);
      const result = await computeRiskScore('999');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.factors).toHaveLength(7);
    });

    it('each factor has required shape', async () => {
      configureMocks();
      const result = await computeRiskScore('1');
      for (const f of result.factors) {
        expect(f).toHaveProperty('rule');
        expect(f).toHaveProperty('label');
        expect(f).toHaveProperty('weight');
        expect(f).toHaveProperty('contribution');
        expect(f).toHaveProperty('detail');
        expect(typeof f.rule).toBe('string');
        expect(typeof f.contribution).toBe('number');
        expect(f.contribution).toBeGreaterThanOrEqual(0);
        expect(f.contribution).toBeLessThanOrEqual(f.weight);
      }
    });
  });
});
