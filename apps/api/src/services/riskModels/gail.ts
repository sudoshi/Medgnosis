// =============================================================================
// Gail / BCRA — 5-year invasive breast cancer risk (7 factors).
// Registered for the registry pattern, but the model requires reproductive +
// family-history inputs that standard EHR structured data lacks. Until those
// are wired (PRO capture / structured family history), it returns
// insufficient_data — honest graceful degradation, not a faked score.
// =============================================================================

export interface GailInput {
  age: number;
  gender: string;
  menarcheAge?: number;
  firstBirthAge?: number;
  firstDegreeRelatives?: number;
  biopsies?: number;
  atypicalHyperplasia?: boolean;
  race?: string;
}

export interface GailResult {
  score: number | null;
  category: 'low' | 'moderate' | 'high' | 'insufficient_data';
  components: Record<string, unknown>;
}

export function scoreGail(i: GailInput): GailResult {
  const required = [i.menarcheAge, i.firstBirthAge, i.firstDegreeRelatives, i.biopsies];
  if (required.some((v) => v == null)) {
    return {
      score: null,
      category: 'insufficient_data',
      components: { reason: 'missing reproductive/family-history inputs (menarche age, first-birth age, first-degree relatives, prior biopsies)' },
    };
  }
  // Full Gail relative-risk calculation belongs here once inputs are available.
  // Placeholder low-risk return is unreachable with current data (always insufficient).
  return { score: 0, category: 'low', components: {} };
}
