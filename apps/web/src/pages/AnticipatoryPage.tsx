// =============================================================================
// Medgnosis Web — Anticipatory Care (AMP + Auto-Orders + MTM)
// "Care that happens before the visit." AMP worklist + the capture-rate ROI
// slider, the Auto-Orders co-sign queue, and the MTM auto-referral roster.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, X, FileSignature, Pill } from 'lucide-react';
import { useToast } from '../stores/ui.js';
import {
  useAmpWorklist,
  useAmpRoi,
  useAmpDisposition,
  useEnrollments,
  useEnrollmentActions,
  useMtmReferrals,
  useMtmAdvance,
  type AmpDisposition,
  type AmpOutreach,
} from '../hooks/useAnticipatory.js';

const TIER_LABEL: Record<number, string> = {
  1: 'Pre-visit (T-14)',
  2: 'Not seen 1yr',
  3: 'Drifting away',
};

const DISPOSITIONS: { key: AmpDisposition; label: string }[] = [
  { key: 'labs_completed', label: 'Labs done' },
  { key: 'procedure', label: 'Procedure' },
  { key: 'reminder', label: 'Reminder' },
  { key: 'education', label: 'Education' },
  { key: 'referral', label: 'Referral' },
  { key: 'declined', label: 'Declined' },
];

function currency(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

// ─── ROI slider (the compendium's signature interactive) ─────────────────────
function RoiSlider() {
  const { data } = useAmpRoi();
  const [rate, setRate] = useState(30);
  const rows = data?.data ?? [];
  const total = rows.reduce((s, r) => s + r.opportunity, 0);
  const captured = (total * rate) / 100;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-bright">Opportunity at capture rate</h2>
        <span className="text-2xl font-semibold text-gold tabular-nums">{currency(captured)}</span>
      </div>
      <input
        type="range" min={0} max={100} step={5} value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
        className="w-full accent-teal"
        aria-label="Capture rate"
      />
      <div className="flex justify-between text-xs text-dim">
        <span>0%</span>
        <span className="text-bright font-data">{rate}% capture</span>
        <span>100% = {currency(total)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-edge/20">
        {rows.map((r) => (
          <div key={r.amp_tier} className="text-center">
            <div className="text-xs text-dim">{TIER_LABEL[r.amp_tier] ?? `Tier ${r.amp_tier}`}</div>
            <div className="text-sm font-data tabular-nums text-bright">{currency((r.opportunity * rate) / 100)}</div>
            <div className="text-[11px] text-ghost">{r.pending_gaps} gaps</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AMP worklist ─────────────────────────────────────────────────────────────
function AmpRow({ o }: { o: AmpOutreach }) {
  const disposition = useAmpDisposition();
  const toast = useToast();
  const act = (d: AmpDisposition): void => {
    disposition.mutate(
      { id: o.outreach_id, disposition: d },
      { onSuccess: () => toast.success(`Recorded: ${d.replace(/_/g, ' ')}`), onError: () => toast.error('Failed') },
    );
  };
  return (
    <div className="card p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/patients/${o.patient_id}`} className="font-medium text-bright hover:text-teal transition-colors truncate">
            {o.patient_name}
          </Link>
          {o.net_revenue != null && <span className="font-data text-gold tabular-nums text-xs">{currency(o.net_revenue)}</span>}
          {o.appointment_date && <span className="text-xs text-teal">appt {o.appointment_date}</span>}
        </div>
        <div className="text-xs text-dim truncate">{o.measure_name ?? 'Care gap'}</div>
      </div>
      <div className="flex items-center gap-1 flex-wrap flex-shrink-0">
        {DISPOSITIONS.map((d) => (
          <button key={d.key} onClick={() => act(d.key)} disabled={disposition.isPending}
            className={['px-2 py-1 rounded-btn text-[11px] font-ui border transition-colors disabled:opacity-50',
              d.key === 'declined'
                ? 'border-edge/35 text-dim hover:text-crimson hover:border-crimson/40'
                : 'border-edge/35 text-dim hover:text-emerald hover:border-emerald/40'].join(' ')}>
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AmpSection() {
  const [tier, setTier] = useState(1);
  const { data, isLoading } = useAmpWorklist(tier);
  const rows = data?.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 border-b border-edge/30">
        {[1, 2, 3].map((t) => (
          <button key={t} onClick={() => setTier(t)}
            className={['px-3 py-2 text-sm font-ui border-b-2 -mb-px transition-colors',
              tier === t ? 'border-teal text-bright' : 'border-transparent text-dim hover:text-bright'].join(' ')}>
            {TIER_LABEL[t]}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="py-8 text-center text-dim">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card p-6 text-center text-dim text-sm">No pending outreach in this tier.</div>
      ) : (
        <div className="space-y-2">{rows.map((o) => <AmpRow key={o.outreach_id} o={o} />)}</div>
      )}
    </div>
  );
}

// ─── Auto-Orders co-sign queue ─────────────────────────────────────────────────
function EnrollmentSection() {
  const { data } = useEnrollments('pending');
  const { cosign, disenroll } = useEnrollmentActions();
  const toast = useToast();
  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return <div className="card p-4 text-sm text-dim">No enrollments awaiting co-sign.</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((e) => (
        <div key={e.enrollment_id} className="card p-3 flex items-center justify-between">
          <div className="min-w-0">
            <Link to={`/patients/${e.patient_id}`} className="font-medium text-bright hover:text-teal transition-colors truncate">{e.patient_name}</Link>
            <div className="text-xs text-dim">{e.protocol_name}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => cosign.mutate(e.enrollment_id, { onSuccess: () => toast.success('Co-signed — protocol active'), onError: () => toast.error('Failed') })}
              disabled={cosign.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-xs font-ui border border-emerald/40 text-emerald hover:bg-emerald/10 transition-colors disabled:opacity-50">
              <FileSignature size={13} strokeWidth={2} aria-hidden="true" /> Co-sign
            </button>
            <button onClick={() => disenroll.mutate(e.enrollment_id, { onSuccess: () => toast.success('Dis-enrolled'), onError: () => toast.error('Failed') })}
              disabled={disenroll.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-xs font-ui border border-edge/35 text-dim hover:text-crimson hover:border-crimson/40 transition-colors disabled:opacity-50">
              <X size={13} strokeWidth={2} aria-hidden="true" /> Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MTM referrals ──────────────────────────────────────────────────────────────
function MtmSection() {
  const { data } = useMtmReferrals();
  const advance = useMtmAdvance();
  const toast = useToast();
  const rows = data?.data ?? [];
  if (rows.length === 0) return <div className="card p-4 text-sm text-dim">No active MTM referrals.</div>;
  return (
    <div className="space-y-2">
      {rows.slice(0, 25).map((m) => (
        <div key={m.mtm_id} className="card p-3 flex items-center justify-between">
          <div className="min-w-0">
            <Link to={`/patients/${m.patient_id}`} className="font-medium text-bright hover:text-teal transition-colors truncate">{m.patient_name}</Link>
            <div className="text-xs text-dim capitalize">{m.condition} · {m.trigger_code} <span className="font-data text-amber">{m.trigger_value}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-info capitalize">{m.mtm_status.replace(/_/g, ' ')}</span>
            <button onClick={() => advance.mutate({ id: m.mtm_id, at_goal: true }, { onSuccess: () => toast.success('Advanced — at goal'), onError: () => toast.error('Failed') })}
              disabled={advance.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-emerald/40 text-emerald hover:bg-emerald/10 transition-colors disabled:opacity-50">
              <Check size={13} strokeWidth={2} aria-hidden="true" /> At goal
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnticipatoryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarClock size={22} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-bright">Anticipatory Care</h1>
      </div>
      <p className="text-sm text-dim max-w-2xl">
        Care that happens before the visit — gaps worked two weeks ahead, the population drifting
        from care reached, routine orders generated by protocol, and the uncontrolled referred to pharmacy.
      </p>

      <RoiSlider />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-bright flex items-center gap-2"><CalendarClock size={15} className="text-teal" aria-hidden="true" /> AMP outreach worklist</h2>
        <AmpSection />
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-bright flex items-center gap-2"><FileSignature size={15} className="text-teal" aria-hidden="true" /> Auto-Orders — co-sign queue</h2>
          <EnrollmentSection />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-bright flex items-center gap-2"><Pill size={15} className="text-teal" aria-hidden="true" /> MTM auto-referrals</h2>
          <MtmSection />
        </section>
      </div>
    </div>
  );
}
