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
        // App surface layers
        void:   '#060A14',
        s0:     '#0C1320',
        s1:     '#111B2E',
        s2:     '#172239',

        // Border base — use opacity modifier: edge/35 = dim, edge/65 = mid
        edge:   '#1E4478',

        // Text hierarchy
        bright: '#EDF2FF',
        dim:    '#5E7FA3',
        ghost:  '#2D4060',

        // Semantic accent colors (use ONLY for designated meaning)
        teal: {
          DEFAULT: '#0DD9D9',
          dark:    '#0BB5B5',
        },
        amber:   '#F5A623',
        crimson: '#E8394A',
        emerald: '#10C981',
        violet:  '#8B5CF6',

        // ─── Legacy aliases ─────────────────────────────────────────────────
        // These keep existing pages functional during migration.
        // REMOVE in Phase 11 after all pages are rewritten.
        dark: {
          primary:   '#0C1320',
          secondary: '#111B2E',
          card:      '#111B2E',
          border:    '#1E4478',
          text: {
            primary:   '#EDF2FF',
            secondary: '#5E7FA3',
          },
        },
        light: {
          primary:   '#0C1320',
          secondary: '#111B2E',
          card:      '#172239',
          border:    '#1E4478',
          text: {
            primary:   '#EDF2FF',
            secondary: '#5E7FA3',
          },
        },
        accent: {
          primary: '#0DD9D9',  // was #2563EB → teal
          success: '#10C981',  // unchanged → emerald
          warning: '#F5A623',  // was #D97706 → amber
          error:   '#E8394A',  // was #DC2626 → crimson
        },
        // Legacy gray references (AppShell uses raw gray-* until Phase 2)
        gray: {
          50:  '#0C1320',
          100: '#111B2E',
          200: '#172239',
          300: '#1E4478',
          400: '#2D5A8E',
          500: '#5E7FA3',
          600: '#7A9CBF',
          700: '#111B2E',
          800: '#0C1320',
          900: '#060A14',
        },
      },

      // ─── TYPOGRAPHY ────────────────────────────────────────────────────────
      fontFamily: {
        ui:   ['Lexend', 'sans-serif'],
        data: ['"Fira Code"', '"Fira Mono"', 'monospace'],
      },
      fontSize: {
        // Data scale — for numbers, IDs, timestamps, metrics
        'data-xs':  ['11px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'data-sm':  ['13px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'data-md':  ['16px', { lineHeight: '1.3', letterSpacing: '0.01em' }],
        'data-lg':  ['20px', { lineHeight: '1.2', letterSpacing: '0.01em' }],
        'data-xl':  ['28px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        'data-2xl': ['40px', { lineHeight: '1.0', letterSpacing: '-0.02em' }],
        'data-3xl': ['56px', { lineHeight: '1.0', letterSpacing: '-0.03em' }],
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
