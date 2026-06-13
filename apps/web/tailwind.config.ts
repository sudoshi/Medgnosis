// =============================================================================
// Medgnosis Web — Tailwind Configuration
// Design System: "Clinical Obsidian" — v2.0
// =============================================================================

import type { Config } from 'tailwindcss';

const config: Config = {
  // Dark-first design — always dark, no light mode switching
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // ─── COLOR SYSTEM ──────────────────────────────────────────────────────
      // Clinical Obsidian palette. Rule: color = signal, never decoration.
      //   void/s0/s1/s2  = depth layers (darkest to interactive)
      //   bright/dim/ghost = text hierarchy
      //   teal   = primary interactive, selected state, data accent
      //   amber  = caution, warning, elevated risk
      //   crimson = critical, danger, overdue, high-risk
      //   emerald = success, resolved, met target, healthy
      //   violet  = secondary chart series, annotations
      colors: {
        // Surfaces, text, borders, and semantic accents all resolve to channel
        // CSS vars (tokens-dark.css / tokens-light.css). Channel format keeps
        // /opacity modifiers working (border-edge/35, bg-teal/10) AND makes every
        // utility theme-aware automatically. Channels live in the token files.
        void:    'rgb(var(--void) / <alpha-value>)',
        s0:      'rgb(var(--s0) / <alpha-value>)',
        s1:      'rgb(var(--s1) / <alpha-value>)',
        s2:      'rgb(var(--s2) / <alpha-value>)',

        // Border base — use opacity modifier: edge/35 = dim, edge/65 = mid
        edge:    'rgb(var(--edge) / <alpha-value>)',

        // Text hierarchy
        bright:  'rgb(var(--bright) / <alpha-value>)',
        dim:     'rgb(var(--dim) / <alpha-value>)',
        ghost:   'rgb(var(--ghost) / <alpha-value>)',
        // Foreground for text/icons on a SOLID accent fill (buttons/badges)
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',

        // Semantic accent colors (use ONLY for designated meaning)
        teal: {
          DEFAULT: 'rgb(var(--teal) / <alpha-value>)',
          dark:    'rgb(var(--teal-dark) / <alpha-value>)',
        },
        amber:   'rgb(var(--amber) / <alpha-value>)',
        crimson: 'rgb(var(--crimson) / <alpha-value>)',
        emerald: 'rgb(var(--emerald) / <alpha-value>)',
        violet:  'rgb(var(--violet) / <alpha-value>)',
        // Clinical informational blue (distinct from interactive teal)
        info:    'rgb(var(--info) / <alpha-value>)',
        // Caution/watch tier — between emerald (good) and amber (warning)
        gold:    'rgb(var(--gold) / <alpha-value>)',

        // ─── Legacy aliases — now token-backed so they theme too ────────────
        dark: {
          primary:   'rgb(var(--s0) / <alpha-value>)',
          secondary: 'rgb(var(--s1) / <alpha-value>)',
          card:      'rgb(var(--s1) / <alpha-value>)',
          border:    'rgb(var(--edge) / <alpha-value>)',
          text: {
            primary:   'rgb(var(--bright) / <alpha-value>)',
            secondary: 'rgb(var(--dim) / <alpha-value>)',
          },
        },
        light: {
          primary:   'rgb(var(--s0) / <alpha-value>)',
          secondary: 'rgb(var(--s1) / <alpha-value>)',
          card:      'rgb(var(--s2) / <alpha-value>)',
          border:    'rgb(var(--edge) / <alpha-value>)',
          text: {
            primary:   'rgb(var(--bright) / <alpha-value>)',
            secondary: 'rgb(var(--dim) / <alpha-value>)',
          },
        },
        accent: {
          primary: 'rgb(var(--teal) / <alpha-value>)',
          success: 'rgb(var(--emerald) / <alpha-value>)',
          warning: 'rgb(var(--amber) / <alpha-value>)',
          error:   'rgb(var(--crimson) / <alpha-value>)',
        },
        // Legacy gray references (AppShell uses raw gray-* until migrated)
        gray: {
          50:  'rgb(var(--s0) / <alpha-value>)',
          100: 'rgb(var(--s1) / <alpha-value>)',
          200: 'rgb(var(--s2) / <alpha-value>)',
          300: 'rgb(var(--edge) / <alpha-value>)',
          400: 'rgb(var(--dim) / <alpha-value>)',
          500: 'rgb(var(--dim) / <alpha-value>)',
          600: 'rgb(var(--dim) / <alpha-value>)',
          700: 'rgb(var(--s1) / <alpha-value>)',
          800: 'rgb(var(--s0) / <alpha-value>)',
          900: 'rgb(var(--void) / <alpha-value>)',
        },
      },

      // ─── TYPOGRAPHY ────────────────────────────────────────────────────────
      fontFamily: {
        display: ['"Crimson Pro"', 'Georgia', 'serif'],
        heading: ['"Source Serif 4"', 'Georgia', 'serif'],
        ui:      ['"Source Sans 3"', '"Helvetica Neue"', 'sans-serif'],
        data:    ['"IBM Plex Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Data scale — for numbers, IDs, timestamps, metrics.
        // Values in rem (anchored to 17px root) so they scale with the
        // fluid html font-size alongside all standard Tailwind text-* utilities.
        //   rem = px / 17  →  at 17px root: same as before; at 21px root: +24%
        'data-xs':  ['0.647rem', { lineHeight: '1.4', letterSpacing: '0.01em' }],  // ~11px @ 17px root
        'data-sm':  ['0.765rem', { lineHeight: '1.4', letterSpacing: '0.01em' }],  // ~13px @ 17px root
        'data-md':  ['0.941rem', { lineHeight: '1.3', letterSpacing: '0.01em' }],  // ~16px @ 17px root
        'data-lg':  ['1.176rem', { lineHeight: '1.2', letterSpacing: '0.01em' }],  // ~20px @ 17px root
        'data-xl':  ['1.647rem', { lineHeight: '1.1', letterSpacing: '-0.01em' }], // ~28px @ 17px root
        'data-2xl': ['2.353rem', { lineHeight: '1.0', letterSpacing: '-0.02em' }], // ~40px @ 17px root
        'data-3xl': ['3.294rem', { lineHeight: '1.0', letterSpacing: '-0.03em' }], // ~56px @ 17px root
      },

      // ─── BORDER RADIUS ─────────────────────────────────────────────────────
      borderRadius: {
        'panel': '12px',
        'card':  '8px',
        'pill':  '999px',
        'btn':   '6px',
        'input': '6px',
      },

      // ─── SHADOWS & GLOWS ───────────────────────────────────────────────────
      boxShadow: {
        // Panel depth
        'panel':
          '0 1px 3px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        'panel-hover':
          '0 2px 8px rgba(0,0,0,0.6), 0 8px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        'panel-focus': '0 0 0 2px rgba(13,217,217,0.4)',

        // Semantic glows — used sparingly on critical elements
        'teal-glow':    '0 0 24px rgba(13,217,217,0.18), 0 0 8px rgba(13,217,217,0.08)',
        'crimson-glow': '0 0 24px rgba(232,57,74,0.28), 0 0 8px rgba(232,57,74,0.12)',
        'amber-glow':   '0 0 24px rgba(245,166,35,0.18), 0 0 8px rgba(245,166,35,0.08)',
        'emerald-glow': '0 0 24px rgba(16,201,129,0.18), 0 0 8px rgba(16,201,129,0.08)',

        // Button hover glows
        'btn-teal':    '0 4px 18px rgba(13,217,217,0.35)',
        'btn-crimson': '0 4px 18px rgba(232,57,74,0.35)',
        'btn-amber':   '0 4px 18px rgba(245,166,35,0.35)',

        // Legacy glows
        'glow':         '0 0 15px rgba(13,217,217,0.25)',
        'glow-success': '0 0 15px rgba(16,201,129,0.25)',
        'glow-warning': '0 0 15px rgba(245,166,35,0.25)',
        'glow-error':   '0 0 15px rgba(232,57,74,0.25)',
      },

      // ─── BACKGROUND IMAGES ─────────────────────────────────────────────────
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        // Shimmer gradient for skeleton loaders
        'shimmer': 'linear-gradient(90deg, transparent 0%, rgba(30,68,120,0.25) 50%, transparent 100%)',
        // Dot-grid texture for login page
        'dot-grid': 'radial-gradient(circle, #1E4478 1px, transparent 1px)',
        // Legacy (keep for pages not yet migrated)
        'gradient-dark':  'linear-gradient(to bottom right, #060A14, #0C1320)',
        'gradient-light': 'linear-gradient(to bottom right, #0C1320, #111B2E)',
      },

      // ─── ANIMATIONS ────────────────────────────────────────────────────────
      animation: {
        // Page/panel entrance
        'fade-up':     'fadeUp 0.4s ease-out both',
        'fade-in':     'fadeIn 0.3s ease-out both',
        'slide-right': 'slideRight 0.3s ease-out both',
        'alert-in':    'alertIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both',

        // Data visualization
        'bar-fill':    'barFill 0.8s cubic-bezier(0.4,0,0.2,1) both',
        'gauge-fill':  'gaugeFill 1s cubic-bezier(0.4,0,0.2,1) both',

        // Ambient / live
        'shimmer':    'shimmer 1.6s ease-in-out infinite',
        'pulse-dot':  'pulseDot 2.2s ease-in-out infinite',
        'mesh-drift': 'meshDrift 28s ease-in-out infinite alternate',

        // Legacy (keep for unmigrated pages)
        'fade-in-legacy':           'fadeIn 0.5s ease-in-out',
        'slide-in':                 'slideIn 0.5s ease-in-out',
        'pulse-glow':               'pulseGlow 2s infinite',
        'progress-indeterminate':   'progressIndeterminate 1s ease-in-out infinite',
      },

      // ─── KEYFRAMES ─────────────────────────────────────────────────────────
      keyframes: {
        // Entrance animations
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideRight: {
          '0%':   { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        alertIn: {
          '0%':   { opacity: '0', transform: 'translateX(-14px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        // Legacy entrance
        slideIn: {
          '0%':   { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },

        // Data visualization
        barFill: {
          '0%':   { width: '0%' },
          '100%': { width: 'var(--bar-width, 100%)' },
        },
        gaugeFill: {
          '0%':   { strokeDashoffset: 'var(--gauge-max, 251)' },
          '100%': { strokeDashoffset: 'var(--gauge-offset, 0)' },
        },

        // Skeleton shimmer
        shimmer: {
          '0%':   { backgroundPosition: '-400% 0' },
          '100%': { backgroundPosition: '400% 0' },
        },

        // Live indicator
        pulseDot: {
          '0%, 100%': { opacity: '1',   transform: 'scale(1)' },
          '50%':      { opacity: '0.35', transform: 'scale(0.75)' },
        },

        // Login page ambient background
        meshDrift: {
          '0%':   { transform: 'translate(0px, 0px) scale(1)' },
          '33%':  { transform: 'translate(40px, -30px) scale(1.05)' },
          '66%':  { transform: 'translate(-30px, 40px) scale(0.97)' },
          '100%': { transform: 'translate(20px, -20px) scale(1.02)' },
        },

        // Legacy
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        progressIndeterminate: {
          '0%':   { transform: 'translateX(-100%)' },
          '50%':  { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
