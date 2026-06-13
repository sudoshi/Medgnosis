// =============================================================================
// Medgnosis Web — Cohort Manager
// Specialist population command center: pick a cohort, see flagged patients,
// and close the loop back to the PCP with a required disposition.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UsersRound, Send, CheckCircle2 } from 'lucide-react';
import { useToast } from '../stores/ui.js';
import {
  useCohorts,
  useCohortMembers,
  useCohortMessages,
  useCohortActions,
  type CohortMember,
} from '../hooks/useCohorts.js';

function MemberRow({ m, cohortName }: { m: CohortMember; cohortName: string }) {
  const { sendMessage } = useCohortActions();
  const toast = useToast();
  const onMessage = (): void => {
    sendMessage.mutate(
      { patient_id: m.patient_id, subject: `${cohortName} — specialist review`, required_disposition: 'Review and document plan within 2 weeks' },
      { onSuccess: () => toast.success('Closed-loop message sent to PCP'), onError: () => toast.error('Send failed') },
    );
  };
  return (
    <div className="card p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Link to={`/patients/${m.patient_id}`} className="font-medium text-bright hover:text-teal transition-colors truncate">{m.patient_name}</Link>
        <div className="flex gap-1 flex-wrap mt-0.5">
          {m.flags.map((f) => <span key={f} className="badge badge-amber text-[10px]">{f.replace(/_/g, ' ')}</span>)}
          {m.conditions.slice(0, 3).map((c) => <span key={c} className="font-data text-[10px] text-ghost">{c}</span>)}
        </div>
      </div>
      <button onClick={onMessage} disabled={sendMessage.isPending}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-teal/40 text-teal hover:bg-teal/10 transition-colors disabled:opacity-50 flex-shrink-0">
        <Send size={13} strokeWidth={2} aria-hidden="true" /> Message PCP
      </button>
    </div>
  );
}

function MessagesPanel() {
  const { data } = useCohortMessages();
  const { resolveMessage } = useCohortActions();
  const toast = useToast();
  const messages = data?.data ?? [];
  if (messages.length === 0) return <div className="card p-4 text-sm text-dim">No closed-loop messages yet.</div>;
  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <div key={m.message_id} className="card p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-bright truncate">{m.subject}</div>
            <div className="text-xs text-ghost">{m.patient_name} · {m.required_disposition ?? 'review'}</div>
            {m.disposition && <div className="text-xs text-emerald mt-0.5">✓ {m.disposition}</div>}
          </div>
          {m.status === 'resolved' ? (
            <span className="text-xs text-emerald flex items-center gap-1 flex-shrink-0"><CheckCircle2 size={12} aria-hidden="true" /> resolved</span>
          ) : (
            <button onClick={() => resolveMessage.mutate({ id: m.message_id, disposition: 'Reviewed; plan documented' }, { onSuccess: () => toast.success('Loop closed'), onError: () => toast.error('Failed') })}
              disabled={resolveMessage.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-emerald/40 text-emerald hover:bg-emerald/10 transition-colors disabled:opacity-50 flex-shrink-0">
              <CheckCircle2 size={13} strokeWidth={2} aria-hidden="true" /> Resolve
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function CohortManagerPage() {
  const { data: cohortsData } = useCohorts();
  const cohorts = cohortsData?.data ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const activeId = selected ?? cohorts[0]?.cohort_id ?? null;
  const { data: membersData, isLoading } = useCohortMembers(activeId);
  const members = membersData?.data ?? [];
  const activeCohort = cohorts.find((c) => c.cohort_id === activeId);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <UsersRound size={22} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-bright">Cohort Manager</h1>
      </div>
      <p className="text-sm text-dim max-w-2xl">
        Define the population you worry about, watch it continuously, and push structured,
        closed-loop guidance back to primary care — not a curbside, a tracked disposition.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {cohorts.map((c) => (
          <button key={c.cohort_id} onClick={() => setSelected(c.cohort_id)}
            className={['px-3 py-1.5 rounded-btn text-sm font-ui border transition-colors',
              activeId === c.cohort_id ? 'border-teal/50 text-bright bg-teal/5' : 'border-edge/35 text-dim hover:text-bright'].join(' ')}>
            {c.name}
          </button>
        ))}
        {cohorts.length === 0 && <span className="text-sm text-dim">No cohorts defined.</span>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-bright">
            Members{activeCohort ? ` · ${activeCohort.name}` : ''} {members.length > 0 && <span className="text-dim">({members.length})</span>}
          </h2>
          {isLoading ? (
            <div className="py-8 text-center text-dim">Loading…</div>
          ) : members.length === 0 ? (
            <div className="card p-6 text-center text-dim text-sm">No matching patients.</div>
          ) : (
            <div className="space-y-2">{members.map((m) => <MemberRow key={m.patient_id} m={m} cohortName={activeCohort?.name ?? 'Cohort'} />)}</div>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-bright">Closed-loop messages</h2>
          <MessagesPanel />
        </section>
      </div>
    </div>
  );
}
