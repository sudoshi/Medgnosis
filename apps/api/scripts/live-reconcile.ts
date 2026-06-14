// =============================================================================
// Medgnosis — live CQL reconcile entrypoint (Phase 2 Epic A gate)
// Exports a bounded real Medgnosis diabetes cohort as a QI-Core transaction
// Bundle (buildCohortBundle), loads it into the clinical-reasoning sidecar
// (loadBundle), runs $evaluate-measure (population), and prints the SQL-vs-CQL
// reconcile for the bound measure. Run via scripts/cql-live-reconcile.sh, which
// brings up the engine and sets DATABASE_URL / CQL_ENGINE_URL.
//
// Honest by design: exact SQL/CQL agreement is NOT expected yet — Medgnosis
// gap-status semantics differ from the eCQM, and the exported resource set
// (Patient/Condition/Observation) omits Encounter, which CMS122's denominator
// requires. The deliverable is a real end-to-end run + a quantified delta.
//
// DB-safety: phm_edw.observation is ~1B rows. Every cohort query runs on a
// single reserved connection under a 30s statement_timeout, and the observation
// fetch rides the PARTIAL index idx_observation_patient_datetime (patient_id,
// observation_datetime DESC) WHERE active_ind='Y' via a per-patient LATERAL
// join — so it never degrades to a table-wide sequential scan.
// =============================================================================

import { sql } from '@medgnosis/db';
import { buildCohortBundle, type CohortRows } from '../src/services/fhir/qicoreExport.js';
import { loadBundle } from '../src/services/cqlEngineLoader.js';
import { evaluateMeasure, populationsFromReport } from '../src/services/fhir/cqlEngineClient.js';
import { reconcile } from '../src/services/measureReconciliation.js';

const MEASURE_CODE = process.env['MEASURE_CODE'] ?? 'CMS122v12';
const ENGINE_URL = process.env['CQL_ENGINE_URL'] ?? 'http://localhost:18080/fhir';
const COHORT_LIMIT = Number(process.env['COHORT_LIMIT'] ?? '200');

// HbA1c LOINC codes (CMS122 numerator lab).
const HBA1C_LOINC = ['4548-4', '4549-2', '17855-8', '17856-6', '41995-2', '59261-8', '62388-4', '71875-9'];

type Db = Awaited<ReturnType<typeof sql.reserve>>;

interface CohortResult {
  engineMeasureId: string;
  period: { start: string; end: string };
  cohort: CohortRows;
}

async function runCohort(db: Db): Promise<CohortResult> {
  // Hard backstop: nothing on this connection may run longer than 30s.
  await db`SET statement_timeout = '30s'`;

  // 1. Resolve the measure binding (engine Measure id + reporting period).
  const [binding] = await db<
    { ecqm_id: string | null; period_start: string; period_end: string }[]
  >`
    SELECT ecqm_id,
           reporting_period_start::text AS period_start,
           reporting_period_end::text   AS period_end
    FROM phm_edw.measure_artifact
    WHERE measure_code = ${MEASURE_CODE}
    ORDER BY reporting_period_start DESC NULLS LAST
    LIMIT 1
  `;
  if (!binding?.ecqm_id) {
    throw new Error(`No measure_artifact binding (ecqm_id) for measure_code=${MEASURE_CODE}`);
  }
  const engineMeasureId = binding.ecqm_id;
  const period = { start: binding.period_start, end: binding.period_end };
  console.info(`[reconcile] measure_code=${MEASURE_CODE} -> engine Measure/${engineMeasureId}`);
  console.info(`[reconcile] period ${period.start}..${period.end}; engine ${ENGINE_URL}`);

  // 2. Bounded diabetes cohort: patients with a condition in the CMS122 diabetes
  //    value set, capped at COHORT_LIMIT.
  const patientIdRows = await db<{ patient_id: number }[]>`
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
    WHERE c.condition_code IN (
      SELECT vc.code
      FROM phm_edw.measure_value_set mv
      JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
      JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = mv.value_set_oid
      WHERE md.measure_code = ${MEASURE_CODE} AND vc.code_system = 'SNOMEDCT'
    )
    ORDER BY cd.patient_id
    LIMIT ${COHORT_LIMIT}
  `;
  const ids = patientIdRows.map((r) => r.patient_id);
  console.info(`[reconcile] cohort size: ${ids.length} diabetes patients (limit ${COHORT_LIMIT})`);
  if (ids.length === 0) throw new Error('Empty diabetes cohort — nothing to reconcile');

  // 3. Patient + condition rows for the cohort.
  const [patients, conditions] = await Promise.all([
    db`
      SELECT patient_id, first_name, last_name, date_of_birth, gender, race, ethnicity, mrn
      FROM phm_edw.patient WHERE patient_id = ANY(${ids}) AND active_ind = 'Y'
    `,
    // Only the diabetes-relevant diagnoses (the CMS122 value set) — CMS122 needs
    // the diabetes Condition, not every problem on the chart. Keeps the bundle lean.
    db`
      SELECT cd.condition_diagnosis_id, c.condition_name, c.condition_code,
             cd.onset_date, cd.diagnosis_status, cd.patient_id
      FROM phm_edw.condition_diagnosis cd
      JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
      WHERE cd.patient_id = ANY(${ids})
        AND c.condition_code IN (
          SELECT vc.code
          FROM phm_edw.measure_value_set mv
          JOIN phm_edw.measure_definition md ON md.measure_id = mv.measure_id
          JOIN phm_edw.vsac_value_set_code vc ON vc.value_set_oid = mv.value_set_oid
          WHERE md.measure_code = ${MEASURE_CODE} AND vc.code_system = 'SNOMEDCT'
        )
    `,
  ]);

  // 3b. HbA1c observations via a per-patient LATERAL join, BOUNDED TO THE
  //     MEASUREMENT PERIOD. The inner predicate (patient_id = const AND
  //     active_ind='Y' AND observation_datetime in [start,end]) is an exact
  //     prefix of the partial index idx_observation_patient_datetime, so each
  //     patient is a tight indexed range seek over one period's worth of rows —
  //     the code filter applies to that small slice. The period bound is what
  //     keeps this milliseconds-per-patient instead of walking full histories
  //     (and is clinically correct: CMS122 only scores HbA1c during the period).
  const observations = await db`
    SELECT o.observation_id, o.observation_desc, o.observation_code,
           o.value_numeric, o.value_text, o.units, o.observation_datetime, o.patient_id
    FROM unnest(${ids}::int[]) AS c(patient_id)
    JOIN LATERAL (
      SELECT obs.observation_id, obs.observation_desc, obs.observation_code,
             obs.value_numeric, obs.value_text, obs.units, obs.observation_datetime, obs.patient_id
      FROM phm_edw.observation obs
      WHERE obs.patient_id = c.patient_id
        AND obs.active_ind = 'Y'
        AND obs.observation_datetime >= ${period.start}::date
        AND obs.observation_datetime <  (${period.end}::date + 1)
        AND obs.observation_code = ANY(${HBA1C_LOINC})
      LIMIT 50
    ) o ON true
  `;
  console.info(
    `[reconcile] resources: ${patients.length} Patient, ${conditions.length} Condition, ${observations.length} HbA1c Observation`,
  );

  return {
    engineMeasureId,
    period,
    cohort: { patients, conditions, observations, medications: [] },
  };
}

async function main(): Promise<void> {
  const db = await sql.reserve();
  let result: CohortResult;
  try {
    result = await runCohort(db);
  } finally {
    db.release();
  }
  const { engineMeasureId, period, cohort } = result;

  // 4. Build + load the QI-Core transaction Bundle.
  const bundle = buildCohortBundle(cohort);
  console.info(`[reconcile] loading ${bundle.entry.length} resources into the engine ...`);
  const load = await loadBundle(ENGINE_URL, bundle);
  console.info(`[reconcile] load result:`, load);

  // 5. Evaluate population + print the full breakdown.
  const report = await evaluateMeasure(ENGINE_URL, engineMeasureId, {
    periodStart: period.start,
    periodEnd: period.end,
    reportType: 'population',
  });
  const pops = populationsFromReport(report);
  const score = report.group?.[0]?.measureScore?.value;
  console.info(`[reconcile] CQL population:`, { ...pops, score });

  // 6. SQL-vs-CQL reconcile (tolerance 0 — print both sides + deltas).
  const r = await reconcile(MEASURE_CODE, period, { engineUrl: ENGINE_URL, engineMeasureId });
  console.info('[reconcile] ===== SQL vs CQL =====');
  console.info('[reconcile] SQL   :', r.sql);
  console.info('[reconcile] CQL   :', r.cql);
  console.info('[reconcile] deltas:', r.deltas, '| agree:', r.agree);

  await sql.end();
}

main().catch(async (err) => {
  console.error('[reconcile] FAILED:', err instanceof Error ? err.message : err);
  try {
    await sql.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
