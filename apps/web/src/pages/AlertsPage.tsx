// =============================================================================
// Medgnosis Web — Alerts page (NEW — real-time alert feed)
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '../services/api.js';

interface Alert {
  alert_id: number;
  patient_id: number;
  patient_name: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

interface AlertsResponse {
  alerts: Alert[];
}

function severityIcon(severity: string) {
  switch (severity) {
    case 'critical':
    case 'high':
      return <AlertTriangle className="h-5 w-5 text-accent-error" />;
    case 'medium':
      return <Clock className="h-5 w-5 text-accent-warning" />;
    default:
      return <Bell className="h-5 w-5 text-accent-primary" />;
  }
}

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    critical: 'bg-accent-error/10 text-accent-error border-accent-error/20',
    high: 'bg-accent-error/10 text-accent-error border-accent-error/20',
    medium: 'bg-accent-warning/10 text-accent-warning border-accent-warning/20',
    low: 'bg-accent-success/10 text-accent-success border-accent-success/20',
    info: 'bg-accent-primary/10 text-accent-primary border-accent-primary/20',
  };
  return colors[severity] ?? 'bg-gray-100 text-gray-500 border-gray-200';
}

export function AlertsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get<AlertsResponse>('/alerts'),
    refetchInterval: 30_000, // Poll every 30s for new alerts
  });

  const acknowledge = useMutation({
    mutationFn: (alertId: number) => api.post(`/alerts/${alertId}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const alerts = data?.data?.alerts ?? [];
  const filtered =
    filter === 'all' ? alerts : alerts.filter((a) => a.status === filter);

  const unacknowledgedCount = alerts.filter((a) => a.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
            Alerts
          </h1>
          {unacknowledgedCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent-error text-white">
              {unacknowledgedCount} new
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {['all', 'active', 'acknowledged'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                filter === f
                  ? 'bg-accent-primary text-white'
                  : 'border border-light-border dark:border-dark-border hover:bg-light-secondary dark:hover:bg-dark-secondary'
              }`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-dark-secondary/10 rounded-xl animate-pulse" />
            ))
          : filtered.map((alert) => (
              <div
                key={alert.alert_id}
                className={`panel-base p-4 ${
                  alert.status === 'active' ? 'border-l-4 border-l-accent-error' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {severityIcon(alert.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm">{alert.title}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize border ${severityBadge(
                          alert.severity,
                        )}`}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      <span>Patient: {alert.patient_name ?? `ID ${alert.patient_id}`}</span>
                      <span>{new Date(alert.created_at).toLocaleString()}</span>
                      {alert.acknowledged_at && (
                        <span className="flex items-center gap-1 text-accent-success">
                          <CheckCircle className="h-3 w-3" />
                          Acknowledged
                        </span>
                      )}
                    </div>
                  </div>
                  {alert.status === 'active' && (
                    <button
                      onClick={() => acknowledge.mutate(alert.alert_id)}
                      disabled={acknowledge.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-light-border dark:border-dark-border hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 mx-auto text-light-text-secondary dark:text-dark-text-secondary opacity-50" />
            <p className="mt-4 text-light-text-secondary dark:text-dark-text-secondary">
              No alerts to display
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
