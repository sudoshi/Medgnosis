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
  /** Applied under the dark theme. */
  variables: Record<string, string>;
  /** Applied under the light theme — deepened so accents stay AA on white.
   *  Omitted for the default palette (token defaults already adapt by theme). */
  lightVariables?: Record<string, string>;
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
    lightVariables: {
      '--primary':        '#0E7490',
      '--primary-light':  '#0E7490',
      '--primary-dark':   '#0A5A72',
      '--primary-bg':     'rgba(14,116,144,0.10)',
      '--primary-border': 'rgba(14,116,144,0.30)',
      '--primary-glow':   'rgba(14,116,144,0.18)',
      '--accent':         '#C2570C',
      '--accent-light':   '#C2570C',
      '--accent-dark':    '#9A4509',
      '--accent-bg':      'rgba(194,87,12,0.12)',
      '--accent-glow':    'rgba(194,87,12,0.18)',
      '--border-hover':   'rgba(14,116,144,0.35)',
      '--border-focus':   'rgba(14,116,144,0.60)',
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
    lightVariables: {
      '--primary':        '#0A7D54',
      '--primary-light':  '#0A7D54',
      '--primary-dark':   '#075B3D',
      '--primary-bg':     'rgba(10,125,84,0.10)',
      '--primary-border': 'rgba(10,125,84,0.30)',
      '--primary-glow':   'rgba(10,125,84,0.18)',
      '--accent':         '#6D3FD4',
      '--accent-light':   '#6D3FD4',
      '--accent-dark':    '#5326A8',
      '--accent-bg':      'rgba(109,63,212,0.12)',
      '--accent-glow':    'rgba(109,63,212,0.18)',
      '--border-hover':   'rgba(10,125,84,0.35)',
      '--border-focus':   'rgba(10,125,84,0.60)',
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
    lightVariables: {
      '--primary':        '#2563EB',
      '--primary-light':  '#2563EB',
      '--primary-dark':   '#1D4ED8',
      '--primary-bg':     'rgba(37,99,235,0.10)',
      '--primary-border': 'rgba(37,99,235,0.30)',
      '--primary-glow':   'rgba(37,99,235,0.18)',
      '--accent':         '#B5790F',
      '--accent-light':   '#B5790F',
      '--accent-dark':    '#8C5D0B',
      '--accent-bg':      'rgba(181,121,15,0.12)',
      '--accent-glow':    'rgba(181,121,15,0.18)',
      '--border-hover':   'rgba(37,99,235,0.35)',
      '--border-focus':   'rgba(37,99,235,0.60)',
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
    lightVariables: {
      '--primary':        '#7C2FD6',
      '--primary-light':  '#7C2FD6',
      '--primary-dark':   '#6320AB',
      '--primary-bg':     'rgba(124,47,214,0.10)',
      '--primary-border': 'rgba(124,47,214,0.30)',
      '--primary-glow':   'rgba(124,47,214,0.18)',
      '--accent':         '#0E7490',
      '--accent-light':   '#0E7490',
      '--accent-dark':    '#0A5A72',
      '--accent-bg':      'rgba(14,116,144,0.12)',
      '--accent-glow':    'rgba(14,116,144,0.18)',
      '--border-hover':   'rgba(124,47,214,0.35)',
      '--border-focus':   'rgba(124,47,214,0.60)',
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

export function applyPalette(id: string, resolvedTheme: 'dark' | 'light' = 'dark'): void {
  const palette = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
  const style = document.documentElement.style;
  // Clear all managed vars first so token defaults take effect for 'clinical-teal'
  for (const v of MANAGED_VARIABLES) style.removeProperty(v);
  // Apply the theme-appropriate override set for non-default palettes
  const vars = resolvedTheme === 'light' ? (palette.lightVariables ?? palette.variables) : palette.variables;
  for (const [k, v] of Object.entries(vars)) style.setProperty(k, v);
}
