// =============================================================================
// CHA2DS2-VASc — stroke risk in atrial fibrillation (Lip et al., 2010)
// Computable from problem-list conditions + demographics. Surfaces the
// anticoagulation gap — the same shape as the compendium's chemoprevention gap.
// =============================================================================

export interface Cha2ds2VascInput {
  age: number;
  gender: string;
  chf: boolean;
  htn: boolean;
  dm: boolean;
  stroke: boolean; // stroke / TIA / thromboembolism
  vascular: boolean; // MI / PAD / aortic plaque
}

export interface Cha2ds2VascResult {
  score: number;
  category: 'low' | 'moderate' | 'high';
  anticoag_indicated: boolean;
  components: Record<string, number>;
}

export function scoreCha2ds2Vasc(i: Cha2ds2VascInput): Cha2ds2VascResult {
  const agePts = i.age >= 75 ? 2 : i.age >= 65 ? 1 : 0;
  const isFemale = (i.gender ?? '').toLowerCase().startsWith('f');
  const components = {
    chf: i.chf ? 1 : 0,
    htn: i.htn ? 1 : 0,
    age: agePts,
    dm: i.dm ? 1 : 0,
    stroke: i.stroke ? 2 : 0,
    vascular: i.vascular ? 1 : 0,
    sex: isFemale ? 1 : 0,
  };
  const score = Object.values(components).reduce((a, b) => a + b, 0);
  // Guideline anticoagulation threshold: >=2 (men), >=3 (women).
  const anticoag_indicated = isFemale ? score >= 3 : score >= 2;
  const category: 'low' | 'moderate' | 'high' = score === 0 ? 'low' : score === 1 ? 'moderate' : 'high';
  return { score, category, anticoag_indicated, components };
}
