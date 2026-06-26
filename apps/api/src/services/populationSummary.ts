// =============================================================================
// Medgnosis API — Population Summary (deterministic, PHI-safe aggregate)
//
// Backs the 'population_summary' AI-insights job type. By default this produces
// a DETERMINISTIC aggregate over a cohort scope using the same star-schema and
// EDW sources the morning-briefing route reads. NO external LLM call is required
// and NO patient identifiers ever appear in the output — aggregates only.
//
// An optional LLM-narrative enrichment is gated behind the SAME BAA/consent
// provider config used by every other cloud-AI path (config.aiInsightsEnabled +
// config.anthropicBaaSigned when config.aiProvider === 'anthropic'); it defaults
// OFF, so the deterministic summary is always authoritative. The enrichment path
// is a typed stub that throws PopulationSummaryLlmNotEnabledError rather than
// calling any external API.
//
// Pure of BullMQ and pure of a concrete DB client (the `sql` tagged-template is
// dependency-injected), so the whole pipeline is unit-testable in isolation —
// mirroring the processMpiFeed pattern in workers/mpi-feed.ts.
// =============================================================================

import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Storage target
//
// Deterministic population summaries persist to the SAME `ai_insights` table
// every other AI job output uses. The aggregate is NOT patient-scoped, so a
// sentinel patient_id of 0 marks it as a population-level (non-PHI) row; the
// insight_type 'weekly_summary' is an allowed CHECK value on that table.
// ---------------------------------------------------------------------------

export const POPULATION_SUMMARY_INSIGHT_TYPE = 'weekly_summary' as const;
/** Sentinel patient_id for population-level (non-patient) ai_insights rows. */
export const POPULATION_SCOPE_PATIENT_ID = 0 as const;

// Title-case risk tiers as stored in phm_star.fact_patient_composite.risk_tier.
const RISK_TIERS = ['Critical', 'High', 'Medium', 'Low'] as const;
type RiskTier = (typeof RISK_TIERS)[number];

// ---------------------------------------------------------------------------
// Public contract — input scope
// ---------------------------------------------------------------------------

/**
 * Cohort scope for a population summary. When `providerId` is set the summary is
 * limited to that provider's panel (matching the morning-briefing scoping); when
 * omitted the summary covers the whole population (admin/house-wide view).
 */
export interface PopulationSummaryScope {
  providerId?: number;
  /** Cap on the number of top care-gap categories returned. */
  topGapCategories?: number;
}

// ---------------------------------------------------------------------------
// Public contract — output JSON schema
//
// PHI policy: every field below is an aggregate count or a non-identifying
// category label. There is NO patient name, MRN, patient_id, date of birth, or
// any free-text patient field anywhere in this shape.
// ---------------------------------------------------------------------------

export interface RiskTierDistributionEntry {
  tier: RiskTier;
  count: number;
}

export interface CareGapCategoryEntry {
  /** Measure/category label (e.g. a measure name) — never a patient identifier. */
  category: string;
  openGapCount: number;
}

export interface PopulationSummaryResult {
  schemaVersion: 1;
  scope: { providerId: number | null };
  generatedAt: string;
  patientCount: number;
  riskTierDistribution: RiskTierDistributionEntry[];
  topOpenCareGapCategories: CareGapCategoryEntry[];
  openCareGapTotal: number;
  /** Optional LLM narrative — only present when the BAA-gated path is enabled. */
  narrative?: string;
}

// ---------------------------------------------------------------------------
// Dependency-injected SQL surface
//
// Mirrors the `sql` tagged-template export from @medgnosis/db so the live worker
// passes the real client and tests pass a stub.
// ---------------------------------------------------------------------------

export type SqlTag = <Row = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Row[]>;

export interface BuildPopulationSummaryDeps {
  sql: SqlTag;
  /** Override the wall clock for deterministic tests. */
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// LLM enrichment gate (defaults OFF — deterministic path is authoritative)
// ---------------------------------------------------------------------------

/** Thrown when LLM narrative enrichment is requested but the provider is not BAA-approved. */
export class PopulationSummaryLlmNotEnabledError extends Error {
  public readonly code = 'POPULATION_SUMMARY_LLM_NOT_ENABLED';
  constructor(reason: string) {
    super(`Population-summary LLM enrichment is not enabled: ${reason}`);
    this.name = 'PopulationSummaryLlmNotEnabledError';
  }
}

/**
 * True only when the SAME BAA/consent provider config that gates every other
 * cloud-AI path permits an LLM call. Ollama (local) needs no BAA; Anthropic
 * (cloud) requires anthropicBaaSigned. Defaults to a non-enabled state because
 * aiInsightsEnabled defaults false.
 */
export function isLlmNarrativeEnabled(): boolean {
  if (!config.aiInsightsEnabled) return false;
  if (config.aiProvider === 'anthropic' && !config.anthropicBaaSigned) return false;
  return true;
}

/**
 * Gated stub for optional narrative enrichment. Intentionally calls NO external
 * API. When the provider is not BAA-approved it throws a typed error; when it is
 * approved it currently returns undefined (no-op) so the deterministic summary
 * remains authoritative until a vetted narrative implementation is wired in.
 */
export function enrichWithNarrative(_summary: PopulationSummaryResult): string | undefined {
  if (!isLlmNarrativeEnabled()) {
    throw new PopulationSummaryLlmNotEnabledError(
      config.aiProvider === 'anthropic'
        ? 'Anthropic provider requires a signed BAA (ANTHROPIC_BAA_SIGNED=true)'
        : 'AI insights are disabled (AI_INSIGHTS_ENABLED=false)',
    );
  }
  // BAA-approved path is intentionally a no-op stub — never call an external API
  // from this module. A vetted narrative generator can be wired here later.
  return undefined;
}

// ---------------------------------------------------------------------------
// Deterministic aggregate builder
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic, PHI-safe population summary for a cohort scope. Reads
 * ONLY the aggregate sources already used by other insight paths (the patient
 * composite star table for risk tiers + open care gaps from the EDW). Never
 * selects a patient identifier.
 */
export async function buildPopulationSummary(
  scope: PopulationSummaryScope,
  deps: BuildPopulationSummaryDeps,
): Promise<PopulationSummaryResult> {
  const { sql } = deps;
  const now = deps.now ?? (() => new Date());
  const providerId = scope.providerId ?? null;
  const topN = Math.max(1, scope.topGapCategories ?? 5);

  // Provider-scoped patients resolve through dim_provider.provider_key, matching
  // the morning-briefing route's scoping. Whole-population when providerId null.
  const providerScope =
    providerId !== null
      ? sqlProviderScope(sql, providerId)
      : { compositePredicate: sql``, gapPredicate: sql`` };

  const [tierRows, gapRows] = await Promise.all([
    sql<{ risk_tier: string | null; tier_count: number }>`
      SELECT fpc.risk_tier, COUNT(*)::int AS tier_count
      FROM phm_star.fact_patient_composite fpc
      WHERE 1 = 1
        ${providerScope.compositePredicate}
      GROUP BY fpc.risk_tier
    `,
    sql<{ category: string | null; open_gap_count: number }>`
      SELECT COALESCE(md.measure_name, 'Uncategorized') AS category,
             COUNT(*)::int AS open_gap_count
      FROM phm_edw.care_gap cg
      LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      ${providerId !== null ? sql`LEFT JOIN phm_edw.patient p ON p.patient_id = cg.patient_id` : sql``}
      WHERE cg.gap_status = 'open'
        AND cg.active_ind = 'Y'
        ${providerScope.gapPredicate}
      GROUP BY COALESCE(md.measure_name, 'Uncategorized')
      ORDER BY open_gap_count DESC, category ASC
    `,
  ]);

  const riskTierDistribution = normalizeTierDistribution(tierRows);
  const patientCount = riskTierDistribution.reduce((sum, e) => sum + e.count, 0);

  const allGapCategories: CareGapCategoryEntry[] = gapRows.map((r) => ({
    category: r.category ?? 'Uncategorized',
    openGapCount: Number(r.open_gap_count) || 0,
  }));
  const openCareGapTotal = allGapCategories.reduce((sum, e) => sum + e.openGapCount, 0);
  const topOpenCareGapCategories = allGapCategories.slice(0, topN);

  return {
    schemaVersion: 1,
    scope: { providerId },
    generatedAt: now().toISOString(),
    patientCount,
    riskTierDistribution,
    topOpenCareGapCategories,
    openCareGapTotal,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ProviderScopeFragments {
  compositePredicate: ReturnType<SqlTag>;
  gapPredicate: ReturnType<SqlTag>;
}

function sqlProviderScope(sql: SqlTag, providerId: number): ProviderScopeFragments {
  // Cast through `unknown` because the live `sql` tag returns a query fragment
  // (postgres.js Fragment) for nested interpolation, not a resolved Promise.
  const composite = sql`
    AND fpc.provider_key = (
      SELECT provider_key FROM phm_star.dim_provider
      WHERE provider_id = ${providerId} LIMIT 1
    )
  ` as unknown as ReturnType<SqlTag>;
  const gap = sql`
    AND (p.pcp_provider_id = ${providerId})
  ` as unknown as ReturnType<SqlTag>;
  return { compositePredicate: composite, gapPredicate: gap };
}

/**
 * Project raw GROUP BY rows onto the fixed Title-case tier set, folding any
 * unexpected/legacy casing into the matching canonical tier and dropping nulls.
 * Always returns all four tiers (count 0 when absent) for a stable shape.
 */
function normalizeTierDistribution(
  rows: { risk_tier: string | null; tier_count: number }[],
): RiskTierDistributionEntry[] {
  const counts = new Map<RiskTier, number>(RISK_TIERS.map((t) => [t, 0]));
  for (const row of rows) {
    const canonical = canonicalTier(row.risk_tier);
    if (!canonical) continue;
    counts.set(canonical, (counts.get(canonical) ?? 0) + (Number(row.tier_count) || 0));
  }
  return RISK_TIERS.map((tier) => ({ tier, count: counts.get(tier) ?? 0 }));
}

function canonicalTier(raw: string | null): RiskTier | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  for (const tier of RISK_TIERS) {
    if (tier.toLowerCase() === normalized) return tier;
  }
  // Fold the riskScoring 'moderate' band onto the star schema 'Medium' tier.
  if (normalized === 'moderate') return 'Medium';
  return null;
}
