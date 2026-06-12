// =============================================================================
// Unit tests — Population Finder (pure staging logic)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

// Importing the module loads @medgnosis/db (which connects on import); mock it.
// These tests exercise the pure staging mappers only — sql is never called.
const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});
vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, { unsafe: vi.fn(), json: (v: unknown) => v }),
}));

import {
  stageCkdFromGfr,
  classifyObesityFromBmi,
  needsRestage,
  CKD_GENERIC_CODES,
} from '../populationFinder.js';

describe('stageCkdFromGfr', () => {
  it('maps GFR to the correct CKD stage (KDIGO bands)', () => {
    expect(stageCkdFromGfr(95)).toMatchObject({ icd10: 'N18.1' });
    expect(stageCkdFromGfr(75)).toMatchObject({ icd10: 'N18.2' });
    expect(stageCkdFromGfr(52)).toMatchObject({ icd10: 'N18.31' }); // 3a
    expect(stageCkdFromGfr(42)).toMatchObject({ icd10: 'N18.32' }); // 3b
    expect(stageCkdFromGfr(20)).toMatchObject({ icd10: 'N18.4' });
    expect(stageCkdFromGfr(12)).toMatchObject({ icd10: 'N18.5' });
  });

  it('returns a stage_label and a name', () => {
    const s = stageCkdFromGfr(42);
    expect(s?.stage_label).toBe('Stage 3b');
    expect(s?.name).toMatch(/stage 3b/i);
  });

  it('returns null when GFR is not a CKD-staging value (>=90 needs damage; handle as no-stage)', () => {
    // We treat >=90 as N18.1 only when called; a null GFR yields null.
    expect(stageCkdFromGfr(null)).toBeNull();
    expect(stageCkdFromGfr(NaN)).toBeNull();
  });
});

describe('classifyObesityFromBmi', () => {
  it('classifies BMI into obesity bands', () => {
    expect(classifyObesityFromBmi(27)).toMatchObject({ icd10: 'E66.3' });        // overweight
    expect(classifyObesityFromBmi(32)).toMatchObject({ icd10: 'E66.9', stage_label: 'Class I' });
    expect(classifyObesityFromBmi(37)).toMatchObject({ icd10: 'E66.9', stage_label: 'Class II' });
    expect(classifyObesityFromBmi(41)).toMatchObject({ icd10: 'E66.01' });       // Class III
  });

  it('returns null below the overweight threshold', () => {
    expect(classifyObesityFromBmi(23)).toBeNull();
    expect(classifyObesityFromBmi(null)).toBeNull();
  });
});

describe('needsRestage', () => {
  it('is true when the current code is a generic CKD entry and evidence yields a specific stage', () => {
    expect(needsRestage('N18.9', 'N18.32')).toBe(true);
  });

  it('is false when the current code already matches the staged evidence', () => {
    expect(needsRestage('N18.32', 'N18.32')).toBe(false);
  });

  it('is false when the current code is already a specific (non-generic) stage', () => {
    expect(needsRestage('N18.4', 'N18.32')).toBe(false);
  });

  it('exposes the set of generic codes it re-stages', () => {
    expect(CKD_GENERIC_CODES).toContain('N18.9');
  });
});
