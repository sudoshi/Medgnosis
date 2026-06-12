// =============================================================================
// Medgnosis API — Inpatient Glucometrics
// "If the disease moves on a four-hour clock, the analytics can't move on a
// twenty-four-hour one." Two transparent rules: any reading >=300 in 24h, or a
// 24h average >=180. Both bedside-defensible, both stored in the rules engine.
// =============================================================================

import { sql } from '@medgnosis/db';
import { getNumericThreshold } from './rulesEngine.js';

export interface GlucoseReading {
  glucose_mgdl: number;
  reading_datetime: string;
}

export interface GlucoThresholds {
  single: number;
  avg24h: number;
}

const DAY_MS = 86_400_000;

/** Mean of readings within the last 24h of `nowISO`, or null if none. */
export function avg24h(readings: GlucoseReading[], nowISO: string): number | null {
  const now = new Date(nowISO).getTime();
  const recent = readings.filter((r) => now - new Date(r.reading_datetime).getTime() <= DAY_MS);
  if (recent.length === 0) return null;
  const sum = recent.reduce((s, r) => s + r.glucose_mgdl, 0);
  return sum / recent.length;
}

export interface GlucoRisk {
  highRisk: boolean;
  reasons: string[];
  avg: number | null;
  maxReading: number | null;
}

/** Two-rule triage over a patient's recent glucose readings. */
export function glucoseRisk(readings: GlucoseReading[], nowISO: string, th: GlucoThresholds): GlucoRisk {
  const now = new Date(nowISO).getTime();
  const recent = readings.filter((r) => now - new Date(r.reading_datetime).getTime() <= DAY_MS);
  const reasons: string[] = [];

  const maxReading = recent.length ? Math.max(...recent.map((r) => r.glucose_mgdl)) : null;
  const avg = avg24h(readings, nowISO);

  if (maxReading != null && maxReading >= th.single) reasons.push('severe_excursion');
  if (avg != null && avg >= th.avg24h) reasons.push('persistent');

  return { highRisk: reasons.length > 0, reasons, avg, maxReading };
}

// ─── DB orchestration ────────────────────────────────────────────────────────

export interface GlucoCensusRow {
  admission_id: number;
  patient_id: number;
  patient_name: string;
  unit: string;
  bed: string;
  avg_24h: number | null;
  max_24h: number | null;
  high_risk: boolean;
  reasons: string[];
}

/**
 * Triage the inpatient census by the two glucometrics rules. Thresholds from
 * the GLUCOMETRICS rules-engine entity. Cohort = active admissions (small).
 */
export async function glucoCensus(): Promise<GlucoCensusRow[]> {
  const single = await getNumericThreshold('GLUCOMETRICS', 'HIGH_RISK_SINGLE_MGDL', 300);
  const avgTh = await getNumericThreshold('GLUCOMETRICS', 'HIGH_RISK_AVG_24H_MGDL', 180);
  const now = new Date().toISOString();

  const admissions = await sql<{ admission_id: number; patient_id: number; patient_name: string; unit: string; bed: string }[]>`
    SELECT a.admission_id, a.patient_id, a.unit, a.bed,
           p.first_name || ' ' || p.last_name AS patient_name
    FROM phm_rt.admission a
    JOIN phm_edw.patient p ON p.patient_id = a.patient_id
    WHERE a.status = 'admitted'
    ORDER BY a.unit, a.bed
  `;

  const out: GlucoCensusRow[] = [];
  for (const a of admissions) {
    const readings = await sql<GlucoseReading[]>`
      SELECT glucose_mgdl, reading_datetime::text AS reading_datetime
      FROM phm_rt.glucose_stream
      WHERE admission_id = ${a.admission_id}
        AND reading_datetime >= NOW() - INTERVAL '24 hours'
      ORDER BY reading_datetime DESC
    `;
    const risk = glucoseRisk(readings, now, { single, avg24h: avgTh });
    out.push({
      admission_id: a.admission_id,
      patient_id: a.patient_id,
      patient_name: a.patient_name,
      unit: a.unit,
      bed: a.bed,
      avg_24h: risk.avg != null ? Math.round(risk.avg) : null,
      max_24h: risk.maxReading,
      high_risk: risk.highRisk,
      reasons: risk.reasons,
    });
  }
  return out;
}
