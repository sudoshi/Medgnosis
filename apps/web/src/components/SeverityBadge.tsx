// =============================================================================
// Medgnosis Web — SeverityBadge
// One source of truth for clinical-severity display. ALWAYS pairs the color with
// an icon AND a text label so urgency is never encoded by hue alone — a
// red/green-color-blind clinician, a monochrome display, or a screen reader must
// all be able to triage. See the color-only-encoding findings in the UX plan.
// =============================================================================

import { AlertOctagon, AlertTriangle, AlertCircle, Info, type LucideIcon } from 'lucide-react';

export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

const CONFIG: Record<Severity, { badge: string; Icon: LucideIcon; label: string }> = {
  critical: { badge: 'badge-crimson', Icon: AlertOctagon, label: 'Critical' },
  high: { badge: 'badge-amber', Icon: AlertTriangle, label: 'High' },
  moderate: { badge: 'badge-caution', Icon: AlertCircle, label: 'Moderate' },
  low: { badge: 'badge-info', Icon: Info, label: 'Low' },
  info: { badge: 'badge-info', Icon: Info, label: 'Info' },
};

interface SeverityBadgeProps {
  severity: Severity;
  /** Override the visible text (e.g. a domain term like "Overdue" or "RRT").
      The icon + color still convey severity; an aria-label keeps the level
      explicit for assistive tech. */
  label?: string;
  className?: string;
}

export function SeverityBadge({ severity, label, className = '' }: SeverityBadgeProps) {
  const cfg = CONFIG[severity];
  const Icon = cfg.Icon;
  const text = label ?? cfg.label;
  return (
    <span
      className={`${cfg.badge} inline-flex items-center gap-1 ${className}`.trim()}
      aria-label={label ? `${cfg.label}: ${label}` : cfg.label}
    >
      <Icon size={11} strokeWidth={2.5} aria-hidden="true" />
      {text}
    </span>
  );
}
