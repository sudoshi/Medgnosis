// =============================================================================
// Medgnosis DB — Demo seed script
// Populates app tables with sample care gaps, clinical alerts, and AI insights
// for development and testing. Requires the legacy data to already be loaded
// (phm_edw schema with patients and measures).
// =============================================================================

import { sql } from './client.js';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  console.info('[seed-demo] Seeding demo data...');

  // Verify prerequisites
  const [patientCheck] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM phm_edw.patient
  `;
  if (!patientCheck || patientCheck.count === 0) {
    console.warn('[seed-demo] No patients found in phm_edw. Run database restore or ETL first.');
    await sql.end();
    return;
  }
  console.info(`[seed-demo] Found ${patientCheck.count.toLocaleString()} patients in phm_edw.`);

  await seedDemoUsers();
  await seedCareGaps();
  await seedClinicalAlerts();
  await seedAiInsights();
  await seedPatientRiskHistory();

  console.info('[seed-demo] Demo data seeded successfully.');
  await sql.end();
}

// ---------------------------------------------------------------------------
// Demo users (provider + analyst roles)
// ---------------------------------------------------------------------------
async function seedDemoUsers(): Promise<void> {
  console.info('[seed-demo] Seeding demo users...');
  const hash = await bcrypt.hash('password', BCRYPT_ROUNDS);

  const users = [
    { email: 'dr.chen@medgnosis.app', first: 'Sarah', last: 'Chen', role: 'provider' },
    { email: 'nurse.williams@medgnosis.app', first: 'James', last: 'Williams', role: 'provider' },
    { email: 'analyst@medgnosis.app', first: 'Maria', last: 'Rodriguez', role: 'analyst' },
    { email: 'coordinator@medgnosis.app', first: 'David', last: 'Kim', role: 'care_coordinator' },
  ];

  for (const u of users) {
    await sql`
      INSERT INTO app_users (email, password_hash, first_name, last_name, role, mfa_enabled)
      VALUES (${u.email}, ${hash}, ${u.first}, ${u.last}, ${u.role}, FALSE)
      ON CONFLICT (email) DO NOTHING
    `;
  }
  console.info(`[seed-demo] ${users.length} demo users created.`);
}

// ---------------------------------------------------------------------------
// Care gaps — sample open/closed gaps for real patients against real measures
// ---------------------------------------------------------------------------
async function seedCareGaps(): Promise<void> {
  console.info('[seed-demo] Seeding care gaps...');

  // Get sample patients and measures
  const patients = await sql<{ patient_id: number }[]>`
    SELECT patient_id FROM phm_edw.patient ORDER BY patient_id LIMIT 200
  `;
  const measures = await sql<{ measure_id: number; measure_code: string }[]>`
    SELECT measure_id, measure_code FROM phm_edw.measure_definition WHERE active_ind = 'Y'
  `;

  if (measures.length === 0) {
    console.warn('[seed-demo] No measures found — skipping care gap seeding.');
    return;
  }

  // Check existing count to avoid duplicates
  const [existing] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM phm_edw.care_gap
  `;
  if (existing && existing.count > 0) {
    console.info(`[seed-demo] ${existing.count} care gaps already exist — skipping.`);
    return;
  }

  let inserted = 0;
  for (let i = 0; i < Math.min(patients.length, 150); i++) {
    const p = patients[i];
    // Each patient gets 1-3 random care gaps
    const numGaps = 1 + (i % 3);
    for (let j = 0; j < numGaps; j++) {
      const measure = measures[(i + j) % measures.length];
      const isOpen = Math.random() > 0.3; // 70% open
      const identifiedDate = new Date(Date.now() - (30 + Math.floor(Math.random() * 300)) * 86400000);
      const resolvedDate = isOpen ? null : new Date(identifiedDate.getTime() + Math.floor(Math.random() * 60) * 86400000);

      await sql`
        INSERT INTO phm_edw.care_gap (patient_id, measure_id, gap_status, identified_date, resolved_date, active_ind)
        VALUES (
          ${p.patient_id},
          ${measure.measure_id},
          ${isOpen ? 'open' : 'closed'},
          ${identifiedDate.toISOString()},
          ${resolvedDate?.toISOString() ?? null},
          'Y'
        )
      `;
      inserted++;
    }
  }
  console.info(`[seed-demo] ${inserted} care gaps created.`);
}

// ---------------------------------------------------------------------------
// Clinical alerts — sample alerts at various severities
// ---------------------------------------------------------------------------
async function seedClinicalAlerts(): Promise<void> {
  console.info('[seed-demo] Seeding clinical alerts...');

  const [existing] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM clinical_alerts
  `;
  if (existing && existing.count > 0) {
    console.info(`[seed-demo] ${existing.count} alerts already exist — skipping.`);
    return;
  }

  const patients = await sql<{ patient_id: number; first_name: string; last_name: string }[]>`
    SELECT patient_id, first_name, last_name FROM phm_edw.patient ORDER BY patient_id LIMIT 50
  `;

  // alert_type must match CHECK constraint on clinical_alerts
  const alertTemplates = [
    { type: 'risk_threshold', rule: 'high_risk_score', severity: 'critical', title: 'High Risk Score', body: 'Risk score exceeded critical threshold (>80).' },
    { type: 'care_gap_overdue', rule: 'care_gap_overdue', severity: 'warning', title: 'Overdue Care Gap', body: 'Patient has care gaps overdue by >90 days.' },
    { type: 'lab_critical', rule: 'lab_abnormal', severity: 'warning', title: 'Abnormal Lab Result', body: 'HbA1c result >9.0% detected.' },
    { type: 'encounter_followup', rule: 'missed_appointment', severity: 'info', title: 'Missed Encounter', body: 'No encounter in the past 12 months.' },
    { type: 'medication_adherence', rule: 'med_nonadherence', severity: 'warning', title: 'Medication Non-Adherence', body: 'Active prescription with no refill in >60 days.' },
    { type: 'lab_critical', rule: 'bp_elevated', severity: 'critical', title: 'Elevated Blood Pressure', body: 'Most recent BP reading >140/90 mmHg.' },
  ];

  let inserted = 0;
  for (let i = 0; i < Math.min(patients.length, 30); i++) {
    const p = patients[i];
    const tmpl = alertTemplates[i % alertTemplates.length];
    // Simulate some acknowledged/resolved alerts
    const acknowledgedAt = i >= 20 ? new Date(Date.now() - Math.floor(Math.random() * 7) * 86400000).toISOString() : null;
    const resolvedAt = i >= 25 ? new Date().toISOString() : null;

    await sql`
      INSERT INTO clinical_alerts (patient_id, alert_type, rule_key, severity, title, body, acknowledged_at, resolved_at)
      VALUES (
        ${p.patient_id},
        ${tmpl.type},
        ${tmpl.rule},
        ${tmpl.severity},
        ${tmpl.title},
        ${`${tmpl.body} Patient: ${p.first_name} ${p.last_name}.`},
        ${acknowledgedAt},
        ${resolvedAt}
      )
    `;
    inserted++;
  }
  console.info(`[seed-demo] ${inserted} clinical alerts created.`);
}

// ---------------------------------------------------------------------------
// AI insights — sample generated insights
// ---------------------------------------------------------------------------
async function seedAiInsights(): Promise<void> {
  console.info('[seed-demo] Seeding AI insights...');

  const [existing] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM ai_insights
  `;
  if (existing && existing.count > 0) {
    console.info(`[seed-demo] ${existing.count} AI insights already exist — skipping.`);
    return;
  }

  const patients = await sql<{ patient_id: number }[]>`
    SELECT patient_id FROM phm_edw.patient ORDER BY patient_id LIMIT 10
  `;

  // insight_type must match CHECK: weekly_summary, trend_narrative, anomaly_detection, risk_analysis, care_recommendation
  const insightTypes = ['care_recommendation', 'risk_analysis', 'trend_narrative'] as const;
  const sampleInsights = [
    '{"priority_actions":["Schedule HbA1c follow-up within 30 days","Review medication adherence","Refer to diabetes educator"],"summary":"Patient has uncontrolled diabetes with rising HbA1c trend. Recommend intensified glycemic management."}',
    '{"risk_factors":["Age >65","Multiple chronic conditions","No recent encounter"],"risk_band":"high","score":78,"summary":"Elevated risk due to age, comorbidity burden, and care engagement gap."}',
    '{"population_trends":["15% increase in uncontrolled HbA1c","Care gap closure rate improved to 62%","Average risk score stable at 45"],"recommendations":["Focus outreach on high-risk diabetic cohort","Expand telehealth for follow-ups"]}',
  ];

  let inserted = 0;
  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    const type = insightTypes[i % insightTypes.length];
    const content = sampleInsights[i % sampleInsights.length];

    await sql`
      INSERT INTO ai_insights (patient_id, insight_type, content, model_id, provider, input_tokens, output_tokens, cost_cents)
      VALUES (
        ${p.patient_id},
        ${type},
        ${content},
        'gemma:7b',
        'ollama',
        ${250 + Math.floor(Math.random() * 500)},
        ${100 + Math.floor(Math.random() * 300)},
        0
      )
    `;
    inserted++;
  }
  console.info(`[seed-demo] ${inserted} AI insights created.`);
}

// ---------------------------------------------------------------------------
// Patient risk history — sample risk score snapshots
// ---------------------------------------------------------------------------
async function seedPatientRiskHistory(): Promise<void> {
  console.info('[seed-demo] Seeding patient risk history...');

  const [existing] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM patient_risk_history
  `;
  if (existing && existing.count > 0) {
    console.info(`[seed-demo] ${existing.count} risk records already exist — skipping.`);
    return;
  }

  const patients = await sql<{ patient_id: number }[]>`
    SELECT patient_id FROM phm_edw.patient ORDER BY patient_id LIMIT 50
  `;

  let inserted = 0;
  for (const p of patients) {
    // Generate 3 months of weekly risk snapshots
    for (let week = 12; week >= 0; week--) {
      const date = new Date(Date.now() - week * 7 * 86400000);
      const baseScore = 20 + Math.floor(Math.random() * 60);
      const score = Math.min(100, Math.max(0, baseScore + Math.floor((Math.random() - 0.5) * 10)));
      // band CHECK: low, moderate, high, critical
      const band = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 40 ? 'moderate' : 'low';

      await sql`
        INSERT INTO patient_risk_history (patient_id, score, band, factors, computed_at)
        VALUES (
          ${p.patient_id},
          ${score},
          ${band},
          ${'{"age":' + Math.floor(Math.random() * 30 + 30) + ',"conditions":' + Math.floor(Math.random() * 8) + ',"care_gaps":' + Math.floor(Math.random() * 4) + '}'},
          ${date.toISOString()}
        )
      `;
      inserted++;
    }
  }
  console.info(`[seed-demo] ${inserted} risk history records created.`);
}

main().catch((err) => {
  console.error('[seed-demo] Demo seeding failed:', err);
  process.exit(1);
});
