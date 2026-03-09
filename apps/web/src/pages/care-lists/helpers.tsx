// =============================================================================
// Care Lists — Shared helpers & small components
// =============================================================================

import {
  Stethoscope,
  FlaskConical,
  Image as ImageIcon,
  Pill,
  ClipboardList,
} from 'lucide-react';

// ─── Item type icon mapping ──────────────────────────────────────────────────

export const itemTypeIcon: Record<string, typeof FlaskConical> = {
  lab: FlaskConical,
  imaging: ImageIcon,
  medication: Pill,
  referral: ClipboardList,
  procedure: Stethoscope,
};

// ─── ItemTypeBadge ───────────────────────────────────────────────────────────

export function ItemTypeBadge({ type }: { type: string }) {
  const Icon = itemTypeIcon[type] ?? Stethoscope;
  const colors: Record<string, string> = {
    lab: 'bg-teal/10 text-teal border-teal/20',
    imaging: 'bg-violet/10 text-violet border-violet/20',
    medication: 'bg-amber/10 text-amber border-amber/20',
    referral: 'bg-cyan/10 text-cyan border-cyan/20',
    procedure: 'bg-dim/10 text-dim border-dim/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-ui font-medium border capitalize ${colors[type] ?? colors.procedure}`}>
      <Icon size={10} strokeWidth={1.5} />
      {type}
    </span>
  );
}

// ─── PriorityDot ─────────────────────────────────────────────────────────────

export function PriorityDot({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const colors: Record<string, string> = {
    high: 'bg-crimson',
    medium: 'bg-amber',
    low: 'bg-emerald',
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[priority] ?? 'bg-dim'}`}
      title={`${priority} priority`}
    />
  );
}
