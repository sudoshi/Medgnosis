// =============================================================================
// Medgnosis API — VSAC value set service
// Reads phm_edw.vsac_* reference tables and the measure_value_set bridge.
//
// resolveMeasureCodes() is role-aware: callers must supply a PopulationRole
// and receive only codes classified under that role. 'unclassified' may be
// requested explicitly for audit purposes but must NEVER be served as a
// denominator — consuming code is responsible for enforcing that contract.
// =============================================================================

import { sql } from '@medgnosis/db';

// phm_edw code-column reality (verified 2026-06-12): condition and procedure
// are SNOMED-coded — the Parthenon handoff's ICD-10/CPT routing does not apply.
// NB: these are VSAC code_system labels, NOT phm_edw.*.code_system values —
// the EDW stores 'SNOMED'/'ICD-10' (CHECK-constrained); translate labels
// before ever joining an EDW code_system column against VSAC's.
export const EDW_CODE_SYSTEM = {
  condition: 'SNOMEDCT',
  procedure: 'SNOMEDCT',
  medication: 'RXNORM',
  observation: 'LOINC',
} as const;

// EDW code_system column labels → VSAC code_system labels. The EDW CHECK
// constraints allow 'ICD-10','SNOMED','ICD-9','OTHER'; VSAC uses different
// labels. NEVER join the columns directly — translate through this map.
// null means unmapped by design: ICD-9 and OTHER have no corresponding VSAC
// eCQM code system in the loaded value sets. Rows with a null-mapped system
// are still reported as warnings when the table contains >0 rows (the system
// exists in live data but cannot be reconciled against VSAC extracts).
export const EDW_TO_VSAC_CODE_SYSTEM: Record<string, string | null> = {
  SNOMED: 'SNOMEDCT',
  'ICD-10': 'ICD10CM',
  'ICD-9': null, // VSAC eCQM extracts carry no ICD-9 — unmapped by design
  OTHER: null,
};

export type EdwDomain = keyof typeof EDW_CODE_SYSTEM;

export type PopulationRole =
  | 'initial_population'
  | 'denominator'
  | 'denominator_exclusion'
  | 'numerator'
  | 'supplemental'
  | 'unclassified';

export interface MeasureBridgeStatus {
  measure_code: string;
  vsac_cms_id: string;
  version_drift: boolean;
  roles: Record<string, number>;
  unclassified_count: number;
}

export interface ValueSetSummary {
  value_set_oid: string;
  name: string;
  qdm_category: string | null;
  code_count: number;
}

export interface ValueSetCode {
  code: string;
  description: string | null;
  code_system: string;
}

export interface MeasureValueSet {
  value_set_oid: string;
  name: string;
  vsac_cms_id: string;
  qdm_category: string | null;
  code_count: number;
}

// Use NULLIF trick: pass null to disable optional filter inline — avoids nested
// sql`` fragments that would fire extra mock calls under the test harness.
export async function listValueSets(search?: string): Promise<ValueSetSummary[]> {
  const searchPattern = search ? '%' + search + '%' : null;
  return sql<ValueSetSummary[]>`
    SELECT
      vs.value_set_oid,
      vs.name,
      vs.qdm_category,
      COUNT(vc.id)::int AS code_count
    FROM phm_edw.vsac_value_set vs
    LEFT JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = vs.value_set_oid
    WHERE (${searchPattern}::text IS NULL OR vs.name ILIKE ${searchPattern}::text)
    GROUP BY vs.value_set_oid, vs.name, vs.qdm_category
    ORDER BY vs.name
  `;
}

export async function getValueSetCodes(
  oid: string,
  codeSystem?: string,
): Promise<ValueSetCode[]> {
  // LIMIT 12000: the largest loaded expansion (verified 2026-06-12) is 11,539
  // codes. The limit is set above that ceiling to guard against unbounded
  // responses without silently truncating any current value set. Pagination
  // (offset/cursor) is deferred as future work if expansions grow further.
  return sql<ValueSetCode[]>`
    SELECT vc.code, vc.description, vc.code_system
    FROM phm_edw.vsac_value_set_code vc
    WHERE vc.value_set_oid = ${oid}
      AND (${codeSystem ?? null}::text IS NULL OR vc.code_system = ${codeSystem ?? null}::text)
    ORDER BY vc.code_system, vc.code
    LIMIT 12000
  `;
}

export async function getMeasureValueSets(measureCode: string): Promise<MeasureValueSet[]> {
  return sql<MeasureValueSet[]>`
    SELECT
      vs.value_set_oid,
      vs.name,
      mv.vsac_cms_id,
      vs.qdm_category,
      COUNT(vc.id)::int AS code_count
    FROM phm_edw.measure_value_set mv
    JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
    JOIN phm_edw.vsac_value_set vs ON vs.value_set_oid = mv.value_set_oid
    LEFT JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = vs.value_set_oid
    WHERE md.measure_code = ${measureCode}
    GROUP BY vs.value_set_oid, vs.name, mv.vsac_cms_id, vs.qdm_category
    ORDER BY vs.name
  `;
}

export async function resolveMeasureCodes(
  measureCode: string,
  codeSystem: string,
  role: PopulationRole,
): Promise<string[]> {
  const rows = await sql<{ code: string }[]>`
    SELECT DISTINCT vc.code
    FROM phm_edw.measure_value_set mv
    JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
    JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = mv.value_set_oid
    WHERE md.measure_code = ${measureCode}
      AND vc.code_system = ${codeSystem}
      AND mv.population_role = ${role}
    ORDER BY vc.code
  `;
  return rows.map((r) => r.code);
}

export async function getMeasureBridgeStatus(
  measureCode: string,
): Promise<MeasureBridgeStatus | null> {
  const rows = await sql<{ vsac_cms_id: string; population_role: string; n: number }[]>`
    SELECT mv.vsac_cms_id, mv.population_role, count(*)::int AS n
    FROM phm_edw.measure_value_set mv
    JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
    WHERE md.measure_code = ${measureCode}
    GROUP BY mv.vsac_cms_id, mv.population_role
  `;
  if (rows.length === 0) return null;
  const first = rows[0];
  if (!first) return null;
  const roles: Record<string, number> = {};
  let unclassified = 0;
  for (const r of rows) {
    roles[r.population_role] = (roles[r.population_role] ?? 0) + r.n;
    if (r.population_role === 'unclassified') unclassified += r.n;
  }
  return {
    measure_code: measureCode,
    vsac_cms_id: first.vsac_cms_id,
    version_drift: measureCode !== first.vsac_cms_id,
    roles,
    unclassified_count: unclassified,
  };
}
