// =============================================================================
// Medgnosis API — Data Quality anomaly detectors
// "A data-quality problem is the manifestation of a process-control problem
// somewhere in the enterprise." Hunt impossible values, implausible jumps, and
// identity collisions over the small/dimension tables. A confirmed finding
// becomes a standing regression check. Never scans observation/patient.
// =============================================================================

import { sql } from '@medgnosis/db';

// ─── Pure threshold helpers ──────────────────────────────────────────────────

export function isImpossibleHeight(inches: number): boolean {
  return inches < 20 || inches > 96;
}
export function isImpossibleTemp(f: number): boolean {
  return f < 86 || f > 113;
}
export function isImpossibleWeight(lbs: number): boolean {
  return lbs < 1 || lbs > 1000;
}
export function isImplausibleJump(prev: number | null, curr: number, maxDelta: number): boolean {
  if (prev == null) return false;
  return Math.abs(curr - prev) > maxDelta;
}
export function hasEdgeWhitespace(s: string | null): boolean {
  if (!s) return false;
  return s !== s.trim();
}

// ─── DB orchestration (small tables only) ────────────────────────────────────

export interface DqScanResult {
  byDetector: Record<string, number>;
}

async function upsertFinding(f: {
  detector: string; entity_table: string; entity_id: number | null; patient_id: number | null;
  field: string; observed: string; severity: string; detail: Record<string, string | number | boolean | null>;
}): Promise<boolean> {
  const rows = await sql<{ finding_id: number }[]>`
    INSERT INTO phm_edw.dq_finding
      (detector, entity_table, entity_id, patient_id, field, observed, severity, detail)
    VALUES (${f.detector}, ${f.entity_table}, ${f.entity_id}, ${f.patient_id},
            ${f.field}, ${f.observed}, ${f.severity}, ${sql.json(f.detail)})
    ON CONFLICT (detector, entity_table, entity_id, field) DO NOTHING
    RETURNING finding_id
  `;
  return rows.length > 0;
}

export async function runDqScan(): Promise<DqScanResult> {
  const byDetector: Record<string, number> = {};
  const bump = (d: string): void => { byDetector[d] = (byDetector[d] ?? 0) + 1; };

  // Impossible vitals (vital_sign ≈ 4.4k rows — full scan is safe here)
  const vitals = await sql<{ vital_id: number; patient_id: number; height_in: string | null; temperature_f: string | null; weight_lbs: string | null }[]>`
    SELECT vital_id, patient_id, height_in::text, temperature_f::text, weight_lbs::text
    FROM phm_edw.vital_sign WHERE active_ind = 'Y'
      AND (height_in > 96 OR height_in < 20
        OR temperature_f > 113 OR temperature_f < 86
        OR weight_lbs > 1000 OR weight_lbs < 1)
  `;
  for (const v of vitals) {
    if (v.height_in != null && isImpossibleHeight(Number(v.height_in))) {
      if (await upsertFinding({ detector: 'impossible_height', entity_table: 'vital_sign', entity_id: v.vital_id, patient_id: v.patient_id, field: 'height_in', observed: v.height_in, severity: 'critical', detail: { value: Number(v.height_in) } })) bump('impossible_height');
    }
    if (v.temperature_f != null && isImpossibleTemp(Number(v.temperature_f))) {
      if (await upsertFinding({ detector: 'impossible_temp', entity_table: 'vital_sign', entity_id: v.vital_id, patient_id: v.patient_id, field: 'temperature_f', observed: v.temperature_f, severity: 'critical', detail: { value: Number(v.temperature_f) } })) bump('impossible_temp');
    }
    if (v.weight_lbs != null && isImpossibleWeight(Number(v.weight_lbs))) {
      if (await upsertFinding({ detector: 'impossible_weight', entity_table: 'vital_sign', entity_id: v.vital_id, patient_id: v.patient_id, field: 'weight_lbs', observed: v.weight_lbs, severity: 'warning', detail: { value: Number(v.weight_lbs) } })) bump('impossible_weight');
    }
  }

  // Implausible weight jumps between consecutive readings (window over small table)
  const jumps = await sql<{ vital_id: number; patient_id: number; weight_lbs: string; prev_weight: string | null }[]>`
    SELECT vital_id, patient_id, weight_lbs::text,
           LAG(weight_lbs) OVER (PARTITION BY patient_id ORDER BY recorded_datetime)::text AS prev_weight
    FROM phm_edw.vital_sign WHERE active_ind = 'Y' AND weight_lbs IS NOT NULL
  `;
  for (const j of jumps) {
    const prev = j.prev_weight != null ? Number(j.prev_weight) : null;
    if (isImplausibleJump(prev, Number(j.weight_lbs), 100)) {
      if (await upsertFinding({ detector: 'weight_jump', entity_table: 'vital_sign', entity_id: j.vital_id, patient_id: j.patient_id, field: 'weight_lbs', observed: `${prev} -> ${j.weight_lbs}`, severity: 'warning', detail: { prev, curr: Number(j.weight_lbs) } })) bump('weight_jump');
    }
  }

  // Identity: provider display_name edge whitespace (small dimension)
  const providers = await sql<{ provider_id: number; display_name: string | null }[]>`
    SELECT provider_id, display_name FROM phm_edw.provider WHERE display_name <> trim(display_name)
  `;
  for (const p of providers) {
    if (hasEdgeWhitespace(p.display_name)) {
      if (await upsertFinding({ detector: 'provider_trailing_space', entity_table: 'provider', entity_id: p.provider_id, patient_id: null, field: 'display_name', observed: JSON.stringify(p.display_name), severity: 'warning', detail: { display_name: p.display_name } })) bump('provider_trailing_space');
    }
  }

  return { byDetector };
}
