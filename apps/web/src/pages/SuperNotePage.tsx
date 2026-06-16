// =============================================================================
// Medgnosis Web — SuperNote
// "The note that does the work." Pre-assembled from the record; the A&P codes
// the diagnosis as the plan is written. Documentation as the cockpit.
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, ArrowLeft, Stethoscope, ClipboardList, FlaskConical, CheckCircle2 } from 'lucide-react';
import { useToast } from '../stores/ui.js';
import {
  useSuperNote,
  useFinalizeSuperNote,
  labLabel,
  type ApScaffoldEntry,
} from '../hooks/useSuperNote.js';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard.js';

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-bright flex items-center gap-2">{icon} {title}</h2>
      {children}
    </section>
  );
}

export function SuperNotePage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { data, isLoading } = useSuperNote(patientId);
  const finalize = useFinalizeSuperNote(patientId);
  const toast = useToast();

  const note = data?.data;
  const [plans, setPlans] = useState<Record<string, string>>({});
  const [includeGaps, setIncludeGaps] = useState(true);
  const [filed, setFiled] = useState(false);

  const draftKey = `mg_supernote_draft_${patientId ?? ''}`;

  // Seed plan editor from the record, then restore any unsaved local draft on top.
  const seed = useMemo(() => {
    const s: Record<string, string> = {};
    note?.assessment_plan.forEach((e, i) => { s[`${e.icd10_code}-${i}`] = e.current_plan; });
    return s;
  }, [note]);

  useEffect(() => {
    if (!note) return;
    let restored = seed;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) restored = { ...seed, ...(JSON.parse(saved) as Record<string, string>) };
    } catch { /* ignore malformed draft */ }
    setPlans(restored);
  }, [note, seed, draftKey]);

  const isDirty = useMemo(
    () => !!note && !filed && JSON.stringify(plans) !== JSON.stringify(seed),
    [note, filed, plans, seed],
  );

  // No server draft endpoint exists for SuperNote, so unsaved A&P plans are
  // persisted to localStorage (survives in-app navigation); beforeunload warns
  // on tab close / refresh.
  useUnsavedChangesGuard(isDirty, () => {
    try { localStorage.setItem(draftKey, JSON.stringify(plans)); } catch { /* quota */ }
  });

  if (isLoading) return <div className="py-16 text-center text-dim">Assembling note…</div>;
  if (!note) return <div className="py-16 text-center text-dim">Patient not found.</div>;

  const onFinalize = (): void => {
    const ap = note.assessment_plan
      .map((e, i) => ({ icd10_code: e.icd10_code, diagnosis_name: e.diagnosis_name, plan: plans[`${e.icd10_code}-${i}`] ?? '' }))
      .filter((e) => e.icd10_code && e.plan.trim());
    if (ap.length === 0) { toast.error('Write at least one plan before finalizing'); return; }
    finalize.mutate(
      { ap },
      {
        onSuccess: (res) => {
          setFiled(true);
          try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
          toast.success(`Note filed — ${res.data?.coded ?? 0} diagnoses coded`);
        },
        onError: () => toast.error('Finalize failed'),
      },
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <Link to={`/patients/${note.patient.patient_id}`} className="text-xs text-dim hover:text-teal flex items-center gap-1 mb-1">
            <ArrowLeft size={12} aria-hidden="true" /> Back to chart
          </Link>
          <h1 className="text-2xl font-semibold text-bright flex items-center gap-2">
            <FileText size={22} strokeWidth={1.5} className="text-teal" aria-hidden="true" />
            SuperNote — {note.patient.first_name} {note.patient.last_name}
          </h1>
          <p className="text-sm text-dim">{note.patient.age} yo {note.patient.gender}</p>
        </div>
        <button onClick={onFinalize} disabled={finalize.isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-btn text-sm font-ui border border-emerald/50 text-emerald hover:bg-emerald/10 transition-colors disabled:opacity-50">
          <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" /> {finalize.isPending ? 'Filing…' : 'Finalize & code'}
        </button>
      </div>

      {/* Brief history — leads with what's due */}
      <div className="card p-4">
        <p className="text-sm text-bright leading-relaxed">{note.brief_history}</p>
        {note.whats_due !== 'Up to date on care gaps.' && (
          <p className="text-sm text-gold mt-2 font-medium">{note.whats_due}</p>
        )}
      </div>

      {/* Interval events */}
      {note.interval_events.length > 0 && (
        <Section title="Interval events" icon={<Stethoscope size={15} className="text-teal" aria-hidden="true" />}>
          <div className="card divide-y divide-edge/15">
            {note.interval_events.slice(0, 8).map((e, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 text-sm">
                <span className="font-data text-xs text-dim w-24">{e.event_date}</span>
                <span className="text-bright capitalize">{e.detail ?? e.kind}</span>
                {e.reason && <span className="text-xs text-ghost truncate">{e.reason}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Problem list — grouped by organ system */}
      <Section title="Problem list (by organ system)" icon={<ClipboardList size={15} className="text-teal" aria-hidden="true" />}>
        <div className="space-y-3">
          {note.problems_by_system.map((g) => (
            <div key={g.organ_system} className="card p-3">
              <div className="text-xs font-semibold text-teal uppercase tracking-wide mb-1.5">{g.organ_system}</div>
              <ul className="space-y-1">
                {g.problems.map((p) => (
                  <li key={p.icd10_code} className="text-sm text-bright flex items-center gap-2">
                    <span className="font-data text-xs text-dim">{p.icd10_code}</span> {p.dx_name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Care gaps riding inside the note */}
      <Section title="Open care gaps" icon={<ClipboardList size={15} className="text-amber" aria-hidden="true" />}>
        <div className="card p-3">
          <label className="flex items-center gap-2 text-xs text-dim mb-2 cursor-pointer">
            <input type="checkbox" checked={includeGaps} onChange={(e) => setIncludeGaps(e.target.checked)} className="accent-teal" />
            Include in note · as of {new Date().toISOString().slice(0, 10)}
          </label>
          {includeGaps && (
            <ul className="space-y-1">
              {note.care_gaps.map((g) => (
                <li key={g.care_gap_id} className="text-sm text-dim flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${g.gap_priority === 'high' ? 'bg-crimson' : 'bg-amber'}`} />
                  {g.measure_name}{g.due_date ? <span className="text-xs text-ghost">· due {g.due_date}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* Trended labs */}
      {note.lab_review.length > 0 && (
        <Section title="Diagnostics review" icon={<FlaskConical size={15} className="text-teal" aria-hidden="true" />}>
          <div className="card p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(
              note.lab_review.reduce<Record<string, string[]>>((acc, r) => {
                (acc[r.observation_code] ??= []).push(r.value_numeric ?? '—');
                return acc;
              }, {}),
            ).map(([code, vals]) => (
              <div key={code}>
                <div className="text-[11px] text-ghost">{labLabel(code)}</div>
                <div className="font-data tabular-nums text-sm text-bright">{vals.slice(0, 3).reverse().join(' → ')}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Assessment & Plan — typing the plan codes the diagnosis */}
      <Section title="Assessment & Plan" icon={<Stethoscope size={15} className="text-teal" aria-hidden="true" />}>
        <div className="space-y-2">
          {note.assessment_plan.map((e: ApScaffoldEntry, i) => {
            const key = `${e.icd10_code}-${i}`;
            return (
              <div key={key} className="card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-data text-xs text-dim">{e.icd10_code}</span>
                  <span className="text-sm font-medium text-bright">{e.diagnosis_name}</span>
                  <span className="text-[11px] text-ghost">{e.organ_system}</span>
                </div>
                {e.previous_plan && <div className="text-xs text-ghost italic">Previous: {e.previous_plan}</div>}
                <textarea
                  value={plans[key] ?? ''}
                  onChange={(ev) => setPlans((p) => ({ ...p, [key]: ev.target.value }))}
                  placeholder="Today's plan…"
                  rows={2}
                  className="w-full bg-s1 border border-edge/30 rounded-btn p-2 text-sm text-bright placeholder:text-ghost focus:border-teal/50 focus:outline-none resize-y"
                />
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
