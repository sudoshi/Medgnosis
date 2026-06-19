import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, ClipboardCheck, Eye, GitCompareArrows, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, apiErrorMessage } from '../../services/api.js';
import { fmtDate, fmtDateTime } from './helpers.js';
import type {
  MeasurePromotionConfig,
  MeasureDossier,
  PopulationCounts,
  QdmBridgeIssue,
  QdmBridgeOperationalStatus,
  SemanticDriftDetail,
  SemanticDriftWorklist,
  SemanticDriftWorklistRow,
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

const DEFAULT_MEASURE = 'CMS122v12';
const DEFAULT_DENOMINATOR_DRIFT = 'residual_cql_or_qicore_semantic_gap';
const WORKLIST_LIMIT = 25;
type BadgeVariant = 'crimson' | 'amber' | 'teal' | 'emerald' | 'violet' | 'info' | 'dim';

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

function jsonPreview(value: unknown, maxItems?: number) {
  if (Array.isArray(value) && maxItems !== undefined) {
    return JSON.stringify(value.slice(0, maxItems), null, 2);
  }
  return JSON.stringify(value ?? null, null, 2);
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

function DetailPanel({ detail, isLoading, error }: {
  detail: SemanticDriftDetail | undefined;
  isLoading: boolean;
  error: unknown;
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

export function MeasureGovernanceTab() {
  const [selectedMeasure, setSelectedMeasure] = useState(DEFAULT_MEASURE);
  const [denominatorDrift, setDenominatorDrift] = useState(DEFAULT_DENOMINATOR_DRIFT);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);

  const configsQuery = useQuery({
    queryKey: ['admin', 'measure-governance', 'configs'],
    queryFn: () => api.get<{ configs: MeasurePromotionConfig[] }>('/admin/measure-promotion-configs?limit=100'),
    staleTime: 30_000,
  });
  const configs = configsQuery.data?.data?.configs ?? [];
  const selectedConfig = configs.find((config) => config.measureCode === selectedMeasure);

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
                  {[selectedMeasure, ...configs.map((config) => config.measureCode)]
                    .filter((value, index, arr) => value && arr.indexOf(value) === index)
                    .map((measureCode) => (
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
        />
      </div>
    </div>
  );
}
