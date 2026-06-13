// =============================================================================
// Medgnosis API — Data Quality anomaly detectors
// "A data-quality problem is the manifestation of a process-control problem
// somewhere in the enterprise." Hunt impossible values, implausible jumps, and
// identity collisions over the small/dimension tables. A confirmed finding
// becomes a standing regression check. Never scans observation/patient.
// =============================================================================

import { sql } from '@medgnosis/db';
import { EDW_TO_VSAC_CODE_SYSTEM } from './vsacService.js';

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

  // ─── Code-system contract: EDW ↔ VSAC label alignment ───────────────────────
  // Scope: phm_edw.condition (324 rows) and phm_edw.procedure (415 rows).
  // These are small dimension tables — full scans are safe.
  //
  // phm_edw.observation is EXPLICITLY OUT OF SCOPE: it has ~1B rows, no
  // code_system column, and is not part of the VSAC eCQM code-system contract.
  //
  // Three finding types:
  //   1. warning — code_system value absent from EDW_TO_VSAC_CODE_SYSTEM entirely
  //      (not a known EDW label; indicates schema drift or mis-ingest)
  //   2. warning — code_system maps to a VSAC label but a LIMIT-500 sample join
  //      against vsac_value_set_code yields zero matching codes while the EDW
  //      has >100 rows of that system (mapped-but-zero-overlap hazard)
  //   3. info — condition rows whose code_system='ICD-10' (the column DEFAULT)
  //      but condition_code matches ^[0-9]+$ (purely numeric = SNOMED-shaped);
  //      the column default silently mislabels SNOMED codes as ICD-10
  //
  // Dedup: entity_id=0 is a sentinel for aggregate/table-level findings (no
  // single row is the culprit). field='code_system:<VALUE>' gives each distinct
  // system its own ON CONFLICT slot per table, so re-runs are idempotent.
  // entity_id=0 is safe because all real PK sequences start at 1.

  const CODE_SYSTEM_TABLES = ['condition', 'procedure'] as const;
  for (const tbl of CODE_SYSTEM_TABLES) {
    const dist = await sql<{ code_system: string; row_count: number }[]>`
      SELECT code_system, count(*)::int AS row_count
      FROM ${sql.unsafe(`phm_edw.${tbl}`)}
      GROUP BY code_system
    `;

    for (const row of dist) {
      const cs = row.code_system;
      const n = row.row_count;
      const field = `code_system:${cs}`;

      if (!(cs in EDW_TO_VSAC_CODE_SYSTEM)) {
        // Not in the map at all — unknown EDW code_system label
        if (await upsertFinding({
          detector: 'code_system_contract',
          entity_table: tbl,
          entity_id: 0,
          patient_id: null,
          field,
          observed: cs,
          severity: 'warning',
          detail: { code_system: cs, row_count: n, reason: 'unmapped_label' },
        })) bump('code_system_contract');
        continue;
      }

      const vsacLabel = EDW_TO_VSAC_CODE_SYSTEM[cs];
      if (vsacLabel === null) {
        // In the map but null-mapped by design (ICD-9, OTHER) — warn when rows exist
        if (n > 0) {
          if (await upsertFinding({
            detector: 'code_system_contract',
            entity_table: tbl,
            entity_id: 0,
            patient_id: null,
            field,
            observed: cs,
            severity: 'warning',
            detail: { code_system: cs, row_count: n, reason: 'null_mapped_system_has_rows', note: 'ICD-9 and OTHER have no corresponding VSAC code system; codes cannot be reconciled against value sets' },
          })) bump('code_system_contract');
        }
        continue;
      }

      // Mapped to a VSAC label: sample-join to detect zero-overlap (>100 EDW rows threshold).
      // The code column name differs by table: condition_code / procedure_code.
      // Both are VARCHAR(50); the join is against vsac_value_set_code.code (VARCHAR(50)).
      if (n > 100) {
        const codeCol = tbl === 'condition' ? 'condition_code' : 'procedure_code';
        const overlap = await sql<{ overlap_count: number }[]>`
          SELECT count(DISTINCT vc.code)::int AS overlap_count
          FROM (
            SELECT ${sql.unsafe(codeCol)} AS code
            FROM ${sql.unsafe(`phm_edw.${tbl}`)}
            WHERE code_system = ${cs}
            LIMIT 500
          ) edw_sample
          JOIN phm_edw.vsac_value_set_code vc
            ON vc.code = edw_sample.code
           AND vc.code_system = ${vsacLabel}
        `;
        const overlapCount = overlap[0]?.overlap_count ?? 0;
        if (overlapCount === 0) {
          if (await upsertFinding({
            detector: 'code_system_contract',
            entity_table: tbl,
            entity_id: 0,
            patient_id: null,
            field,
            observed: cs,
            severity: 'warning',
            detail: { code_system: cs, vsac_label: vsacLabel, row_count: n, sample_size: 500, overlap_count: 0, reason: 'mapped_zero_overlap' },
          })) bump('code_system_contract');
        }
      }
    }
  }

  // Informational: condition rows with code_system='ICD-10' (the column DEFAULT)
  // but condition_code matching ^[0-9]+$ — SNOMED concept IDs are purely numeric;
  // ICD-10 codes always contain letters. These are SNOMED codes that inherited the
  // column default instead of being explicitly labeled 'SNOMED'.
  const mislabelRows = await sql<{ mislabel_count: number }[]>`
    SELECT count(*)::int AS mislabel_count
    FROM phm_edw.condition
    WHERE code_system = 'ICD-10'
      AND condition_code ~ '^[0-9]+$'
  `;
  const mislabelCount = mislabelRows[0]?.mislabel_count ?? 0;
  if (mislabelCount > 0) {
    if (await upsertFinding({
      detector: 'code_system_contract',
      entity_table: 'condition',
      entity_id: 0,
      patient_id: null,
      field: 'code_system:ICD-10_default_mislabel',
      observed: `ICD-10 (${mislabelCount} rows with numeric codes)`,
      severity: 'info',
      detail: { mislabel_count: mislabelCount, reason: 'icd10_default_mislabel', note: "code_system column defaults to 'ICD-10'; purely numeric codes are SNOMED-shaped and likely miscategorized" },
    })) bump('code_system_contract');
  }

  return { byDetector };
}
