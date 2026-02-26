// =============================================================================
// Medgnosis — Conditions Tab
// Problem-oriented view grouped by Active / Chronic / Resolved
// =============================================================================

import { useState } from 'react';
import { ChevronDown, ChevronRight, Activity } from 'lucide-react';

interface Condition {
  id: number;
  code: string;
  name: string;
  status: string;
  type?: string | null;
  onset_date: string;
  resolution_date?: string | null;
}

interface ConditionsTabProps {
  conditions: Condition[];
}

function formatDate(dateStr: string | null | undefined) {
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

interface GroupConfig {
  key: string;
  label: string;
  badge: string;
  accent: string;
  filter: (c: Condition) => boolean;
}

const GROUPS: GroupConfig[] = [
  {
    key: 'active',
    label: 'Active Conditions',
    badge: 'badge-amber',
    accent: 'border-l-amber',
    filter: (c) => c.status?.toUpperCase() === 'ACTIVE',
  },
  {
    key: 'chronic',
    label: 'Chronic Conditions',
    badge: 'badge-teal',
    accent: 'border-l-teal',
    filter: (c) => c.type?.toUpperCase() === 'CHRONIC' && c.status?.toUpperCase() !== 'RESOLVED',
  },
  {
    key: 'resolved',
    label: 'Resolved',
    badge: 'badge-emerald',
    accent: 'border-l-emerald/50',
    filter: (c) => c.status?.toUpperCase() === 'RESOLVED' || c.status?.toUpperCase() === 'INACTIVE',
  },
];

export function ConditionsTab({ conditions }: ConditionsTabProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ resolved: true });

  if (conditions.length === 0) {
    return (
      <div className="surface">
        <div className="empty-state py-12">
          <Activity size={24} className="text-ghost mb-3" />
          <p className="empty-state-title">No conditions recorded</p>
          <p className="empty-state-desc">Diagnoses and conditions will appear here.</p>
        </div>
      </div>
    );
  }

  // Categorize — a condition can only appear in one group (first match wins)
  const categorized = new Set<number>();
  const grouped = GROUPS.map((group) => {
    const items = conditions.filter((c) => {
      if (categorized.has(c.id)) return false;
      if (group.filter(c)) {
        categorized.add(c.id);
        return true;
      }
      return false;
    });
    return { ...group, items };
  });

  // Anything uncategorized goes to "Other"
  const other = conditions.filter((c) => !categorized.has(c.id));

  return (
    <div className="space-y-4">
      {grouped.map((group) => {
        if (group.items.length === 0) return null;
        const isCollapsed = collapsed[group.key] ?? false;

        return (
          <div key={group.key} className="surface">
            <button
              onClick={() => setCollapsed((s) => ({ ...s, [group.key]: !isCollapsed }))}
              className="flex items-center justify-between w-full mb-2"
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? (
                  <ChevronRight size={14} className="text-ghost" />
                ) : (
                  <ChevronDown size={14} className="text-dim" />
                )}
                <h3 className="text-sm font-semibold text-bright">{group.label}</h3>
                <span className={group.badge}>{group.items.length}</span>
              </div>
            </button>

            {!isCollapsed && (
              <div className="space-y-0">
                {group.items.map((c) => (
                  <div
                    key={c.id}
                    className={[
                      'flex items-start justify-between gap-2 py-2.5 pl-3 border-b border-edge/10 last:border-0',
                      'border-l-2',
                      group.accent,
                    ].join(' ')}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-bright">{c.name || c.code}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-data text-[10px] text-ghost">{c.code}</span>
                        {c.type && (
                          <>
                            <span className="text-ghost">·</span>
                            <span className="text-[10px] text-ghost capitalize">{c.type.toLowerCase()}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className="font-data text-[10px] text-ghost tabular-nums">
                        {formatDate(c.onset_date)}
                      </span>
                      {c.resolution_date && (
                        <span className="font-data text-[10px] text-emerald tabular-nums">
                          Resolved {formatDate(c.resolution_date)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {other.length > 0 && (
        <div className="surface">
          <h3 className="text-sm font-semibold text-bright mb-2">Other</h3>
          <div className="space-y-0">
            {other.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 py-2 border-b border-edge/10 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-bright">{c.name || c.code}</p>
                  <span className="font-data text-[10px] text-ghost">{c.code}</span>
                </div>
                <span className="badge-dim">{c.status || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
