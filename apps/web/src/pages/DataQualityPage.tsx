// =============================================================================
// Medgnosis Web — Data Quality (the rogues' gallery + five-tests feed board)
// "Trust isn't a feeling about your data. It's a deliverable you engineer."
// =============================================================================

import { Link } from 'react-router-dom';
import { ShieldAlert, Check, X, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '../stores/ui.js';
import { QueryError } from '../components/QueryError.js';
import { useDqFindings, useDqFeeds, useDqActions, type DqFinding, type DqFeed } from '../hooks/useDataQuality.js';

const DETECTOR_LABEL: Record<string, string> = {
  impossible_height: 'Impossible height',
  impossible_temp: 'Impossible temperature',
  impossible_weight: 'Impossible weight',
  weight_jump: 'Implausible weight change',
  provider_trailing_space: 'Trailing-space identity',
};

const SEV_CLASS: Record<string, string> = { critical: 'badge badge-crimson', warning: 'badge badge-amber', info: 'badge badge-dim' };

function TestCell({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-ghost">—</span>;
  return ok
    ? <CheckCircle2 size={14} className="text-emerald" aria-label="pass" />
    : <XCircle size={14} className="text-crimson" aria-label="fail" />;
}

function FeedBoard() {
  const { data } = useDqFeeds();
  const feeds = data?.data ?? [];
  if (feeds.length === 0) return null;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ghost border-b border-edge/20">
            <th className="text-left p-2 font-medium">Feed</th>
            <th className="p-2 font-medium">Accurate</th>
            <th className="p-2 font-medium">Timely</th>
            <th className="p-2 font-medium">Complete</th>
            <th className="p-2 font-medium">Understood</th>
            <th className="p-2 font-medium">Trusted</th>
            <th className="text-left p-2 font-medium">Latency</th>
          </tr>
        </thead>
        <tbody>
          {feeds.map((f: DqFeed) => (
            <tr key={f.feed_name} className="border-b border-edge/10">
              <td className="p-2 text-bright">{f.feed_name}<div className="text-[11px] text-ghost">{f.source}</div></td>
              <td className="p-2 text-center"><TestCell ok={f.accurate} /></td>
              <td className="p-2 text-center"><TestCell ok={f.timely} /></td>
              <td className="p-2 text-center"><TestCell ok={f.complete} /></td>
              <td className="p-2 text-center"><TestCell ok={f.understood} /></td>
              <td className="p-2 text-center"><TestCell ok={f.trusted} /></td>
              <td className="p-2 text-xs text-dim">{f.latency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingRow({ f }: { f: DqFinding }) {
  const { confirm, dismiss } = useDqActions();
  const toast = useToast();
  const busy = confirm.isPending || dismiss.isPending;
  return (
    <div className="card p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={SEV_CLASS[f.severity] ?? 'badge badge-dim'}>{DETECTOR_LABEL[f.detector] ?? f.detector}</span>
          <span className="font-data text-bright">{f.observed}</span>
        </div>
        <div className="text-xs text-ghost mt-0.5">
          {f.entity_table}{f.entity_id ? ` #${f.entity_id}` : ''}
          {f.patient_id ? <> · <Link to={`/patients/${f.patient_id}`} className="hover:text-teal">{f.patient_name ?? `Patient ${f.patient_id}`}</Link></> : null}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={() => confirm.mutate(f.finding_id, { onSuccess: () => toast.success('Confirmed — now a standing check'), onError: () => toast.error('Failed') })}
          disabled={busy} title="Confirm → standing regression check"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-crimson/40 text-crimson hover:bg-crimson/10 transition-colors disabled:opacity-50">
          <Check size={13} strokeWidth={2} aria-hidden="true" /> Confirm
        </button>
        <button onClick={() => dismiss.mutate(f.finding_id, { onSuccess: () => toast.success('Dismissed'), onError: () => toast.error('Failed') })}
          disabled={busy}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-edge/35 text-dim hover:text-bright transition-colors disabled:opacity-50">
          <X size={13} strokeWidth={2} aria-hidden="true" /> Dismiss
        </button>
      </div>
    </div>
  );
}

export function DataQualityPage() {
  const { data, isLoading, isError } = useDqFindings('open');
  const findings = data?.data ?? [];
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <ShieldAlert size={22} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-bright">Data Quality</h1>
        {findings.length > 0 && <span className="badge badge-amber">{findings.length} open</span>}
      </div>
      <p className="text-sm text-dim max-w-2xl">
        Disciplined doubt: a bad value is the visible symptom of a process problem upstream.
        Confirm an anomaly and it becomes a standing regression check.
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-bright">The five tests, per feed</h2>
        <FeedBoard />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-bright">Rogues&apos; gallery</h2>
        {isLoading ? (
          <div className="py-8 text-center text-dim">Scanning…</div>
        ) : isError ? (
          <QueryError what="data-quality findings" />
        ) : findings.length === 0 ? (
          <div className="card p-8 text-center text-dim text-sm">No open anomalies.</div>
        ) : (
          <div className="space-y-2">{findings.map((f) => <FindingRow key={f.finding_id} f={f} />)}</div>
        )}
      </section>
    </div>
  );
}
