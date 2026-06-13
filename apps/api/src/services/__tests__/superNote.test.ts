// =============================================================================
// Unit tests — SuperNote assembly (pure helpers)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});
vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, { unsafe: vi.fn(), json: (v: unknown) => v }),
}));

import { organSystemRank, groupProblems, whatsDue, briefHistory, type ProblemRow } from '../superNote.js';

describe('organSystemRank', () => {
  it('ranks high-impact systems before Other', () => {
    expect(organSystemRank('Cardiovascular')).toBeLessThan(organSystemRank('Other'));
    expect(organSystemRank('Renal')).toBeLessThan(organSystemRank('Pulmonary'));
    expect(organSystemRank('Unknown thing')).toBe(organSystemRank('Other'));
  });
});

describe('groupProblems', () => {
  const rows: ProblemRow[] = [
    { icd10_code: 'I50.32', dx_name: 'Diastolic HF', organ_system: 'Cardiovascular', disease_process: 'Heart Failure', generate_plan: true },
    { icd10_code: 'E11.22', dx_name: 'DM2 w/ CKD', organ_system: 'Renal', disease_process: 'CKD', generate_plan: true },
    { icd10_code: 'E11.22', dx_name: 'DM2 w/ CKD', organ_system: 'Endocrine', disease_process: 'Chronic Diabetes', generate_plan: true },
    { icd10_code: 'I50.32', dx_name: 'Diastolic HF', organ_system: 'Cardiovascular', disease_process: 'Heart Failure', generate_plan: true }, // dup
  ];

  it('groups by organ system, ordered by rank', () => {
    const groups = groupProblems(rows);
    expect(groups.map((g) => g.organ_system)).toEqual(['Cardiovascular', 'Renal', 'Endocrine']);
  });

  it('dual-mapped code appears under both systems', () => {
    const groups = groupProblems(rows);
    const renal = groups.find((g) => g.organ_system === 'Renal');
    const endo = groups.find((g) => g.organ_system === 'Endocrine');
    expect(renal?.problems.some((p) => p.icd10_code === 'E11.22')).toBe(true);
    expect(endo?.problems.some((p) => p.icd10_code === 'E11.22')).toBe(true);
  });

  it('dedupes identical code within a system', () => {
    const cardiac = groupProblems(rows).find((g) => g.organ_system === 'Cardiovascular');
    expect(cardiac?.problems).toHaveLength(1);
  });
});

describe('whatsDue', () => {
  it('names open-gap measures', () => {
    expect(whatsDue([{ measure_name: 'HbA1c' }, { measure_name: 'Eye exam' }])).toMatch(/A1c/i);
    expect(whatsDue([{ measure_name: 'HbA1c' }, { measure_name: 'Eye exam' }])).toMatch(/eye exam/i);
  });
  it('says up to date when no gaps', () => {
    expect(whatsDue([])).toMatch(/up to date/i);
  });
});

describe('briefHistory', () => {
  it('produces a deterministic sentence with name, age, conditions, last-seen, due', () => {
    const h = briefHistory(
      { first_name: 'Super', last_name: 'Bean', age: 72, gender: 'male' },
      [{ dx_name: 'CAD', organ_system: 'Cardiovascular' }, { dx_name: 'COPD', organ_system: 'Pulmonary' }],
      '2025-05-14',
      'due for: A1c',
    );
    expect(h).toMatch(/Super Bean/);
    expect(h).toMatch(/72/);
    expect(h).toMatch(/CAD/);
    expect(h).toMatch(/2025-05-14/);
    expect(h).toMatch(/A1c/);
  });
});
