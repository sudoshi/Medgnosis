// =============================================================================
// Medgnosis Web — Population Finder review worklist
// The CKD playbook surfaced to the clinician: lab/vitals-evident conditions
// missing from (or generic on) the problem list. Accept routes through the
// audited bulk-load utility; "Does not have" / "Snooze" are first-class.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Check, X, Ban, Clock, FlaskConical, Activity } from 'lucide-react';
import { useToast } from '../stores/ui.js';
import { QueryError } from '../components/QueryError.js';
import {
  usePopulationFinder,
  useFinderActions,
  type FinderCandidate,
} from '../hooks/usePopulationFinder.js';

const FINDING_LABEL: Record<string, string> = {
  ckd_restage: 'Re-stage generic CKD',
  ckd_unlabeled: 'Unlabeled CKD (lab-evident)',
  obesity_unlabeled: 'Unlabeled obesity',
};

function EvidenceText({ c }: { c: FinderCandidate }) {
  const when = c.evidence.observed_at
    ? new Date(c.evidence.observed_at).toLocaleDateString()
    : 'unknown date';
  if (c.evidence.egfr != null) {
    return (
      <span className="flex items-center gap-1.5 text-dim">
        <FlaskConical size={13} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
        eGFR <span className="font-data tabular-nums text-bright">{c.evidence.egfr}</span> on {when}
      </span>
    );
  }
  if (c.evidence.bmi != null) {
    return (
      <span className="flex items-center gap-1.5 text-dim">
        <Activity size={13} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
        BMI <span className="font-data tabular-nums text-bright">{c.evidence.bmi}</span> on {when}
      </span>
    );
  }
  return <span className="text-ghost">—</span>;
}

function CandidateRow({ c }: { c: FinderCandidate }) {
  const { accept, reject, dismiss } = useFinderActions();
  const toast = useToast();
  const busy = accept.isPending || reject.isPending || dismiss.isPending;

  const act = (
    fn: { mutate: (v: never, opts?: { onSuccess?: () => void; onError?: () => void }) => void },
    arg: unknown,
    okMsg: string,
  ): void => {
    fn.mutate(arg as never, {
      onSuccess: () => toast.success(okMsg),
      onError: () => toast.error('Action failed'),
    });
  };

  return (
    <div className="card p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/patients/${c.patient_id}`}
            className="font-medium text-bright hover:text-teal transition-colors truncate"
          >
            {c.patient_name}
          </Link>
          <span className="badge badge-info">{FINDING_LABEL[c.finding_type] ?? c.finding_type}</span>
        </div>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          {c.current_icd10 && (
            <>
              <span className="font-data text-dim line-through">{c.current_icd10}</span>
              <span className="text-ghost">→</span>
            </>
          )}
          <span className="font-data tabular-nums text-bright">{c.suggested_icd10}</span>
          <span className="text-dim truncate">{c.suggested_name}</span>
        </div>
        <div className="text-xs">
          <EvidenceText c={c} />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => act(accept, c.candidate_id, `Added ${c.suggested_icd10} to problem list`)}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-xs font-ui border border-emerald/40 text-emerald hover:bg-emerald/10 transition-colors disabled:opacity-50"
        >
          <Check size={13} strokeWidth={2} aria-hidden="true" /> Accept
        </button>
        <button
          onClick={() => act(reject, c.candidate_id, 'Rejected')}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-xs font-ui border border-edge/35 text-dim hover:text-bright hover:border-edge transition-colors disabled:opacity-50"
        >
          <X size={13} strokeWidth={2} aria-hidden="true" /> Reject
        </button>
        <button
          onClick={() => act(dismiss, { id: c.candidate_id, reason: 'does_not_have' }, 'Marked: does not have')}
          disabled={busy}
          title="Patient does not have this condition (permanent dismissal)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-edge/35 text-dim hover:text-crimson hover:border-crimson/40 transition-colors disabled:opacity-50"
        >
          <Ban size={13} strokeWidth={2} aria-hidden="true" /> Does not have
        </button>
        <button
          onClick={() => act(dismiss, { id: c.candidate_id, reason: 'snooze' }, 'Snoozed 12 months')}
          disabled={busy}
          title="Snooze for 12 months"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-ui border border-edge/35 text-dim hover:text-amber hover:border-amber/40 transition-colors disabled:opacity-50"
        >
          <Clock size={13} strokeWidth={2} aria-hidden="true" /> 12mo
        </button>
      </div>
    </div>
  );
}

export function PopulationFinderPage() {
  const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const { data, isLoading, isError } = usePopulationFinder(status);
  const candidates = data?.data ?? [];

  const tabs: Array<{ key: typeof status; label: string }> = [
    { key: 'pending', label: 'Pending' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'rejected', label: 'Dismissed' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-bright">Population Finder</h1>
          {status === 'pending' && candidates.length > 0 && (
            <span className="badge badge-info">{candidates.length} to review</span>
          )}
        </div>
      </div>

      <p className="text-sm text-dim max-w-2xl">
        Conditions the data evidences but the problem list misses — generic diagnoses to
        re-stage and lab/vitals-evident conditions to add. Recognition is the rate-limiting
        step of chronic-disease care.
      </p>

      <div className="flex items-center gap-1 border-b border-edge/30">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={[
              'px-3 py-2 text-sm font-ui border-b-2 -mb-px transition-colors',
              status === t.key
                ? 'border-teal text-bright'
                : 'border-transparent text-dim hover:text-bright',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-dim">
          <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        </div>
      ) : isError ? (
        <QueryError what="the review worklist" />
      ) : candidates.length === 0 ? (
        <div className="card p-10 flex flex-col items-center gap-2 text-center">
          <Search size={28} strokeWidth={1.5} className="text-ghost" aria-hidden="true" />
          <p className="text-bright font-medium">Nothing {status === 'pending' ? 'to review' : `in ${status}`}</p>
          <p className="text-sm text-dim">The nightly finder sweep populates this worklist.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => (
            <CandidateRow key={c.candidate_id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
