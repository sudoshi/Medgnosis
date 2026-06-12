// =============================================================================
// Medgnosis API — Generic early-warning scoring engine
// "The score was never the innovation. The latency was the disease." Band-driven
// and data-defined: the same engine scores MEWS and NEWS2 from the bands seeded
// in clinical_rule. Bedside-verifiable: distance from normal earns points.
// =============================================================================

export interface Band {
  parameter: string;
  min?: number | null;
  max?: number | null;
  value?: number | string | boolean;
  points: number;
}

export interface LadderRow {
  score_min: number;
  score_max: number | null;
  action: string;
  owner: string;
}

export interface TriggerRow {
  band: string;
  aggregate_min?: number;
  aggregate_max?: number | null;
  single_param_score?: number;
  response: string;
}

export interface ScoreResult {
  total: number;
  components: Record<string, number>;
  maxSingleParam: number;
}

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

function matchBand(bands: Band[], value: number | string | boolean): Band | null {
  for (const b of bands) {
    if (b.value !== undefined) {
      if (b.value === value) return b;
    } else {
      const v = value as number;
      const minOk = b.min == null || v >= b.min;
      const maxOk = b.max == null || v <= b.max;
      if (minOk && maxOk) return b;
    }
  }
  return null;
}

/**
 * Sum points across parameters present in `params`, using the matching band per
 * parameter (numeric min/max or discrete value). Tracks the max single-parameter
 * score (NEWS2's single-param-3 escalation depends on it).
 */
export function scoreVitals(
  params: Record<string, number | string | boolean | null | undefined>,
  bands: Band[],
): ScoreResult {
  const byParam = new Map<string, Band[]>();
  for (const b of bands) {
    const arr = byParam.get(b.parameter) ?? [];
    arr.push(b);
    byParam.set(b.parameter, arr);
  }

  let total = 0;
  let maxSingleParam = 0;
  const components: Record<string, number> = {};

  for (const [param, pbands] of byParam) {
    const v = params[param];
    if (v == null) continue;
    const band = matchBand(pbands, v);
    const pts = band?.points ?? 0;
    components[param] = pts;
    total += pts;
    if (pts > maxSingleParam) maxSingleParam = pts;
  }

  return { total, components, maxSingleParam };
}

/** MEWS action ladder: first row whose [score_min, score_max] contains the score. */
export function mewsAction(score: number, ladder: LadderRow[]): { action: string; owner: string } | null {
  const row = ladder.find((r) => score >= r.score_min && (r.score_max == null || score <= r.score_max));
  return row ? { action: row.action, owner: row.owner } : null;
}

/**
 * NEWS2 clinical-response band. Aggregate match, but a single parameter scoring 3
 * escalates an otherwise-low aggregate to the low-medium ("red score") response.
 */
export function news2Band(
  total: number,
  maxSingleParam: number,
  triggers: TriggerRow[],
): { band: string; response: string } {
  const agg = triggers.find(
    (t) => t.aggregate_min != null && total >= t.aggregate_min && (t.aggregate_max == null || total <= t.aggregate_max),
  );
  const singleTrig = triggers.find((t) => t.single_param_score === 3);
  if (maxSingleParam >= 3 && agg && agg.band === 'low' && singleTrig) {
    return { band: singleTrig.band, response: singleTrig.response };
  }
  return agg ? { band: agg.band, response: agg.response } : { band: 'low', response: '' };
}
