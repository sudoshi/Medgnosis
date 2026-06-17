// =============================================================================
// Admin — Shared helpers & small components
// =============================================================================

import {
  LayoutDashboard,
  Users,
  Globe,
  PlugZap,
  Database,
  ScrollText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

// ─── Tab config ──────────────────────────────────────────────────────────────

export const ADMIN_TABS = [
  { id: 'dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'users',      label: 'Users',         icon: Users           },
  { id: 'fhir',       label: 'FHIR Endpoints',icon: Globe           },
  { id: 'ehr',        label: 'EHR Integrations', icon: PlugZap      },
  { id: 'etl',        label: 'ETL & Database',icon: Database        },
  { id: 'audit',      label: 'Audit Log',     icon: ScrollText      },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]['id'];

// ─── Small helpers ───────────────────────────────────────────────────────────

export function fmtDate(s: string | null) {
  if (!s) return '\u2014';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(s: string | null) {
  if (!s) return '\u2014';
  return new Date(s).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── MetricCard ──────────────────────────────────────────────────────────────

export function MetricCard({ label, value, sub, color = 'teal' }: {
  label: string;
  value: string | number | null;
  sub?: string;
  color?: 'teal' | 'amber' | 'crimson' | 'emerald';
}) {
  const colorMap: Record<string, string> = {
    teal:    'text-[var(--primary)]',
    amber:   'text-amber',
    crimson: 'text-crimson',
    emerald: 'text-emerald',
  };
  return (
    <div className="surface p-5">
      <p className="text-xs text-ghost uppercase tracking-wider mb-2">{label}</p>
      <p className={`font-data text-data-2xl tabular-nums ${colorMap[color]}`}>
        {value === null ? '...' : typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-ghost mt-1">{sub}</p>}
    </div>
  );
}

// ─── RoleBadge ───────────────────────────────────────────────────────────────

export function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin:             'bg-[var(--primary-bg)] text-[var(--primary)] border border-[var(--primary-border)]',
    provider:          'bg-emerald/10 text-emerald border border-emerald/25',
    analyst:           'bg-violet/10 text-violet border border-violet/25',
    care_coordinator:  'bg-info/10 text-info border border-info/25',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[role] ?? 'bg-s2 text-ghost border border-edge/35'}`}>
      {role.replace(/_/g, ' ')}
    </span>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ElementType; cls: string }> = {
    connected:    { icon: CheckCircle2,  cls: 'text-emerald' },
    degraded:     { icon: AlertTriangle, cls: 'text-amber'   },
    disconnected: { icon: XCircle,       cls: 'text-ghost'   },
  };
  const entry = map[status] ?? map.disconnected;
  const Icon = entry.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${entry.cls}`}>
      <Icon size={12} strokeWidth={2} />
      <span className="capitalize">{status}</span>
    </span>
  );
}
