// =============================================================================
// Medgnosis API — Clinical Rules Engine
// Logic as data: versioned, effective-dated EAV (phm_edw.clinical_rule).
// evaluate(entity, attribute, asOf?) — time-travel to any prior logic.
// The Geisinger doctrine: store clinical definitions as data so one update
// propagates everywhere, every past result is reproducible, and the criteria
// behind any computation can be shown ("transparency -> trust").
// =============================================================================

import { sql } from '@medgnosis/db';

export interface ClinicalRuleRow {
  rule_id: number;
  entity: string;
  attribute: string;
  value_text: string | null;
  value_numeric: string | null; // postgres.js returns NUMERIC as string
  value_jsonb: unknown;
  unit: string | null;
  display_order: number;
  effective_date: string;
  expiration_date: string | null;
  source: string | null;
  notes: string | null;
}

/**
 * Return every active rule row for (entity, attribute) that is in effect on the
 * given date (defaults to today). Ordered by display_order then rule_id so band
 * tables and ladders come back in a stable, meaningful sequence.
 */
export async function evaluate(
  entity: string,
  attribute: string,
  asOf?: string,
): Promise<ClinicalRuleRow[]> {
  return sql<ClinicalRuleRow[]>`
    SELECT rule_id, entity, attribute, value_text, value_numeric, value_jsonb,
           unit, display_order, effective_date, expiration_date, source, notes
    FROM phm_edw.clinical_rule
    WHERE entity = ${entity}
      AND attribute = ${attribute}
      AND active_ind = 'Y'
      AND effective_date <= COALESCE(${asOf ?? null}::date, CURRENT_DATE)
      AND (expiration_date IS NULL
           OR expiration_date > COALESCE(${asOf ?? null}::date, CURRENT_DATE))
    ORDER BY display_order, rule_id
  `;
}

/**
 * Resolve a single numeric threshold. The supplied `fallback` is returned when
 * no rule exists OR the rules table is unreachable — a rules outage must never
 * break the consuming worker/route.
 */
export async function getNumericThreshold(
  entity: string,
  attribute: string,
  fallback: number,
  asOf?: string,
): Promise<number> {
  try {
    const rows = await evaluate(entity, attribute, asOf);
    const v = rows[0]?.value_numeric;
    return v != null ? Number(v) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolve a value set (e.g. inclusion-criteria code lists) from value_text.
 */
export async function getValueSet(
  entity: string,
  attribute: string,
  asOf?: string,
): Promise<string[]> {
  const rows = await evaluate(entity, attribute, asOf);
  return rows
    .map((r) => r.value_text)
    .filter((v): v is string => v != null);
}

export interface RuleExplanation {
  entity: string;
  attribute: string;
  as_of: string;
  rules: ClinicalRuleRow[];
}

/**
 * Transparency endpoint payload — the criteria active for (entity, attribute)
 * as of a date. "When a clinician asks 'who counts as a CAD patient here?',
 * the answer is a query, not an archaeology project."
 */
export async function explain(
  entity: string,
  attribute: string,
  asOf?: string,
): Promise<RuleExplanation> {
  const rows = await evaluate(entity, attribute, asOf);
  return {
    entity,
    attribute,
    as_of: asOf ?? 'current',
    rules: rows,
  };
}

export interface RuleEntitySummary {
  entity: string;
  attribute: string;
  rule_count: number;
  current_count: number;
}

/**
 * Catalog of every (entity, attribute) pair with total vs currently-effective
 * row counts — powers the rules browser.
 */
export async function listEntities(): Promise<RuleEntitySummary[]> {
  return sql<RuleEntitySummary[]>`
    SELECT entity, attribute,
           COUNT(*)::int AS rule_count,
           COUNT(*) FILTER (
             WHERE effective_date <= CURRENT_DATE
               AND (expiration_date IS NULL OR expiration_date > CURRENT_DATE)
               AND active_ind = 'Y'
           )::int AS current_count
    FROM phm_edw.clinical_rule
    GROUP BY entity, attribute
    ORDER BY entity, attribute
  `;
}
