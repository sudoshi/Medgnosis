// =============================================================================
// Medgnosis — Palette System
// 5 runtime-switchable color palettes. Each overrides only primary/accent vars.
// Surface, text, and semantic colors are NEVER changed by palette switching.
// =============================================================================

export interface Palette {
  id: string;
  name: string;
  description: string;
  primary: string;
  accent: string;
  variables: Record<string, string>;
}

export const PALETTES: Palette[] = [
  {
    id: 'clinical-teal',
    name: 'Clinical Teal',
    description: 'Default — teal and amber',
    primary: '#0DD9D9',
    accent: '#F5A623',
    variables: {},  // default: clears all overrides — tokens-dark.css values take effect
  },
  {
    id: 'arctic',
    name: 'Arctic',
    description: 'Sky blue and warm orange',
    primary: '#22D3EE',
    accent: '#FB923C',
    variables: {
      '--primary':        '#22D3EE',
      '--primary-light':  '#67E8F9',
      '--primary-dark':   '#0EA5E9',
      '--primary-bg':     'rgba(34,211,238,0.08)',
      '--primary-border': 'rgba(34,211,238,0.25)',
      '--primary-glow':   'rgba(34,211,238,0.20)',
      '--accent':         '#FB923C',
      '--accent-light':   '#FDBA74',
      '--accent-dark':    '#EA580C',
      '--accent-bg':      'rgba(251,146,60,0.10)',
      '--accent-glow':    'rgba(251,146,60,0.18)',
      '--border-hover':   'rgba(34,211,238,0.30)',
      '--border-focus':   'rgba(34,211,238,0.60)',
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    description: 'Emerald and lavender',
    primary: '#34D399',
    accent: '#A78BFA',
    variables: {
      '--primary':        '#34D399',
      '--primary-light':  '#6EE7B7',
      '--primary-dark':   '#10B981',
      '--primary-bg':     'rgba(52,211,153,0.08)',
      '--primary-border': 'rgba(52,211,153,0.25)',
      '--primary-glow':   'rgba(52,211,153,0.20)',
      '--accent':         '#A78BFA',
      '--accent-light':   '#C4B5FD',
      '--accent-dark':    '#7C3AED',
      '--accent-bg':      'rgba(167,139,250,0.10)',
      '--accent-glow':    'rgba(167,139,250,0.18)',
      '--border-hover':   'rgba(52,211,153,0.30)',
      '--border-focus':   'rgba(52,211,153,0.60)',
    },
  },
  {
    id: 'sapphire',
    name: 'Sapphire',
    description: 'Royal blue and gold',
    primary: '#3B82F6',
    accent: '#F59E0B',
    variables: {
      '--primary':        '#3B82F6',
      '--primary-light':  '#60A5FA',
      '--primary-dark':   '#2563EB',
      '--primary-bg':     'rgba(59,130,246,0.08)',
      '--primary-border': 'rgba(59,130,246,0.25)',
      '--primary-glow':   'rgba(59,130,246,0.20)',
      '--accent':         '#F59E0B',
      '--accent-light':   '#FCD34D',
      '--accent-dark':    '#D97706',
      '--accent-bg':      'rgba(245,158,11,0.10)',
      '--accent-glow':    'rgba(245,158,11,0.18)',
      '--border-hover':   'rgba(59,130,246,0.30)',
      '--border-focus':   'rgba(59,130,246,0.60)',
    },
  },
  {
    id: 'plum',
    name: 'Plum',
    description: 'Violet and teal',
    primary: '#A855F7',
    accent: '#22D3EE',
    variables: {
      '--primary':        '#A855F7',
      '--primary-light':  '#C084FC',
      '--primary-dark':   '#9333EA',
      '--primary-bg':     'rgba(168,85,247,0.08)',
      '--primary-border': 'rgba(168,85,247,0.25)',
      '--primary-glow':   'rgba(168,85,247,0.20)',
      '--accent':         '#22D3EE',
      '--accent-light':   '#67E8F9',
      '--accent-dark':    '#0EA5E9',
      '--accent-bg':      'rgba(34,211,238,0.10)',
      '--accent-glow':    'rgba(34,211,238,0.18)',
      '--border-hover':   'rgba(168,85,247,0.30)',
      '--border-focus':   'rgba(168,85,247,0.60)',
    },
  },
];

// Only these vars are managed by the palette engine.
// All others (surfaces, text, semantic) come from tokens-dark.css and are immutable.
const MANAGED_VARIABLES = [
  '--primary',
  '--primary-light',
  '--primary-dark',
  '--primary-bg',
  '--primary-border',
  '--primary-glow',
  '--accent',
  '--accent-light',
  '--accent-dark',
  '--accent-bg',
  '--accent-glow',
  '--border-hover',
  '--border-focus',
];

export function applyPalette(id: string): void {
  const palette = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
  const style = document.documentElement.style;
  // Clear all managed vars first so tokens-dark.css defaults take effect for 'clinical-teal'
  for (const v of MANAGED_VARIABLES) style.removeProperty(v);
  // Apply overrides for non-default palettes
  for (const [k, v] of Object.entries(palette.variables)) style.setProperty(k, v);
}
