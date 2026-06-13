// =============================================================================
// Medgnosis Web — Coding & HCC Capture
// "Why the money followed the medicine." Capture % by provider, the E&M
// visit-level shift, and the missed-opportunity worklist (the recognition gap).
// =============================================================================

import { Link } from 'react-router-dom';
import { BadgeDollarSign, TrendingUp, Search } from 'lucide-react';
import { QueryError } from '../components/QueryError.js';
import {
  useHccCapture,
  useEmDistribution,
  useMissedOpportunities,
  findingLabel,
  type ProviderCapture,
} from '../hooks/useCoding.js';

function captureClass(pct: number): string {
  if (pct >= 70) return 'text-emerald';
  if (pct >= 50) return 'text-gold';
  return 'text-crimson';
}

function CaptureSection() {
  const { data, isError } = useHccCapture();
  const overall = data?.data?.overall;
  const providers = data?.data?.byProvider ?? [];
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-bright flex items-center gap-2">
        <BadgeDollarSign size={15} className="text-teal" aria-hidden="true" /> HCC capture
      </h2>
      {isError && <QueryError what="HCC capture metrics" />}
      {overall && (
        <div className="card p-5 flex items-end gap-4">
          <div>
            <div className={`text-4xl font-semibold tabular-nums ${captureClass(overall.capture_pct)}`}>{overall.capture_pct}%</div>
            <div className="text-xs text-dim mt-1">Overall capture · {overall.coded} of {overall.evident} evident HCC conditions coded</div>
          </div>
          <div className="flex-1 h-3 bg-s1 rounded-full overflow-hidden self-center">
            <div className="h-full bg-teal" style={{ width: `${overall.capture_pct}%` }} />
          </div>
        </div>
      )}
      <div className="card divide-y divide-edge/15">
        {providers.map((p: ProviderCapture) => (
          <div key={p.provider_id ?? 'none'} className="flex items-center justify-between p-3">
            <span className="text-sm text-bright truncate">{p.provider_name?.trim() || 'Unattributed'}</span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-dim tabular-nums">{p.coded}/{p.evident}</span>
              <span className={`text-lg font-semibold tabular-nums ${captureClass(p.capture_pct)}`}>{p.capture_pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmSection() {
  const { data } = useEmDistribution();
  const o = data?.data?.overall;
  if (!o) return null;
  const bar = (n: number, color: string, label: string) => (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs text-dim">{label}</span>
      <div className="flex-1 h-4 bg-s1 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${o.total ? (n / o.total) * 100 : 0}%` }} />
      </div>
      <span className="w-10 text-right font-data tabular-nums text-xs text-bright">{n}</span>
    </div>
  );
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-bright flex items-center gap-2">
        <TrendingUp size={15} className="text-teal" aria-hidden="true" /> E&M visit-level distribution
      </h2>
      <div className="card p-4 space-y-2">
        {bar(o.level3, 'bg-dim', 'Level 3')}
        {bar(o.level4, 'bg-teal', 'Level 4')}
        {bar(o.level5, 'bg-gold', 'Level 5')}
        <div className="text-xs text-dim pt-2 border-t border-edge/15">
          {o.pct_level4plus}% at level 4 or 5 · {o.total} visits
        </div>
      </div>
    </section>
  );
}

function MissedSection() {
  const { data } = useMissedOpportunities();
  const d = data?.data;
  if (!d) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-bright flex items-center gap-2">
        <Search size={15} className="text-amber" aria-hidden="true" /> Missed opportunities
      </h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="text-xs text-dim mb-2 flex items-center justify-between">
            <span>Lab/vitals-evident, not coded</span>
            <Link to="/population-finder" className="text-teal hover:underline">Population Finder →</Link>
          </div>
          {d.lab_evident.map((r) => (
            <div key={r.label} className="flex justify-between text-sm py-0.5">
              <span className="text-dim">{findingLabel(r.label)}</span>
              <span className="font-data tabular-nums text-bright">{r.count}</span>
            </div>
          ))}
          {d.lab_evident.length === 0 && <div className="text-xs text-ghost">None pending.</div>}
        </div>
        <div className="card p-4">
          <div className="text-xs text-dim mb-2">Uncoded HCC conditions ({d.total_uncoded_hcc})</div>
          {d.uncoded_hcc.slice(0, 10).map((r) => (
            <div key={r.label} className="flex justify-between text-sm py-0.5">
              <span className="font-data text-dim">{r.label}</span>
              <span className="font-data tabular-nums text-bright">{r.count}</span>
            </div>
          ))}
          {d.uncoded_hcc.length === 0 && <div className="text-xs text-ghost">None pending.</div>}
        </div>
      </div>
    </section>
  );
}

export function CodingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BadgeDollarSign size={22} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-bright">Coding & HCC Capture</h1>
      </div>
      <p className="text-sm text-dim max-w-2xl">
        Honest severity documentation makes risk scores reflect reality. Capture follows the
        medicine — the gap between what's evident and what's coded is a worklist, not a mystery.
      </p>
      <CaptureSection />
      <EmSection />
      <MissedSection />
    </div>
  );
}
