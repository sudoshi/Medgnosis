// =============================================================================
// Medgnosis Web — Shared time/date utilities
// Centralised so every component formats dates and ages identically.
// =============================================================================

import { formatDistanceToNow } from 'date-fns';

/**
 * Human-relative timestamp.
 * @example relativeTime('2025-02-25T08:00:00Z') → "3 hours ago"
 */
export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '—';
  }
}

/**
 * Locale date string with short month by default.
 * @example formatDate('1985-06-15') → "Jun 15, 1985"
 */
export function formatDate(
  dateStr: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', opts);
  } catch {
    return '—';
  }
}

/**
 * 12-hour clock time.
 * @example formatTime('2025-02-25T14:30:00Z') → "2:30 PM"
 */
export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour:   'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

/**
 * Age in whole years from date-of-birth string.
 * Returns null when DOB is missing or unparseable.
 */
export function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  try {
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  } catch {
    return null;
  }
}

/**
 * Time-of-day greeting string.
 * @example getGreeting() → "Good morning" | "Good afternoon" | "Good evening"
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
