// =============================================================================
// Unit tests — SuperNote assembly (pure helpers)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql, mockConfig } = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue([]);
  const cfg = { aiInsightsEnabled: false, anthropicBaaSigned: false, aiProvider: 'ollama' as 'anthropic' | 'ollama' };
  return { mockSql: fn, mockConfig: cfg };
});
vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, { unsafe: vi.fn(), json: (v: unknown) => v }),
}));
vi.mock('../../config.js', () => ({ config: mockConfig }));

import {
  organSystemRank,
  groupProblems,
  whatsDue,
  briefHistory,
  sectionProvenance,
  initialReviewState,
  assertExplicitFinalization,
  finalizationProvenance,
  isSuperNoteNarrativeEnabled,
  enrichSuperNoteNarrative,
  SuperNoteLlmNotEnabledError,
  SUPERNOTE_SOURCES,
  type ProblemRow,
  type SuperNote,
} from '../superNote.js';

beforeEach(() => {
  mockConfig.aiInsightsEnabled = false;
  mockConfig.anthropicBaaSigned = false;
  mockConfig.aiProvider = 'ollama';
});

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

describe('sectionProvenance', () => {
  it('records the structured sources and affirms deterministic, non-AI assembly', () => {
    const p = sectionProvenance(SUPERNOTE_SOURCES.PROBLEM_LIST, SUPERNOTE_SOURCES.MEASURES);
    expect(p.sources).toEqual(['problem_list', 'measures']);
    expect(p.deterministic).toBe(true);
    expect(p.ai_generated).toBe(false);
  });

  it('exposes the canonical structured-source vocabulary the note derives from', () => {
    expect(Object.values(SUPERNOTE_SOURCES)).toEqual(
      expect.arrayContaining(['problem_list', 'medications', 'vitals', 'encounter', 'measures', 'labs', 'demographics']),
    );
  });
});

describe('initialReviewState (review-status defaults)', () => {
  it('defaults a freshly assembled note to unsigned/draft and unsigned, with no edit tracking yet', () => {
    const s = initialReviewState();
    expect(s.review_status).toBe('unsigned');
    expect(s.signed).toBe(false);
    expect(s.last_edited_by).toBeNull();
    expect(s.last_edited_at).toBeNull();
  });
});

describe('assertExplicitFinalization (no-autosign guard)', () => {
  it('throws when an unsigned/draft/pending-review note would be finalized without an explicit clinician action', () => {
    expect(() => assertExplicitFinalization('unsigned')).toThrow(/no-autosign/i);
    expect(() => assertExplicitFinalization('draft')).toThrow(/no-autosign/i);
    expect(() => assertExplicitFinalization('pending-review')).toThrow(/no-autosign/i);
  });

  it('permits an explicit reviewed/final clinician status transition', () => {
    expect(() => assertExplicitFinalization('reviewed')).not.toThrow();
    expect(() => assertExplicitFinalization('final')).not.toThrow();
  });
});

describe('finalizationProvenance', () => {
  it('writes honest provenance: deterministic, not AI-generated, clinician-finalized', () => {
    const prov = finalizationProvenance(3);
    expect(prov.assembled_by).toBe('supernote');
    expect(prov.deterministic).toBe(true);
    expect(prov.ai_generated).toBe(false);
    expect(prov.finalized_by).toBe('clinician');
    expect(prov.coded_count).toBe(3);
    expect(prov.sources.length).toBeGreaterThan(0);
  });

  it('never claims AI generation in the serialized provenance metadata', () => {
    const serialized = JSON.stringify(finalizationProvenance(1));
    expect(serialized).toContain('"ai_generated":false');
    expect(serialized).not.toMatch(/"ai_generated":true/);
    expect(serialized).not.toMatch(/coming soon|llm[-_ ]generated|gpt/i);
  });
});

describe('SuperNote LLM narrative seam (OFF by default — deterministic is authoritative)', () => {
  it('is disabled by default (AI_INSIGHTS_ENABLED defaults false)', () => {
    expect(isSuperNoteNarrativeEnabled()).toBe(false);
  });

  it('throws a typed not-enabled error instead of promising a deferred AI narrative', () => {
    const note = {} as SuperNote;
    expect(() => enrichSuperNoteNarrative(note)).toThrow(SuperNoteLlmNotEnabledError);
    try {
      enrichSuperNoteNarrative(note);
    } catch (err) {
      expect((err as SuperNoteLlmNotEnabledError).code).toBe('SUPERNOTE_LLM_NOT_ENABLED');
    }
  });

  it('stays disabled for the cloud provider until a BAA is signed', () => {
    mockConfig.aiInsightsEnabled = true;
    mockConfig.aiProvider = 'anthropic';
    mockConfig.anthropicBaaSigned = false;
    expect(isSuperNoteNarrativeEnabled()).toBe(false);
    expect(() => enrichSuperNoteNarrative({} as SuperNote)).toThrow(/BAA/i);
  });

  it('is a no-op stub (returns undefined, never calls an API) when BAA-approved', () => {
    mockConfig.aiInsightsEnabled = true;
    mockConfig.aiProvider = 'anthropic';
    mockConfig.anthropicBaaSigned = true;
    expect(isSuperNoteNarrativeEnabled()).toBe(true);
    expect(enrichSuperNoteNarrative({} as SuperNote)).toBeUndefined();
  });
});

describe('deferred-claim honesty (product surface)', () => {
  // Guards the PRODUCT SURFACE (serialized note + provenance the client receives),
  // not source comments. The note must never advertise a deferred AI narrative or
  // claim AI generation.
  it('serialized provenance + assembly metadata never claim AI generation or a deferred AI narrative', () => {
    const surface = JSON.stringify({
      provenance: {
        brief_history: sectionProvenance(SUPERNOTE_SOURCES.PROBLEM_LIST),
        assessment_plan: sectionProvenance(SUPERNOTE_SOURCES.PROBLEM_LIST),
      },
      assembly: { deterministic: true, ai_generated: false, assembled_by: 'supernote' },
      review: initialReviewState(),
      finalization: finalizationProvenance(2),
    });
    expect(surface).not.toMatch(/AI narrative coming soon/i);
    expect(surface).not.toMatch(/llm[-_ ]generated/i);
    expect(surface).not.toMatch(/"ai_generated":true/);
    // Affirmatively honest: the surface states it is deterministic and non-AI.
    expect(surface).toContain('"deterministic":true');
    expect(surface).toContain('"ai_generated":false');
  });
});
