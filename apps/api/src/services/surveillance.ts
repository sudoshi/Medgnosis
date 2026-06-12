// =============================================================================
// Medgnosis API — Surveillance streamer + scorer
// Stream → stratify → delegate. Appends readings to the hot partition, scores
// MEWS + NEWS2 on arrival, and escalates over WebSocket at RRT/emergency tiers.
// =============================================================================

import { sql } from '@medgnosis/db';
import { evaluate } from './rulesEngine.js';
import {
  scoreVitals,
  mewsAction,
  news2Band,
  type Band,
  type LadderRow,
  type TriggerRow,
} from './ewsEngine.js';
import { publishAlert } from '../plugins/websocket.js';

interface Bandsets {
  mewsBands: Band[];
  mewsLadder: LadderRow[];
  news2Bands: Band[];
  news2Triggers: TriggerRow[];
}

async function loadBandsets(): Promise<Bandsets> {
  const [mb, ml, nb, nt] = await Promise.all([
    evaluate('MEWS', 'SCORING_BAND'),
    evaluate('MEWS', 'ACTION_LADDER'),
    evaluate('NEWS2', 'SCORING_BAND'),
    evaluate('NEWS2', 'TRIGGER'),
  ]);
  return {
    mewsBands: mb.map((r) => r.value_jsonb as Band),
    mewsLadder: ml.map((r) => r.value_jsonb as LadderRow),
    news2Bands: nb.map((r) => r.value_jsonb as Band),
    news2Triggers: nt.map((r) => r.value_jsonb as TriggerRow),
  };
}

interface VitalRow {
  reading_id: number;
  patient_id: number;
  temp_c: string | null;
  heart_rate: number | null;
  systolic_bp: number | null;
  resp_rate: number | null;
  spo2: number | null;
  on_oxygen: boolean;
  consciousness: string;
  gcs: number;
}

export interface AdmissionScore {
  mews: number;
  news2: number;
  mewsBand: string;
  news2Band: string;
}

/** Score the latest vital reading for an admission; writes MEWS+NEWS2 rows. */
export async function scoreAdmission(
  admissionId: number,
  bandsets?: Bandsets,
): Promise<AdmissionScore | null> {
  const bs = bandsets ?? (await loadBandsets());

  const [v] = await sql<VitalRow[]>`
    SELECT reading_id, patient_id, temp_c::text AS temp_c, heart_rate, systolic_bp,
           resp_rate, spo2, on_oxygen, consciousness, gcs
    FROM phm_rt.vital_stream
    WHERE admission_id = ${admissionId}
    ORDER BY recorded_datetime DESC
    LIMIT 1
  `;
  if (!v) return null;

  const tempC = v.temp_c != null ? Number(v.temp_c) : null;

  // MEWS — temp, HR, SBP, RR, GCS
  const mews = scoreVitals(
    { temp_c: tempC, heart_rate: v.heart_rate, systolic_bp: v.systolic_bp, resp_rate: v.resp_rate, gcs: v.gcs },
    bs.mewsBands,
  );
  const mewsAct = mewsAction(mews.total, bs.mewsLadder);

  // NEWS2 — RR, SpO2, O2, SBP, HR, consciousness, temp
  const news2 = scoreVitals(
    {
      resp_rate: v.resp_rate, spo2: v.spo2, on_oxygen: v.on_oxygen,
      systolic_bp: v.systolic_bp, heart_rate: v.heart_rate,
      consciousness: v.consciousness === 'A' ? 'A' : 'CVPU', temp_c: tempC,
    },
    bs.news2Bands,
  );
  const news2Trig = news2Band(news2.total, news2.maxSingleParam, bs.news2Triggers);

  await sql`
    INSERT INTO phm_rt.ews_score (admission_id, patient_id, score_type, score, band, action, components, reading_id)
    VALUES
      (${admissionId}, ${v.patient_id}, 'MEWS', ${mews.total}, ${mewsAct?.owner ?? 'Bedside RN'},
       ${mewsAct?.action ?? null}, ${sql.json(mews.components)}, ${v.reading_id}),
      (${admissionId}, ${v.patient_id}, 'NEWS2', ${news2.total}, ${news2Trig.band},
       ${news2Trig.response}, ${sql.json(news2.components)}, ${v.reading_id})
  `;

  // Escalate: MEWS >= 5 (RRT) or NEWS2 >= 7 (emergency)
  if (mews.total >= 5 || news2.total >= 7) {
    await publishAlert(String(v.patient_id), '', {
      alertId: `ews-${admissionId}-${v.reading_id}`,
      severity: 'critical',
      title: `Deterioration: MEWS ${mews.total} / NEWS2 ${news2.total}`,
      ruleKey: 'EWS_ESCALATION',
      patientId: String(v.patient_id),
    }).catch(() => { /* WebSocket optional — never break scoring */ });
  }

  return { mews: mews.total, news2: news2.total, mewsBand: mewsAct?.owner ?? '', news2Band: news2Trig.band };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface TickResult {
  ticked: number;
  alerts: number;
}

/**
 * One surveillance tick: append a fresh vital reading (random walk from the
 * last) for each admitted patient, occasionally a glucose/insulin, then score.
 */
export async function streamTick(): Promise<TickResult> {
  const bs = await loadBandsets();
  const admissions = await sql<{ admission_id: number; patient_id: number }[]>`
    SELECT admission_id, patient_id FROM phm_rt.admission WHERE status = 'admitted'
  `;

  let alerts = 0;
  for (const a of admissions) {
    const [last] = await sql<VitalRow[]>`
      SELECT temp_c::text AS temp_c, heart_rate, systolic_bp, resp_rate, spo2, on_oxygen, consciousness, gcs
      FROM phm_rt.vital_stream WHERE admission_id = ${a.admission_id}
      ORDER BY recorded_datetime DESC LIMIT 1
    `;
    const walk = (base: number, span: number): number => base + Math.round((Math.random() - 0.5) * span);
    const temp = last?.temp_c ? Number(last.temp_c) : 36.8;
    const hr = clamp(walk(last?.heart_rate ?? 78, 8), 40, 150);
    const sbp = clamp(walk(last?.systolic_bp ?? 120, 10), 80, 200);
    const rr = clamp(walk(last?.resp_rate ?? 16, 3), 8, 32);
    const spo2 = clamp(walk(last?.spo2 ?? 97, 2), 88, 100);

    await sql`
      INSERT INTO phm_rt.vital_stream
        (admission_id, patient_id, temp_c, heart_rate, systolic_bp, resp_rate, spo2, on_oxygen, consciousness, gcs)
      VALUES (${a.admission_id}, ${a.patient_id}, ${clamp(temp, 35, 39).toFixed(1)}, ${hr}, ${sbp}, ${rr}, ${spo2},
              ${last?.on_oxygen ?? false}, ${last?.consciousness ?? 'A'}, ${last?.gcs ?? 15})
    `;

    // Occasional glucose + insulin (every 3rd admission per tick)
    if (a.admission_id % 3 === 0) {
      const glucose = clamp(walk(140, 60), 70, 360);
      await sql`INSERT INTO phm_rt.glucose_stream (admission_id, patient_id, glucose_mgdl) VALUES (${a.admission_id}, ${a.patient_id}, ${glucose})`;
      if (glucose > 200) {
        await sql`INSERT INTO phm_rt.insulin_admin (admission_id, patient_id, dose_units, product)
          VALUES (${a.admission_id}, ${a.patient_id}, ${clamp(Math.round((glucose - 140) / 40), 2, 12)}, 'Insulin Lispro 100 UNT/ML Injectable Solution [Humalog]')`;
      }
    }

    const score = await scoreAdmission(a.admission_id, bs);
    if (score && (score.mews >= 5 || score.news2 >= 7)) alerts += 1;
  }

  return { ticked: admissions.length, alerts };
}
