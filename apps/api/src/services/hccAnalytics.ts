// =============================================================================
// Medgnosis API — HCC & coding analytics
// "Why the money followed the medicine." Capture % per provider, E&M visit-level
// distribution, and the missed-opportunity report (conditions evident but not
// coded — the recognition gap quantified). Thin reporting over existing tables;
// no observation/patient scans.
// =============================================================================

import { sql } from '@medgnosis/db';

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function captureRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export interface EmShift {
  level3: number;
  level4: number;
  level5: number;
  total: number;
  pct_level4plus: number;
}

export function emShift(dist: Record<string, number>): EmShift {
  const level3 = dist['99213'] ?? 0;
  const level4 = dist['99214'] ?? 0;
  const level5 = dist['99215'] ?? 0;
  const total = level3 + level4 + level5;
  const pct_level4plus = total > 0 ? Math.round(((level4 + level5) / total) * 100) : 0;
  return { level3, level4, level5, total, pct_level4plus };
}

const HCC_PREFIXES = ['E11', 'I50', 'N18', 'E66', 'I48'];
export function isHccRelevant(icd10: string): boolean {
  return HCC_PREFIXES.some((p) => icd10.startsWith(p));
}

// ─── DB queries ──────────────────────────────────────────────────────────────

export interface ProviderCapture {
  provider_id: number | null;
  provider_name: string | null;
  evident: number;
  coded: number;
  capture_pct: number;
}

export async function hccCaptureByProvider(): Promise<{ byProvider: ProviderCapture[]; overall: ProviderCapture }> {
  const rows = await sql<{ provider_id: number | null; provider_name: string | null; evident: number; coded: number }[]>`
    WITH evident AS (
      SELECT DISTINCT pl.patient_id, pl.icd10_code, p.pcp_provider_id
      FROM phm_edw.problem_list pl
      JOIN phm_edw.patient p ON p.patient_id = pl.patient_id
      WHERE pl.active_ind = 'Y' AND pl.problem_status = 'Active'
        AND p.pcp_provider_id IS NOT NULL
        AND (pl.icd10_code LIKE 'E11%' OR pl.icd10_code LIKE 'I50%' OR pl.icd10_code LIKE 'N18%'
          OR pl.icd10_code LIKE 'E66%' OR pl.icd10_code LIKE 'I48%')
    ),
    coded AS (
      SELECT DISTINCT patient_id, icd10_code FROM phm_edw.note_coded_diagnosis WHERE hcc_relevant = TRUE
    )
    SELECT e.pcp_provider_id AS provider_id,
           pr.display_name AS provider_name,
           COUNT(*)::int AS evident,
           COUNT(*) FILTER (WHERE c.patient_id IS NOT NULL)::int AS coded
    FROM evident e
    LEFT JOIN coded c ON c.patient_id = e.patient_id AND c.icd10_code = e.icd10_code
    LEFT JOIN phm_edw.provider pr ON pr.provider_id = e.pcp_provider_id
    GROUP BY e.pcp_provider_id, pr.display_name
    ORDER BY evident DESC
  `;

  const byProvider: ProviderCapture[] = rows.map((r) => ({
    provider_id: r.provider_id,
    provider_name: r.provider_name,
    evident: r.evident,
    coded: r.coded,
    capture_pct: captureRate(r.coded, r.evident),
  }));

  const evidentTotal = byProvider.reduce((s, r) => s + r.evident, 0);
  const codedTotal = byProvider.reduce((s, r) => s + r.coded, 0);
  const overall: ProviderCapture = {
    provider_id: null,
    provider_name: 'All providers',
    evident: evidentTotal,
    coded: codedTotal,
    capture_pct: captureRate(codedTotal, evidentTotal),
  };

  return { byProvider, overall };
}

export interface ProviderEm extends EmShift {
  provider_id: number | null;
  provider_name: string | null;
}

export async function emDistribution(): Promise<{ byProvider: ProviderEm[]; overall: EmShift }> {
  const rows = await sql<{ provider_id: number | null; provider_name: string | null; c3: number; c4: number; c5: number }[]>`
    SELECT bc.provider_id, pr.display_name AS provider_name,
           COUNT(*) FILTER (WHERE bli.cpt_code = '99213')::int AS c3,
           COUNT(*) FILTER (WHERE bli.cpt_code = '99214')::int AS c4,
           COUNT(*) FILTER (WHERE bli.cpt_code = '99215')::int AS c5
    FROM phm_edw.billing_line_item bli
    JOIN phm_edw.billing_claim bc ON bc.claim_id = bli.claim_id
    LEFT JOIN phm_edw.provider pr ON pr.provider_id = bc.provider_id
    WHERE bli.cpt_code IN ('99213', '99214', '99215') AND bli.active_ind = 'Y'
    GROUP BY bc.provider_id, pr.display_name
    ORDER BY (COUNT(*) FILTER (WHERE bli.cpt_code IN ('99213','99214','99215'))) DESC
  `;

  const byProvider: ProviderEm[] = rows.map((r) => ({
    provider_id: r.provider_id,
    provider_name: r.provider_name,
    ...emShift({ '99213': r.c3, '99214': r.c4, '99215': r.c5 }),
  }));

  const agg = byProvider.reduce(
    (acc, r) => ({ '99213': acc['99213'] + r.level3, '99214': acc['99214'] + r.level4, '99215': acc['99215'] + r.level5 }),
    { '99213': 0, '99214': 0, '99215': 0 },
  );

  return { byProvider, overall: emShift(agg) };
}

export interface MissedOpportunities {
  lab_evident: { label: string; count: number }[];
  uncoded_hcc: { label: string; count: number }[];
  total_uncoded_hcc: number;
}

export async function missedOpportunities(): Promise<MissedOpportunities> {
  const [labEvident, uncodedHcc] = await Promise.all([
    sql<{ label: string; count: number }[]>`
      SELECT finding_type AS label, COUNT(*)::int AS count
      FROM phm_edw.population_finder_candidate
      WHERE status = 'pending'
      GROUP BY finding_type ORDER BY count DESC
    `,
    sql<{ label: string; count: number }[]>`
      WITH evident AS (
        SELECT DISTINCT pl.patient_id, pl.icd10_code
        FROM phm_edw.problem_list pl
        WHERE pl.active_ind = 'Y' AND pl.problem_status = 'Active'
          AND (pl.icd10_code LIKE 'E11%' OR pl.icd10_code LIKE 'I50%' OR pl.icd10_code LIKE 'N18%'
            OR pl.icd10_code LIKE 'E66%' OR pl.icd10_code LIKE 'I48%')
      ),
      coded AS (SELECT DISTINCT patient_id, icd10_code FROM phm_edw.note_coded_diagnosis WHERE hcc_relevant = TRUE)
      SELECT e.icd10_code AS label, COUNT(*)::int AS count
      FROM evident e
      LEFT JOIN coded c ON c.patient_id = e.patient_id AND c.icd10_code = e.icd10_code
      WHERE c.patient_id IS NULL
      GROUP BY e.icd10_code ORDER BY count DESC LIMIT 20
    `,
  ]);

  return {
    lab_evident: labEvident,
    uncoded_hcc: uncodedHcc,
    total_uncoded_hcc: uncodedHcc.reduce((s, r) => s + r.count, 0),
  };
}
