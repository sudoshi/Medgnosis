// =============================================================================
// Dashboard — Stats Strip (Section 2)
// Each metric is an actionable link into its filtered detail view.
// =============================================================================

import {
  Users,
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { TrendBadge } from './helpers.js';
import type { DashboardResponse } from './types.js';

interface StatsStripProps {
  isLoading: boolean;
  stats: DashboardResponse['stats'] | undefined;
}

// ─── One clickable metric cell ──────────────────────────────────────────────
interface StatCellProps {
  to: string;
  icon: LucideIcon;
  iconClass: string;   // colour pair for the icon chip, e.g. 'bg-teal/10 text-teal'
  label: string;
  value: string;
  valueClass?: string; // override value colour (defaults to bright)
  children?: React.ReactNode; // trend badge / sub-caption row
}

function StatCell({
  to,
  icon: Icon,
  iconClass,
  label,
  value,
  valueClass = 'text-bright',
  children,
}: StatCellProps) {
  return (
    <Link
      to={to}
      className="group relative flex items-center gap-3 px-4 py-3 flex-1 min-w-0 hover:bg-s1 transition-colors duration-100"
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-card flex items-center justify-center ${iconClass}`}>
        <Icon size={15} strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ghost uppercase tracking-wider leading-none">{label}</p>
        <p className={`font-data text-data-lg tabular-nums leading-none mt-1.5 ${valueClass}`}>
          {value}
        </p>
        <div className="mt-1">{children}</div>
      </div>
      {/* Drill-in affordance — appears on hover */}
      <ArrowUpRight
        size={13}
        strokeWidth={2}
        className="absolute top-2.5 right-2.5 text-ghost opacity-0 group-hover:opacity-100 group-hover:text-teal transition-all duration-100"
        aria-hidden="true"
      />
    </Link>
  );
}

export function StatsStrip({ isLoading, stats }: StatsStripProps) {
  return (
    <div className="surface p-0 overflow-hidden animate-fade-up stagger-2">
      {isLoading ? (
        <div className="flex divide-x divide-edge/25">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 px-4 py-3 space-y-2">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-6 w-16 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-stretch divide-x divide-edge/25">
          <StatCell
            to="/patients"
            icon={Users}
            iconClass="bg-teal/10 text-teal"
            label="Total Patients"
            value={(stats?.total_patients.value ?? 0).toLocaleString()}
          >
            <TrendBadge value={stats?.total_patients.trend ?? 0} label="vs last month" />
          </StatCell>

          <StatCell
            to="/patients"
            icon={Activity}
            iconClass="bg-emerald/10 text-emerald"
            label="Active Patients"
            value={(stats?.active_patients ?? 0).toLocaleString()}
          >
            <p className="text-xs text-ghost">currently enrolled</p>
          </StatCell>

          <StatCell
            to="/measures"
            icon={AlertCircle}
            iconClass="bg-amber/10 text-amber"
            label="Open Care Gaps"
            value={(stats?.care_gaps.value ?? 0).toLocaleString()}
            valueClass="text-amber"
          >
            <TrendBadge value={stats?.care_gaps.trend ?? 0} label="vs last month" />
          </StatCell>

          <StatCell
            to="/patients?risk_level=high"
            icon={AlertTriangle}
            iconClass="bg-crimson/10 text-crimson"
            label="High Risk"
            value={(stats?.risk_score.high_risk_count ?? 0).toLocaleString()}
            valueClass="text-crimson"
          >
            <p className="text-xs text-ghost">
              {stats?.risk_score.high_risk_percentage ?? 0}% of stratified
            </p>
          </StatCell>
        </div>
      )}
    </div>
  );
}
