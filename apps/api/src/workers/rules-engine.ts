// =============================================================================
// Medgnosis API — Rules Engine Worker (BullMQ)
// Evaluates clinical alert rules for patients.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { sql } from '@medgnosis/db';
import { ALERT_RULE_KEYS, ALERT_THRESHOLDS } from '@medgnosis/shared';
import { config } from '../config.js';
import { publishAlert } from '../plugins/websocket.js';

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

  for (const gap of overdue) {
    const severity =
      gap.days_overdue >= ALERT_THRESHOLDS.CARE_GAP_CRITICAL_DAYS
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
// Master evaluator
// ---------------------------------------------------------------------------

async function evaluateAllRules(job: { data: RulesJobData }): Promise<void> {
  const { patientId, orgId } = job.data;
  await evaluateCareGapOverdue(patientId, orgId);
  // Additional rules will be added here as the system matures
}

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
