// =============================================================================
// Medgnosis API - QDM bridge shadow refresh wrapper
// Records an operational ledger row around the existing QDM/CQL smoke harness.
// This is intentionally non-authoritative: it may refresh CQL shadow rows and
// reconciliation evidence, but it never flips measure_promotion_config.
// =============================================================================

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '@medgnosis/db';
import {
  completeQdmBridgeRun,
  failQdmBridgeRun,
  startQdmBridgeRun,
} from '../services/qdm/bridgeOps.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../../..');

interface RunSummaryRow {
  result_rows: number | string;
  cql_shadow_rows: number | string;
  measure_report_id: number | string | null;
}

interface ReconciliationSummaryRow {
  reconciliation_run_id: number | string | null;
  cql_measure_report_id: number | string | null;
  status: string | null;
  promotion_eligible: boolean | null;
}

async function main(): Promise<void> {
  const measureCode = process.env['MEASURE_CODE'] ?? 'CMS122v12';
  const periodStart = process.env['QDM_CQL_PERIOD_START'] ?? process.env['CQL_REPORTING_PERIOD_START'] ?? null;
  const periodEnd = process.env['QDM_CQL_PERIOD_END'] ?? process.env['CQL_REPORTING_PERIOD_END'] ?? null;
  const triggerSource = process.env['QDM_BRIDGE_TRIGGER'] === 'scheduled' ? 'scheduled' : 'script';
  const run = await startQdmBridgeRun({
    operation: 'cql_shadow_refresh',
    measureCode,
    periodStart,
    periodEnd,
    triggerSource,
    metadata: {
      harness: 'scripts/cql-qdm-smoke.sh',
      authoritativePromotion: false,
      evidenceSource: process.env['QDM_CQL_EVIDENCE_SOURCE'] ?? 'qdm-cql-smoke',
      starSource: process.env['QDM_CQL_STAR_SOURCE'] ?? 'qdm-cql',
      reconciliationScope: process.env['QDM_CQL_RECONCILIATION_SCOPE'] ?? null,
      requireExplicitPatientBounds:
        Boolean(process.env['QDM_PATIENT_IDS']) || Boolean(process.env['QDM_PATIENT_REFS']),
    },
  });

  console.info('[qdm-bridge-shadow-run] started run', run.id);

  try {
    await runSmokeHarness(run.id);
    const summary = await summarizeRun(run.id);
    await completeQdmBridgeRun({
      id: run.id,
      patientsSelected: summary.resultRows || null,
      evidenceRowsPersisted: summary.cqlShadowRows || null,
      measureReportId: summary.measureReportId,
      reconciliationRunId: summary.reconciliationRunId,
      result: {
        resultRows: summary.resultRows,
        cqlShadowRows: summary.cqlShadowRows,
        reconciliationStatus: summary.reconciliationStatus,
        promotionEligible: summary.promotionEligible,
        authoritativePromotion: false,
      },
    });
    console.info('[qdm-bridge-shadow-run] completed run', run.id, summary);
  } catch (error) {
    await failQdmBridgeRun({
      id: run.id,
      error,
      metadata: { authoritativePromotion: false },
    });
    throw error;
  }
}

async function runSmokeHarness(runId: string): Promise<void> {
  const env = {
    ...process.env,
    QDM_RUN_ID: runId,
    QDM_CQL_PERSIST_EVIDENCE: process.env['QDM_CQL_PERSIST_EVIDENCE'] ?? 'true',
    QDM_CQL_PROMOTE_STAR: process.env['QDM_CQL_PROMOTE_STAR'] ?? 'true',
    QDM_CQL_RECONCILE: process.env['QDM_CQL_RECONCILE'] ?? 'true',
    QDM_CQL_PERSIST_RECONCILIATION: process.env['QDM_CQL_PERSIST_RECONCILIATION'] ?? 'true',
    QDM_CQL_PROMOTION_ELIGIBLE: 'false',
  };

  await new Promise<void>((resolve, reject) => {
    const child = spawn('bash', ['scripts/cql-qdm-smoke.sh'], {
      cwd: REPO_ROOT,
      env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`QDM CQL smoke harness exited with ${signal ?? code}`));
    });
  });
}

async function summarizeRun(runId: string): Promise<{
  resultRows: number;
  cqlShadowRows: number;
  measureReportId: number | null;
  reconciliationRunId: number | null;
  reconciliationStatus: string | null;
  promotionEligible: boolean | null;
}> {
  const [star] = await sql<RunSummaryRow[]>`
    SELECT
      COUNT(*)::int AS result_rows,
      COUNT(*) FILTER (WHERE reconciliation_status = 'cql_shadow')::int AS cql_shadow_rows,
      MAX(measure_report_id)::bigint AS measure_report_id
    FROM phm_star.fact_measure_result
    WHERE qdm_run_id = ${runId}::uuid
  `;
  const [reconciliation] = await sql<ReconciliationSummaryRow[]>`
    SELECT
      id AS reconciliation_run_id,
      cql_measure_report_id,
      status,
      promotion_eligible
    FROM phm_edw.measure_reconciliation_run
    WHERE metadata->>'qdmRunId' = ${runId}
    ORDER BY computed_at DESC, id DESC
    LIMIT 1
  `;

  return {
    resultRows: Number(star?.result_rows ?? 0),
    cqlShadowRows: Number(star?.cql_shadow_rows ?? 0),
    measureReportId: nullableNumber(star?.measure_report_id ?? reconciliation?.cql_measure_report_id),
    reconciliationRunId: nullableNumber(reconciliation?.reconciliation_run_id),
    reconciliationStatus: reconciliation?.status ?? null,
    promotionEligible: reconciliation?.promotion_eligible ?? null,
  };
}

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

main()
  .catch((error) => {
    console.error(
      '[qdm-bridge-shadow-run] FAILED:',
      error instanceof Error && error.message.length > 0 ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sql.end({ timeout: 1 });
    } catch {
      /* ignore */
    }
  });
