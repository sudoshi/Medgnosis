// =============================================================================
// Medgnosis API — VSAC value set service
// Reads phm_edw.vsac_* reference tables and the measure_value_set bridge.
//
// SAFETY: resolveMeasureCodes() returns the union of ALL bridged value sets
// REGARDLESS of population role — denominator, exclusion (hospice / advanced
// illness / frailty / palliative), and supplemental codes together (~82% of
// CMS122's SNOMEDCT codes are exclusion-family). Treating that union as a
// denominator would invert eCQM exclusion semantics. Do NOT drive population
// finding or gap generation from it until the bridge carries population_role.
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

export type EdwDomain = keyof typeof EDW_CODE_SYSTEM;

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
  return sql<ValueSetCode[]>`
    SELECT vc.code, vc.description, vc.code_system
    FROM phm_edw.vsac_value_set_code vc
    WHERE vc.value_set_oid = ${oid}
      AND (${codeSystem ?? null}::text IS NULL OR vc.code_system = ${codeSystem ?? null}::text)
    ORDER BY vc.code_system, vc.code
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
): Promise<string[]> {
  const rows = await sql<{ code: string }[]>`
    SELECT DISTINCT vc.code
    FROM phm_edw.measure_value_set mv
    JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
    JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = mv.value_set_oid
    WHERE md.measure_code = ${measureCode}
      AND vc.code_system = ${codeSystem}
    ORDER BY vc.code
  `;
  return rows.map((r) => r.code);
}
