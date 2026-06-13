// =============================================================================
// Dashboard — Clinician Workspace (Section 3: Schedule + Alerts)
// =============================================================================

import { Link } from 'react-router-dom';
import {
  Calendar,
  AlertTriangle,
  Clock,
  ExternalLink,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { calcAge, formatTime, relativeTime } from '../../utils/time.js';
import type { DashboardResponse } from './types.js';

type ScheduleEntry = DashboardResponse['clinician']['todays_schedule'][number];
type AlertEntry = DashboardResponse['clinician']['urgent_alerts'][number];

interface WorkspaceSectionProps {
  isLoading: boolean;
  schedule: ScheduleEntry[];
  alerts: AlertEntry[];
}

export function WorkspaceSection({ isLoading, schedule, alerts }: WorkspaceSectionProps) {
  const hasCritical = alerts.some((a) => a.severity === 'critical');

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="surface space-y-3">
            <div className="skeleton h-5 w-36 rounded" />
            <div className="skeleton h-40 rounded-card" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-4">

      {/* Today's Schedule */}
      <div
        className="surface animate-fade-up stagger-3"
        style={{ borderTopColor: 'rgb(var(--teal) / 0.5)', borderTopWidth: '2px' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Calendar size={15} strokeWidth={1.5} className="text-teal" />
            <h3 className="text-base font-semibold text-bright">Today&apos;s Schedule</h3>
          </div>
          <span className="font-data text-sm text-ghost tabular-nums">
            {schedule.length} visit{schedule.length !== 1 ? 's' : ''}
          </span>
        </div>

        {schedule.length === 0 ? (
          <div className="py-10 text-center">
            <Clock size={22} strokeWidth={1.5} className="text-ghost mx-auto mb-2.5" />
            <p className="text-sm text-ghost">No encounters scheduled for today</p>
          </div>
        ) : (
          <div className="max-h-[480px] overflow-y-auto scrollbar-thin">
            {schedule.map((enc) => {
              const age = calcAge(enc.date_of_birth);
              const isPast = new Date(enc.date) < new Date();
              return (
                <Link
                  key={enc.id}
                  to={`/patients/${enc.patient_id}`}
                  className={[
                    'flex items-center gap-4 py-2.5',
                    'border-b border-edge/10 last:border-0',
                    'hover:bg-s1 -mx-[var(--padding-panel)] px-[var(--padding-panel)]',
                    'transition-colors duration-100 group',
                    isPast ? 'opacity-40' : '',
                  ].join(' ')}
                >
                  {/* Time slot */}
                  <div className="flex-shrink-0 w-[68px] flex flex-col items-end gap-0.5">
                    <p className={`font-data text-sm font-medium tabular-nums leading-none ${isPast ? 'text-ghost' : 'text-teal'}`}>
                      {formatTime(enc.date)}
                    </p>
                    {isPast && (
                      <CheckCircle2 size={11} strokeWidth={2} className="text-ghost/70" />
                    )}
                  </div>

                  {/* Spine */}
                  <div className="flex-shrink-0 w-px h-7 bg-edge/30" />

                  {/* Patient info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-bright group-hover:text-teal transition-colors truncate leading-snug">
                      {enc.patient_name}
                    </p>
                    <p className="font-data text-xs text-ghost mt-0.5 truncate">
                      {enc.mrn}
                      {age !== null && (
                        <span className="ml-2 text-dim">
                          · {age}y {enc.gender ?? ''}
                        </span>
                      )}
                      {enc.reason && (
                        <span className="ml-2 text-dim">· {enc.reason}</span>
                      )}
                    </p>
                  </div>

                  {/* Encounter type */}
                  <div className="flex-shrink-0">
                    <span className="badge-dim text-xs">{enc.type || 'Visit'}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Urgent Alerts */}
      <div
        className="surface animate-fade-up stagger-4"
        style={{
          borderTopColor: hasCritical ? 'rgb(var(--crimson) / 0.55)' : 'rgb(var(--amber) / 0.45)',
          borderTopWidth: '2px',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle
              size={15}
              strokeWidth={1.5}
              className={hasCritical ? 'text-crimson' : 'text-amber'}
            />
            <h3 className="text-base font-semibold text-bright">Urgent Alerts</h3>
          </div>
          {alerts.length > 0 && (
            <Link to="/alerts" className="text-xs text-teal hover:text-teal/80 transition-colors font-medium">
              View all
            </Link>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="py-10 text-center">
            <Shield size={22} strokeWidth={1.5} className="text-emerald mx-auto mb-2.5" />
            <p className="text-sm font-medium text-emerald">All clear</p>
            <p className="text-xs text-ghost mt-1">No unacknowledged urgent alerts</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[340px] overflow-y-auto scrollbar-thin">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={[
                  'rounded-card px-3.5 py-3 border-l-2',
                  alert.severity === 'critical'
                    ? 'border-l-crimson bg-crimson/5'
                    : 'border-l-amber bg-amber/5',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-bright leading-snug">{alert.title}</p>
                    {alert.patient_name && (
                      <Link
                        to={`/patients/${alert.patient_id}`}
                        className="inline-flex items-center gap-1 font-data text-xs text-teal hover:text-teal/80 transition-colors mt-0.5"
                      >
                        {alert.patient_name}
                        <ExternalLink size={9} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                  <span className={`flex-shrink-0 ${alert.severity === 'critical' ? 'badge-crimson' : 'badge-amber'}`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="font-data text-xs text-ghost mt-1.5 tabular-nums">
                  {relativeTime(alert.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
