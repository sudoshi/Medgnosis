import { useCallback, useMemo, useState } from 'react';
import type { DragEvent, ElementType } from 'react';
import {
  Activity,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardCheck,
  Clock3,
  Database,
  FileCheck2,
  GitBranch,
  Globe2,
  GripVertical,
  Network,
  RefreshCcw,
  Scale,
  ServerCog,
  ShieldCheck,
  TestTube2,
  Workflow,
} from 'lucide-react';

type RoadmapStatus = 'complete' | 'active' | 'next';

interface RoadmapTask {
  label: string;
  done: boolean;
}

interface RoadmapCard {
  id: string;
  title: string;
  track: string;
  status: RoadmapStatus;
  icon: ElementType;
  description: string;
  tags: string[];
  evidence: string;
  tasks?: RoadmapTask[];
}

const ROADMAP_CARDS: RoadmapCard[] = [
  {
    id: 'clinical-workspace',
    title: 'Clinical Workspace Foundation',
    track: 'Product Core',
    status: 'complete',
    icon: Activity,
    description: 'Patient chart, bundle worklists, alert triage, SuperNote, and provider-scoped clinical workflows.',
    tags: ['product', 'clinical'],
    evidence: 'Dashboard, patient detail, care lists, alerts, SuperNote, and settings routes are live.',
    tasks: [
      { label: 'Patient chart and longitudinal tabs', done: true },
      { label: 'Care bundle worklists and closure flows', done: true },
      { label: 'Provider-panel scoping and patient access controls', done: true },
      { label: 'Clinical note and SuperNote workspace', done: true },
    ],
  },
  {
    id: 'cds-parity',
    title: 'CDS Parity Program',
    track: 'Clinical Decision Support',
    status: 'complete',
    icon: Workflow,
    description: 'Rules, problem-list analytics, closed-loop follow-up, AMP, surveillance, data quality, cohorts, and HCC coding.',
    tags: ['cds', 'analytics'],
    evidence: 'The eight CDS phases are present across services, workers, routes, and admin/user-facing pages.',
    tasks: [
      { label: 'Versioned rules engine and transparency routes', done: true },
      { label: 'Population finder and problem-list curation', done: true },
      { label: 'Close-the-loop and anticipatory workflows', done: true },
      { label: 'Real-time surveillance and coding analytics', done: true },
    ],
  },
  {
    id: 'standards-foundation',
    title: 'FHIR/CQL/DEQM Foundation',
    track: 'Standards',
    status: 'complete',
    icon: Globe2,
    description: 'US Core/QI-Core projection, VSAC terminology, CQL sidecar execution, MeasureReport persistence, and DEQM gaps.',
    tags: ['standards', 'quality'],
    evidence: 'FHIR services, CQL loader/client, MeasureReport store, DEQM, QRDA, and VSAC services are implemented.',
    tasks: [
      { label: 'US Core and QI-Core constants/projections', done: true },
      { label: 'VSAC value-set service and measure bindings', done: true },
      { label: 'CQL sidecar execution seam', done: true },
      { label: 'MeasureReport, DEQM, and QRDA foundations', done: true },
    ],
  },
  {
    id: 'ehr-integration',
    title: 'Vendor-Neutral EHR Integration',
    track: 'Interoperability',
    status: 'complete',
    icon: Network,
    description: 'SMART launch, backend services, FHIR client reads, tenant registry, capability diagnostics, and Bulk Data ledger.',
    tags: ['ehr', 'fhir'],
    evidence: 'EHR admin routes, services, onboarding scripts, launch flows, token metadata, and bulk job ledger are present.',
    tasks: [
      { label: 'Tenant and client registry', done: true },
      { label: 'SMART discovery and launch flows', done: true },
      { label: 'Backend Services token path', done: true },
      { label: 'Bulk Data job kickoff and polling ledger', done: true },
    ],
  },
  {
    id: 'qdm-bridge',
    title: 'FHIR/QDM Dimensional Bridge',
    track: 'Quality Analytics',
    status: 'complete',
    icon: Scale,
    description: 'QDM evidence spine, EDW-to-QI-Core projection, CQL shadow star rows, reconciliation, and source-aware lineage.',
    tags: ['qdm', 'analytics'],
    evidence: 'Migrations 068-079, QDM services, CQL shadow refresh, reconciliation, and lineage views are in main.',
    tasks: [
      { label: 'QDM event and FHIR crosswalk foundation', done: true },
      { label: 'CQL MeasureReport evidence persistence', done: true },
      { label: 'Shadow fact_measure_result materialization', done: true },
      { label: 'PHI-safe bridge run and issue ledger', done: true },
    ],
  },
  {
    id: 'governance-ui',
    title: 'Governance And Admin Surfaces',
    track: 'Operations',
    status: 'complete',
    icon: ShieldCheck,
    description: 'Auth provider administration, system health, measure governance, semantic drift worklists, and audited evidence detail.',
    tags: ['admin', 'governance'],
    evidence: 'Admin tabs cover users, auth, health, FHIR, EHR, ETL, audit, and measure governance.',
    tasks: [
      { label: 'Admin auth-provider management', done: true },
      { label: 'Measure promotion configuration', done: true },
      { label: 'Semantic drift dossier and worklist', done: true },
      { label: 'Audited raw-evidence drilldown', done: true },
    ],
  },
  {
    id: 'ux-hardening',
    title: 'UX, Accessibility, And Density',
    track: 'Frontend Quality',
    status: 'complete',
    icon: CheckCircle2,
    description: 'Theme tokens, shadcn primitives, data boundaries, screen-reader support, destructive-action confirmation, and dense layouts.',
    tags: ['frontend', 'quality'],
    evidence: 'Shared UI primitives, light/dark tokens, data boundaries, announcer, and focused accessibility fixes are merged.',
    tasks: [
      { label: 'Light/dark theme tokens', done: true },
      { label: 'Reusable shadcn-style primitives', done: true },
      { label: 'Error states instead of false-empty worklists', done: true },
      { label: 'Keyboard and screen-reader affordances', done: true },
    ],
  },
  {
    id: 'semantic-drift',
    title: 'CMS122 Semantic Drift Governance',
    track: 'Clinical Governance',
    status: 'active',
    icon: ClipboardCheck,
    description: 'Review the CMS122 vs DM-02 dossier before any CQL-authoritative promotion decision.',
    tags: ['governance', 'quality'],
    evidence: 'Dossier 2 compares 256 patients and keeps CMS122 in cql_shadow mode with sql_bundle authority.',
    tasks: [
      { label: 'Persist aggregate and patient-level drift classifications', done: true },
      { label: 'Expose compact worklist and audited detail route', done: true },
      { label: 'Clinically adjudicate residual drift buckets', done: false },
      { label: 'Approve or reject CQL-authoritative baseline change', done: false },
    ],
  },
  {
    id: 'qdm-expansion',
    title: 'QDM Datatype Expansion',
    track: 'Bridge Expansion',
    status: 'active',
    icon: Database,
    description: 'Extend the bridge beyond the first CMS122 vertical slice to broader QDM timing, actor, result, and relation coverage.',
    tags: ['qdm', 'data'],
    evidence: 'The current bridge supports a production-ready vertical slice and a documented expansion model.',
    tasks: [
      { label: 'Patient, diagnosis, encounter, and lab evidence slice', done: true },
      { label: 'Medication duration and negation fixtures', done: false },
      { label: 'Actor/entity relationship bridge', done: false },
      { label: 'QDM-first star ETL for additional facts', done: false },
    ],
  },
  {
    id: 'production-onboarding',
    title: 'Production EHR Onboarding',
    track: 'Interoperability',
    status: 'active',
    icon: ServerCog,
    description: 'Move from vendor-neutral platform readiness to real Epic/Cerner customer tenant onboarding and launch evidence.',
    tags: ['ehr', 'ops'],
    evidence: 'Core tenant, launch, backend services, and bulk machinery exists; external vendor registration remains environment-specific.',
    tasks: [
      { label: 'Local SMART/HAPI paths', done: true },
      { label: 'Vendor app registration and credential capture', done: false },
      { label: 'Sandbox launch certification evidence', done: false },
      { label: 'Production tenant monitoring and runbook signoff', done: false },
    ],
  },
  {
    id: 'validator-gates',
    title: 'Validator And Submission Gates',
    track: 'Conformance',
    status: 'next',
    icon: TestTube2,
    description: 'Convert standards output from framework-ready to validator-backed conformance for reporting packages.',
    tags: ['standards', 'qa'],
    evidence: 'DEQM, QRDA, MeasureReport, and QI-Core paths exist, but broader validator coverage is the next gate.',
    tasks: [
      { label: 'QI-Core fixture validation matrix', done: false },
      { label: 'DEQM Gaps-in-Care validator samples', done: false },
      { label: 'QRDA Cat I/Cat III validation package', done: false },
      { label: 'Measure-specific regression fixtures', done: false },
    ],
  },
  {
    id: 'scheduled-ops',
    title: 'Scheduled Bridge Operations',
    track: 'Operations',
    status: 'next',
    icon: RefreshCcw,
    description: 'Promote the QDM shadow refresh wrapper from manual runbook command to scheduled, monitored operations.',
    tags: ['ops', 'qdm'],
    evidence: 'The PHI-safe run ledger, issue ledger, status view, and qdm:shadow-refresh command are already in place.',
    tasks: [
      { label: 'Manual shadow refresh wrapper', done: true },
      { label: 'Schedule definition and retention policy', done: false },
      { label: 'Alerting for stale or failed bridge runs', done: false },
      { label: 'Dashboards for evidence volume and issue rates', done: false },
    ],
  },
  {
    id: 'payer-data',
    title: 'Bulk And Payer Data Expansion',
    track: 'Data Acquisition',
    status: 'next',
    icon: BellRing,
    description: 'Add longitudinal external data flows for payer, ADT, HIE, and attribution-driven analytics.',
    tags: ['fhir', 'data'],
    evidence: 'Bulk Data scaffolding exists; production data-source expansion is a separate integration phase.',
    tasks: [
      { label: 'Bulk Data job ledger foundation', done: true },
      { label: 'Attribution roster ingestion', done: false },
      { label: 'Claims and payer FHIR data contracts', done: false },
      { label: 'ADT/HIE feed normalization strategy', done: false },
    ],
  },
  {
    id: 'release-discipline',
    title: 'Release And Evidence Discipline',
    track: 'Delivery',
    status: 'next',
    icon: GitBranch,
    description: 'Keep production changes tied to scoped commits, root gates, migration dry-runs, browser smoke, and deploy evidence.',
    tags: ['devex', 'ops'],
    evidence: 'The recent QDM bridge deployment used root gates, migration dry-run, browser smoke, push, deploy, and public health checks.',
    tasks: [
      { label: 'Root typecheck, lint, test, build gates', done: true },
      { label: 'Migration dry-run before deploy', done: true },
      { label: 'Browser smoke for new admin surfaces', done: true },
      { label: 'Automated release evidence capture', done: false },
    ],
  },
];

const STATUS_COLUMNS: Array<{
  id: RoadmapStatus;
  label: string;
  accent: string;
  dot: string;
  icon: ElementType;
}> = [
  { id: 'complete', label: 'Complete', accent: 'bg-emerald', dot: 'bg-emerald', icon: CheckCircle2 },
  { id: 'active', label: 'Active', accent: 'bg-amber', dot: 'bg-amber', icon: Clock3 },
  { id: 'next', label: 'Next', accent: 'bg-info', dot: 'bg-info', icon: Circle },
];

const TAG_STYLES: Record<string, string> = {
  admin: 'bg-violet/10 text-violet border-violet/25',
  analytics: 'bg-info/10 text-info border-info/25',
  cds: 'bg-emerald/10 text-emerald border-emerald/25',
  clinical: 'bg-emerald/10 text-emerald border-emerald/25',
  data: 'bg-info/10 text-info border-info/25',
  devex: 'bg-violet/10 text-violet border-violet/25',
  ehr: 'bg-amber/10 text-amber border-amber/25',
  fhir: 'bg-info/10 text-info border-info/25',
  frontend: 'bg-teal/10 text-teal border-teal/25',
  governance: 'bg-amber/10 text-amber border-amber/25',
  ops: 'bg-crimson/10 text-crimson border-crimson/25',
  product: 'bg-teal/10 text-teal border-teal/25',
  qa: 'bg-violet/10 text-violet border-violet/25',
  qdm: 'bg-[var(--primary-bg)] text-[var(--primary)] border-[var(--primary-border)]',
  quality: 'bg-emerald/10 text-emerald border-emerald/25',
  standards: 'bg-info/10 text-info border-info/25',
};

function statusTone(status: RoadmapStatus) {
  if (status === 'complete') return 'text-emerald';
  if (status === 'active') return 'text-amber';
  return 'text-info';
}

function RoadmapCardView({
  card,
  expanded,
  dragging,
  onDragStart,
  onToggle,
}: {
  card: RoadmapCard;
  expanded: boolean;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLElement>, id: string) => void;
  onToggle: (id: string) => void;
}) {
  const Icon = card.icon;
  const completed = card.tasks?.filter((task) => task.done).length ?? 0;
  const total = card.tasks?.length ?? 0;
  const completion = total > 0 ? Math.round((completed / total) * 100) : card.status === 'complete' ? 100 : 0;

  return (
    <article
      draggable
      onDragStart={(event) => onDragStart(event, card.id)}
      className={[
        'group min-h-[15.5rem] rounded-card border bg-s1 p-4 transition-all duration-150',
        'border-edge/35 hover:border-edge/60 hover:bg-s2',
        dragging ? 'scale-[0.98] opacity-50' : 'shadow-sm',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <GripVertical
          size={15}
          className="mt-1 flex-shrink-0 text-ghost opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-card border border-edge/30 bg-s2">
          <Icon size={17} className={statusTone(card.status)} strokeWidth={1.7} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase text-ghost">{card.track}</p>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug text-bright">{card.title}</h3>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-dim">{card.description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {card.tags.map((tag) => (
          <span
            key={tag}
            className={[
              'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase',
              TAG_STYLES[tag] ?? 'border-edge/35 bg-s2 text-ghost',
            ].join(' ')}
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] uppercase text-ghost">Evidence</span>
          <span className="font-data text-xs tabular-nums text-dim">{completion}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-s0">
          <div className={`h-full rounded-full ${statusTone(card.status).replace('text-', 'bg-')}`} style={{ width: `${completion}%` }} />
        </div>
        <p className="text-xs leading-relaxed text-ghost">{card.evidence}</p>
      </div>

      {card.tasks && card.tasks.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => onToggle(card.id)}
            className="inline-flex items-center gap-1 text-xs text-dim transition-colors hover:text-bright"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span>{completed}/{total}</span>
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1.5">
              {card.tasks.map((task) => (
                <li key={task.label} className="flex items-start gap-2">
                  {task.done ? (
                    <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0 text-emerald" />
                  ) : (
                    <Circle size={13} className="mt-0.5 flex-shrink-0 text-ghost" />
                  )}
                  <span className={['text-xs leading-relaxed', task.done ? 'text-ghost line-through' : 'text-dim'].join(' ')}>
                    {task.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

export function RoadmapTab() {
  const [cards, setCards] = useState<RoadmapCard[]>(ROADMAP_CARDS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<RoadmapStatus | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['qdm-bridge', 'semantic-drift']));

  const counts = useMemo(() => {
    return STATUS_COLUMNS.reduce<Record<RoadmapStatus, number>>(
      (acc, column) => {
        acc[column.id] = cards.filter((card) => card.status === column.id).length;
        return acc;
      },
      { complete: 0, active: 0, next: 0 },
    );
  }, [cards]);

  const total = cards.length;
  const completePercent = Math.round((counts.complete / total) * 100);

  const handleToggle = useCallback((id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: DragEvent<HTMLElement>, id: string) => {
    setDraggingId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>, status: RoadmapStatus) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLElement>, status: RoadmapStatus) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    setCards((previous) => previous.map((card) => (card.id === id ? { ...card, status } : card)));
    setDraggingId(null);
    setDragOverStatus(null);
  }, []);

  const resetDrag = useCallback(() => {
    setDraggingId(null);
    setDragOverStatus(null);
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface p-4">
          <p className="text-xs uppercase text-ghost">Roadmap Completion</p>
          <p className="mt-2 font-data text-data-2xl text-[var(--primary)]">{completePercent}%</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-s0">
            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${completePercent}%` }} />
          </div>
        </div>
        {STATUS_COLUMNS.map((column) => {
          const Icon = column.icon;
          return (
            <div key={column.id} className="surface p-4">
              <div className="flex items-center gap-2">
                <Icon size={15} className={statusTone(column.id)} />
                <p className="text-xs uppercase text-ghost">{column.label}</p>
              </div>
              <p className="mt-2 font-data text-data-2xl text-bright">{counts[column.id]}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3" onDragEnd={resetDrag}>
        {STATUS_COLUMNS.map((column) => {
          const columnCards = cards.filter((card) => card.status === column.id);
          const isDragOver = dragOverStatus === column.id;

          return (
            <section
              key={column.id}
              className={[
                'min-h-[28rem] overflow-hidden rounded-panel border bg-s0 transition-colors',
                isDragOver ? 'border-[var(--primary-border)]' : 'border-edge/35',
              ].join(' ')}
              onDragOver={(event) => handleDragOver(event, column.id)}
              onDrop={(event) => handleDrop(event, column.id)}
              onDragLeave={() => setDragOverStatus(null)}
            >
              <div className={`h-1 ${column.accent}`} />
              <div className="flex items-center gap-2 border-b border-edge/25 px-4 py-3">
                <span className={`h-2 w-2 rounded-full ${column.dot}`} />
                <h2 className="flex-1 text-sm font-semibold text-bright">{column.label}</h2>
                <span className="rounded-full border border-edge/30 bg-s2 px-2 py-0.5 font-data text-xs text-ghost">
                  {columnCards.length}
                </span>
              </div>

              <div className="space-y-3 p-3">
                {columnCards.map((card) => (
                  <RoadmapCardView
                    key={card.id}
                    card={card}
                    expanded={expanded.has(card.id)}
                    dragging={draggingId === card.id}
                    onDragStart={handleDragStart}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="surface-compact flex flex-wrap items-center gap-3">
        <FileCheck2 size={15} className="text-[var(--primary)]" />
        <span className="text-xs text-dim">Snapshot source: archive branch commit 0b3448b. Content refreshed through 2026-06-18.</span>
      </div>
    </div>
  );
}
