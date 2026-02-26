// =============================================================================
// Medgnosis Web — Patient Detail  (Clinical Obsidian v2)
// Full patient record: header, info strip, timeline, care-gaps / conditions
// =============================================================================

import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Activity,
  Clipboard,
  Eye,
  AlertCircle,
  Phone,
  Mail,
} from 'lucide-react';
import { api } from '../services/api.js';

// ─── Types matching the actual API response ───────────────────────────────────

interface PatientDetail {
  id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string;
  gender: string;
  primary_phone: string | null;
  email: string | null;
  active_ind: string;
  conditions: Array<{
    id: number;
    code: string;
    name: string;
    status: string;
    onset_date: string;
  }>;
  encounters: Array<{
    id: number;
    date: string;
    type: string;
    reason: string | null;
  }>;
  observations: Array<{
    id: number;
    name: string;
    value: string | null;
    unit: string | null;
    date: string;
  }>;
  care_gaps: Array<{
    id: number;
    measure: string | null;
    status: string;
    identified_date: string;
    resolved_date: string | null;
  }>;
}

interface TimelineItem {
  key: string;
  type: 'encounter' | 'observation' | 'condition' | 'care-gap';
  title: string;
  subtitle: string | null;
  date: string;
  status: string | null;
  value: string | null;
  unit: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  'bg-teal/20 text-teal',
  'bg-violet/20 text-violet',
  'bg-amber/20 text-amber',
  'bg-emerald/20 text-emerald',
  'bg-crimson/20 text-crimson',
];

function avatarColor(id: number): string {
  return AVATAR_PALETTE[id % AVATAR_PALETTE.length];
}

function getInitials(first: string, last: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function calcAge(dob: string): number | null {
  if (!dob) return null;
  try {
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  } catch {
    return null;
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatGender(g: string): string {
  if (!g) return '—';
  if (g.toUpperCase().startsWith('M')) return 'Male';
  if (g.toUpperCase().startsWith('F')) return 'Female';
  return g;
}

function getMonthYearKey(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

// ─── Event type → visual tokens ───────────────────────────────────────────────

const TYPE_NODE: Record<string, string> = {
  encounter:   'bg-teal/20 border border-teal/60',
  observation: 'bg-emerald/20 border border-emerald/60',
  condition:   'bg-amber/20 border border-amber/60',
  'care-gap':  'bg-crimson/20 border border-crimson/60',
};

const TYPE_SPINE: Record<string, string> = {
  encounter:   'bg-teal/20',
  observation: 'bg-emerald/20',
  condition:   'bg-amber/20',
  'care-gap':  'bg-crimson/20',
};

const STATUS_BADGE: Record<string, string> = {
  active:    'badge badge-amber',
  completed: 'badge badge-emerald',
  open:      'badge badge-crimson',
  resolved:  'badge badge-emerald',
  closed:    'badge badge-dim',
  identified:'badge badge-crimson',
};

function gapBorderColor(status: string): string {
  const s = status?.toLowerCase() ?? '';
  if (s === 'open' || s === 'identified') return 'border-l-crimson bg-crimson/5';
  if (s === 'resolved' || s === 'closed') return 'border-l-emerald/50 bg-s1';
  return 'border-l-edge/30 bg-s1';
}

function gapStatusBadge(status: string): string {
  const s = status?.toLowerCase() ?? '';
  if (s === 'open' || s === 'identified') return 'badge badge-crimson';
  if (s === 'resolved' || s === 'closed') return 'badge badge-emerald';
  return 'badge badge-dim';
}

// ─── PatientDetailPage ────────────────────────────────────────────────────────

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient', patientId],
    queryFn:  () => api.get<PatientDetail>(`/patients/${patientId}`),
    enabled:  !!patientId,
  });

  const patient = data?.data;

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="surface flex items-center gap-5">
          <div className="skeleton w-12 h-12 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-7 w-56 rounded" />
            <div className="skeleton h-3 w-72 rounded" />
          </div>
        </div>
        <div className="surface p-0 overflow-hidden">
          <div className="flex divide-x divide-edge/25">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-1 px-5 py-4 space-y-2">
                <div className="skeleton h-6 w-8 rounded" />
                <div className="skeleton h-2.5 w-20 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
          <div className="surface space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton w-[11px] h-[11px] rounded-full mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-1.5 pb-4">
                  <div className="skeleton h-3 w-2/5 rounded" />
                  <div className="skeleton h-2.5 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="surface space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-14 rounded-card" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Not found / error ────────────────────────────────────────────────────
  if (error || !patient) {
    return (
      <div className="space-y-4">
        <Link
          to="/patients"
          className="inline-flex items-center gap-1.5 text-xs text-ghost hover:text-dim transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          All Patients
        </Link>
        <div className="empty-state py-20">
          <p className="empty-state-title">Patient not found</p>
          <p className="empty-state-desc">
            No patient with ID {patientId} exists or you don't have access.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const initials = getInitials(patient.first_name, patient.last_name);
  const color    = avatarColor(patient.id);
  const age      = calcAge(patient.date_of_birth);
  const gender   = formatGender(patient.gender);

  const openGaps = (patient.care_gaps ?? []).filter(
    (g) => ['open', 'identified'].includes(g.status?.toLowerCase() ?? ''),
  );

  // Build unified, date-descending timeline
  const timelineItems: TimelineItem[] = [
    ...(patient.encounters ?? []).map((e): TimelineItem => ({
      key:      `enc-${e.id}`,
      type:     'encounter',
      title:    e.type || 'Encounter',
      subtitle: e.reason || null,
      date:     e.date,
      status:   'completed',
      value:    null,
      unit:     null,
    })),
    ...(patient.observations ?? []).map((o): TimelineItem => ({
      key:      `obs-${o.id}`,
      type:     'observation',
      title:    o.name || 'Observation',
      subtitle: null,
      date:     o.date,
      status:   null,
      value:    o.value,
      unit:     o.unit,
    })),
    ...(patient.conditions ?? []).map((c): TimelineItem => ({
      key:      `cond-${c.id}`,
      type:     'condition',
      title:    c.name || c.code,
      subtitle: c.code !== c.name ? c.code : null,
      date:     c.onset_date,
      status:   c.status,
      value:    null,
      unit:     null,
    })),
    ...(patient.care_gaps ?? []).map((g): TimelineItem => ({
      key:      `gap-${g.id}`,
      type:     'care-gap',
      title:    g.measure || 'Care Gap',
      subtitle: null,
      date:     g.identified_date,
      status:   g.status,
      value:    null,
      unit:     null,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group by month/year
  const grouped: [string, TimelineItem[]][] = [];
  for (const item of timelineItems.slice(0, 50)) {
    const key = getMonthYearKey(item.date);
    const last = grouped[grouped.length - 1];
    if (last && last[0] === key) {
      last[1].push(item);
    } else {
      grouped.push([key, [item]]);
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Back link ───────────────────────────────────────────────────── */}
      <Link
        to="/patients"
        className="inline-flex items-center gap-1.5 text-xs text-ghost hover:text-dim transition-colors font-ui"
      >
        <ArrowLeft size={13} strokeWidth={1.5} />
        All Patients
      </Link>

      {/* ── Patient header ──────────────────────────────────────────────── */}
      <div className="surface animate-fade-up stagger-1 flex items-center gap-4">
        {/* 48px avatar */}
        <div
          className={[
            'flex-shrink-0 flex items-center justify-center',
            'w-12 h-12 rounded-full text-base font-bold font-ui',
            color,
          ].join(' ')}
          aria-label={`${patient.first_name} ${patient.last_name}`}
        >
          {initials}
        </div>

        {/* Name + demographics */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-bright leading-tight">
            {patient.last_name}, {patient.first_name}
          </h1>
          <p className="text-sm text-dim mt-0.5 flex flex-wrap items-center gap-x-0 gap-y-0">
            <span className="font-data text-xs tabular-nums text-dim">MRN {patient.mrn}</span>
            <span className="mx-1.5 text-ghost">·</span>
            <span>{gender}</span>
            {age !== null && (
              <>
                <span className="mx-1.5 text-ghost">·</span>
                <span className="font-data text-xs tabular-nums">{age} yrs</span>
              </>
            )}
            <span className="mx-1.5 text-ghost">·</span>
            <span className="text-ghost text-xs">DOB</span>
            <span className="ml-1 font-data text-xs tabular-nums">
              {formatDate(patient.date_of_birth)}
            </span>
          </p>
        </div>
      </div>

      {/* ── Info strip (counts) ─────────────────────────────────────────── */}
      <div className="surface p-0 overflow-hidden animate-fade-up stagger-2">
        <div className="flex items-stretch divide-x divide-edge/25">

          {/* Conditions */}
          <div className="flex-1 flex items-center gap-3 px-5 py-3 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-amber/10">
              <Activity size={15} className="text-amber" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {(patient.conditions ?? []).length}
              </p>
              <p className="data-label mt-0.5">Conditions</p>
            </div>
          </div>

          {/* Encounters */}
          <div className="flex-1 flex items-center gap-3 px-5 py-3 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-teal/10">
              <Clipboard size={15} className="text-teal" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {(patient.encounters ?? []).length}
              </p>
              <p className="data-label mt-0.5">Encounters</p>
            </div>
          </div>

          {/* Observations */}
          <div className="flex-1 flex items-center gap-3 px-5 py-3 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-emerald/10">
              <Eye size={15} className="text-emerald" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {(patient.observations ?? []).length}
              </p>
              <p className="data-label mt-0.5">Observations</p>
            </div>
          </div>

          {/* Open Care Gaps */}
          <div className="flex-1 flex items-center gap-3 px-5 py-3 min-w-0">
            <div
              className={[
                'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card',
                openGaps.length > 0 ? 'bg-crimson/10' : 'bg-s2',
              ].join(' ')}
            >
              <AlertCircle
                size={15}
                strokeWidth={1.5}
                className={openGaps.length > 0 ? 'text-crimson' : 'text-ghost'}
              />
            </div>
            <div>
              <p
                className={[
                  'font-data text-data-lg tabular-nums leading-none',
                  openGaps.length > 0 ? 'text-crimson' : 'text-bright',
                ].join(' ')}
              >
                {openGaps.length}
              </p>
              <p className="data-label mt-0.5">Open Gaps</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

        {/* ── Timeline ─────────────────────────────────────────────── */}
        <div className="surface animate-fade-up stagger-3">
          <h2 className="text-sm font-semibold text-bright mb-5">Clinical Timeline</h2>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-5 pb-4 border-b border-edge/20">
            {[
              { type: 'encounter',   label: 'Encounter' },
              { type: 'observation', label: 'Observation' },
              { type: 'condition',   label: 'Condition' },
              { type: 'care-gap',    label: 'Care Gap' },
            ].map(({ type, label }) => (
              <span key={type} className="flex items-center gap-1.5">
                <span
                  className={['w-2.5 h-2.5 rounded-full border', TYPE_NODE[type]].join(' ')}
                  aria-hidden="true"
                />
                <span className="text-xs text-ghost font-ui">{label}</span>
              </span>
            ))}
          </div>

          {grouped.length === 0 ? (
            <div className="empty-state py-12">
              <p className="empty-state-title">No timeline events</p>
              <p className="empty-state-desc">
                No encounters, observations, or conditions on record.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(([monthYear, events]) => (
                <div key={monthYear}>
                  {/* Month/year separator */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className="data-label whitespace-nowrap">{monthYear}</span>
                    <div className="flex-1 h-px bg-edge/20" aria-hidden="true" />
                  </div>

                  {/* Events in this group */}
                  <div className="space-y-0">
                    {events.map((item, i) => (
                      <div key={item.key} className="flex gap-3 min-w-0">
                        {/* Node + connecting spine */}
                        <div
                          className="flex flex-col items-center flex-shrink-0"
                          aria-hidden="true"
                        >
                          <div
                            className={[
                              'w-[11px] h-[11px] rounded-full flex-shrink-0 mt-0.5',
                              TYPE_NODE[item.type] ?? 'bg-s2 border border-edge/50',
                            ].join(' ')}
                          />
                          {/* Spine segment — skip after last item */}
                          {i < events.length - 1 && (
                            <div
                              className={[
                                'w-px flex-1 min-h-[16px]',
                                TYPE_SPINE[item.type] ?? 'bg-edge/20',
                              ].join(' ')}
                            />
                          )}
                        </div>

                        {/* Event content */}
                        <div className="flex-1 min-w-0 pb-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-bright leading-snug truncate">
                                {item.title}
                              </p>
                              {item.subtitle && (
                                <p className="font-data text-xs text-ghost mt-0.5 truncate">
                                  {item.subtitle}
                                </p>
                              )}
                              {item.value && (
                                <p className="font-data text-xs text-emerald tabular-nums mt-0.5">
                                  {item.value}
                                  {item.unit ? ` ${item.unit}` : ''}
                                </p>
                              )}
                              {item.status && (
                                <span
                                  className={[
                                    'inline-block mt-1.5',
                                    STATUS_BADGE[item.status.toLowerCase()] ?? 'badge badge-dim',
                                  ].join(' ')}
                                >
                                  {item.status}
                                </span>
                              )}
                            </div>
                            <span className="font-data text-[11px] text-ghost whitespace-nowrap flex-shrink-0 mt-0.5">
                              {formatDate(item.date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {timelineItems.length > 50 && (
                <p className="text-xs text-ghost text-center pt-2">
                  Showing most recent 50 of {timelineItems.length} events
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Care Gaps */}
          <div className="surface animate-fade-up stagger-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-bright">Care Gaps</h2>
              {openGaps.length > 0 && (
                <span className="badge badge-crimson">
                  {openGaps.length} open
                </span>
              )}
            </div>

            {(patient.care_gaps ?? []).length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-emerald font-medium">No care gaps — excellent!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...(patient.care_gaps ?? [])]
                  .sort((a, b) => {
                    // Open gaps first
                    const aOpen = ['open', 'identified'].includes(a.status?.toLowerCase() ?? '');
                    const bOpen = ['open', 'identified'].includes(b.status?.toLowerCase() ?? '');
                    return Number(bOpen) - Number(aOpen);
                  })
                  .map((gap) => (
                    <div
                      key={gap.id}
                      className={[
                        'rounded-card px-3 py-2.5 border-l-2',
                        gapBorderColor(gap.status),
                      ].join(' ')}
                    >
                      <p className="text-xs font-medium text-bright leading-snug">
                        {gap.measure || 'Unknown Measure'}
                      </p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="font-data text-[10px] text-ghost tabular-nums">
                          {formatDate(gap.identified_date)}
                        </span>
                        <span className={gapStatusBadge(gap.status)}>
                          {gap.status || 'open'}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Conditions */}
          <div className="surface animate-fade-up stagger-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-bright">Conditions</h2>
              <span className="font-data text-xs text-ghost tabular-nums">
                {(patient.conditions ?? []).length}
              </span>
            </div>

            {(patient.conditions ?? []).length === 0 ? (
              <p className="text-xs text-ghost text-center py-4">
                No conditions recorded
              </p>
            ) : (
              <div className="space-y-0">
                {(patient.conditions ?? []).slice(0, 10).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start justify-between gap-2 py-2 border-b border-edge/15 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-bright leading-snug truncate">
                        {c.name || c.code}
                      </p>
                      {c.onset_date && (
                        <p className="font-data text-[10px] text-ghost tabular-nums mt-0.5">
                          {formatDate(c.onset_date)}
                        </p>
                      )}
                    </div>
                    <span
                      className={[
                        'flex-shrink-0',
                        STATUS_BADGE[c.status?.toLowerCase() ?? ''] ?? 'badge badge-dim',
                      ].join(' ')}
                    >
                      {c.status || '—'}
                    </span>
                  </div>
                ))}
                {(patient.conditions ?? []).length > 10 && (
                  <p className="text-xs text-ghost text-center pt-2">
                    +{(patient.conditions.length - 10)} more conditions
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Contact info — only if available */}
          {(patient.primary_phone || patient.email) && (
            <div className="surface animate-fade-up stagger-6">
              <h2 className="text-sm font-semibold text-bright mb-3">Contact</h2>
              <div className="space-y-2">
                {patient.primary_phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone size={13} strokeWidth={1.5} className="flex-shrink-0 text-ghost" aria-hidden="true" />
                    <span className="font-data text-xs text-dim tabular-nums">
                      {patient.primary_phone}
                    </span>
                  </div>
                )}
                {patient.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail size={13} strokeWidth={1.5} className="flex-shrink-0 text-ghost" aria-hidden="true" />
                    <span className="font-data text-xs text-dim truncate">
                      {patient.email}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
