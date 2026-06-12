// =============================================================================
// Medgnosis API — Auto-Orders generation
// "Co-sign once. The protocol does the rest." For each active enrollment,
// generate the recurring orders that are due — future-dated, order_source
// 'protocol'. Physicians hold both keys: enrollment requires a co-sign and
// dis-enrollment is one action away. The automation is an offer, not a mandate.
// =============================================================================

import { sql } from '@medgnosis/db';

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function isExcluded(flags: { hospice: boolean; palliative: boolean; inactive: boolean }): boolean {
  return flags.hospice || flags.palliative || flags.inactive;
}

/** Due if never ordered, or the interval has elapsed since the last order. */
export function isItemDue(lastOrderedISO: string | null, intervalDays: number, todayISO: string): boolean {
  if (!lastOrderedISO) return true;
  const last = new Date(`${lastOrderedISO}T00:00:00Z`);
  const today = new Date(`${todayISO}T00:00:00Z`);
  const elapsedDays = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
  return elapsedDays >= intervalDays;
}

/** 5-year standing enrollment. */
export function expiryDate(enrolledISO: string): string {
  const d = new Date(`${enrolledISO}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 5);
  return d.toISOString().slice(0, 10);
}

// ─── DB orchestration ────────────────────────────────────────────────────────

export interface GenerateResult {
  enrollments: number;
  generated: number;
}

interface DueItem {
  enrollment_id: number;
  patient_id: number;
  item_id: number;
  interval_days: number;
  item_name: string;
  item_type: string;
  loinc_code: string | null;
  cpt_code: string | null;
}

const FUTURE_DATE_DAYS = 180;

/**
 * Generate due orders for every active, non-expired enrollment. Each (patient,
 * protocol item) produces at most one future-dated clinical_order when due
 * (no order with that LOINC within interval_days). Bounded to enrolled patients.
 */
export async function generateForEnrollments(): Promise<GenerateResult> {
  const items = await sql<DueItem[]>`
    SELECT e.enrollment_id, e.patient_id, pi.item_id, pi.interval_days,
           osi.item_name, osi.item_type, osi.loinc_code, osi.cpt_code
    FROM phm_edw.protocol_enrollment e
    JOIN phm_edw.order_protocol_item pi ON pi.protocol_id = e.protocol_id AND pi.active_ind = 'Y'
    JOIN phm_edw.order_set_item osi ON osi.item_id = pi.item_id
    WHERE e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at >= CURRENT_DATE)
  `;

  const enrollments = new Set(items.map((i) => i.enrollment_id)).size;
  let generated = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const item of items) {
    // Last order of this LOINC for the patient (text date for the pure helper).
    const [last] = item.loinc_code
      ? await sql<{ d: string | null }[]>`
          SELECT MAX(order_datetime)::date::text AS d
          FROM phm_edw.clinical_order
          WHERE patient_id = ${item.patient_id} AND loinc_code = ${item.loinc_code} AND active_ind = 'Y'
        `
      : [{ d: null }];

    if (!isItemDue(last?.d ?? null, item.interval_days, today)) continue;

    await sql`
      INSERT INTO phm_edw.clinical_order
        (patient_id, order_type, order_name, loinc_code, cpt_code, priority,
         order_datetime, due_date, order_status, order_source)
      VALUES (
        ${item.patient_id}, ${item.item_type}, ${item.item_name},
        ${item.loinc_code}, ${item.cpt_code}, 'routine',
        NOW(), (CURRENT_DATE + ${FUTURE_DATE_DAYS})::date, 'Future', 'protocol'
      )
    `;
    generated += 1;
  }

  return { enrollments, generated };
}
