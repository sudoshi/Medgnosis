// =============================================================================
// Dashboard — Stats Strip (Section 2)
// =============================================================================

import {
  Users,
  Activity,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { TrendBadge } from './helpers.js';
import type { DashboardResponse } from './types.js';

interface StatsStripProps {
  isLoading: boolean;
  stats: DashboardResponse['stats'] | undefined;
}

export function StatsStrip({ isLoading, stats }: StatsStripProps) {
  const totalPatients = stats?.total_patients.value ?? 0;

  return (
    <div className="surface p-0 overflow-hidden animate-fade-up stagger-2">
      {isLoading ? (
        <div className="flex divide-x divide-edge/25">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 px-5 py-4 space-y-2">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-7 w-16 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-stretch divide-x divide-edge/25">

          {/* Total Patients */}
          <div className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-card bg-teal/10 flex items-center justify-center">
              <Users size={15} strokeWidth={1.5} className="text-teal" />
            </div>
            <div>
              <p className="text-xs font-medium text-ghost uppercase tracking-wider leading-none">Total Patients</p>
              <p className="font-data text-data-xl text-bright tabular-nums leading-none mt-1.5">
                {totalPatients.toLocaleString()}
              </p>
              <div className="mt-1">
                <TrendBadge value={stats?.total_patients.trend ?? 0} label="vs last month" />
              </div>
            </div>
          </div>

          {/* Active Patients */}
          <div className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-card bg-emerald/10 flex items-center justify-center">
              <Activity size={15} strokeWidth={1.5} className="text-emerald" />
            </div>
            <div>
              <p className="text-xs font-medium text-ghost uppercase tracking-wider leading-none">Active Patients</p>
              <p className="font-data text-data-xl text-bright tabular-nums leading-none mt-1.5">
                {(stats?.active_patients ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-ghost mt-1">currently enrolled</p>
            </div>
          </div>

          {/* Open Care Gaps */}
          <div className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-card bg-amber/10 flex items-center justify-center">
              <AlertCircle size={15} strokeWidth={1.5} className="text-amber" />
            </div>
            <div>
              <p className="text-xs font-medium text-ghost uppercase tracking-wider leading-none">Open Care Gaps</p>
              <p className="font-data text-data-xl text-amber tabular-nums leading-none mt-1.5">
                {(stats?.care_gaps.value ?? 0).toLocaleString()}
              </p>
              <div className="mt-1">
                <TrendBadge value={stats?.care_gaps.trend ?? 0} label="vs last month" />
              </div>
            </div>
          </div>

          {/* High Risk */}
          <div className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-card bg-crimson/10 flex items-center justify-center">
              <AlertTriangle size={15} strokeWidth={1.5} className="text-crimson" />
            </div>
            <div>
              <p className="text-xs font-medium text-ghost uppercase tracking-wider leading-none">High Risk</p>
              <p className="font-data text-data-xl text-crimson tabular-nums leading-none mt-1.5">
                {(stats?.risk_score.high_risk_count ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-ghost mt-1">
                {stats?.risk_score.high_risk_percentage ?? 0}% of stratified
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
