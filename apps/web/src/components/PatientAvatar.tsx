// =============================================================================
// Medgnosis — PatientAvatar
// Deterministic colour-coded initial circle, shared across all patient lists.
// Also exports avatarColor() and getInitials() for callers that need the
// raw values (e.g. to colour parent rows).
// =============================================================================

// ─── Colour palette ───────────────────────────────────────────────────────────
// Five Clinical Obsidian accent colours. Deterministic by seed so the same
// patient always gets the same colour regardless of where they appear.

const PALETTE = [
  'bg-teal/20 text-teal',
  'bg-violet/20 text-violet',
  'bg-amber/20 text-amber',
  'bg-emerald/20 text-emerald',
  'bg-crimson/20 text-crimson',
] as const;

/**
 * Returns a stable Tailwind colour-pair class string for a given seed.
 * Accepts a numeric patient ID or any string (name, email, etc.).
 */
export function avatarColor(seed: string | number): string {
  const str  = String(seed);
  const hash = str.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length];
}

// ─── Initials helpers ─────────────────────────────────────────────────────────

/**
 * Initials from a single full-name string.
 * @example getInitials('Jane Doe') → 'JD'
 */
export function getInitials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (name ?? '').slice(0, 2).toUpperCase();
}

/**
 * Initials from separate first + last name fields.
 * @example getInitialsFromParts('Jane', 'Doe') → 'JD'
 */
export function getInitialsFromParts(first: string, last: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

// ─── Size map ─────────────────────────────────────────────────────────────────

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'w-7 h-7 text-xs font-semibold',   // sidebar user avatar
  sm: 'w-8 h-8 text-xs font-semibold',   // compact lists (CareListsPage)
  md: 'w-9 h-9 text-sm font-semibold',   // standard table rows / search results
  lg: 'w-14 h-14 text-base font-bold',   // patient banner header
};

// ─── Component ────────────────────────────────────────────────────────────────

interface PatientAvatarProps {
  /** Pre-computed initials string (1–2 chars). */
  initials: string;
  /** Numeric patient ID or any string — used to pick a palette colour. */
  seed?: string | number;
  /** Size variant. Defaults to 'md' (36 × 36px). */
  size?: AvatarSize;
  /** Extra class names to merge onto the root element. */
  className?: string;
}

export function PatientAvatar({
  initials,
  seed,
  size = 'md',
  className = '',
}: PatientAvatarProps) {
  const color = avatarColor(seed ?? initials);

  return (
    <div
      className={[
        'flex-shrink-0 flex items-center justify-center rounded-full font-ui',
        SIZE_CLASSES[size],
        color,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
