// =============================================================================
// Admin — Dashboard Tab
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api.js';
import { MetricCard, fmtDateTime } from './helpers.js';
import type { AdminStats, AuditLog } from './types.js';

export function DashboardTab() {
  const { data: statsData } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get('/admin/stats'),
    staleTime: 60_000,
  });
  const { data: auditData } = useQuery({
    queryKey: ['admin', 'audit-log', 'recent'],
    queryFn: () => api.get('/admin/audit-log?limit=5'),
    staleTime: 60_000,
  });

  const stats = (statsData as { data?: AdminStats })?.data;
  const recentAudit = (auditData as { data?: { logs: AuditLog[] } })?.data?.logs ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6 gap-4">
        <MetricCard label="Total Providers"  value={stats?.total_providers   ?? null} color="teal"    />
        <MetricCard label="Active Patients"  value={stats?.active_patients   ?? null} color="emerald" />
        <MetricCard label="Open Care Gaps"   value={stats?.open_care_gaps    ?? null} color="amber"   />
        <MetricCard
          label="ETL Status"
          value={stats?.last_etl_status ? stats.last_etl_status.toUpperCase() : null}
          sub={stats?.last_etl_at ? `Last run ${fmtDateTime(stats.last_etl_at)}` : undefined}
          color={stats?.last_etl_status === 'success' ? 'emerald' : 'amber'}
        />
      </div>

      {/* Star schema health */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-wider mb-4">Star Schema Health</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-0">
          {[
            { label: 'fact_patient_composite',    value: stats?.star_composite_rows },
            { label: 'fact_patient_bundle',       value: stats?.star_bundle_rows    },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b border-edge/15 last:border-0">
              <span className="font-data text-xs text-dim">{label}</span>
              <span className="font-data text-xs text-bright tabular-nums">
                {value !== undefined ? Number(value).toLocaleString() : '...'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent audit events */}
      <div className="surface p-5">
        <h3 className="text-xs font-semibold text-bright uppercase tracking-wider mb-4">Recent Activity</h3>
        {recentAudit.length === 0 ? (
          <p className="text-sm text-ghost py-4 text-center">No recent events</p>
        ) : (
          <div className="divide-y divide-edge/15">
            {recentAudit.map((log) => (
              <div key={log.audit_id} className="py-2.5 flex items-start gap-3">
                <span className={`mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide flex-shrink-0 ${
                  log.event_type === 'login' ? 'bg-[var(--primary-bg)] text-[var(--primary)]'
                  : log.event_type === 'phi_access' ? 'bg-amber/10 text-amber'
                  : log.event_type === 'etl_run' ? 'bg-violet/10 text-violet'
                  : 'bg-s2 text-ghost'
                }`}>
                  {log.event_type.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-bright truncate">{log.description ?? '\u2014'}</p>
                  <p className="text-[10px] text-ghost mt-0.5">
                    {log.user_first_name ? `${log.user_first_name} ${log.user_last_name ?? ''}`.trim() : log.user_email ?? 'System'}
                    {' \u00b7 '}
                    {fmtDateTime(log.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
