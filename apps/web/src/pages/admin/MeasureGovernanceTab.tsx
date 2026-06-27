import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  Download,
  Eye,
  FilePlus2,
  FileWarning,
  FlaskConical,
  GitCompareArrows,
  ListChecks,
  Library,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { api, apiErrorMessage } from '../../services/api.js';
import { useToast } from '../../stores/ui.js';
import { useAuthStore } from '../../stores/auth.js';
import { fmtDate, fmtDateTime } from './helpers.js';
import {
  DRIFT_REVIEW_STATES,
  type DriftComment,
  type DriftReview,
  type DriftReviewState,
  type MeasureExportArtifact,
  type MeasureExportResponse,
  type MeasurePromotionConfig,
  type MeasureDossier,
  type PopulationCounts,
  type QdmBridgeIssue,
  type QdmBridgeOperationalStatus,
  type SemanticDriftDetail,
  type SemanticDriftWorklist,
  type SemanticDriftWorklistRow,
} from './types.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const DEFAULT_MEASURE = 'CMS122v12';
const DEFAULT_DENOMINATOR_DRIFT = 'residual_cql_or_qicore_semantic_gap';
const WORKLIST_LIMIT = 25;
const PROMOTION_STATEMENT_TIMEOUT_MS = 60_000;
type BadgeVariant = 'crimson' | 'amber' | 'teal' | 'emerald' | 'violet' | 'info' | 'dim';

// Reporting artifacts available for export. Order drives the export-control UI.
const EXPORT_ARTIFACTS: ReadonlyArray<{ artifact: MeasureExportArtifact; label: string }> = [
  { artifact: 'qrda-cat1', label: 'QRDA Cat I' },
  { artifact: 'qrda-cat3', label: 'QRDA Cat III' },
  { artifact: 'qpp', label: 'QPP JSON' },
  { artifact: 'deqm', label: 'DEQM Bundle' },
  { artifact: 'measure-report', label: 'MeasureReport' },
];

/**
 * Trigger a client-side download of the artifact content returned by the export
 * endpoint, using the server-provided filename + contentType. Object URLs are
 * revoked after the synthetic click so blobs are not leaked.
 */
function triggerArtifactDownload(result: MeasureExportResponse): void {
  const blob = new Blob([result.content], { type: result.contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

interface GovernanceEvidence {
  reconciliationRunId: number | null;
  measureReportId: number | null;
  promotionEligible: boolean;
  hasFullPopulationRun: boolean;
}

interface PromotionActionResponse {
  promotion: {
    dryRun?: boolean;
    rowsPromoted?: number;
  };
}

interface DossierActionResponse {
  dossier: {
    dossierId?: number | null;
    patientRowsReturned?: number;
    patientsPersisted?: number;
    persisted?: boolean;
  };
}

function labelize(value: string | null | undefined): string {
  if (!value) return 'None';
  const replacements: Record<string, string> = {
    cql: 'CQL',
    qdm: 'QDM',
    qicore: 'QI-Core',
    hba1c: 'HbA1c',
    cms122: 'CMS122',
    or: 'or',
    not: 'not',
  };
  return value
    .split('_')
    .map((part) => replacements[part.toLowerCase()] ?? part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function statusVariant(value: string | boolean | null | undefined): BadgeVariant {
  if (value === true || value === 'accepted' || value === 'completed' || value === 'cql_authoritative') return 'emerald';
  if (value === 'drift' || value === false || value === 'manual_hold' || value === 'warning') return 'amber';
  if (value === 'failed' || value === 'rejected' || value === 'error' || value === 'critical') return 'crimson';
  if (value === 'cql_shadow' || value === 'running') return 'teal';
  return 'dim';
}

function flagText(flags: { denominator: boolean; numerator: boolean; exclusion: boolean }) {
  return `${flags.denominator ? 'D' : '-'}${flags.numerator ? 'N' : '-'}${flags.exclusion ? 'X' : '-'}`;
}

function countText(counts: PopulationCounts | undefined) {
  if (!counts) return '-';
  return `${counts.denominator}/${counts.numerator}/${counts.exclusion}`;
}

function coverageCountText(counts: {
  initialPopulation: number;
  denominator: number;
  denominatorExclusion: number;
  numerator: number;
}) {
  return `${counts.initialPopulation}/${counts.denominator}/${counts.denominatorExclusion}/${counts.numerator}`;
}

function reviewStateVariant(state: DriftReviewState): BadgeVariant {
  switch (state) {
    case 'accepted':
      return 'emerald';
    case 'resolved':
      return 'teal';
    case 'in_review':
      return 'amber';
    case 'dismissed':
      return 'dim';
    case 'open':
    default:
      return 'info';
  }
}

function shortActor(userId: string | null): string {
  if (!userId) return 'Unassigned';
  return userId.length > 8 ? `${userId.slice(0, 8)}…` : userId;
}

function driftSummaryEntries(counts: Record<string, unknown> | undefined): Array<{ label: string; value: number }> {
  if (!counts || typeof counts !== 'object') return [];
  const denominator = counts['denominator'];
  if (!denominator || typeof denominator !== 'object') return [];
  return Object.entries(denominator as Record<string, unknown>)
    .map(([key, raw]) => ({ label: labelize(key), value: Number(raw) }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
    .sort((a, b) => b.value - a.value);
}

function jsonPreview(value: unknown, maxItems?: number) {
  if (Array.isArray(value) && maxItems !== undefined) {
    return JSON.stringify(value.slice(0, maxItems), null, 2);
  }
  return JSON.stringify(value ?? null, null, 2);
}

function positiveNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function evidenceForConfig(config: MeasurePromotionConfig | undefined): GovernanceEvidence {
  const shadow = config?.metadata.latestShadowMaterialization;
  const reconciliationRunId = positiveNumber(shadow?.reconciliationRunId) ?? positiveNumber(config?.latestReconciliationRun?.id);
  const measureReportId = positiveNumber(shadow?.measureReportId);
  const evaluationScope = shadow?.evaluationScope ?? config?.latestReconciliationRun?.evaluationScope;

  return {
    reconciliationRunId,
    measureReportId,
    promotionEligible: config?.latestReconciliationRun?.promotionEligible === true,
    hasFullPopulationRun: evaluationScope === 'full_population',
  };
}

function requirePromotionEvidence(evidence: GovernanceEvidence) {
  if (!evidence.reconciliationRunId || !evidence.measureReportId) {
    throw new Error('Latest reconciliation run and MeasureReport evidence are required');
  }
  return {
    reconciliationRunId: evidence.reconciliationRunId,
    measureReportId: evidence.measureReportId,
    requireFullPopulation: true,
    statementTimeoutMs: PROMOTION_STATEMENT_TIMEOUT_MS,
  };
}

function buildWorklistPath(measureCode: string, denominatorDrift: string) {
  const params = new URLSearchParams({
    denominatorDrift,
    limit: String(WORKLIST_LIMIT),
  });
  return `/admin/measure-promotion-configs/${encodeURIComponent(measureCode)}/semantic-drift-worklist?${params}`;
}

function buildOpsIssuesPath(measureCode: string) {
  const params = new URLSearchParams({
    measureCode,
    status: 'open',
    limit: '5',
  });
  return `/admin/qdm-bridge/issues?${params}`;
}

function ConfigRow({
  config,
  selected,
  onSelect,
}: {
  config: MeasurePromotionConfig;
  selected: boolean;
  onSelect: () => void;
}) {
  const run = config.latestReconciliationRun;
  const shadow = config.metadata.latestShadowMaterialization;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full rounded-card border p-3 text-left transition-colors',
        selected ? 'border-[var(--primary)] bg-[var(--primary-bg)]' : 'border-edge/30 bg-s0 hover:bg-s1',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-data text-sm font-semibold text-bright">{config.measureCode}</p>
          <p className="mt-1 truncate text-xs text-ghost">{config.authoritativeSource}</p>
        </div>
        <Badge variant={statusVariant(config.promotionMode)} className="shrink-0">
          {labelize(config.promotionMode)}
        </Badge>
      </div>
      {run && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-ghost">SQL</p>
            <p className="font-data text-bright">{countText(shadow?.sqlCounts)}</p>
          </div>
          <div>
            <p className="text-ghost">CQL</p>
            <p className="font-data text-bright">{countText(shadow?.cqlCounts)}</p>
          </div>
          <div>
            <p className="text-ghost">Status</p>
            <p className="font-data text-bright">{labelize(run.status)}</p>
          </div>
        </div>
      )}
    </button>
  );
}

function DriftRow({
  row,
  selected,
  onSelect,
}: {
  row: SemanticDriftWorklistRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TableRow data-state={selected ? 'selected' : undefined}>
      <TableCell>
        <div className="font-data text-xs text-bright">{row.patientId ?? row.patientRef}</div>
        <div className="mt-1 text-[11px] text-ghost">row {row.dossierPatientId}</div>
      </TableCell>
      <TableCell>
        <Badge variant="amber">{labelize(row.denominatorDrift)}</Badge>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Badge variant={reviewStateVariant(row.reviewState)} className="text-[10px]">
            {labelize(row.reviewState)}
          </Badge>
          {row.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-ghost">
              <MessageSquare size={11} />
              {row.commentCount}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="text-xs text-dim">{labelize(row.reviewBuckets.localGap)}</div>
        <div className="mt-1 text-xs text-ghost">{labelize(row.reviewBuckets.hba1c)}</div>
      </TableCell>
      <TableCell>
        <div className="font-data text-xs text-bright">{flagText(row.sql)} / {flagText(row.cql)}</div>
        <div className="mt-1 text-xs text-ghost">{row.cqlPopulationCounts['initial-population'] ?? 0} IP</div>
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant={selected ? 'default' : 'secondary'} onClick={onSelect}>
          <Eye />
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}

function DetailPanel({ detail, isLoading, error, reviewWorkflow }: {
  detail: SemanticDriftDetail | undefined;
  isLoading: boolean;
  error: unknown;
  reviewWorkflow?: ReactNode;
}) {
  if (isLoading) {
    return <div className="surface p-5 text-sm text-ghost">Loading detail...</div>;
  }
  if (error) {
    return <div className="surface p-5 text-sm text-crimson">{apiErrorMessage(error, 'Detail load failed')}</div>;
  }
  if (!detail) {
    return <div className="surface p-5 text-sm text-ghost">Select a drift row</div>;
  }

  const evidence = detail.measureReportEvidence;
  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-bright">Patient {detail.worklistRow.patientId ?? detail.worklistRow.patientRef}</h3>
          <p className="mt-1 text-xs text-ghost">Dossier row {detail.dossierPatientId}</p>
        </div>
        <Badge variant={evidence ? 'teal' : 'dim'}>{evidence ? `Evidence ${evidence.id}` : 'No evidence'}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-card border border-edge/25 bg-s0 p-3">
          <p className="text-ghost">Review priority</p>
          <p className="mt-1 font-data text-lg text-bright">{detail.worklistRow.reviewPriority}</p>
        </div>
        <div className="rounded-card border border-edge/25 bg-s0 p-3">
          <p className="text-ghost">QDM evidence</p>
          <p className="mt-1 font-data text-lg text-bright">{evidence?.qdmEvidenceCount ?? 0}</p>
        </div>
        <div className="rounded-card border border-edge/25 bg-s0 p-3">
          <p className="text-ghost">SQL flags</p>
          <p className="mt-1 font-data text-lg text-bright">{flagText(detail.worklistRow.sql)}</p>
        </div>
        <div className="rounded-card border border-edge/25 bg-s0 p-3">
          <p className="text-ghost">CQL flags</p>
          <p className="mt-1 font-data text-lg text-bright">{flagText(detail.worklistRow.cql)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-card border border-edge/25 bg-s0 p-3">
        <p className="text-xs font-medium text-bright">Review hint</p>
        <p className="mt-1 text-xs leading-5 text-dim">{detail.worklistRow.reviewHint}</p>
      </div>

      <div className="mt-4 grid gap-4">
        {reviewWorkflow}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-dim">Subject Populations</h4>
            <span className="text-xs text-ghost">{detail.worklistRow.hasSubjectReport ? 'MeasureReport present' : 'No MeasureReport'}</span>
          </div>
          <pre className="max-h-40 overflow-auto rounded-card border border-edge/25 bg-s0 p-3 font-data text-xs text-dim">
            {jsonPreview(detail.worklistRow.cqlPopulationCounts)}
          </pre>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-dim">QDM Evidence Sample</h4>
            <span className="text-xs text-ghost">{evidence?.qdmEvidenceCount ?? 0} rows</span>
          </div>
          <pre className="max-h-72 overflow-auto rounded-card border border-edge/25 bg-s0 p-3 font-data text-xs text-dim">
            {jsonPreview(evidence?.qdmEvidence ?? [], 8)}
          </pre>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-dim">FHIR Subject Report</h4>
            <span className="text-xs text-ghost">{evidence?.fhirSubjectReportPresent ? fmtDateTime(evidence.computedAt) : 'None'}</span>
          </div>
          <pre className="max-h-72 overflow-auto rounded-card border border-edge/25 bg-s0 p-3 font-data text-xs text-dim">
            {jsonPreview(evidence?.fhirSubjectReport ?? null)}
          </pre>
        </section>
      </div>
    </div>
  );
}

function GovernanceActions({
  config,
  evidence,
  isSettingShadow,
  isGeneratingDossier,
  isDryRunningPromotion,
  isRequestingPromotion,
  onSetShadow,
  onGenerateDossier,
  onDryRunPromotion,
  onRequestPromotion,
}: {
  config: MeasurePromotionConfig | undefined;
  evidence: GovernanceEvidence;
  isSettingShadow: boolean;
  isGeneratingDossier: boolean;
  isDryRunningPromotion: boolean;
  isRequestingPromotion: boolean;
  onSetShadow: () => void;
  onGenerateDossier: () => void;
  onDryRunPromotion: () => void;
  onRequestPromotion: () => void;
}) {
  const hasPromotionEvidence = Boolean(evidence.reconciliationRunId && evidence.measureReportId);
  const promotionBlockedReason = !hasPromotionEvidence
    ? 'Latest run and MeasureReport required'
    : !evidence.hasFullPopulationRun
      ? 'Full-population run required'
      : !evidence.promotionEligible
        ? 'Not promotion eligible'
        : 'Ready';

  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <FlaskConical size={16} className="text-[var(--primary)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-bright">Governance Actions</h3>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-card border border-edge/25 bg-s0 p-3">
            <p className="text-ghost">Run</p>
            <p className="mt-1 font-data text-bright">{evidence.reconciliationRunId ?? '-'}</p>
          </div>
          <div className="rounded-card border border-edge/25 bg-s0 p-3">
            <p className="text-ghost">MeasureReport</p>
            <p className="mt-1 font-data text-bright">{evidence.measureReportId ?? '-'}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-start"
          onClick={onSetShadow}
          disabled={!config || config.promotionMode === 'cql_shadow' || isSettingShadow}
        >
          <GitCompareArrows />
          {isSettingShadow ? 'Saving...' : 'Set shadow mode'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-start"
          onClick={onGenerateDossier}
          disabled={!config || isGeneratingDossier}
        >
          <FilePlus2 />
          {isGeneratingDossier ? 'Generating...' : 'Generate dossier'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-start"
          onClick={onDryRunPromotion}
          disabled={!config || !hasPromotionEvidence || !evidence.hasFullPopulationRun || isDryRunningPromotion}
        >
          <FlaskConical />
          {isDryRunningPromotion ? 'Running...' : 'Dry-run promotion'}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="w-full justify-start"
          onClick={onRequestPromotion}
          disabled={
            !config ||
            !hasPromotionEvidence ||
            !evidence.hasFullPopulationRun ||
            !evidence.promotionEligible ||
            isRequestingPromotion
          }
        >
          <Send />
          {isRequestingPromotion ? 'Requesting...' : 'Request promotion'}
        </Button>
        <p className="text-xs text-ghost">{promotionBlockedReason}</p>
      </div>
    </div>
  );
}

function ExportControls({
  measureCode,
  pendingArtifact,
  lastExport,
  onExport,
}: {
  measureCode: string;
  pendingArtifact: MeasureExportArtifact | null;
  lastExport: MeasureExportResponse | null;
  onExport: (artifact: MeasureExportArtifact) => void;
}) {
  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Download size={16} className="text-[var(--primary)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-bright">Reporting Exports</h3>
      </div>

      {/* Persistent submission-readiness warning — exports are well-formed but
          NOT submission-ready until external validation runs. */}
      <div
        role="alert"
        className="mb-4 flex items-start gap-2 rounded-card border border-amber/30 bg-amber/10 p-3"
      >
        <FileWarning size={15} className="mt-0.5 shrink-0 text-amber" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber">Not submission-ready</p>
          <p className="mt-1 text-xs leading-5 text-dim">
            Pending external validation (Cypress / CVU+ for QRDA; CMS QPP sandbox for QPP).
            QRDA Cat I and DEQM are a bounded patient-level sample.
          </p>
        </div>
      </div>

      <p className="mb-3 text-xs text-ghost">
        Export reporting artifacts for <span className="font-data text-dim">{measureCode}</span>.
      </p>
      <div className="space-y-2">
        {EXPORT_ARTIFACTS.map(({ artifact, label }) => (
          <Button
            key={artifact}
            type="button"
            variant="secondary"
            size="sm"
            className="w-full justify-start"
            onClick={() => onExport(artifact)}
            disabled={pendingArtifact !== null}
          >
            <Download />
            {pendingArtifact === artifact ? `Exporting ${label}...` : `Export ${label}`}
          </Button>
        ))}
      </div>

      {lastExport && (
        <div className="mt-4 rounded-card border border-edge/25 bg-s0 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-data text-dim">{lastExport.filename}</span>
            <Badge variant="amber">Unvalidated</Badge>
          </div>
          {lastExport.meta.bound.bounded && (
            <p className="mt-1.5 text-ghost">
              Bounded sample: {lastExport.meta.bound.patientCount ?? 0} of at most{' '}
              {lastExport.meta.bound.sampleCap ?? 0} patient(s).
            </p>
          )}
          <p className="mt-1.5 leading-5 text-dim">{lastExport.submissionReadiness.reason}</p>
        </div>
      )}
    </div>
  );
}

function OpsPanel({
  statusRows,
  issues,
  isLoading,
  error,
}: {
  statusRows: QdmBridgeOperationalStatus[];
  issues: QdmBridgeIssue[];
  isLoading: boolean;
  error: unknown;
}) {
  const latest = statusRows[0];
  const blockingIssues = statusRows.reduce((sum, row) => sum + row.openBlockingIssueCount, 0);
  const openIssues = statusRows.reduce((sum, row) => sum + row.openIssueCount, 0);

  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Activity size={16} className="text-[var(--primary)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-bright">Bridge Ops</h3>
      </div>
      {isLoading && <p className="text-sm text-ghost">Loading ops...</p>}
      {Boolean(error) && <p className="text-sm text-crimson">{String(apiErrorMessage(error, 'Ops load failed'))}</p>}
      {!isLoading && !error && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-card border border-edge/25 bg-s0 p-3">
              <p className="text-ghost">Latest</p>
              <p className="mt-1 truncate font-data text-bright">{latest ? labelize(latest.latestStatus) : 'None'}</p>
            </div>
            <div className="rounded-card border border-edge/25 bg-s0 p-3">
              <p className="text-ghost">Open</p>
              <p className="mt-1 font-data text-bright">{openIssues}</p>
            </div>
            <div className="rounded-card border border-edge/25 bg-s0 p-3">
              <p className="text-ghost">Blocking</p>
              <p className="mt-1 font-data text-bright">{blockingIssues}</p>
            </div>
          </div>

          {latest && (
            <div className="rounded-card border border-edge/25 bg-s0 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-dim">{labelize(latest.operation)}</span>
                <Badge variant={statusVariant(latest.latestStatus)}>{labelize(latest.latestStatus)}</Badge>
              </div>
              <p className="mt-2 font-data text-ghost">{fmtDateTime(latest.latestStartedAt)}</p>
            </div>
          )}

          {issues.length > 0 && (
            <div className="space-y-2">
              {issues.map((issue) => (
                <div key={issue.id} className="rounded-card border border-edge/25 bg-s0 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-bright">{labelize(issue.issueType)}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-ghost">{issue.message}</p>
                    </div>
                    <Badge variant={statusVariant(issue.severity)} className="ml-auto shrink-0">
                      {labelize(issue.severity)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          {issues.length === 0 && <p className="text-xs text-ghost">No open QDM bridge issues</p>}
        </div>
      )}
    </div>
  );
}

function DossierPanel({
  dossier,
  isLoading,
  error,
}: {
  dossier: MeasureDossier | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  const coverage = dossier?.components.testDeckCoverage ?? null;

  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardCheck size={16} className="text-[var(--primary)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-bright">Dossier Evidence</h3>
      </div>
      {isLoading && <p className="text-sm text-ghost">Loading dossier...</p>}
      {Boolean(error) && <p className="text-sm text-crimson">{apiErrorMessage(error, 'Dossier load failed')}</p>}
      {!isLoading && !error && (
        <div className="space-y-3">
          <div className="rounded-card border border-edge/25 bg-s0 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-dim">{dossier?.binding?.ecqm_version ?? dossier?.measureCode ?? DEFAULT_MEASURE}</span>
              <Badge variant={coverage ? 'emerald' : 'dim'}>{coverage ? labelize(coverage.status) : 'No test deck'}</Badge>
            </div>
            <p className="mt-2 truncate font-data text-ghost">
              {dossier?.components.fhirMeasureUrl ?? 'No FHIR Measure binding'}
            </p>
          </div>

          {coverage ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Test deck</p>
                  <p className="mt-1 font-data text-bright">{coverage.subjectCount}</p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Smoke IP/D/X/N</p>
                  <p className="mt-1 font-data text-bright">{coverageCountText(coverage.populationSmoke)}</p>
                </div>
              </div>
              <div className="rounded-card border border-edge/25 bg-s0 p-3 text-xs">
                <p className="font-medium text-bright">{coverage.testDeck}</p>
                <p className="mt-1 font-data text-ghost">{coverage.evidenceSource}</p>
                <p className="mt-2 text-dim">{coverage.promotionGate}</p>
              </div>
            </>
          ) : (
            <p className="text-xs text-ghost">No validated local test-deck evidence is registered for this measure.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CountComparisonPanel({ config }: { config: MeasurePromotionConfig | undefined }) {
  const shadow = config?.metadata.latestShadowMaterialization;
  const sqlCounts = shadow?.sqlCounts;
  const cqlCounts = shadow?.cqlCounts;
  const deltas = shadow?.deltas;

  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <GitCompareArrows size={16} className="text-[var(--primary)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-bright">SQL vs CQL Counts</h3>
      </div>
      {sqlCounts && cqlCounts ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Population</TableHead>
              <TableHead className="text-right">SQL</TableHead>
              <TableHead className="text-right">CQL</TableHead>
              <TableHead className="text-right">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(['denominator', 'numerator', 'exclusion'] as const).map((key) => (
              <TableRow key={key}>
                <TableCell className="text-xs text-dim">{labelize(key)}</TableCell>
                <TableCell className="text-right font-data text-xs text-bright">{sqlCounts[key]}</TableCell>
                <TableCell className="text-right font-data text-xs text-bright">{cqlCounts[key]}</TableCell>
                <TableCell className="text-right font-data text-xs">
                  <span className={(deltas?.[key] ?? Math.abs(sqlCounts[key] - cqlCounts[key])) > 0 ? 'text-amber' : 'text-emerald'}>
                    {deltas?.[key] ?? Math.abs(sqlCounts[key] - cqlCounts[key])}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-xs text-ghost">No shadow reconciliation counts are available for this measure.</p>
      )}
    </div>
  );
}

function DriftSummaryPanel({ worklist }: { worklist: SemanticDriftWorklist | undefined }) {
  const entries = useMemo(() => driftSummaryEntries(worklist?.classificationCounts), [worklist?.classificationCounts]);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <ListChecks size={16} className="text-[var(--primary)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-bright">Drift Summary</h3>
      </div>
      {entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.label} className="rounded-card border border-edge/25 bg-s0 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-dim">{entry.label}</span>
                <span className="font-data text-xs text-bright">{entry.value}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-s2">
                <div
                  className="h-full rounded-full bg-[var(--primary)]"
                  style={{ width: total > 0 ? `${Math.round((entry.value / total) * 100)}%` : '0%' }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ghost">No denominator drift classifications recorded for this dossier.</p>
      )}
    </div>
  );
}

function ValueSetDrilldownPanel({
  dossier,
  isLoading,
  error,
}: {
  dossier: MeasureDossier | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  const valueSets = dossier?.valueSets ?? [];

  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Library size={16} className="text-[var(--primary)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-bright">Value Set Drilldown</h3>
      </div>
      {isLoading && <p className="text-sm text-ghost">Loading value sets...</p>}
      {Boolean(error) && <p className="text-sm text-crimson">{apiErrorMessage(error, 'Value set load failed')}</p>}
      {!isLoading && !error && valueSets.length === 0 && (
        <p className="text-xs text-ghost">No VSAC value sets are bound to this measure.</p>
      )}
      {!isLoading && !error && valueSets.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Value Set</TableHead>
              <TableHead>OID</TableHead>
              <TableHead className="text-right">Codes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {valueSets.map((vs) => (
              <TableRow key={vs.value_set_oid}>
                <TableCell>
                  <div className="text-xs text-bright">{vs.name}</div>
                  {vs.qdm_category && <div className="mt-0.5 text-[11px] text-ghost">{vs.qdm_category}</div>}
                </TableCell>
                <TableCell className="font-data text-[11px] text-ghost">{vs.value_set_oid}</TableCell>
                <TableCell className="text-right font-data text-xs text-bright">{vs.code_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ReviewWorkflowSection({
  row,
  comments,
  commentsLoading,
  commentsError,
  commentDraft,
  onCommentDraftChange,
  isUpdatingState,
  isUpdatingAssignee,
  isAddingComment,
  onSetReviewState,
  onClaimAssignee,
  onClearAssignee,
  onAddComment,
}: {
  row: SemanticDriftWorklistRow;
  comments: DriftComment[];
  commentsLoading: boolean;
  commentsError: unknown;
  commentDraft: string;
  onCommentDraftChange: (value: string) => void;
  isUpdatingState: boolean;
  isUpdatingAssignee: boolean;
  isAddingComment: boolean;
  onSetReviewState: (state: DriftReviewState) => void;
  onClaimAssignee: () => void;
  onClearAssignee: () => void;
  onAddComment: () => void;
}) {
  return (
    <section className="rounded-card border border-edge/25 bg-s0 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-dim">
          <ClipboardCheck size={13} />
          Review Workflow
        </h4>
        <Badge variant={reviewStateVariant(row.reviewState)}>{labelize(row.reviewState)}</Badge>
      </div>

      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-dim">Review state</span>
        <Select
          value={row.reviewState}
          onValueChange={(value) => onSetReviewState(value as DriftReviewState)}
          disabled={isUpdatingState}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DRIFT_REVIEW_STATES.map((state) => (
              <SelectItem key={state} value={state}>
                {labelize(state)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-card border border-edge/25 bg-s1 p-2.5">
        <div className="min-w-0">
          <p className="text-[11px] text-ghost">Assignee</p>
          <p className="truncate font-data text-xs text-bright">{shortActor(row.assigneeUserId)}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="secondary" onClick={onClaimAssignee} disabled={isUpdatingAssignee}>
            <UserCheck />
            Claim
          </Button>
          {row.assigneeUserId && (
            <Button size="sm" variant="ghost" onClick={onClearAssignee} disabled={isUpdatingAssignee}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-dim">
            <MessageSquare size={12} />
            Comments
          </span>
          <span className="text-[11px] text-ghost">{comments.length}</span>
        </div>
        {commentsLoading && <p className="text-xs text-ghost">Loading comments...</p>}
        {Boolean(commentsError) && (
          <p className="text-xs text-crimson">{apiErrorMessage(commentsError, 'Comment load failed')}</p>
        )}
        {!commentsLoading && !commentsError && comments.length === 0 && (
          <p className="text-xs text-ghost">No reviewer comments yet.</p>
        )}
        {comments.length > 0 && (
          <ul className="space-y-2">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-card border border-edge/25 bg-s1 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-data text-[11px] text-dim">{shortActor(comment.authorUserId)}</span>
                  <span className="text-[11px] text-ghost">{fmtDateTime(comment.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-bright">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          rows={3}
          value={commentDraft}
          onChange={(event) => onCommentDraftChange(event.target.value)}
          placeholder="Add a reviewer comment (no PHI)..."
          maxLength={4000}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={onAddComment}
            disabled={isAddingComment || commentDraft.trim().length === 0}
          >
            <Send />
            {isAddingComment ? 'Posting...' : 'Add comment'}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function MeasureGovernanceTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const [selectedMeasure, setSelectedMeasure] = useState(DEFAULT_MEASURE);
  const [denominatorDrift, setDenominatorDrift] = useState(DEFAULT_DENOMINATOR_DRIFT);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [exportingArtifact, setExportingArtifact] = useState<MeasureExportArtifact | null>(null);
  const [lastExport, setLastExport] = useState<MeasureExportResponse | null>(null);

  useEffect(() => {
    setLastExport(null);
  }, [selectedMeasure]);

  const configsQuery = useQuery({
    queryKey: ['admin', 'measure-governance', 'configs'],
    queryFn: () => api.get<{ configs: MeasurePromotionConfig[] }>('/admin/measure-promotion-configs?limit=100'),
    staleTime: 30_000,
  });
  const configRows = configsQuery.data?.data?.configs;
  const configs = useMemo(() => configRows ?? [], [configRows]);
  const selectedConfig = configs.find((config) => config.measureCode === selectedMeasure);
  const selectedEvidence = evidenceForConfig(selectedConfig);
  const measureOptions = useMemo(
    () => [selectedMeasure, ...configs.map((config) => config.measureCode)].filter((value, index, arr) => value && arr.indexOf(value) === index),
    [configs, selectedMeasure],
  );

  useEffect(() => {
    if (!configsQuery.isSuccess || configs.length === 0) return;
    if (configs.some((config) => config.measureCode === selectedMeasure)) return;
    setSelectedMeasure(configs[0].measureCode);
  }, [configs, configsQuery.isSuccess, selectedMeasure]);

  const worklistPath = useMemo(
    () => buildWorklistPath(selectedMeasure, denominatorDrift),
    [selectedMeasure, denominatorDrift],
  );
  const worklistQuery = useQuery({
    queryKey: ['admin', 'measure-governance', 'worklist', selectedMeasure, denominatorDrift],
    queryFn: () => api.get<{ worklist: SemanticDriftWorklist }>(worklistPath),
    enabled: Boolean(selectedMeasure),
    staleTime: 30_000,
  });
  const worklist = worklistQuery.data?.data?.worklist;
  const rows = useMemo(() => worklist?.rows ?? [], [worklist?.rows]);

  useEffect(() => {
    setSelectedRowId(null);
  }, [selectedMeasure, denominatorDrift]);

  useEffect(() => {
    if (selectedRowId === null && rows.length > 0) {
      setSelectedRowId(rows[0].dossierPatientId);
    }
  }, [rows, selectedRowId]);

  useEffect(() => {
    setCommentDraft('');
  }, [selectedRowId]);

  const detailQuery = useQuery({
    queryKey: ['admin', 'measure-governance', 'detail', selectedMeasure, selectedRowId],
    queryFn: () =>
      api.get<{ detail: SemanticDriftDetail }>(
        `/admin/measure-promotion-configs/${encodeURIComponent(selectedMeasure)}/semantic-drift-worklist/${selectedRowId}`,
      ),
    enabled: Boolean(selectedMeasure && selectedRowId),
    staleTime: 15_000,
  });
  const opsStatusQuery = useQuery({
    queryKey: ['admin', 'measure-governance', 'ops-status', selectedMeasure],
    queryFn: () =>
      api.get<{ status: QdmBridgeOperationalStatus[] }>(
        `/admin/qdm-bridge/status?measureCode=${encodeURIComponent(selectedMeasure)}`,
      ),
    enabled: Boolean(selectedMeasure),
    staleTime: 30_000,
  });
  const opsIssuesQuery = useQuery({
    queryKey: ['admin', 'measure-governance', 'ops-issues', selectedMeasure],
    queryFn: () => api.get<{ issues: QdmBridgeIssue[] }>(buildOpsIssuesPath(selectedMeasure)),
    enabled: Boolean(selectedMeasure),
    staleTime: 30_000,
  });
  const dossierQuery = useQuery({
    queryKey: ['admin', 'measure-governance', 'dossier', selectedMeasure],
    queryFn: () => api.get<MeasureDossier>(`/measures/${encodeURIComponent(selectedMeasure)}/dossier`),
    enabled: Boolean(selectedMeasure),
    staleTime: 60_000,
  });
  const commentsQuery = useQuery({
    queryKey: ['admin', 'measure-governance', 'comments', selectedMeasure, selectedRowId],
    queryFn: () =>
      api.get<{ comments: DriftComment[] }>(
        `/admin/measure-promotion-configs/${encodeURIComponent(selectedMeasure)}/semantic-drift-worklist/${selectedRowId}/comments`,
      ),
    enabled: Boolean(selectedMeasure && selectedRowId),
    staleTime: 15_000,
  });
  const comments = useMemo(() => commentsQuery.data?.data?.comments ?? [], [commentsQuery.data?.data?.comments]);
  const invalidateGovernance = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'measure-governance'] });
  };
  const reviewBasePath = `/admin/measure-promotion-configs/${encodeURIComponent(selectedMeasure)}/semantic-drift-worklist/${selectedRowId}`;
  const setReviewStateMutation = useMutation({
    mutationFn: (reviewState: DriftReviewState) =>
      api.patch<{ review: DriftReview }>(`${reviewBasePath}/review-state`, { reviewState }),
    onSuccess: (res) => {
      toast.success(`Review state set to ${labelize(res.data?.review.reviewState ?? 'open')}`);
      invalidateGovernance();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Review state update failed')),
  });
  const setAssigneeMutation = useMutation({
    mutationFn: (assigneeUserId: string | null) =>
      api.patch<{ review: DriftReview }>(`${reviewBasePath}/assignee`, { assigneeUserId }),
    onSuccess: (res) => {
      toast.success(res.data?.review.assigneeUserId ? 'Drift row assigned' : 'Assignee cleared');
      invalidateGovernance();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Assignee update failed')),
  });
  const addCommentMutation = useMutation({
    mutationFn: (body: string) => api.post<{ comment: DriftComment }>(`${reviewBasePath}/comments`, { body }),
    onSuccess: () => {
      toast.success('Comment added');
      setCommentDraft('');
      invalidateGovernance();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Comment add failed')),
  });
  const setShadowModeMutation = useMutation({
    mutationFn: () =>
      api.patch<{ config: MeasurePromotionConfig }>(
        `/admin/measure-promotion-configs/${encodeURIComponent(selectedMeasure)}`,
        { promotionMode: 'cql_shadow' },
      ),
    onSuccess: () => {
      toast.success('Shadow mode saved');
      invalidateGovernance();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Shadow mode update failed')),
  });
  const generateDossierMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        persist: true,
        patientSampleLimit: WORKLIST_LIMIT,
      };
      if (selectedEvidence.reconciliationRunId) body.reconciliationRunId = selectedEvidence.reconciliationRunId;
      if (selectedEvidence.measureReportId) body.measureReportId = selectedEvidence.measureReportId;
      return api.post<DossierActionResponse>(
        `/admin/measure-promotion-configs/${encodeURIComponent(selectedMeasure)}/semantic-drift-dossier`,
        body,
      );
    },
    onSuccess: (res) => {
      const dossier = res.data?.dossier;
      toast.success(
        dossier?.dossierId
          ? `Dossier ${dossier.dossierId} generated`
          : 'Dossier generated',
      );
      invalidateGovernance();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Dossier generation failed')),
  });
  const dryRunPromotionMutation = useMutation({
    mutationFn: () =>
      api.post<PromotionActionResponse>(
        `/admin/measure-promotion-configs/${encodeURIComponent(selectedMeasure)}/promote-cql-authoritative`,
        {
          ...requirePromotionEvidence(selectedEvidence),
          dryRun: true,
        },
      ),
    onSuccess: (res) => {
      toast.success(`Promotion dry-run completed: ${res.data?.promotion.rowsPromoted ?? 0} rows`);
      invalidateGovernance();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Promotion dry-run failed')),
  });
  const requestPromotionMutation = useMutation({
    mutationFn: () =>
      api.post<PromotionActionResponse>(
        `/admin/measure-promotion-configs/${encodeURIComponent(selectedMeasure)}/promote-cql-authoritative`,
        {
          ...requirePromotionEvidence(selectedEvidence),
          dryRun: false,
        },
      ),
    onSuccess: (res) => {
      toast.success(`CQL authoritative promotion requested: ${res.data?.promotion.rowsPromoted ?? 0} rows`);
      invalidateGovernance();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'CQL authoritative promotion failed')),
  });
  const exportArtifactMutation = useMutation({
    mutationFn: (artifact: MeasureExportArtifact) =>
      api.post<MeasureExportResponse>(
        `/admin/measure-exports/${encodeURIComponent(selectedMeasure)}/${artifact}`,
        {},
      ),
    onMutate: (artifact) => setExportingArtifact(artifact),
    onSuccess: (res) => {
      const data = res.data;
      if (!data) {
        toast.error('Export returned no content');
        return;
      }
      triggerArtifactDownload(data);
      setLastExport(data);
      // Surface the not-submission-ready state on every successful export.
      toast.warning(`${data.filename} downloaded — not submission-ready (pending validation)`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Artifact export failed')),
    onSettled: () => setExportingArtifact(null),
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-card bg-[var(--primary-bg)] text-[var(--primary)]">
            <ShieldCheck size={18} strokeWidth={1.7} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-bright">Measure Governance</h2>
            <p className="text-xs text-ghost mt-0.5">Promotion status, semantic drift, and evidence drilldown</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            configsQuery.refetch();
            worklistQuery.refetch();
            opsStatusQuery.refetch();
            opsIssuesQuery.refetch();
            dossierQuery.refetch();
            if (selectedRowId) detailQuery.refetch();
          }}
          disabled={
            configsQuery.isFetching ||
            worklistQuery.isFetching ||
            detailQuery.isFetching ||
            opsStatusQuery.isFetching ||
            opsIssuesQuery.isFetching ||
            dossierQuery.isFetching
          }
        >
          <RefreshCw />
          Refresh
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)_31rem]">
        <div className="space-y-5">
          <div className="surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <GitCompareArrows size={16} className="text-[var(--primary)]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-bright">Promotion Configs</h3>
            </div>
            <p className="mb-3 text-xs text-ghost">
              {configs.length > 0 ? `${configs.length} governed measures` : 'No governed measures returned'}
            </p>
            {configsQuery.isLoading && <p className="text-sm text-ghost">Loading configs...</p>}
            {configsQuery.error && (
              <p className="text-sm text-crimson">{apiErrorMessage(configsQuery.error, 'Config load failed')}</p>
            )}
            <div className="space-y-2">
              {configs.map((config) => (
                <ConfigRow
                  key={config.measureCode}
                  config={config}
                  selected={selectedMeasure === config.measureCode}
                  onSelect={() => setSelectedMeasure(config.measureCode)}
                />
              ))}
              {configs.length === 0 && !configsQuery.isLoading && (
                <button
                  type="button"
                  className="w-full rounded-card border border-edge/30 bg-s0 p-3 text-left"
                  onClick={() => setSelectedMeasure(DEFAULT_MEASURE)}
                >
                  <p className="font-data text-sm text-bright">{DEFAULT_MEASURE}</p>
                  <p className="mt-1 text-xs text-ghost">Default measure</p>
                </button>
              )}
            </div>
          </div>

          <div className="surface p-5 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-dim">Measure</span>
              <Select value={selectedMeasure} onValueChange={setSelectedMeasure}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {measureOptions.map((measureCode) => (
                    <SelectItem key={measureCode} value={measureCode}>
                      {measureCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-dim">Denominator drift</span>
              <Select value={denominatorDrift} onValueChange={setDenominatorDrift}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    'residual_cql_or_qicore_semantic_gap',
                    'denominator_exclusion_evidence_present_but_not_cql_flagged',
                    'missing_cql_diabetes_value_set_evidence',
                    'missing_cql_qualifying_encounter_or_initial_population',
                    'outside_cms122_age_range',
                  ].map((drift) => (
                    <SelectItem key={drift} value={drift}>
                      {labelize(drift)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <GovernanceActions
            config={selectedConfig}
            evidence={selectedEvidence}
            isSettingShadow={setShadowModeMutation.isPending}
            isGeneratingDossier={generateDossierMutation.isPending}
            isDryRunningPromotion={dryRunPromotionMutation.isPending}
            isRequestingPromotion={requestPromotionMutation.isPending}
            onSetShadow={() => setShadowModeMutation.mutate()}
            onGenerateDossier={() => generateDossierMutation.mutate()}
            onDryRunPromotion={() => dryRunPromotionMutation.mutate()}
            onRequestPromotion={() => {
              if (window.confirm(`Promote ${selectedMeasure} to CQL authoritative?`)) {
                requestPromotionMutation.mutate();
              }
            }}
          />

          <ExportControls
            measureCode={selectedMeasure}
            pendingArtifact={exportingArtifact}
            lastExport={lastExport}
            onExport={(artifact) => exportArtifactMutation.mutate(artifact)}
          />

          <OpsPanel
            statusRows={opsStatusQuery.data?.data?.status ?? []}
            issues={opsIssuesQuery.data?.data?.issues ?? []}
            isLoading={opsStatusQuery.isLoading || opsIssuesQuery.isLoading}
            error={opsStatusQuery.error ?? opsIssuesQuery.error}
          />

          <DossierPanel
            dossier={dossierQuery.data?.data}
            isLoading={dossierQuery.isLoading}
            error={dossierQuery.error}
          />

          <CountComparisonPanel config={selectedConfig} />

          <DriftSummaryPanel worklist={worklist} />

          <ValueSetDrilldownPanel
            dossier={dossierQuery.data?.data}
            isLoading={dossierQuery.isLoading}
            error={dossierQuery.error}
          />
        </div>

        <div className="surface p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-bright">{selectedMeasure}</h3>
              <p className="mt-1 text-xs text-ghost">
                {worklist ? `${worklist.pagination.total.toLocaleString()} rows, dossier ${worklist.dossierId}` : 'Semantic drift worklist'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedConfig && <Badge variant={statusVariant(selectedConfig.promotionMode)}>{labelize(selectedConfig.promotionMode)}</Badge>}
              {worklist && <Badge variant="dim">{fmtDate(worklist.generatedAt)}</Badge>}
            </div>
          </div>
          {worklistQuery.isLoading && <p className="text-sm text-ghost">Loading worklist...</p>}
          {worklistQuery.error && (
            <p className="text-sm text-crimson">{apiErrorMessage(worklistQuery.error, 'Worklist load failed')}</p>
          )}
          {!worklistQuery.isLoading && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-ghost">No rows for this filter</p>
          )}
          {rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Drift</TableHead>
                  <TableHead>Bucket</TableHead>
                  <TableHead>SQL / CQL</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <DriftRow
                    key={row.dossierPatientId}
                    row={row}
                    selected={selectedRowId === row.dossierPatientId}
                    onSelect={() => setSelectedRowId(row.dossierPatientId)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DetailPanel
          detail={detailQuery.data?.data?.detail}
          isLoading={detailQuery.isLoading || detailQuery.isFetching}
          error={detailQuery.error}
          reviewWorkflow={
            detailQuery.data?.data?.detail && selectedRowId ? (
              <ReviewWorkflowSection
                row={detailQuery.data.data.detail.worklistRow}
                comments={comments}
                commentsLoading={commentsQuery.isLoading}
                commentsError={commentsQuery.error}
                commentDraft={commentDraft}
                onCommentDraftChange={setCommentDraft}
                isUpdatingState={setReviewStateMutation.isPending}
                isUpdatingAssignee={setAssigneeMutation.isPending}
                isAddingComment={addCommentMutation.isPending}
                onSetReviewState={(state) => setReviewStateMutation.mutate(state)}
                onClaimAssignee={() => {
                  if (!currentUserId) {
                    toast.error('No authenticated user to assign');
                    return;
                  }
                  setAssigneeMutation.mutate(currentUserId);
                }}
                onClearAssignee={() => setAssigneeMutation.mutate(null)}
                onAddComment={() => {
                  const trimmed = commentDraft.trim();
                  if (trimmed.length > 0) addCommentMutation.mutate(trimmed);
                }}
              />
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
