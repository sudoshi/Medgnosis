// =============================================================================
// Medgnosis Web — Dashboard  (Phase 13 — Redesigned Clinician Workspace)
// Greeting -> Stats strip -> Workspace (Schedule+Alerts) -> Pop Health -> Activity
// =============================================================================

import { useDashboard, useMorningBriefing } from '../hooks/useApi.js';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuthStore } from '../stores/auth.js';
import { getGreeting } from '../utils/time.js';
import { SectionDivider, USE_MOCK_SCHEDULE, MOCK_SCHEDULE } from './dashboard/helpers.js';
import type { DashboardResponse } from './dashboard/types.js';
import { StatsStrip } from './dashboard/StatsStrip.js';
import { WorkspaceSection } from './dashboard/WorkspaceSection.js';
import { PopulationHealthSection } from './dashboard/PopulationHealthSection.js';
import { RecentActivitySection } from './dashboard/RecentActivitySection.js';

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading, error } = useDashboard();

  const { data: briefingData } = useMorningBriefing(!isLoading && !error);

  const dashboard = data?.data as DashboardResponse | undefined;
  const stats     = dashboard?.stats;
  const analytics = dashboard?.analytics;
  const clinician = dashboard?.clinician;

  const greeting     = getGreeting();
  const displayName  = user ? `Dr. ${user.last_name}` : '';
  const todayStr     = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
    year:    'numeric',
  });

  if (error) {
    return (
      <div className="p-4 bg-crimson/10 text-crimson rounded-card border border-crimson/20 text-sm">
        Failed to load dashboard data. Check API connectivity.
      </div>
    );
  }

  // Prefer real appointments; fall back to a clearly-labeled sample only when the
  // dataset has none (the demo EDW carries no live schedule) — never present mock
  // patients unlabeled as if they were real.
  const realSchedule = clinician?.todays_schedule ?? [];
  const usingSampleSchedule = realSchedule.length === 0 && USE_MOCK_SCHEDULE;
  const schedule = usingSampleSchedule
    ? (MOCK_SCHEDULE as unknown as NonNullable<typeof clinician>['todays_schedule'])
    : realSchedule;
  const alerts     = clinician?.urgent_alerts     ?? [];
  const criticalCt = clinician?.critical_alert_count ?? 0;
  const abby       = clinician?.abby_briefing;

  const totalPatients = stats?.total_patients.value ?? 0;
  const distribution  = analytics?.risk_stratification.distribution ?? [];
  const gaps          = analytics?.care_gap_summary ?? null;
  const recentEncs    = analytics?.recent_encounters ?? [];

  return (
    <div className="space-y-5">

      {/* SECTION 1 — Greeting */}
      <div className="flex items-start justify-between animate-fade-up stagger-1">
        <div>
          <h1 className="text-3xl font-semibold text-bright tracking-tight leading-tight">
            {greeting}{displayName && `, ${displayName}`}
          </h1>
          <p className="text-sm text-dim mt-1">{todayStr}</p>
        </div>

        <div className="flex items-center gap-3 mt-2">
          {criticalCt > 0 && (
            <Link
              to="/alerts"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-card bg-crimson/10 border border-crimson/30 text-crimson text-sm font-medium hover:bg-crimson/20 transition-colors"
            >
              <Bell size={13} aria-hidden="true" />
              {criticalCt} critical
            </Link>
          )}
          <div className="flex items-center gap-1.5">
            <span className="live-dot" aria-hidden="true" />
            <span className="text-xs text-ghost font-ui">Real-time</span>
          </div>
        </div>
      </div>

      {/* SECTION 2 — Stats strip */}
      <StatsStrip isLoading={isLoading} stats={stats} />

      {/* SECTION 3 — Clinician Workspace (Schedule + Alerts) */}
      <SectionDivider label="Today's Workspace" />
      <WorkspaceSection isLoading={isLoading} schedule={schedule} alerts={alerts} isSampleSchedule={usingSampleSchedule} />

      {/* SECTION 4 — Population Health */}
      <SectionDivider label="Population Health" />
      <PopulationHealthSection
        isLoading={isLoading}
        totalPatients={totalPatients}
        distribution={distribution}
        gaps={gaps}
      />

      {/* SECTION 5 — Recent Activity & Abigail */}
      {!isLoading && (
        <>
          <SectionDivider label="Recent Activity" />
          <RecentActivitySection
            recentEncounters={recentEncs}
            abbyGreeting={
              (briefingData as { data?: { briefing?: string } } | undefined)?.data?.briefing
              || abby?.message
              || 'Ask me about your patients or care gaps.'
            }
          />
        </>
      )}

    </div>
  );
}
