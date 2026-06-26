// =============================================================================
// Medgnosis API — Rules Engine Worker (BullMQ)
// Evaluates clinical alert rules for patients.
//
// Phase 6 — expanded clinical rules engine. Every rule family follows the
// RULE-001 pattern established below:
//   1. Thresholds resolve from the clinical_rule table via getNumericThreshold,
//      with the shared @medgnosis/shared constant as the fallback — a rules-table
//      outage never breaks evaluation.
//   2. Duplicate suppression: an open, unacknowledged alert for the same
//      (patient, rule_key) is never re-created within the active window.
//   3. Idempotent writes + auto-resolution: open alerts for a rule whose
//      triggering condition no longer holds are auto-resolved.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { sql } from '@medgnosis/db';
import { ALERT_RULE_KEYS, ALERT_THRESHOLDS } from '@medgnosis/shared';
import { config } from '../config.js';
import { publishAlert } from '../plugins/websocket.js';
import { getNumericThreshold } from '../services/rulesEngine.js';

export const RULES_QUEUE_NAME = 'medgnosis-rules';

export const connection = {
  host: new URL(config.redisUrl).hostname,
  port: Number(new URL(config.redisUrl).port || 6379),
};

export const rulesQueue = new Queue(RULES_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export interface RulesJobData {
  patientId: string;
  orgId: string;
  triggeredBy: 'care_gap_check' | 'nightly_batch';
}

// ---------------------------------------------------------------------------
// Shared alert primitives — reused by every rule family so suppression and
// resolution behave identically across rules (DRY: extract once a pattern
// repeats 3+ times).
// ---------------------------------------------------------------------------

type AlertSeverity = 'info' | 'warning' | 'critical';

/** clinical_alerts.alert_type CHECK-constrained values used by these rules. */
type AlertType =
  | 'care_gap_overdue'
  | 'lab_critical'
  | 'medication_adherence'
  | 'custom';

interface AlertInput {
  patientId: string;
  orgId: string;
  alertType: AlertType;
  ruleKey: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  ruleContext: Record<string, unknown>;
}

/**
 * Return TRUE when an open (not auto-resolved, not acknowledged) alert already
 * exists for this (patient, rule_key) — the duplicate-suppression window. Open
 * alerts persist until either acknowledged by a user or auto-resolved when the
 * triggering condition clears, so an unresolved signal is never duplicated.
 */
async function hasOpenAlert(patientId: string, ruleKey: string): Promise<boolean> {
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM clinical_alerts
    WHERE patient_id = ${patientId}::int
      AND rule_key = ${ruleKey}
      AND auto_resolved = FALSE
      AND acknowledged_at IS NULL
    LIMIT 1
  `;
  return Boolean(existing);
}

/**
 * Insert an alert (idempotently — callers gate on hasOpenAlert first) and
 * broadcast it. Returns the new alert id, or null when suppressed/not written.
 */
async function createAlert(input: AlertInput): Promise<string | null> {
  const [alert] = await sql<{ id: string }[]>`
    INSERT INTO clinical_alerts
      (patient_id, org_id, alert_type, rule_key, severity, title, body, rule_context)
    VALUES (
      ${input.patientId}::int, ${input.orgId ? Number(input.orgId) : null},
      ${input.alertType}, ${input.ruleKey},
      ${input.severity},
      ${input.title},
      ${input.body},
      ${JSON.stringify(input.ruleContext)}::JSONB
    )
    RETURNING id
  `;

  if (!alert) return null;

  await publishAlert(input.patientId, input.orgId, {
    alertId: alert.id,
    severity: input.severity,
    title: input.title,
    ruleKey: input.ruleKey,
    patientId: input.patientId,
  });

  return alert.id;
}

/**
 * Auto-resolve every still-open alert for this (patient, rule_key) — used when a
 * rule's triggering condition no longer holds (e.g. the latest vital is back in
 * range). Auto-resolution is non-destructive: the alert row is retained with
 * auto_resolved = TRUE and a resolved_at timestamp for audit/trend history.
 */
async function autoResolveOpenAlerts(patientId: string, ruleKey: string): Promise<void> {
  await sql`
    UPDATE clinical_alerts
    SET auto_resolved = TRUE,
        resolved_at = NOW(),
        updated_at = NOW()
    WHERE patient_id = ${patientId}::int
      AND rule_key = ${ruleKey}
      AND auto_resolved = FALSE
      AND acknowledged_at IS NULL
  `;
}

// ---------------------------------------------------------------------------
// RULE-001: Care gap overdue
// ---------------------------------------------------------------------------

async function evaluateCareGapOverdue(
  patientId: string,
  orgId: string,
): Promise<void> {
  const overdue = await sql<{
    care_gap_id: number;
    measure_name: string;
    days_overdue: number;
  }[]>`
    SELECT
      cg.care_gap_id,
      COALESCE(md.measure_name, 'Unknown') AS measure_name,
      EXTRACT(DAY FROM NOW() - cg.due_date)::int AS days_overdue
    FROM phm_edw.care_gap cg
    LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
    WHERE cg.patient_id = ${patientId}::int
      AND cg.gap_status = 'open'
      AND cg.active_ind = 'Y'
      AND cg.due_date < NOW()
  `;

  // Threshold resolved from the rules engine (clinical_rule), with the shared
  // constant as the fallback — a rules-table outage never breaks evaluation.
  const criticalDays = await getNumericThreshold(
    'ALERT_THRESHOLDS',
    'CARE_GAP_CRITICAL_DAYS',
    ALERT_THRESHOLDS.CARE_GAP_CRITICAL_DAYS,
  );

  for (const gap of overdue) {
    const severity =
      gap.days_overdue >= criticalDays
        ? 'critical' as const
        : 'warning' as const;

    // Check for existing open alert
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM clinical_alerts
      WHERE patient_id = ${patientId}::int
        AND rule_key = ${ALERT_RULE_KEYS.CARE_GAP_OVERDUE}
        AND auto_resolved = FALSE
        AND acknowledged_at IS NULL
      LIMIT 1
    `;

    if (existing) continue; // suppress duplicate

    const [alert] = await sql<{ id: string }[]>`
      INSERT INTO clinical_alerts
        (patient_id, org_id, alert_type, rule_key, severity, title, body, rule_context)
      VALUES (
        ${patientId}::int, ${orgId ? Number(orgId) : null},
        'care_gap_overdue', ${ALERT_RULE_KEYS.CARE_GAP_OVERDUE},
        ${severity},
        ${`Care gap overdue: ${gap.measure_name}`},
        ${`${gap.measure_name} is ${gap.days_overdue} days overdue`},
        ${JSON.stringify({ gap_id: gap.care_gap_id, days_overdue: gap.days_overdue })}::JSONB
      )
      RETURNING id
    `;

    if (alert) {
      await publishAlert(patientId, orgId, {
        alertId: alert.id,
        severity,
        title: `Care gap overdue: ${gap.measure_name}`,
        ruleKey: ALERT_RULE_KEYS.CARE_GAP_OVERDUE,
        patientId,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// RULE-009: Abnormal vitals
// Evaluates the single most recent vital_sign reading within the lookback
// window against critical physiological boundaries. A reading older than the
// window is not actionable and is ignored.
// ---------------------------------------------------------------------------

interface LatestVitals {
  vital_id: number;
  recorded_datetime: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  spo2_percent: string | null; // NUMERIC → string
  respiratory_rate: number | null;
  temperature_f: string | null; // NUMERIC → string
}

interface VitalBreach {
  measure: string;
  value: number;
  threshold: number;
  direction: 'high' | 'low';
}

async function evaluateAbnormalVitals(patientId: string, orgId: string): Promise<void> {
  const lookbackDays = await getNumericThreshold(
    'ALERT_THRESHOLDS',
    'VITALS_LOOKBACK_DAYS',
    ALERT_THRESHOLDS.VITALS_LOOKBACK_DAYS,
  );

  const [latest] = await sql<LatestVitals[]>`
    SELECT
      vital_id,
      recorded_datetime,
      bp_systolic,
      bp_diastolic,
      heart_rate,
      spo2_percent,
      respiratory_rate,
      temperature_f
    FROM phm_edw.vital_sign
    WHERE patient_id = ${patientId}::int
      AND active_ind = 'Y'
      AND recorded_datetime >= NOW() - (${lookbackDays}::int * INTERVAL '1 day')
    ORDER BY recorded_datetime DESC
    LIMIT 1
  `;

  if (!latest) {
    // No recent reading — nothing can be in breach; clear any stale alert.
    await autoResolveOpenAlerts(patientId, ALERT_RULE_KEYS.ABNORMAL_VITALS);
    return;
  }

  const [
    sbpHigh,
    sbpLow,
    dbpHigh,
    hrHigh,
    hrLow,
    spo2Low,
    rrHigh,
    tempHigh,
  ] = await Promise.all([
    getNumericThreshold('ALERT_THRESHOLDS', 'VITALS_SBP_CRITICAL_HIGH', ALERT_THRESHOLDS.VITALS_SBP_CRITICAL_HIGH),
    getNumericThreshold('ALERT_THRESHOLDS', 'VITALS_SBP_CRITICAL_LOW', ALERT_THRESHOLDS.VITALS_SBP_CRITICAL_LOW),
    getNumericThreshold('ALERT_THRESHOLDS', 'VITALS_DBP_CRITICAL_HIGH', ALERT_THRESHOLDS.VITALS_DBP_CRITICAL_HIGH),
    getNumericThreshold('ALERT_THRESHOLDS', 'VITALS_HR_CRITICAL_HIGH', ALERT_THRESHOLDS.VITALS_HR_CRITICAL_HIGH),
    getNumericThreshold('ALERT_THRESHOLDS', 'VITALS_HR_CRITICAL_LOW', ALERT_THRESHOLDS.VITALS_HR_CRITICAL_LOW),
    getNumericThreshold('ALERT_THRESHOLDS', 'VITALS_SPO2_CRITICAL_LOW', ALERT_THRESHOLDS.VITALS_SPO2_CRITICAL_LOW),
    getNumericThreshold('ALERT_THRESHOLDS', 'VITALS_RR_CRITICAL_HIGH', ALERT_THRESHOLDS.VITALS_RR_CRITICAL_HIGH),
    getNumericThreshold('ALERT_THRESHOLDS', 'VITALS_TEMP_CRITICAL_HIGH', ALERT_THRESHOLDS.VITALS_TEMP_CRITICAL_HIGH),
  ]);

  const num = (v: number | string | null): number | null =>
    v === null ? null : Number(v);

  const breaches: VitalBreach[] = [];
  const sbp = num(latest.bp_systolic);
  const dbp = num(latest.bp_diastolic);
  const hr = num(latest.heart_rate);
  const spo2 = num(latest.spo2_percent);
  const rr = num(latest.respiratory_rate);
  const temp = num(latest.temperature_f);

  if (sbp !== null && sbp >= sbpHigh) breaches.push({ measure: 'Systolic BP', value: sbp, threshold: sbpHigh, direction: 'high' });
  if (sbp !== null && sbp <= sbpLow) breaches.push({ measure: 'Systolic BP', value: sbp, threshold: sbpLow, direction: 'low' });
  if (dbp !== null && dbp >= dbpHigh) breaches.push({ measure: 'Diastolic BP', value: dbp, threshold: dbpHigh, direction: 'high' });
  if (hr !== null && hr >= hrHigh) breaches.push({ measure: 'Heart rate', value: hr, threshold: hrHigh, direction: 'high' });
  if (hr !== null && hr <= hrLow) breaches.push({ measure: 'Heart rate', value: hr, threshold: hrLow, direction: 'low' });
  if (spo2 !== null && spo2 <= spo2Low) breaches.push({ measure: 'SpO2', value: spo2, threshold: spo2Low, direction: 'low' });
  if (rr !== null && rr >= rrHigh) breaches.push({ measure: 'Respiratory rate', value: rr, threshold: rrHigh, direction: 'high' });
  if (temp !== null && temp >= tempHigh) breaches.push({ measure: 'Temperature', value: temp, threshold: tempHigh, direction: 'high' });

  if (breaches.length === 0) {
    // Latest reading is back in range — resolve any open vitals alert.
    await autoResolveOpenAlerts(patientId, ALERT_RULE_KEYS.ABNORMAL_VITALS);
    return;
  }

  if (await hasOpenAlert(patientId, ALERT_RULE_KEYS.ABNORMAL_VITALS)) return;

  const summary = breaches
    .map((b) => `${b.measure} ${b.value} (${b.direction === 'high' ? '≥' : '≤'} ${b.threshold})`)
    .join('; ');

  await createAlert({
    patientId,
    orgId,
    alertType: 'custom',
    ruleKey: ALERT_RULE_KEYS.ABNORMAL_VITALS,
    severity: 'critical',
    title: 'Abnormal vital signs',
    body: `Critical vital sign(s): ${summary}`,
    ruleContext: {
      vital_id: latest.vital_id,
      recorded_datetime: latest.recorded_datetime,
      breaches,
    },
  });
}

// ---------------------------------------------------------------------------
// RULE-010: High-risk lab result
// Evaluates the most recent observation per analyte (within the lookback
// window) against critical low/high boundaries. Analytes are matched by their
// standard LOINC observation_code.
// ---------------------------------------------------------------------------

interface LabAnalyte {
  name: string;
  loincCodes: string[];
  highKey: keyof typeof ALERT_THRESHOLDS | null;
  highFallback: number | null;
  lowKey: keyof typeof ALERT_THRESHOLDS | null;
  lowFallback: number | null;
  unit: string;
}

const LAB_ANALYTES: readonly LabAnalyte[] = [
  {
    name: 'Potassium',
    loincCodes: ['2823-3'],
    highKey: 'LAB_POTASSIUM_CRITICAL_HIGH',
    highFallback: ALERT_THRESHOLDS.LAB_POTASSIUM_CRITICAL_HIGH,
    lowKey: 'LAB_POTASSIUM_CRITICAL_LOW',
    lowFallback: ALERT_THRESHOLDS.LAB_POTASSIUM_CRITICAL_LOW,
    unit: 'mmol/L',
  },
  {
    name: 'Glucose',
    loincCodes: ['2339-0', '2345-7'],
    highKey: 'LAB_GLUCOSE_CRITICAL_HIGH',
    highFallback: ALERT_THRESHOLDS.LAB_GLUCOSE_CRITICAL_HIGH,
    lowKey: 'LAB_GLUCOSE_CRITICAL_LOW',
    lowFallback: ALERT_THRESHOLDS.LAB_GLUCOSE_CRITICAL_LOW,
    unit: 'mg/dL',
  },
  {
    name: 'Creatinine',
    loincCodes: ['2160-0', '38483-4'],
    highKey: 'LAB_CREATININE_CRITICAL_HIGH',
    highFallback: ALERT_THRESHOLDS.LAB_CREATININE_CRITICAL_HIGH,
    lowKey: null,
    lowFallback: null,
    unit: 'mg/dL',
  },
] as const;

interface LatestLab {
  observation_id: number;
  observation_code: string;
  observation_datetime: string;
  value_numeric: string | null;
  units: string | null;
}

async function evaluateLabCriticalValue(patientId: string, orgId: string): Promise<void> {
  const lookbackDays = await getNumericThreshold(
    'ALERT_THRESHOLDS',
    'LAB_LOOKBACK_DAYS',
    ALERT_THRESHOLDS.LAB_LOOKBACK_DAYS,
  );

  const allCodes = LAB_ANALYTES.flatMap((a) => a.loincCodes);

  // Most recent numeric observation per analyte code within the window.
  const rows = await sql<LatestLab[]>`
    SELECT DISTINCT ON (observation_code)
      observation_id,
      observation_code,
      observation_datetime,
      value_numeric,
      units
    FROM phm_edw.observation
    WHERE patient_id = ${patientId}::int
      AND active_ind = 'Y'
      AND observation_code = ANY(${allCodes})
      AND value_numeric IS NOT NULL
      AND observation_datetime >= NOW() - (${lookbackDays}::int * INTERVAL '1 day')
    ORDER BY observation_code, observation_datetime DESC
  `;

  const breaches: Array<{
    analyte: string;
    value: number;
    threshold: number;
    direction: 'high' | 'low';
    unit: string;
    observation_id: number;
  }> = [];

  for (const analyte of LAB_ANALYTES) {
    const latest = rows.find((r) => analyte.loincCodes.includes(r.observation_code));
    if (!latest || latest.value_numeric === null) continue;
    const value = Number(latest.value_numeric);

    if (analyte.highKey && analyte.highFallback !== null) {
      const threshold = await getNumericThreshold('ALERT_THRESHOLDS', analyte.highKey, analyte.highFallback);
      if (value >= threshold) {
        breaches.push({ analyte: analyte.name, value, threshold, direction: 'high', unit: analyte.unit, observation_id: latest.observation_id });
        continue;
      }
    }
    if (analyte.lowKey && analyte.lowFallback !== null) {
      const threshold = await getNumericThreshold('ALERT_THRESHOLDS', analyte.lowKey, analyte.lowFallback);
      if (value <= threshold) {
        breaches.push({ analyte: analyte.name, value, threshold, direction: 'low', unit: analyte.unit, observation_id: latest.observation_id });
      }
    }
  }

  if (breaches.length === 0) {
    await autoResolveOpenAlerts(patientId, ALERT_RULE_KEYS.LAB_CRITICAL_VALUE);
    return;
  }

  if (await hasOpenAlert(patientId, ALERT_RULE_KEYS.LAB_CRITICAL_VALUE)) return;

  const summary = breaches
    .map((b) => `${b.analyte} ${b.value} ${b.unit} (${b.direction === 'high' ? '≥' : '≤'} ${b.threshold})`)
    .join('; ');

  await createAlert({
    patientId,
    orgId,
    alertType: 'lab_critical',
    ruleKey: ALERT_RULE_KEYS.LAB_CRITICAL_VALUE,
    severity: 'critical',
    title: 'Critical lab value',
    body: `High-risk lab result(s): ${summary}`,
    ruleContext: { breaches },
  });
}

// ---------------------------------------------------------------------------
// RULE-011: Medication safety — duplicate active therapy
// Two or more concurrently-active orders for the same medication is a
// recognized medication-safety signal (duplicate therapy / order error).
// ---------------------------------------------------------------------------

interface DuplicateTherapy {
  medication_id: number;
  medication_name: string;
  order_count: number;
}

async function evaluateMedicationDuplicateTherapy(patientId: string, orgId: string): Promise<void> {
  const minOrders = await getNumericThreshold(
    'ALERT_THRESHOLDS',
    'MED_DUPLICATE_THERAPY_MIN_ORDERS',
    ALERT_THRESHOLDS.MED_DUPLICATE_THERAPY_MIN_ORDERS,
  );

  // An order is "active" when not end-dated (or end-dated in the future) and the
  // row is active. Group by medication to find concurrent duplicates.
  const duplicates = await sql<DuplicateTherapy[]>`
    SELECT
      mo.medication_id,
      m.medication_name,
      COUNT(*)::int AS order_count
    FROM phm_edw.medication_order mo
    JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
    WHERE mo.patient_id = ${patientId}::int
      AND mo.active_ind = 'Y'
      AND (mo.end_datetime IS NULL OR mo.end_datetime > NOW())
    GROUP BY mo.medication_id, m.medication_name
    HAVING COUNT(*) >= ${minOrders}::int
    ORDER BY order_count DESC, m.medication_name
  `;

  if (duplicates.length === 0) {
    await autoResolveOpenAlerts(patientId, ALERT_RULE_KEYS.MEDICATION_DUPLICATE_THERAPY);
    return;
  }

  if (await hasOpenAlert(patientId, ALERT_RULE_KEYS.MEDICATION_DUPLICATE_THERAPY)) return;

  const summary = duplicates
    .map((d) => `${d.medication_name} (${d.order_count} active orders)`)
    .join('; ');

  await createAlert({
    patientId,
    orgId,
    alertType: 'medication_adherence',
    ruleKey: ALERT_RULE_KEYS.MEDICATION_DUPLICATE_THERAPY,
    severity: 'warning',
    title: 'Duplicate active medication therapy',
    body: `Duplicate active therapy detected: ${summary}`,
    ruleContext: { duplicates },
  });
}

// ---------------------------------------------------------------------------
// Master evaluator
// ---------------------------------------------------------------------------

async function evaluateAllRules(job: { data: RulesJobData }): Promise<void> {
  const { patientId, orgId, triggeredBy } = job.data;

  // Care-gap-triggered checks run the gap rule plus the fast safety rules so a
  // gap-driven re-evaluation also surfaces any newly-critical vitals/labs/meds.
  await evaluateCareGapOverdue(patientId, orgId);
  await evaluateAbnormalVitals(patientId, orgId);
  await evaluateLabCriticalValue(patientId, orgId);
  await evaluateMedicationDuplicateTherapy(patientId, orgId);

  // (No additional nightly-only families yet; nightly_batch runs the same set.)
  void triggeredBy;
}

// ---------------------------------------------------------------------------
// Test surface — individual evaluators are exported so each rule family can be
// unit-tested in isolation without standing up the BullMQ worker.
// ---------------------------------------------------------------------------

export const __testables = {
  evaluateCareGapOverdue,
  evaluateAbnormalVitals,
  evaluateLabCriticalValue,
  evaluateMedicationDuplicateTherapy,
  evaluateAllRules,
};

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function startRulesWorker(): Worker<RulesJobData> {
  const worker = new Worker<RulesJobData>(
    RULES_QUEUE_NAME,
    evaluateAllRules,
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job) => {
    console.info(`[rules] Job ${job.id} completed — patient ${job.data.patientId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[rules] Job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}
