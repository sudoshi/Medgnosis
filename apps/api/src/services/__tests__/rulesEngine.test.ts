// =============================================================================
// Unit tests — Clinical Rules Engine
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @medgnosis/db — intercept every SQL tagged-template call
// ---------------------------------------------------------------------------

type SqlRow = Record<string, unknown>;

// vi.hoisted: initialise the mock fn before the hoisted vi.mock factory runs,
// avoiding the temporal-dead-zone error under the current vitest version.
const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>>();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, {
    unsafe: vi.fn().mockResolvedValue([]),
  }),
}));

// Import AFTER mocking
import {
  evaluate,
  getNumericThreshold,
  getValueSet,
  explain,
  type ClinicalRuleRow,
} from '../rulesEngine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ruleRow(overrides: Partial<ClinicalRuleRow> = {}): ClinicalRuleRow {
  return {
    rule_id: 1,
    entity: 'ALERT_THRESHOLDS',
    attribute: 'CARE_GAP_WARNING_DAYS',
    value_text: null,
    value_numeric: null,
    value_jsonb: null,
    unit: null,
    display_order: 0,
    effective_date: '2026-01-01',
    expiration_date: null,
    source: 'test',
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// evaluate
// ---------------------------------------------------------------------------

describe('evaluate', () => {
  it('returns the rows the query produces', async () => {
    const rows = [ruleRow({ value_numeric: '14' })];
    mockSql.mockResolvedValueOnce(rows);

    const result = await evaluate('ALERT_THRESHOLDS', 'CARE_GAP_WARNING_DAYS');
    expect(result).toEqual(rows);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('passes entity, attribute, and asOf to the query as parameters', async () => {
    mockSql.mockResolvedValueOnce([]);
    await evaluate('MEWS', 'SCORING_BAND', '2025-01-01');

    const [, ...params] = mockSql.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(params).toContain('MEWS');
    expect(params).toContain('SCORING_BAND');
    expect(params).toContain('2025-01-01');
  });
});

// ---------------------------------------------------------------------------
// getNumericThreshold
// ---------------------------------------------------------------------------

describe('getNumericThreshold', () => {
  it('parses the postgres NUMERIC string into a number', async () => {
    mockSql.mockResolvedValueOnce([ruleRow({ value_numeric: '0.05' })]);
    const v = await getNumericThreshold('ALERT_THRESHOLDS', 'POPULATION_DRIFT_THRESHOLD', 999);
    expect(v).toBe(0.05);
  });

  it('falls back when no rule exists', async () => {
    mockSql.mockResolvedValueOnce([]);
    const v = await getNumericThreshold('ALERT_THRESHOLDS', 'CARE_GAP_WARNING_DAYS', 14);
    expect(v).toBe(14);
  });

  it('falls back when the query throws (table unreachable never breaks the consumer)', async () => {
    mockSql.mockRejectedValueOnce(new Error('connection refused'));
    const v = await getNumericThreshold('ALERT_THRESHOLDS', 'CARE_GAP_WARNING_DAYS', 30);
    expect(v).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// getValueSet
// ---------------------------------------------------------------------------

describe('getValueSet', () => {
  it('maps value_text and drops null entries', async () => {
    mockSql.mockResolvedValueOnce([
      ruleRow({ value_text: 'N18.4' }),
      ruleRow({ value_text: null }),
      ruleRow({ value_text: 'N18.5' }),
    ]);
    const set = await getValueSet('CKD', 'INCLUSION');
    expect(set).toEqual(['N18.4', 'N18.5']);
  });
});

// ---------------------------------------------------------------------------
// explain
// ---------------------------------------------------------------------------

describe('explain', () => {
  it('returns the transparency shape with current marker when no asOf', async () => {
    const rows = [ruleRow({ value_numeric: '300' })];
    mockSql.mockResolvedValueOnce(rows);

    const result = await explain('GLUCOMETRICS', 'HIGH_RISK_SINGLE_MGDL');
    expect(result).toEqual({
      entity: 'GLUCOMETRICS',
      attribute: 'HIGH_RISK_SINGLE_MGDL',
      as_of: 'current',
      rules: rows,
    });
  });

  it('echoes the asOf date when provided', async () => {
    mockSql.mockResolvedValueOnce([]);
    const result = await explain('CKD_STAGING', 'GFR_BAND', '2013-01-01');
    expect(result.as_of).toBe('2013-01-01');
  });
});
