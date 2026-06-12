// =============================================================================
// Medgnosis Web — Close the Loop
// "No abnormal result falls through." The open-loop worklist + the denominator
// census, plus the CHA2DS2-VASc anticoagulation care-gap panel.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, CheckCircle2, PhoneOff, FileCheck, Eye, HeartPulse } from 'lucide-react';
import { useToast } from '../stores/ui.js';
import {
  useOpenLoops,
  useLoopStats,
  useResolveLoop,
  useRiskScores,
  type OpenLoop,
  type ClosureType,
} from '../hooks/useCloseTheLoop.js';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'badge badge-crimson',
  high: 'badge badge-amber',
  routine: 'badge badge-dim',
};

function StatStrip() {
  const { data } = useLoopStats();
  const byStatus = data?.data?.by_status ?? [];
  const byClosure = data?.data?.by_closure ?? [];
  const open = byStatus.find((s) => s.loop_status === 'open')?.n ?? 0;
  const closed = byStatus.find((s) => s.loop_status === 'closed')?.n ?? 0;
  const total = open + closed;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="card p-4">
        <div className="text-2xl font-semibold text-bright tabular-nums">{total}</div>
        <div className="text-xs text-dim mt-1">Abnormal results tracked</div>
      </div>
      <div className="card p-4">
        <div className="text-2xl font-semibold text-amber tabular-nums">{open}</div>
        <div className="text-xs text-dim mt-1">Open loops</div>
      </div>
      <div className="card p-4">
        <div className="text-2xl font-semibold text-emerald tabular-nums">{closed}</div>
        <div className="text-xs text-dim mt-1">Closed</div>
      </div>
      <div className="card p-4">
        <div className="text-xs text-dim mb-1">Dispositions</div>
        {byClosure.length === 0 ? (
          <div className="text-xs text-ghost">—</div>
        ) : (
          byClosure.map((c) => (
            <div key={c.closure_type} className="flex justify-between text-xs">
              <span className="text-dim capitalize">{(c.closure_type ?? '').replace(/_/g, ' ')}</span>
              <span className="text-bright tabular-nums">{c.n}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LoopRow({ loop }: { loop: OpenLoop }) {
  const resolve = useResolveLoop();
  const toast = useToast();
  const act = (closure_type: ClosureType, msg: string): void => {
    resolve.mutate(
      { id: loop.loop_id, closure_type },
      { onSuccess: () => toast.success(msg), onError: () => toast.error('Resolve failed') },
    );
  };

  return (
    <div className="card p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/patients/${loop.patient_id}`} className="font-medium text-bright hover:text-teal transition-colors truncate">
            {loop.patient_name}
          </Link>
          <span className={SEVERITY_BADGE[loop.severity] ?? 'badge badge-dim'}>{loop.severity}</span>
          {loop.days_overdue > 0 && (
            <span className="text-xs text-crimson tabular-nums">{loop.days_overdue}d overdue</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-dim truncate">{loop.order_name ?? 'Result'}</span>
          {loop.abnormal_flag && <span className="font-data text-amber">flag {loop.abnormal_flag}</span>}
          {loop.result_value && <span className="font-data tabular-nums text-bright">{loop.result_value}</span>}
        </div>
        <div className="text-xs text-ghost">Obligation: {loop.obligation.replace(/_/g, ' ')} · due {loop.due_date}</div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <button onClick={() => act('appropriate_care', 'Documented: appropriate care')} disabled={resolve.isPending}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-emerald/40 text-emerald hover:bg-emerald/10 transition-colors disabled:opacity-50">
          <FileCheck size={13} strokeWidth={2} aria-hidden="true" /> Appropriate care
        </button>
        <button onClick={() => act('reviewed', 'Reviewed / resolved')} disabled={resolve.isPending}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-edge/35 text-dim hover:text-bright hover:border-edge transition-colors disabled:opacity-50">
          <Eye size={13} strokeWidth={2} aria-hidden="true" /> Reviewed
        </button>
        <button onClick={() => act('refused', 'Documented refusal')} disabled={resolve.isPending}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-edge/35 text-dim hover:text-amber hover:border-amber/40 transition-colors disabled:opacity-50">
          <CheckCircle2 size={13} strokeWidth={2} aria-hidden="true" /> Refused
        </button>
        <button onClick={() => act('unable_to_reach', 'Documented: unable to reach')} disabled={resolve.isPending}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-edge/35 text-dim hover:text-crimson hover:border-crimson/40 transition-colors disabled:opacity-50">
          <PhoneOff size={13} strokeWidth={2} aria-hidden="true" /> Unable to reach
        </button>
      </div>
    </div>
  );
}

function RiskPanel() {
  const { data } = useRiskScores('CHA2DS2_VASC', false);
  const scores = (data?.data ?? []).slice().sort((a, b) => (b.score_numeric ?? 0) - (a.score_numeric ?? 0));
  if (scores.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <HeartPulse size={16} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-bright">CHA₂DS₂-VASc — stroke risk in atrial fibrillation</h2>
      </div>
      <p className="text-xs text-dim">Run population-wide; flags anticoagulation gaps (elevated score, not anticoagulated).</p>
      <div className="card divide-y divide-edge/20">
        {scores.map((s) => (
          <div key={s.patient_id} className="flex items-center justify-between p-3">
            <Link to={`/patients/${s.patient_id}`} className="text-sm text-bright hover:text-teal transition-colors truncate">
              {s.patient_name}
            </Link>
            <div className="flex items-center gap-3">
              <span className="font-data tabular-nums text-bright">{s.score_numeric}</span>
              <span className={`badge ${s.risk_category === 'high' ? 'badge-amber' : 'badge-dim'} capitalize`}>{s.risk_category}</span>
              {s.care_gap ? (
                <span className="badge badge-crimson">anticoag gap</span>
              ) : (
                <span className="text-xs text-emerald flex items-center gap-1"><CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" /> managed</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CloseTheLoopPage() {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const { data, isLoading } = useOpenLoops(status);
  const loops = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <ShieldCheck size={22} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-bright">Close the Loop</h1>
      </div>
      <p className="text-sm text-dim max-w-2xl">
        Every abnormal result accounted for — driven to a documented disposition. The denominator
        is the deliverable: silence stops being an option.
      </p>

      <StatStrip />

      <div className="flex items-center gap-1 border-b border-edge/30">
        {(['open', 'closed'] as const).map((t) => (
          <button key={t} onClick={() => setStatus(t)}
            className={['px-3 py-2 text-sm font-ui border-b-2 -mb-px transition-colors capitalize',
              status === t ? 'border-teal text-bright' : 'border-transparent text-dim hover:text-bright'].join(' ')}>
            {t} loops
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-dim">
          <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        </div>
      ) : loops.length === 0 ? (
        <div className="card p-10 flex flex-col items-center gap-2 text-center">
          <AlertTriangle size={26} strokeWidth={1.5} className="text-ghost" aria-hidden="true" />
          <p className="text-bright font-medium">No {status} loops</p>
          <p className="text-sm text-dim">The nightly scan tracks every abnormal result.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {loops.map((loop) => <LoopRow key={loop.loop_id} loop={loop} />)}
        </div>
      )}

      <RiskPanel />
    </div>
  );
}
