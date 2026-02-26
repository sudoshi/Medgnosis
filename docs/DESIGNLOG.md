# Medgnosis — UI/UX Redesign Log
> **"Clinical Obsidian"** — A precision-engineered dark interface for healthcare workers
>
> Started: 2026-02-25 | Status: **Phases 1–18 Complete** ✓ | Clinical Workspace UI Complete ✓

---

## Table of Contents
1. [Design Audit — Current State](#1-design-audit--current-state)
2. [Design Direction & Rationale](#2-design-direction--rationale)
3. [Design System Specification](#3-design-system-specification)
4. [Component Specifications](#4-component-specifications)
5. [Page-by-Page Specifications](#5-page-by-page-specifications)
6. [Implementation Todo List](#6-implementation-todo-list)
7. [Progress Log](#7-progress-log)
8. [Implementation Learnings](#8-implementation-learnings)

---

## 1. Design Audit — Current State

### 1.1 Global Issues

| Issue | Severity | Location |
|-------|----------|----------|
| AppShell uses raw `gray-*` Tailwind classes, inconsistent with the custom `panel-*` system | High | `AppShell.tsx` |
| No custom typography — defaults to system font stack (whatever browser provides) | High | `tailwind.config.ts` |
| Color palette is generic: blue-500 is the only accent, carries no clinical hierarchy | High | `tailwind.config.ts` |
| Glassmorphism is inconsistently applied — some panels use it, AppShell does not | Medium | Multiple |
| Dark mode classes are inconsistent — some pages use `dark:bg-gray-*`, others use `dark:bg-dark-*` | High | `AppShell.tsx` vs pages |
| No data visualization — only flat progress bars and colored dots | High | `DashboardPage.tsx` |
| Identical stat card template reused unchanged across Dashboard, Patients, Care Lists | Medium | 3 pages |
| Sidebar collapse is click-based (toggle), uses very basic icon-only state | Medium | `AppShell.tsx` |
| No visual distinction between interactive and informational elements | Medium | Global |
| Loading skeletons are crude rectangles, don't match content shape | Low | Multiple |
| Pagination is only Prev/Next buttons — no page numbers | Low | `PatientsPage.tsx` |
| Timeline in PatientDetail has no connecting spine — just floating dots | Medium | `PatientDetailPage.tsx` |
| Risk gauge is a plain circle border — no arc or gradient | Medium | `PatientDetailPage.tsx` |
| GlobalSearch modal is narrow (max-w-lg), no categorization | Low | `GlobalSearch.tsx` |
| No live indicator for WebSocket connection status | Low | `AppShell.tsx` |
| Alert severity has no spatial/weight differentiation — all alerts look the same | Medium | `AlertsPage.tsx` |
| Settings page is a flat vertical stack of section cards with no navigation | Low | `SettingsPage.tsx` |
| Measures list items have no performance visualization | Medium | `MeasuresPage.tsx` |
| Care Lists page: gaps are unsorted flat list, no priority grouping | Medium | `CareListsPage.tsx` |
| All buttons use the same styling regardless of action weight | Medium | Global |
| No patient avatar/initials — everything is text-only | Low | Multiple |
| Empty states are plain centered text messages | Low | Multiple |

### 1.2 Current Color Vocabulary Problems

The current system uses only:
- **Blue** (`#2563EB` / accent-primary) — used for everything active/interactive/selected
- **Gray** (raw Tailwind) — used in AppShell inconsistently with `dark-*` tokens elsewhere
- **Amber/Red/Green** — used correctly as warnings/errors/success, but with same visual weight

Result: Blue carries no signal because it's everywhere. There's no visual hierarchy.

### 1.3 Typography Problems

- No font family is declared in Tailwind config or index.html
- Falls back to system fonts (different on every OS: SF Pro on Mac, Segoe UI on Windows)
- Numbers and IDs render in the same proportional font as prose — no data-reading feel
- No typographic scale definition — all sizes from raw Tailwind (text-xs, text-sm, text-2xl)

### 1.4 Layout Problems

- Sidebar is too wide collapsed (64px) vs standard icon-nav pattern (48-56px)
- Topbar search button ("Search patients... Ctrl+K") looks like a fake input — misleading affordance
- Main content area has no max-width on very large monitors
- Measures page overflows `h-[calc(100vh-7rem)]` at small heights — no graceful degradation
- Patient Detail right sidebar and timeline have equal visual weight — no information hierarchy

---

## 2. Design Direction & Rationale

### 2.1 Concept: "Clinical Obsidian"

**The brief:** Design for a healthcare worker who lives in this interface for 8-12 hours, making time-critical decisions about real patients. The interface must:
- Be immediately scannable under cognitive load and stress
- Use color only where it carries meaning (never decoratively)
- Render data with the precision and clarity of a medical instrument
- Feel authoritative and trustworthy, not playful or consumer-grade
- Work in dark hospital environments without eye strain

**The metaphor:** A cardiac monitor in a well-lit ICU. Dark background so data glows. Cool accent colors for interactive state (teal, clinical). Warm colors only for urgency. Information hierarchy enforced by size, weight, contrast — not color alone.

### 2.2 Aesthetic Commitments

1. **Dark-first always.** The application is always dark. No light mode. Healthcare screens run dark for night shifts, reduced eye strain, and OCR camera workflows.

2. **Color = signal, never decoration.** Teal is interactive state. Amber is caution. Crimson is critical. Emerald is resolved/healthy. These four colors must never be used for aesthetics alone.

3. **Typography is clinical.** Lexend for all prose/UI text — designed by researchers to reduce visual stress and improve reading performance (used in healthcare and education). Fira Code for all numeric data, IDs, timestamps — monospaced precision reads faster in data-heavy contexts.

4. **Numbers are first-class.** Patient counts, risk scores, dates, percentages — all rendered in Fira Code, slightly larger than surrounding text, always in `text-bright`.

5. **Density with breathing room.** Healthcare workers need high information density. But every section needs adequate whitespace to prevent confusion. The rule: dense within a card, generous between cards.

6. **Motion is purposeful.** Bars animate once on load. Numbers count up once. Alerts pulse to draw attention. No continuous animations except the live indicator pulse. No gratuitous hover effects.

7. **Depth without blur.** Avoid heavy glassmorphism — blurred backgrounds are visually noisy on data-dense screens. Use solid dark surfaces with precise 1px borders and subtle inner gradients instead.

### 2.3 Why These Fonts

**Lexend** (UI text): Designed by Dr. Bonnie Shaver-Troup and Thomas Jockin; Google-funded research showed it reduces visual stress and improves reading speed. Available on Google Fonts. Clean, contemporary, slightly humanist without being informal. Works at all weights from 300 (labels) to 700 (headings). Perfect for a healthcare interface where readability under stress is the design constraint.

**Fira Code** (data/mono): A monospaced font with programming ligatures. Numbers are tabular-width by design — meaning columns of numbers align perfectly. This matters enormously when scanning patient risk scores, encounter counts, and dates in a table. Available on Google Fonts.

### 2.4 Accessibility Commitments

- All color signals (risk bands, severity) must include text or shape backup — never color alone
- Minimum contrast ratio 4.5:1 for all text (WCAG AA)
- Focus rings visible on all interactive elements (teal ring, 2px offset)
- Motion respects `prefers-reduced-motion` — all animations wrapped in media query
- Risk levels shown as text label + icon + color (triple encoding)

---

## 3. Design System Specification

### 3.1 Color Tokens

Replace current color system entirely. New Tailwind `colors` config:

```typescript
// tailwind.config.ts colors section replacement
colors: {
  // App surfaces
  void:     '#060A14',    // App background (deepest navy-black)
  s0:       '#0C1320',    // Primary card/panel surface
  s1:       '#111B2E',    // Elevated card surface
  s2:       '#172239',    // Hover / interactive state

  // Borders
  'border-dim': 'rgba(30,68,120,0.35)',   // Default panel borders
  'border-mid': 'rgba(30,68,120,0.65)',   // Active/focused borders
  'border-hi':  'rgba(13,217,217,0.35)',  // Teal-tinted selected borders

  // Text
  bright:   '#EDF2FF',    // Primary text — slightly blue-tinted white
  dim:      '#5E7FA3',    // Secondary / label text
  ghost:    '#2D4060',    // Placeholder / muted text

  // Semantic accents (used ONLY for their designated meaning)
  teal:     '#0DD9D9',    // Primary interactive: links, active states, selections
  'teal-d': '#0BB5B5',    // Teal darker (hover on teal)
  amber:    '#F5A623',    // Warning: elevated risk, near-due, caution
  crimson:  '#E8394A',    // Critical: high-risk, overdue, alert
  emerald:  '#10C981',    // Success: resolved, met target, low-risk, healthy
  violet:   '#8B5CF6',    // Tertiary: secondary chart series, annotations

  // Legacy aliases for backward compat during migration (remove after all pages done)
  'accent-primary': '#0DD9D9',  // was blue-600
  'accent-success': '#10C981',
  'accent-warning': '#F5A623',
  'accent-error':   '#E8394A',
}
```

### 3.2 Typography Tokens

Add to `tailwind.config.ts` theme.extend:

```typescript
fontFamily: {
  ui:   ['Lexend', 'sans-serif'],
  data: ['Fira Code', 'Fira Mono', 'monospace'],
},
fontSize: {
  // Overrides for tighter type scale
  'data-xs':  ['11px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
  'data-sm':  ['13px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
  'data-md':  ['16px', { lineHeight: '1.3', letterSpacing: '0.01em' }],
  'data-lg':  ['20px', { lineHeight: '1.2', letterSpacing: '0.01em' }],
  'data-xl':  ['28px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
  'data-2xl': ['40px', { lineHeight: '1.0', letterSpacing: '-0.02em' }],
},
```

Google Fonts import in `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Lexend:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

### 3.3 Spacing & Radius

```typescript
// In tailwind.config.ts borderRadius:
borderRadius: {
  'panel': '12px',   // Primary cards/panels
  'card':  '8px',    // Inner cards, items within panels
  'pill':  '999px',  // Status badges
  'btn':   '6px',    // Buttons
  'input': '6px',    // Form inputs
}
```

### 3.4 Shadow & Glow Tokens

```typescript
boxShadow: {
  // Panel elevation
  'panel':      '0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
  'panel-hover':'0 2px 8px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
  'panel-focus':'0 0 0 2px rgba(13,217,217,0.4)',

  // Semantic glows (used sparingly)
  'teal-glow':    '0 0 20px rgba(13,217,217,0.15)',
  'crimson-glow': '0 0 20px rgba(232,57,74,0.25)',
  'amber-glow':   '0 0 20px rgba(245,166,35,0.15)',

  // Interactive button glow on hover
  'btn-teal':    '0 4px 16px rgba(13,217,217,0.3)',
  'btn-crimson': '0 4px 16px rgba(232,57,74,0.3)',
}
```

### 3.5 Animation Tokens

```typescript
animation: {
  'fade-up':      'fadeUp 0.4s ease-out both',
  'fade-in':      'fadeIn 0.3s ease-out both',
  'shimmer':      'shimmer 1.5s infinite',
  'bar-fill':     'barFill 0.8s cubic-bezier(0.4,0,0.2,1) both',
  'gauge-fill':   'gaugeFill 1s cubic-bezier(0.4,0,0.2,1) both',
  'pulse-dot':    'pulseDot 2s ease-in-out infinite',
  'count-up':     'fadeIn 0.5s ease-out both', // Cue for JS countup
  'slide-right':  'slideRight 0.3s ease-out both',
  'alert-in':     'alertIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
}
keyframes: {
  fadeUp: {
    '0%':   { opacity: '0', transform: 'translateY(12px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },
  fadeIn: {
    '0%':   { opacity: '0' },
    '100%': { opacity: '1' },
  },
  shimmer: {
    '0%':   { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
  barFill: {
    '0%':   { width: '0%' },
    '100%': { width: 'var(--bar-width)' },
  },
  gaugeFill: {
    '0%':   { strokeDashoffset: 'var(--gauge-max)' },
    '100%': { strokeDashoffset: 'var(--gauge-offset)' },
  },
  pulseDot: {
    '0%, 100%': { opacity: '1', transform: 'scale(1)' },
    '50%':      { opacity: '0.4', transform: 'scale(0.8)' },
  },
  slideRight: {
    '0%':   { opacity: '0', transform: 'translateX(-8px)' },
    '100%': { opacity: '1', transform: 'translateX(0)' },
  },
  alertIn: {
    '0%':   { opacity: '0', transform: 'translateX(-12px) scale(0.97)' },
    '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
  },
}
```

### 3.6 CSS Component Classes (globals.css)

Complete replacement of panel system:

```css
/* ─── Surfaces ───────────────────────────────────────────────── */
.surface          /* bg-s0, border-dim, shadow-panel, rounded-panel */
.surface-raised   /* bg-s1, border-dim, shadow-panel, rounded-panel — for nested */
.surface-hover    /* adds bg-s2 on hover transition */
.surface-selected /* border-border-hi, bg-teal/5 */

/* ─── Typography ─────────────────────────────────────────────── */
.text-primary     /* color: bright, font-ui */
.text-secondary   /* color: dim, font-ui */
.text-muted       /* color: ghost, font-ui */
.data-value       /* font-data, text-bright, tabular-nums */
.data-label       /* font-ui text-xs uppercase tracking-wider text-dim */
.data-id          /* font-data text-xs text-dim */  (MRN, CMS ID, etc.)

/* ─── Status badges ──────────────────────────────────────────── */
.badge            /* base pill badge */
.badge-crimson    /* critical, overdue, high-risk */
.badge-amber      /* warning, caution, medium */
.badge-teal       /* info, interactive */
.badge-emerald    /* success, resolved, low-risk */
.badge-dim        /* neutral, unknown */

/* ─── Buttons ────────────────────────────────────────────────── */
.btn-primary      /* teal bg, void text, hover shadow-btn-teal */
.btn-secondary    /* s1 bg, bright text, border-mid */
.btn-ghost        /* transparent, dim text, hover s2 bg */
.btn-danger       /* crimson bg/10, crimson text, hover crimson/20 */
.btn-icon         /* square, no text */

/* ─── Form elements ──────────────────────────────────────────── */
.input-field      /* s0 bg, border-dim, rounded-input, focus:border-teal */
.select-field     /* same + custom arrow */

/* ─── Data visualization ─────────────────────────────────────── */
.progress-track   /* h-1.5 rounded bg-s2 overflow-hidden */
.progress-bar     /* h-full rounded transition animate-bar-fill */
.progress-teal    /* teal fill */
.progress-amber   /* amber fill */
.progress-crimson /* crimson fill */
.progress-emerald /* emerald fill */

/* ─── Timeline ───────────────────────────────────────────────── */
.timeline-spine   /* 1px left border dim, absolute */
.timeline-node    /* 8px circle on spine, colored by type */
.timeline-item    /* pl-8 relative */
.timeline-date    /* font-data text-xs text-dim */

/* ─── Skeleton loading ───────────────────────────────────────── */
.skeleton         /* bg-gradient shimmer, rounded */
.skeleton-text    /* h-4 rounded */
.skeleton-circle  /* rounded-full */
```

### 3.7 Patient Avatar Pattern

For all places where a patient appears, render a colored circle with their initials:

```tsx
// Colors determined by patient_id % 8 to be consistent per patient
const avatarColors = [
  'bg-teal/20 text-teal',
  'bg-violet/20 text-violet',
  'bg-amber/20 text-amber',
  'bg-emerald/20 text-emerald',
  'bg-crimson/20 text-crimson',
  'bg-blue-400/20 text-blue-400',
  'bg-pink-400/20 text-pink-400',
  'bg-indigo-400/20 text-indigo-400',
];

function PatientAvatar({ firstName, lastName, patientId, size = 'md' })
// Renders: <div class="..."><span>JD</span></div>
```

---

## 4. Component Specifications

### 4.1 AppShell

**File:** `apps/web/src/components/AppShell.tsx`

**Current issues:** Raw gray Tailwind, click-toggle sidebar, no user avatar, no live indicator, branding is just a text span.

**New design:**

```
┌──────────────────────────────────────────────────────────────┐
│ ╔══╗  [topbar: search ─────────────────────────] [user] [⚡] │
│ ║MG║  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  [bell]       │
│ ║  ║  Page Content                                           │
│ ╠══╣                                                         │
│ ║ 🏠║                                                         │
│ ║ 👥║  ← icons only when narrow                               │
│ ║ 📊║                                                         │
│ ║ ✓ ║                                                         │
│ ║ 🔔║ ← red badge when unread alerts                          │
│ ║   ║                                                         │
│ ╠══╣                                                         │
│ ║⚙️ ║                                                         │
│ ║JD ║ ← user initials avatar                                  │
│ ╚══╝                                                         │
└──────────────────────────────────────────────────────────────┘
```

**Specific changes:**
- Root div: `bg-void` (replaces `bg-gray-50 dark:bg-gray-900`)
- Sidebar: `bg-s0 border-r border-dim` — always 60px wide
- Sidebar on hover (or when sidebarOpen): expand to 220px with smooth transition
- Logo area: 60×60 cell with "MG" monogram in teal (two letters, stacked or side-by-side in Lexend 700)
- Nav items: 60px height cells, icon centered at 22px. On expand: icon left at 18px + label text slides in
- Active nav item: teal 3px left border + teal icon color + `bg-s2` background
- Settings moved to bottom of nav, above user avatar (remove from main nav group)
- User avatar: circle with initials + role, at bottom. On hover: tooltip with full name
- Topbar: `bg-void/80 backdrop-blur-md border-b border-dim` — height 56px
- Topbar search: full-width centered input (not fake button), `max-w-md`, bg-s0, border-dim, teal focus ring
- Topbar right: alert count badge icon, user name text
- Live WebSocket indicator: small pulsing teal dot + "Live" text, shown when connected
- Page content: `bg-void min-h-full p-6`
- Remove the sidebar toggle button entirely — hover-expand replaces it

**State management:** The `sidebarOpen` toggle state in `useUiStore` should remain for explicit pin-open. Hover state is CSS-driven via `group-hover`.

### 4.2 GlobalSearch

**File:** `apps/web/src/components/GlobalSearch.tsx`

**Current issues:** Too narrow (max-w-lg), no categorization, results are plain list, no keyboard navigation indicators.

**New design:**
- Modal: `max-w-2xl` (640px), centered, appears at `pt-[12vh]`
- Backdrop: `bg-void/80 backdrop-blur-sm`
- Panel: `bg-s0 border border-teal/30 rounded-panel shadow-teal-glow`
- Search input: 52px height, Lexend, large text (16px), teal caret
- Results: organized sections — "Recent" (last 3 visits, from localStorage) + "Search Results"
- Each result: patient initials avatar + full name (Lexend 600) + "MRN: XXXXX · DOB: XX/XX/XXXX" (Fira Code)
- Keyboard navigation: selected row gets `bg-s1 border-l-2 border-teal`
- Footer hint bar: "↑↓ navigate · ↵ open · Esc close" in ghost text

### 4.3 AuthGuard

**File:** `apps/web/src/components/AuthGuard.tsx`

Minor change: Replace the loading spinner with the new design-system spinner (teal ring animation).

---

## 5. Page-by-Page Specifications

### 5.1 LoginPage

**File:** `apps/web/src/pages/LoginPage.tsx`

**Current state:** Has background blur blobs, glassmorphism card, blue accent. Works but generic.

**New design:**
- Full `bg-void` page
- Animated background: CSS-only moving gradient mesh using `@keyframes` — subtle navy-to-teal-tinted radial gradient orbits behind the form, very slow (30s cycle), barely visible
- A fine dot-grid overlay: `bg-[radial-gradient(circle,#1E3A5F_1px,transparent_1px)] bg-[length:24px_24px] opacity-20`
- Center card: `bg-s0 border border-dim shadow-panel rounded-panel p-10 max-w-md w-full`
- Top of card: "MG" monogram (same as sidebar) + "Medgnosis" in Lexend 700, teal color, 32px
- Tagline: "Population Health Management" in dim text, Lexend 300
- Form inputs: use new `input-field` class, teal focus glow
- Submit button: `btn-primary` full width with `shadow-btn-teal` on hover
- Loading state: button shows inline spinner (teal, 16px) + "Signing in..."
- Error: `bg-crimson/10 border border-crimson/20 text-crimson` pill with X icon
- Footer: version or HIPAA compliance text in ghost

### 5.2 DashboardPage

**File:** `apps/web/src/pages/DashboardPage.tsx`

**Current state:** 4 identical stat cards + two-column layout with flat charts.

**New layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ [Population Overview ─────────────────] [High Risk] [Gaps]  │
│  1,023,847 patients     ▆▅▇▆▄▅▆▇ spark   24,891      87,432 │
│  ↑ 2.1% vs last month                                       │
├─────────────────────────────────────────────────────────────┤
│ [Risk Stratification ─────────────────] [Care Gap Summary]  │
│  ████░░░░░░░░ Critical 4.2%             Donut chart here    │
│  ████████░░░░ High     18.7%            High:   24,891      │
│  ████████████ Moderate 45.1%            Medium: 43,219      │
│  ████████████ Low      32.0%            Low:    19,322      │
├─────────────────────────────────────────────────────────────┤
│ [Recent Activity ─────────────────────────────────────────] │
│  [JD] Jane Doe        Office Visit    Dr. Smith   5 days ago│
│  [MJ] Mike Johnson    ER Visit        Dr. Lee     6 days ago│
└─────────────────────────────────────────────────────────────┘
```

**Specific changes:**

**Hero row (top):** 3-cell grid (`2fr 1fr 1fr`)
- Cell 1: "Population Overview" — large patient count in `data-2xl font-data`, inline sparkline (last 6 months — fake data from total_patients trend for now, use Recharts `Sparkline` or just a simple SVG path), trend pill below
- Cell 2: "High Risk" — count in `data-xl font-data text-crimson`, "Patients requiring attention" sub
- Cell 3: "Care Gaps" — count in `data-xl font-data text-amber`, trend sub

All three as `surface` with `animate-fade-up` with staggered delays (0ms, 100ms, 200ms).

**Risk Stratification panel:**
- Use Recharts `BarChart` horizontal (layout="vertical") — 4 bars
- Colors: crimson, amber, teal, emerald
- Each bar labeled with risk level + count + percentage
- Animation: bars animate from 0 on mount (CSS `animate-bar-fill` on each bar)
- Show total number in corner

**Care Gap Summary panel:**
- SVG donut chart: 3 segments (high/medium/low), centered percentage number
- Legend list below with colored dots + count + label
- If Recharts: use `PieChart` with `innerRadius` and no animation (custom CSS instead)

**Recent Activity panel (full width):**
- Patient initials avatar (colored) + name (Lexend 500) + encounter type + provider + relative time
- Relative time in `font-data text-dim` (e.g., "3d ago", "2h ago")
- Hover: `surface-hover` background
- No border between items — just vertical whitespace

**Loading state:** Custom shimmer skeletons that match the actual layout shapes (wide bar, two squares, etc.)

### 5.3 PatientsPage

**File:** `apps/web/src/pages/PatientsPage.tsx`

**Current state:** Stats grid + search input + table + Prev/Next pagination.

**New design:**

**Stats bar:** Change from 4 cards to a horizontal strip — a single `surface` panel with 4 stats divided by vertical separators. Saves vertical space.

```
┌─────────────────────────────────────────────────────────────┐
│  Total: 1,023,847 │ High Risk: 24,891 │ Open Gaps: 87,432 │ Showing: 20 │
└─────────────────────────────────────────────────────────────┘
```

**Search:** Move inline with filter buttons into one row:
```
[ 🔍 Search patients...   ▏        Ctrl+K ] [Risk ▾] [Status ▾]
```

**Table redesign:**
- Patient cell: 36px avatar circle (initials, color based on patient_id) + name (Lexend 500) + gender · DOB (dim, smaller)
- Risk cell: badge (text + colored) + narrow 4px height bar under badge showing score 0-100
- Care Gaps cell: if > 0, crimson pill with count and subtle count weight; if 0, emerald "✓" check
- Last Encounter: relative time primary ("5d ago") in `font-data`, absolute date secondary below
- Row chevron: `>` in ghost, replaced on hover with teal `→` using transition
- Row hover: `bg-s1` + teal 3px left border accent (applied to first `td`)
- Table header: sticky top, `bg-s0 border-b border-dim`, column labels in `data-label` class, subtle sort indicator arrows
- Alternating row backgrounds: subtle (not jarring) — even rows `bg-s0`, odd rows `bg-s0/60`

**Pagination:** Numbered pages
```
← Prev   1  2  3  ...  47  48  Next →
              [current page highlighted in teal]
```
- Show max 5 page numbers around current
- Ellipsis for large gaps
- Show "Showing 21–40 of 1,023,847"

### 5.4 PatientDetailPage

**File:** `apps/web/src/pages/PatientDetailPage.tsx`

**Current state:** Header + 4 cards + 2-col (timeline + sidebar).

**New design:**

**Header:**
```
← Back to Patients
[JD avatar 48px]  Jane Doe                          [HIGH RISK]
                  MRN: 10000234  ·  F, 67 years      Risk: 82
                  DOB: 1958-03-14
```
- Patient name in Lexend 700, 28px
- MRN in `font-data text-dim`
- Risk badge right-aligned: `badge-crimson` for critical/high, `badge-amber` for moderate, `badge-emerald` for low
- Risk score right of badge as plain number

**Info strip (replaces 4 cards):**
4 data cells in a single horizontal `surface` — `grid grid-cols-4 divide-x divide-dim`:
1. Demographics (age, gender, DOB)
2. Risk Score (arc gauge SVG — see gauge spec below)
3. Open Care Gaps (count, crimson if > 0)
4. Last Encounter (date + type)

**Risk Gauge SVG spec:**
```svg
<!-- Arc from -135° to 135° (270° sweep), centered -->
<!-- Background ring: stroke #172239, strokeWidth 8 -->
<!-- Colored arc: 0-33 emerald, 34-66 amber, 67-100 crimson -->
<!-- Animates strokeDashoffset from full to target on mount -->
<!-- Score number centered inside arc -->
<svg viewBox="0 0 100 80" className="w-20 h-16">
  <path d="M 15,70 A 40,40 0 1 1 85,70" fill="none" stroke="#172239" strokeWidth="8" strokeLinecap="round" />
  <path d="M 15,70 A 40,40 0 1 1 85,70" fill="none" stroke="{color}" strokeWidth="8"
        strokeLinecap="round" strokeDasharray="{circumference}"
        strokeDashoffset="{offset}" style="animation: gaugeFill 1s ease-out both" />
  <text x="50" y="68" textAnchor="middle" fontSize="18" fontFamily="Fira Code" fill="#EDF2FF">{score}</text>
</svg>
```

**Timeline (left panel, lg:col-span-2):**

Full vertical timeline with connecting spine:
```
2026 January ──────────────────────────────
│
●── Office Visit · Jan 15          Dr. Smith
│   Completed
│
●── HbA1c Level: 7.2 %             Jan 12
│   Observation
│
2025 November ─────────────────────────────
│
⚠── Annual Diabetes Screening      Due Jan 1
    Care Gap · OPEN
```

- Spine: 1px `border-l border-dim` running the full height
- Month/year group headers: `text-dim text-xs uppercase tracking-wider` with `border-b border-dim` extending right
- Event node: colored circle (16px) on the spine, different icon/color per type:
  - Encounter: `bg-teal/20` with stethoscope-equivalent (circle)
  - Observation: `bg-emerald/20` with activity icon
  - Condition: `bg-amber/20` with heart icon
  - Care Gap: `bg-crimson/20` with target icon
- Content: event title (Lexend 500) + description + status badge
- Date: `font-data text-dim text-xs` right-aligned
- Animate each item with `animate-fade-up` staggered by index

**Right sidebar:**

*Risk Assessment card:*
- Arc gauge (large, 120px) centered at top
- Below: band label + score number
- Color band description

*Care Gaps card:*
- Priority-sorted list
- Each gap: left border color (crimson=high, amber=medium, emerald=low)
- Days-until-due countdown in `font-data`: "Due in 3 days" (amber/crimson based on urgency)
- Status badge

*Active Conditions card:*
- Simple list with status pills
- Condition name + onset date in `font-data text-xs`

### 5.5 MeasuresPage

**File:** `apps/web/src/pages/MeasuresPage.tsx`

**Current state:** 3-column split (filter sidebar | list | detail panel).

**New design:**

**Filter sidebar** (unchanged width, visual refresh):
- Section header: "Domains" in `data-label`
- Each domain button: shows domain name + count + tiny performance pill (% of measures meeting target)
- Active: `bg-s1 border-l-2 border-teal text-teal`
- Hover: `bg-s2`

**Measure list** (middle column):
- Search input at top
- Each measure item:
  ```
  ┌────────────────────────────────────┐
  │ CMS122v11          [CLINICAL] 78% ●│
  │ Diabetes: HbA1c Control            │
  │ ████████████░░░  vs 85% target     │
  └────────────────────────────────────┘
  ```
  - CMS ID in `font-data text-xs text-teal`
  - Title in Lexend 500 (truncated to 1 line)
  - Performance % right-aligned, colored (emerald if ≥ target, amber if ≥ 75%, crimson if < 75%)
  - Thin 4px bar (full width) at bottom of card showing performance vs target
  - Active: `border-teal bg-s1`

**Detail panel** (right, full flex-1):
- Header: CMS ID (teal, Fira Code) + domain badge + title (Lexend 700 24px)
- Description text in Lexend 400, readable line length
- **Performance gauge**: Large SVG arc gauge (160px), colored by threshold, score centered
- **Stats row**: 3 cells — Performance % | Target % | Eligible count | Compliant count
- **Population split visualization**: Horizontal bar showing eligible vs compliant proportion
- **Trend note**: "Trending ↑ 3.2% from last quarter" (mocked from performance data)
- Domain/type metadata at bottom

### 5.6 CareListsPage

**File:** `apps/web/src/pages/CareListsPage.tsx`

**Current state:** Stats cards + search/filter + flat card list.

**New design:**

**Stats strip:** Same pattern as PatientsPage — single `surface` horizontal bar:
```
Total: 87,432  │  Open: 51,209  │  High Priority: 24,891  │  Patients: 18,234
```

**Toolbar:** Search + status dropdown in one row.

**Priority-grouped list:**

```
─── HIGH PRIORITY (24,891) ───────────────────────── [Collapse ▾]

[JD] Jane Doe · Diabetes HbA1c Screening    CMS122  Due: 2 days  OPEN  →
[MJ] Mike J.  · Colorectal Cancer Screening CMS130  OVERDUE      OPEN  →

─── MEDIUM PRIORITY (43,219) ─────────────────────── [Collapse ▾]
...

─── LOW PRIORITY (19,322) ────────────────────────── [Collapse ▾]
...
```

- Section headers: `data-label` style + count in `font-data` + collapse toggle
- Each gap row: single horizontal line (not card) in `surface` panel:
  - Patient avatar (36px) + patient name (Lexend 500)
  - Gap description (truncated)
  - Measure ID (Fira Code text-dim)
  - Due date: colored by urgency (crimson if overdue, amber if ≤7 days, dim if later)
  - Status badge
  - Row hover: `bg-s1 border-l-2 border-teal`
- Remove the current outer `panel-base` wrapper — let the gap list be a `surface` with built-in padding

### 5.7 AlertsPage

**File:** `apps/web/src/pages/AlertsPage.tsx`

**Current state:** Header with filter tabs + card list.

**New design:**

**Header:** "Alerts" + unread badge + filter tabs (All | Active | Acknowledged)
- Live indicator: pulsing teal dot + "Live" when WebSocket connected
- Unread count badge: crimson pill on heading

**Alert cards — severity-differentiated:**

*Critical alerts:*
```
┌▌───────────────────────────────────────────────────────────┐
│▌ 🔴 CRITICAL              [High Risk Threshold Exceeded]   │
│▌ Patient: Jane Doe (MRN: 10000234)                         │
│▌ Risk score jumped from 45 → 89 in 24h                    │
│▌ 2 min ago                                [Acknowledge →]  │
└▌───────────────────────────────────────────────────────────┘
```
- `bg-crimson/8 border border-crimson/20 border-l-4 border-l-crimson`
- Subtle `shadow-crimson-glow`
- Title bold + severity badge (`badge-crimson`)

*High alerts:* Same structure, amber treatment
*Medium alerts:* Amber border-l only, no glow
*Low/Info alerts:* Dim border-l, teal treatment

**Acknowledge button:**
- Default: `btn-ghost` with outline
- Loading: spinner
- Done: replaced with `✓ Acknowledged at HH:MM` in emerald (Fira Code for time)

**Empty state:**
- Large checkmark icon (outlined) in teal/20
- "All clear — no alerts to show" in dim text
- Sub: "New alerts will appear here in real time"

**New alert animation:** `animate-alert-in` on new cards pushed in by WebSocket

### 5.8 SettingsPage

**File:** `apps/web/src/pages/SettingsPage.tsx`

**Current state:** Flat vertical stack of section cards.

**New design:** Left-nav tabs + content panel

```
┌─────────────────────────────────────────────────────────────┐
│ Settings                                                     │
├──────────────┬──────────────────────────────────────────────┤
│ 🔔 Notifications │ Notifications                            │
│ 🗄️ Data         │ Configure how and when you receive alerts  │
│ 🕐 Schedule     ├──────────────────────────────────────────┤
│ 🔒 Security     │ ── Email ────────────────────── [●━━━━━]  │
│ 👤 Profile      │ ── Desktop ─────────────────── [━━━━━○]  │
└──────────────┘  │ ── Care Gap Alerts ──────────── [●━━━━━]  │
                  │ ── Risk Score Changes ────────── [━━━━━○]  │
                  └──────────────────────────────────────────┘
```

**Left nav:** `bg-s0 rounded-panel w-52 self-start sticky top-6`
- Each tab: icon + label, active = `bg-s1 text-teal border-l-2 border-teal`

**Content area:** `surface flex-1`

**Toggle redesign:**
- Custom Tailwind toggle: `w-11 h-6 rounded-pill`
- On: `bg-teal` with white 20px dot on right
- Off: `bg-s2 border border-dim` with dim 20px dot on left
- Transition: 200ms ease

**Profile section:**
- Add user avatar (large, 72px) with initials at top of profile card
- Role/title display
- Input fields use `input-field` class

### 5.9 EncounterNotePage (Clinical Workspace — Module 10.3)

**Files:**
- `apps/web/src/pages/EncounterNotePage.tsx` — Full SOAP encounter note page
- `apps/web/src/components/encounter/SOAPSectionEditor.tsx` — TipTap rich text editor per section

**Purpose:** Clinical encounter note with AI Scribe (Ollama/MedGemma). Navigated from PatientBanner "New Note" button → `/patients/:patientId/encounter-note`.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Patient   │  Patient: Name (MRN)     │  DRAFT   │
├─────────────────────────────────────────────────────────────┤
│  Visit Type: [followup ▾]   Chief Complaint: [__________]  │
│                                      [✨ AI Scribe All]     │
├─────────────────────────────────────────────────────────────┤
│  ┌── Subjective ──────────────────────── [✨ AI] ────────┐  │
│  │  TipTap rich text editor (Lexend prose, dark theme)   │  │
│  │  Bold | Italic | Strike | List | OL | Quote | Code    │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌── Objective ───────────────────────── [✨ AI] ────────┐  │
│  │  TipTap rich text editor                              │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌── Assessment ──────────────────────── [✨ AI] ────────┐  │
│  │  TipTap rich text editor                              │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌── Plan ────────────────────────────── [✨ AI] ────────┐  │
│  │  TipTap rich text editor                              │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  [Save Draft]                           [Finalize & Sign]   │
└─────────────────────────────────────────────────────────────┘
```

**Key behaviors:**
- Creates draft note on mount via `POST /clinical-notes`; loads existing via `?noteId=` query param
- 4 independent TipTap editor instances (one per SOAP section) with full toolbar
- **Per-section AI:** Each section has a teal "✨ AI" button that generates only that section via `POST /clinical-notes/scribe`
- **AI Scribe All:** Top-level button generates all 4 sections sequentially with loading overlays
- AI-generated sections marked with teal `ring-1 ring-teal/20` border + "AI-assisted" badge
- **Auto-save:** Debounced PATCH (3s timer via `useRef`) on any content change
- **Finalize & Sign:** Confirmation modal → locks note to read-only, sets `finalized_at`
- Status badge in header: `badge-teal` for draft, `badge-emerald` for finalized

**SOAPSectionEditor component:**
- TipTap extensions: StarterKit (h3/h4), Highlight, Typography, Link, TaskList, TaskItem
- Toolbar: lucide-react icons (Bold, Italic, Strikethrough, List, ListOrdered, Quote, Code, Undo2, Redo2)
- Loading overlay: center-positioned spinner + "Generating {section}..." text with `opacity-50 pointer-events-none` on editor
- Syncs external value changes (from AI scribe) via `useEffect` watching `value` prop
- Prose classes: `prose prose-invert prose-sm` with teal links, dim paragraph text, ghost blockquotes

**Design tokens used:**
- Surfaces: `surface`, `bg-s0`, `bg-edge/30`
- Text: `text-bright`, `text-dim`, `text-ghost`, `text-teal`
- Buttons: `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-xs`
- Badges: `badge-teal`, `badge-emerald`
- Forms: `input-field`, `select-field`
- Status: `ring-1 ring-teal/20` for AI-generated indicator

---

## 6. Implementation Todo List

> Use this section to track progress. Mark items `[x]` as they are completed.

---

### PHASE 1 — Foundation (Design System)
*Must complete before any page work. Everything else depends on this.*

#### 1.1 Font Setup
- [x] **1.1.1** Add Google Fonts link tags to `apps/web/index.html` (Lexend + Fira Code)
- [x] **1.1.2** Add `font-family` body rule to `globals.css` — set `font-family: 'Lexend', sans-serif` on `body`

#### 1.2 Tailwind Config
- [x] **1.2.1** Replace `colors` block — new void/s0/s1/s2/border/text/teal/amber/crimson/emerald/violet tokens
- [x] **1.2.2** Add `fontFamily` — `ui: ['Lexend']`, `data: ['Fira Code']`
- [x] **1.2.3** Add `fontSize` data scale — `data-xs` through `data-2xl`
- [x] **1.2.4** Add `borderRadius` — panel, card, pill, btn, input
- [x] **1.2.5** Add `boxShadow` — panel, panel-hover, panel-focus, teal-glow, crimson-glow, amber-glow, btn-teal, btn-crimson
- [x] **1.2.6** Replace `animation` block — fade-up, fade-in, shimmer, bar-fill, gauge-fill, pulse-dot, slide-right, alert-in
- [x] **1.2.7** Replace `keyframes` block — all new keyframes matching animations above
- [x] **1.2.8** Legacy gradient tokens kept as backward-compat aliases; new tokens added alongside
- [x] **1.2.9** `dark.*` and `light.*` tokens re-pointed to new design values (kept as aliases for Phase 11 cleanup)

#### 1.3 globals.css
- [x] **1.3.1** Add `@layer base` body/html rules — font-family, color-scheme: dark, background color, CSS custom properties
- [x] **1.3.2** New `.surface`, `.surface-raised`, `.surface-hover`, `.surface-selected`, `.surface-interactive` added; `.panel-*` kept as aliases
- [x] **1.3.3** Added `.text-primary`, `.text-secondary`, `.text-muted`, `.data-value`, `.data-label`, `.data-id`
- [x] **1.3.4** Added badge classes — `.badge`, `.badge-crimson`, `.badge-amber`, `.badge-teal`, `.badge-emerald`, `.badge-violet`, `.badge-dim`
- [x] **1.3.5** Added button classes — `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-icon`, `.btn-sm`, `.btn-lg`
- [x] **1.3.6** Added form element classes — `.input-field`, `.select-field` with custom SVG arrow
- [x] **1.3.7** Added progress classes — `.progress-track`, `.progress-bar`, `.progress-teal/amber/crimson/emerald/violet/dim`
- [x] **1.3.8** Added timeline classes — `.timeline-container`, `.timeline-spine`, `.timeline-node`, `.timeline-node-*`, `.timeline-item`, `.timeline-date`, `.timeline-group-header`
- [x] **1.3.9** Added skeleton shimmer — `.skeleton`, `.skeleton-text`, `.skeleton-text-sm`, `.skeleton-circle`, `.skeleton-btn`
- [x] **1.3.10** Added ultra-thin scrollbar (4px, `rgba(30,68,120,0.5)` thumb) and `.scrollbar-hidden`
- [x] **1.3.11** Added `@media (prefers-reduced-motion: reduce)` block — disables all animations/transitions
- [x] **1.3.12** Old modal classes kept as aliases pointing to new implementations for backward compat
- [x] **1.3.13** Added new `.overlay-backdrop` and `.command-panel` modal classes

---

### PHASE 2 — AppShell & GlobalSearch
*Wraps all pages — must be correct before pages look right.*

#### 2.1 AppShell
- [x] **2.1.1** Replace root div: `flex h-screen bg-void overflow-hidden`
- [x] **2.1.2** Sidebar: `bg-s0 border-r border-edge/35 flex flex-col` — click-toggle `w-[60px]` ↔ `w-[220px]` with `transition-all duration-200`
- [x] **2.1.3** Logo area: 60px height, MG monogram (teal `bg-teal/12 border-teal/20`), Medgnosis wordmark slides in via `max-w-0 → max-w-[120px]` opacity transition; chevron icon toggles L/R
- [x] **2.1.4** `NavItem` extracted as internal component — icon 20px centered, label slides in via `max-w-0 opacity-0 → max-w-[160px] opacity-100`, `title` attr for tooltip when collapsed
- [x] **2.1.5** Active nav: `inset 3px 0 0 #0DD9D9` box-shadow (left border) + `bg-s2 text-teal`; inactive = `text-dim hover:bg-s2 hover:text-bright`
- [x] **2.1.6** Settings + Logout moved to bottom section, visually separated by `border-t border-edge/25`
- [x] **2.1.7** User avatar: bottom of sidebar, initials circle (palette-colored by email hash), name + role slide in
- [x] **2.1.8** Topbar: `bg-void/90 backdrop-blur-md border-b border-edge/35 h-14 flex items-center px-4 gap-4`
- [x] **2.1.9** Topbar search: `<button>` styled as `input-field` — `cursor-text`, Search icon, placeholder, ⌘K kbd badge; opens modal on click
- [x] **2.1.10** Topbar right: Bell icon → `/alerts` link + user display name
- [x] **2.1.11** Live indicator: `.live-dot` (emerald pulseDot animation) + "Live" text always shown when authenticated
- [x] **2.1.12** Main content: `flex-1 overflow-y-auto bg-void scrollbar-thin` with inner `<div class="p-6">` wrapper

#### 2.2 GlobalSearch
- [x] **2.2.1** Backdrop: `fixed inset-0 z-50 bg-void/85 backdrop-blur-sm`
- [x] **2.2.2** Panel: `max-w-2xl w-full bg-s0 border border-teal/25 rounded-panel shadow-teal-glow animate-fade-up`
- [x] **2.2.3** Input: 52px height row (`h-[52px]`), 15px Lexend, `caret-teal`, teal focus, clear X button
- [x] **2.2.4** Results: 36px avatar circles with initials (palette-colored by patient_id), name + MRN·DOB in Fira Code
- [x] **2.2.5** Keyboard navigation: `selectedIndex` state, ArrowUp/Down cycle through list, Enter selects; `onMouseEnter` syncs mouse hover with keyboard index
- [x] **2.2.6** Footer hint bar: 36px `h-9 bg-s1 border-t border-edge/25` — ↑↓ Navigate, ↵ Open, Esc Close icons+text
- [x] **BONUS** Recent searches: sessionStorage persistence (last 4), shown when no query with Clock icon header
- [x] **BONUS** Loading skeleton: avatar circle + 2-line skeleton while debouncing
- [x] **BONUS** Empty state: human-readable "No patients found for X" + tip text

---

### PHASE 3 — Dashboard
- [x] **3.1** Convert stats section to 3-cell hero row: Population Overview (2fr) + High Risk (1fr) + Care Gaps (1fr)
- [x] **3.2** Population Overview card: `data-2xl font-data` patient count, inline SVG sparkline, trend pill
- [x] **3.3** High Risk card: `data-xl font-data text-crimson` count, description below
- [x] **3.4** Care Gaps card: `data-xl font-data text-amber` count, trend below
- [x] **3.5** Add staggered `animate-fade-up` to hero cells (delay: 0ms, 100ms, 200ms)
- [x] **3.6** Risk Stratification: implement Recharts horizontal bar chart (layout="vertical") with crimson/amber/teal/emerald fills
- [x] **3.7** Care Gap Summary: implement SVG donut chart (3 segments) with centered percentage number and legend list
- [x] **3.8** Recent Activity: add patient initials avatar, relative time formatter helper, proper row layout
- [x] **3.9** Implement shimmer skeleton that matches the hero row + chart layout shapes
- [x] **3.10** Add page-level padding `p-6` since AppShell no longer adds it

---

### PHASE 4 — Patients Page
- [x] **4.1** Convert 4-card stats to single horizontal strip panel with 4 cells divided by separators
- [x] **4.2** Move search + filter controls into single toolbar row
- [x] **4.3** Table: add `PatientAvatar` component (36px, initials, color by patient_id)
- [x] **4.4** Table: risk column — badge + 4px bar below showing score 0-100
- [x] **4.5** Table: care gaps column — crimson pill if > 0, emerald "✓" if 0
- [x] **4.6** Table: last encounter — relative time primary, absolute secondary below
- [x] **4.7** Table: row hover — `bg-s1` + teal left border on first td
- [x] **4.8** Table: sticky header with `data-label` column headings
- [x] **4.9** Implement numbered pagination component: `← 1 2 3 … 47 48 →`
- [x] **4.10** Add sort indicators to column headers (UI only — wire to API later)
- [x] **4.11** Update skeleton rows to match new column widths

---

### PHASE 5 — Patient Detail
- [x] **5.1** Header: large patient name + MRN (Fira Code) + risk badge right-aligned
- [x] **5.2** Add 48px patient avatar to header
- [x] **5.3** Convert 4 cards to single horizontal info strip (4 cells, dividers)
- [x] **5.4** Implement SVG arc gauge for risk score — in info strip and right sidebar
- [x] **5.5** Timeline: add vertical spine (1px border-dim), month/year group headers
- [x] **5.6** Timeline: color-coded circular nodes for each event type
- [x] **5.7** Timeline: staggered `animate-fade-up` on each timeline item
- [x] **5.8** Timeline: group events by month/year with separator headers
- [x] **5.9** Right sidebar — Care Gaps: priority-sorted, left border color, days-until-due countdown
- [x] **5.10** Right sidebar — Conditions: onset date in Fira Code, status pill
- [x] **5.11** Right sidebar — Risk Assessment: replace plain circle with SVG arc gauge
- [x] **5.12** Update page-level padding

---

### PHASE 6 — Measures Page
- [x] **6.1** Filter sidebar: add mini donut (or bar) per domain showing % meeting target
- [x] **6.2** Filter sidebar: active state — `bg-s1 border-l-2 border-teal text-teal`
- [x] **6.3** Measure list items: CMS ID in Fira Code + mini 4px bar at bottom of item
- [x] **6.4** Measure list active item: `bg-s1 border border-teal/40`
- [x] **6.5** Detail panel: implement SVG arc gauge for performance score
- [x] **6.6** Detail panel: stats row — 4 cells in a strip (Performance, Target, Eligible, Compliant)
- [x] **6.7** Detail panel: population split visualization (horizontal bar, eligible/compliant)
- [x] **6.8** Detail panel: domain badge + measure type badge in header

---

### PHASE 7 — Care Lists Page
- [x] **7.1** Convert 4 stats cards to horizontal strip (same as Patients)
- [x] **7.2** Group gaps by priority — High | Medium | Low sections with collapsible headers
- [x] **7.3** Gap rows: patient initials avatar + name + gap description + measure ID + due date + status
- [x] **7.4** Due date urgency coloring: crimson if overdue, amber if ≤7 days, dim otherwise
- [x] **7.5** Row hover: `bg-s1 border-l-2 border-teal`
- [x] **7.6** Section headers: count in Fira Code, collapse toggle button

---

### PHASE 8 — Alerts Page
- [x] **8.1** Alert card — critical: `bg-crimson/8 border-l-4 border-l-crimson shadow-crimson-glow`
- [x] **8.2** Alert card — high: amber treatment (no glow)
- [x] **8.3** Alert card — medium: amber border-l-2 only
- [x] **8.4** Alert card — low/info: teal dim treatment
- [x] **8.5** Acknowledge button: `btn-secondary` → loading spinner → emerald "✓ Acknowledged HH:MM"
- [x] **8.6** Time display: relative time (e.g., "2 min ago") in Fira Code
- [x] **8.7** Empty state: design proper empty state with icon + message
- [x] **8.8** Add live indicator pulsing dot next to "Alerts" heading
- [x] **8.9** New alert animation: `animate-alert-in` on WebSocket-triggered cards

---

### PHASE 9 — Login Page
- [x] **9.1** Background: CSS animated mesh gradient (keyframes, slow orbit, no JS)
- [x] **9.2** Background: fine dot-grid overlay using CSS background-image
- [x] **9.3** Card: `bg-s0 border border-dim shadow-panel rounded-panel p-10 max-w-md`
- [x] **9.4** Logo/brand: MG monogram + Medgnosis wordmark in Lexend 700 teal
- [x] **9.5** Inputs: `input-field` class, teal focus glow
- [x] **9.6** Submit button: `btn-primary` full width + `shadow-btn-teal` on hover
- [x] **9.7** Error state: crimson pill with icon
- [x] **9.8** Footer: version or HIPAA notice in ghost text

---

### PHASE 10 — Settings Page
- [x] **10.1** Convert to two-column layout: left nav tabs (w-52) + content panel
- [x] **10.2** Left nav: icon + label per section, active = teal border-l + teal text + bg-s1
- [x] **10.3** Add managed `activeTab` state to switch content
- [x] **10.4** Toggle: redesign to custom Tailwind pill toggle (teal on, s2 off)
- [x] **10.5** Profile section: add 72px user avatar with initials at top
- [x] **10.6** Inputs in profile: `input-field` class
- [x] **10.7** Select dropdowns: `select-field` class

---

### PHASE 11 — Shared Components & Polish
- [ ] **11.1** Extract `PatientAvatar` component to `src/components/PatientAvatar.tsx`
- [ ] **11.2** Extract `RiskGauge` SVG component to `src/components/RiskGauge.tsx`
- [ ] **11.3** Extract `RelativeTime` utility function to `src/utils/time.ts`
- [ ] **11.4** Extract `StatsStrip` component for reuse across Dashboard/Patients/Care Lists
- [ ] **11.5** Extract numbered `Pagination` component to `src/components/Pagination.tsx`
- [ ] **11.6** Audit all pages for any remaining `gray-*` raw Tailwind color classes — replace with design tokens
- [ ] **11.7** Audit all pages for any remaining `dark:*` conditional classes — remove (dark-only design)
- [ ] **11.8** Audit all pages for `text-light-*` and `text-dark-*` legacy tokens — replace
- [ ] **11.9** Test at 1280px, 1440px, and 1920px viewport widths
- [ ] **11.10** Test sidebar hover-expand behavior — ensure labels don't flash on narrow expand
- [ ] **11.11** Verify all Fira Code numeric values are `tabular-nums` (CSS `font-variant-numeric: tabular-nums`)
- [ ] **11.12** Verify focus rings on all interactive elements (Tab key navigation test)
- [ ] **11.13** Add `@media (prefers-reduced-motion: reduce)` audit — ensure no animations fire
- [ ] **11.14** Update `docs/DEVLOG.md` with design system notes

---

## 7. Progress Log

| Date | Phase | Work Done |
|------|-------|-----------|
| 2026-02-25 | Planning | Full codebase audit completed. All 8 pages + 3 components read and analyzed. Design system defined. This DESIGNLOG.md written. |
| 2026-02-25 | Phase 2 ✓ | AppShell: full rewrite — void background, click-toggle sidebar (60px↔220px), MG monogram + Medgnosis wordmark slide-in, NavItem component with left-border box-shadow active state (inset 3px teal), max-width label animation, Settings/Logout bottom-docked, user initials avatar (palette-colored), topbar with backdrop-blur + cursor-text search trigger + live indicator + Bell link. GlobalSearch: max-w-2xl command palette, teal border + glow, 52px input with caret-teal, patient avatar circles, ↑↓ keyboard navigation with index sync on mouse hover, Enter-to-select, recent searches (sessionStorage, 4 max), loading skeleton, footer hint bar. Build: ✓ clean. |
| 2026-02-25 | Phase 1 ✓ | Design system foundation complete. `index.html`: Lexend + Fira Code Google Fonts added. `tailwind.config.ts`: full token replacement — void/s0/s1/s2 surfaces, edge border base, bright/dim/ghost text, teal/amber/crimson/emerald/violet accents, data font scale (data-xs–data-3xl), panel/card/pill/btn/input radii, panel/glow/btn shadow tokens, 14 new animation definitions + all keyframes, legacy aliases preserved for backward compat. `globals.css`: 420-line rewrite — base layer with CSS vars + dark color-scheme, surface class family, typography helpers, badge system, button system (5 variants + sizes), form elements, progress bars, timeline classes, skeleton shimmer, scrollbar, empty state, risk gauge, login mesh, alert severity, stats strip, patient avatar, data table, nav item, stagger utilities, reduced-motion media query. Build: ✓ clean (1673 modules, 0 errors). |
| 2026-02-25 | Phase 3 ✓ | DashboardPage: 3-cell hero row (Population Overview 2fr + High Risk + Care Gaps), TrendBadge component (TrendingUp/Down icons), SVG Donut chart (3-segment with cumulative-pct rotation + strokeDashoffset C*0.25 technique), SkeletonHero shimmer placeholders, risk stratification bars with --bar-width/--bar-delay CSS vars, recent encounters with avatarColor + getInitials + relativeTime. API fields: data.stats + data.analytics. Build: ✓ 1977 modules. |
| 2026-02-25 | Phase 4 ✓ | PatientsPage: correct interface (id not patient_id, meta not pagination), stats strip (surface p-0 divide-x), div-based table rows with Link + border-l-2 hover accent, calcAge/formatDOB/formatGender helpers, getPaginationRange returning (number\|'…')[] with ellipsis, numbered pagination with teal current-page highlight. Build: ✓ clean. |
| 2026-02-25 | Phase 5 ✓ | PatientDetailPage: correct interface (no risk_score, encounters use body/date/type, care_gaps use measure/status/identified_date), 48px avatar header, horizontal info strip (4 counts), flex-based timeline with type-colored nodes + spine segments grouped by month/year, care gaps + conditions sidebars. Bug fix: changed all bg-*/12 → bg-*/10 in globals.css + AppShell.tsx (Tailwind @apply opacity-12 not in default scale). Build: ✓ clean. |
| 2026-02-25 | Phase 6 ✓ | MeasuresPage: 2-column layout (h-[calc(100vh-7.5rem)] -m-6 overflow-hidden), measure list with font-data code labels, separate MeasureDetailPanel with own query. ArcGauge SVG (r=36, C/2 semicircle, strokeDasharray pct*C/2-3 value arc, rotate(-180 50 60)). Animated progress bars. API: population.{total_patients,compliant,eligible}. Build: ✓ clean. |
| 2026-02-25 | Phase 7 ✓ | CareListsPage: stats strip (crimson open/emerald resolved/violet patients), status filter tabs, collapsible SectionHeader with ChevronDown rotation, CareGapRow with avatar+Link+measure+date+badge+resolve button, useMutation for PATCH /care-gaps/:id, per-row loading via variables. isOpenStatus() helper. Build: ✓ clean. |
| 2026-02-25 | Phase 8 ✓ | AlertsPage: UUID id, severity-differentiated cards via inline boxShadow (inset 4px 0 0 #E8394A + 0 0 16px glow), SEVERITY_CARD map, live-dot in header, critical alert summary banner, filter tabs (all/unread/acknowledged), acknowledge button with spinner, formatDistanceToNow timestamps. Build: ✓ clean. |
| 2026-02-25 | Phase 9 ✓ | LoginPage: full-screen bg-void, embedded CSS keyframes (login-blob-1 22s/login-blob-2 30s/login-grid-pulse 12s), radial-gradient teal + violet blobs with blur-[130px], animated grid overlay (52px × 52px) + radial vignette to fade edges, MG monogram with box-shadow glow, surface card with input-field/btn-primary, crimson error banner with AlertCircle icon, live-dot "All systems operational" footer. Build: ✓ clean. |
| 2026-02-25 | Visual delight pass ✓ | globals.css: (1) Ambient body background — radial-gradient teal breath at top-center (2.8% opacity); (2) Surface micro-gradient overlay — 2.2% white highlight from top-left simulates light catch; (3) surface-interactive: translateY(-1px) lift + :active scale; (4) Badge inner glow — inset box-shadow per accent color; (5) btn-primary/secondary: translateY(-1px) on hover, translateY(0)+scale on :active; (6) Skeleton shimmer — higher contrast (edge 60% + teal 8% at peak vs old flat navy); (7) Progress bars — gradient fills (dark→accent→bright) for luminosity; (8) Active nav — directional gradient bleeding teal inward from left accent; (9) Dividers — fade-to-transparent gradient edges, no harsh 1px line; (10) live-dot::before — expanding ring keyframe (liveDotRing: scale 1→2.2, opacity 0.5→0); (11) input:focus — increased teal glow intensity. Also fixed 3 pre-existing TS bugs: PatientBanner prop types (pcp/insurance/address field names), OverviewTab call site (patient→individual arrays), EncountersTab missing generic on api.get. Build: ✓ 2607 modules. |
| 2026-02-25 | Typography fix ✓ | Fluid root font-size: `clamp(17px, 1.1vw + 1.2px, 21px)` on `html` in globals.css. 17px at ≤1440px (laptop), scales to 21px at ≥1800px (desktop). All rem-based Tailwind utilities (text-xs, text-sm, etc.) scale automatically. Converted `data-*` fontSize scale from hard-coded px → rem (÷17) so stat numbers and timestamps also scale. Zero component changes required. Build: ✓ clean. |
| 2026-02-25 | Phase 10 ✓ | SettingsPage: left-nav tab layout (5 tabs: Profile/Notifications/Data/Schedule/Security, w-[196px] surface nav), right content area with per-section components (animate-fade-up), custom pill Toggle (w-9 h-5 rounded-full, teal on/s2+edge off, white knob translate), SettingRow reusable component with label+description+toggle, ProfileSection (2-col name grid + email + readOnly role), NotificationsSection (4 toggles), DataSection (3 toggles + DB overview table), ScheduleSection (2 selects + next-jobs list), SecuritySection (2FA button + session info + danger zone). Build: ✓ 1977 modules. |
| 2026-02-25 | Phase 13 ✓ | Dashboard redesign — layout, typography, and panel elegance. Problems fixed: (1) Stats strip moved from below panels to top — numbers are now the first thing scanned; (2) 3-equal-column layout replaced with 5:3 grid (Schedule wider than Alerts, Abby removed from prime real estate); (3) Population Health made always-visible — removed collapsible toggle entirely, content is core product value; (4) Section dividers (SectionDivider component — small uppercase label + fade-to-transparent gradient line) separate major sections without harsh borders; (5) Top-border accents per panel type: teal for Schedule, adaptive crimson/amber for Alerts depending on whether criticals exist, violet for Abigail; (6) Font size bumps: panel headers text-sm→text-base, patient names text-xs→text-sm, time slots text-xs→text-sm, stats values using text-data-xl with uppercase tracking labels, secondary info text-[10px]→text-xs minimum; (7) Stats strip redesigned with icons (Users/Activity/AlertCircle/AlertTriangle) in colored icon wells, divide-x separators, color-coded numbers (amber for gaps, crimson for high risk); (8) Schedule rows enhanced: vertical spine divider between time and patient, reason shown inline, group-hover name→teal; (9) Abby moved to bottom-right of last row — compact, graceful placeholder with violet glow; (10) Removed useState (was only for collapsed pop health toggle). Build: ✓ 2607 modules. |
| 2026-02-25 | Phase 11 ✓ | Shared component extraction & deduplication. Created `src/utils/time.ts` (relativeTime, formatDate, formatTime, calcAge, getGreeting — replaces 6+ inline copies). Created `src/components/PatientAvatar.tsx` (PatientAvatar, avatarColor, getInitials, getInitialsFromParts — deterministic palette coloring via hash % 5; xs/sm/md/lg size variants). Created `src/components/Pagination.tsx` (numbered paginator with ellipsis, item count label, renders null if ≤1 page). Updated: AlertsPage (→ relativeTime from utils), DashboardPage (→ PatientAvatar + time utils, removed 5 inline helpers, added SectionDivider), PatientsPage (→ PatientAvatar + Pagination + formatDate + calcAge, removed ~80 lines of duplicates), CareListsPage (→ PatientAvatar + getInitials + formatDate, removed duplicates), GlobalSearch (→ PatientAvatar + getInitialsFromParts + formatDate, removed AVATAR_PALETTE + getAvatarColor), PatientBanner (→ PatientAvatar size="lg" + getInitialsFromParts + calcAge + formatDate, removed 5 inline helpers). NotFoundPage: replaced legacy tokens (bg-gradient-dark, text-dark-text-primary, bg-accent-primary) with canonical tokens (bg-void, text-bright, btn btn-primary). Build: ✓ 2610 modules. |
| 2026-02-25 | Phase 12 ✓ | Healthcare color & icon standards (ISMP/FDA/HL7 IEC 60446). Added `info: '#4B9EDB'` color token (clinical blue — distinct from interactive teal, never used for navigation). Added `--color-info` CSS var. Added `.badge-info` (blue, for purely informational alerts) and `.badge-caution` (muted amber at 78% opacity, for medium severity below urgent threshold). AlertsPage: SEVERITY_CARD low/info now use info blue left border (was teal, which is interactive color); SeverityIcon — medium now muted amber opacity-60, low → text-dim, info → text-info, default → text-ghost; SeverityBadge — medium → badge-caution, low → badge-dim, info → badge-info (was all collapsing to amber or teal, now fully differentiated 5-tier hierarchy: crimson→amber→caution→dim→info). CareListsPage: open gap stats strip icon+number→amber (was crimson); SectionHeader open colorClass→amber; CareGapRow status badge→badge-amber (was badge-crimson). CareGapsTab: AlertCircle icon→amber, count badge→badge-amber, border-l-amber bg-amber/5 (was crimson). OverviewTab: gapStatusBadge open→badge-amber; AlertCircle icon+count badge→amber; care gap card border-l-amber bg-amber/5. Rationale: care gaps = missed preventive care = *warnings*, not life-threatening. Crimson reserved exclusively for: lab critical values, severe allergies, truly life-threatening alerts. Build: ✓ 2607 modules. |
| 2026-02-25 | Backend: Phase 6 Star Schema v2 ✓ | **Star schema v2 complete (3 migrations + 1 script).** Migration 010 adds: 5 new dimensions (dim_payer, dim_allergy, dim_care_gap_bundle, bridge_bundle_measure, dim_risk_model), ALTERs dim_measure (+7 cols) and fact_care_gap (+4 cols), 9 new fact tables (fact_patient_bundle, fact_patient_bundle_detail, fact_patient_composite, fact_provider_quality, fact_ai_risk_score, fact_population_snapshot, fact_immunization, fact_patient_insurance, fact_sdoh), 27 performance indexes, 4 materialized views (mv_patient_dashboard, mv_bundle_compliance_by_provider, mv_population_overview, mv_care_gap_worklist). Migration 011 seeds dim_care_gap_bundle (45 bundles from phm_edw.condition_bundle with hard-coded disease_category), bridge_bundle_measure (~350 rows with shared-measure and dedup_domain detection), and dim_risk_model (4 Abigail AI models). Migration 013 provides ETL Steps 16–27: dim_payer/allergy/bundle/bridge reload, fact_care_gap UPSERT (gap closures, backfill bundle_key/provider_key/days_open), fact_patient_bundle (ICD-10 pattern qualification + compliance calc), fact_patient_bundle_detail (dedup via ROW_NUMBER PARTITION BY patient_key+dedup_domain), fact_patient_composite (10-CTE join, risk_tier from abigail_priority_score thresholds), fact_provider_quality (PERCENT_RANK), fact_population_snapshot (PERCENTILE_CONT median), incremental immunization/insurance/sdoh inserts. Step 27 (REFRESH MATERIALIZED VIEW CONCURRENTLY) extracted to packages/db/scripts/refresh_star_views.sql (cannot run inside transaction). |
| 2026-02-25 | Clinical Workspace: Module 10.3 ✓ | **Encounter Note with AI Scribe** — full SOAP note editor. Created `EncounterNotePage.tsx` (~350 lines): visit type selector (followup/initial/urgent/telehealth), chief complaint input, "AI Scribe All" button, 4 SOAPSectionEditor instances with TipTap rich text, auto-save via debounced PATCH (3s useRef timer), finalize with confirmation dialog, status badge (draft/finalized), AI-generated section tracking via `Set<string>`. Created `components/encounter/SOAPSectionEditor.tsx` (~230 lines): TipTap editor with StarterKit+Highlight+Typography+Link+TaskList+TaskItem extensions, 9-button toolbar (Bold/Italic/Strike/List/OL/Quote/Code/Undo/Redo via lucide-react), per-section AI generate button with loading overlay (opacity-50+spinner), "AI-assisted" teal badge, external value sync via useEffect, prose-invert dark theme classes. Backend: 7 Fastify endpoints in `routes/clinical-notes/index.ts` (CRUD + finalize + amend + AI scribe), scribe gathers patient context from 6 parallel DB queries (conditions/meds/vitals/allergies/care-gaps/encounters), builds clinical prompt, calls `generateCompletion({jsonMode:true, temperature:0.3})`. Database: `012_clinical_notes.sql` migration (UUID PK, SOAP text columns, JSONB ai_generated provenance, status workflow). 5 React Query hooks added to useApi.ts. Route wired in App.tsx. Build: ✓ 4/4 packages clean. |
| 2026-02-26 | Patient-Context Abby Chat ✓ | **Full AI clinical assistant with EHR context injection.** Backend: Created `services/patientContext.ts` — extracted 6 parallel SQL queries (conditions, medications, vitals, allergies, care gaps, encounters) + formatting logic into shared helper; refactored clinical-notes scribe to import shared helper (eliminated ~100 lines of duplication). Enhanced `POST /insights/chat` endpoint: accepts optional `patient_id`, verifies patient exists, fetches clinical context via `getPatientClinicalContext()`, builds enriched system prompt with patient summary, caps history at 16 turns for token budget (gemma:7b 4K context), returns `context_summary` for UI display; added `aiGateMiddleware` preHandler. Frontend: Created `components/patient/AbbyTab.tsx` (~300 lines) — full chat UI with violet top-border branding, collapsible clinical context summary panel (ChevronDown toggle), message area with auto-scroll (useRef + scrollIntoView), user messages (teal/10) + Abby messages (bg-s1 with inline Sparkles icon), thinking spinner, quick-action suggestion chips ("Summarize care gaps", "Drug interaction check", "Quality measures", "Risk assessment"), multi-turn history sent with each request, clinical decision support disclaimer, loading skeleton on initial chart review. Wired into PatientDetailPage as 8th tab (`'abby'` TabId, Sparkles icon via TabBar `icon` prop). Fixed Dashboard AbbyChat bug: `data.reply` → `data.response` (API returns `response` field). Enhanced `useAiChat` hook: added `history` parameter, removed hardcoded `provider: 'ollama'`. Build: ✓ 4/4 packages, 2726 modules. |
| 2026-02-25 | Phases 14–18 ✓ | **Phase 14 — Toast & Feedback System:** Created `stores/ui.ts` toast slice (addToast/removeToast, MAX_TOASTS=3), `stores/ws.ts` (WsStatus: connected/reconnecting/disconnected), `Toast.tsx` (ToastContainer + ToastItem, animate-fade-up, auto-dismiss 4s, 4 severity icons + border colors), `ConfirmModal.tsx` (generic dialog, danger/primary variant, focus-trap, Esc-to-cancel, Enter-to-confirm). Wired: CareListsPage (ConfirmModal before resolve → success/error toast), AlertsPage (toast on acknowledge), AppShell (ConfirmModal for logout), SettingsPage (controlled profile form, save toast, removed fake scheduled jobs with "Not configured" state). **Phase 15 — AppShell & Dashboard Interactivity:** AppShell: useQuery for unread alert count (refetchInterval 60s) → crimson badge on Bell; WsIndicator component hooks to useWsStore (connected=green live-dot, reconnecting=amber static dot, disconnected=WifiOff grey); useAlertSocket updated to write to useWsStore on open/close/error. Dashboard: DonutChart segments now clickable (navigate to /care-lists?status=open); risk stratification bar rows wrapped in `<button>` → navigate to /patients?risk=:level; recent encounter rows wrapped in `<Link>` with group-hover teal; Abby placeholder replaced with full chat textarea + useMutation POST /insights/chat, chat history display, Enter-to-send. **Phase 16 — Patient Detail Enrichment:** OverviewTab: RiskTierCard mini-arc-gauge (48px, emerald/amber/crimson based on compliance_pct) shown in right column when bundle data loads; abnormal count badge on Recent Results header; each abnormal observation gets an "Abnormal" badge. LabsVitalsTab: "X abnormal" toggle button filters list to show only flagged results; abnormal values show badge-crimson "Abnormal" label. MedicationsTab: strength + form fields now rendered. PatientBanner: insurance prefers payer_name over payer, shows plan_type. TabBar: full ARIA tablist/tab/tabpanel roles, ArrowLeft/Right/Home/End keyboard navigation, tabIndex roving. **Phase 17 — Care Lists & Measures:** CareListsPage: server-side search with 300ms debounce, per-page selector (25/50/100), Pagination component wired to meta.total_pages, sticky table header (sticky top-0 bg-s0 z-10). MeasuresPage: auto-select first measure on load (useEffect), TrendBadge added to performance stat, Eligible/Compliant counts wrapped in Link → /patients?measure=:code&cohort=eligible|compliant. **Phase 18 — Accessibility & Polish:** GlobalSearch: "Clear" button in recent searches header (clears sessionStorage key). TabBar: focus-visible:ring-2 ring-inset, tabIndex roving (-1 for non-active tabs). AppShell: focus-visible rings on logout button and search trigger. CareListsPage: focus-visible rings on resolve button and status filter tabs. PatientDetailPage: tabpanel div gets role="tabpanel" + aria-labelledby. Build: ✓ 4/4 packages, 0 errors. |

---

## 8. Implementation Learnings

*Discovered during Phases 1–10. These are non-obvious gotchas and repeatable patterns worth preserving for Phase 11 and future sessions.*

---

### 8.1 Tailwind JIT — The `@apply` Opacity Trap

**Problem:** `@apply bg-crimson/12` in `globals.css` throws a PostCSS error: *"The 'bg-crimson/12' class does not exist"*. The same class written in a `.tsx` file builds fine.

**Root cause:** Tailwind JIT generates utility classes by scanning source files. A class like `bg-teal/12` written in `AppShell.tsx` gets generated because the scanner finds it. But `bg-crimson/12` used *only* inside `@apply` in a CSS file was never scanned from source → never generated → `@apply` fails because the class isn't in the registry. Additionally, `12` is not in Tailwind's default opacity scale (0, 5, 10, 15, 20, 25…).

**Rule:** In `@apply` directives, only use opacity values that are multiples of 5 (`/5`, `/10`, `/15`, `/20`, `/25`…). Use `/8`, `/12`, etc. freely in `.tsx` source files — JIT generates them on-demand. Never use them exclusively in CSS.

**Fix applied:** Changed all `/12` → `/10` in `globals.css` (badge and btn-danger classes) and `AppShell.tsx` (`bg-teal/12` → `bg-teal/10`).

---

### 8.2 API Response Shape — Always Read the Route

Every page had interface mismatches. The pattern is consistent:

```typescript
// Every api.get<T>() and api.post<T>() returns:
interface ApiResponse<T> {
  success: boolean;
  data?: T;           // the typed payload — access as result.data
  error?: ApiError;
  meta?: PaginationMeta; // { page, per_page, total, total_pages }
}
// Usage:
const result = await api.get<Patient[]>('/patients');
const patients = result.data ?? [];   // NOT result itself
const pagination = result.meta;       // NOT result.pagination
```

**Field names that differ from intuition** (full reference in Appendix C):

| Assumed | Actual |
|---------|--------|
| `patient_id` | `id` |
| `pagination` | `meta` |
| `message` (alerts) | `body` |
| `acknowledged` | `acknowledged_at` (null = unread) |
| `measure_id` | `measure` |
| `due_date` | `identified_date` |
| `order_status` | `prescription_status` |
| `encounter_date` | `encounter_datetime` |

**Rule:** Read the route handler (SQL column aliases) before writing TypeScript interfaces. Don't guess.

---

### 8.3 SVG Data Visualisation Recipes

#### Donut Chart (full circle, N segments)
```
C = 2 * π * r
Each segment: strokeDasharray="${segLen} ${C}", strokeDashoffset="${C * 0.25 - offset}"
Rotate each segment: rotate(cumulativePct * 360, cx, cy)
```
The `C * 0.25` offset starts the first segment at 12 o'clock (top). Add each previous segment's length to `offset` to chain them.

#### Arc Gauge (semicircle, 9 o'clock → 3 o'clock)
```
r = 36, C = 2πr ≈ 226, C/2 ≈ 113
Center: cx=50, cy=60 in viewBox="0 0 100 65" (bottom half clipped by viewBox height)
Track:  strokeDasharray="${C/2} ${C/2}", transform="rotate(-180 50 60)"
Value:  strokeDasharray="${pct * C/2 - 3} ${C}", transform="rotate(-180 50 60)"
```
The `-3` on the value arc creates a small gap at the ends for visual polish. The `rotate(-180)` starts the arc at the left (9 o'clock) and fills clockwise to the right (3 o'clock).

---

### 8.4 Layout Patterns

#### Full-page split layout escaping AppShell padding
AppShell wraps content in `<div class="p-6">`. To create flush edge-to-edge panels (like the Measures 2-column layout):
```tsx
<div className="flex h-[calc(100vh-7.5rem)] -m-6 overflow-hidden">
```
`-m-6` cancels the parent's `p-6`. `7.5rem` = topbar height (56px = 3.5rem) + padding (1rem top + 1rem bottom = 2rem + some fudge). Adjust if topbar height changes.

#### Flex-based timeline (no absolute positioning)
Each event row has a left "node column" using flex-col:
```tsx
<div className="flex flex-col items-center flex-shrink-0">
  <div className="w-[11px] h-[11px] rounded-full bg-teal" />         {/* node dot */}
  {notLast && <div className="w-px flex-1 min-h-[16px] bg-edge/25" />} {/* spine */}
</div>
<div className="flex-1 pb-4">…content…</div>
```
`flex-1 min-h-[16px]` on the spine automatically fills the height between adjacent nodes regardless of content height. Much simpler than `::before` pseudo-element tricks.

#### Left border without layout disruption
`border-l-*` interacts with Tailwind's `border` shorthand (resets all sides). Use `box-shadow` instead:
```tsx
style={{ boxShadow: 'inset 4px 0 0 #E8394A' }}  // 4px crimson left border
style={{ boxShadow: 'inset 4px 0 0 #E8394A, 0 0 16px rgba(232,57,74,0.08)' }}  // + glow
```
For hover-only accents where layout must not shift, pre-allocate space with a transparent border:
```tsx
className="border-l-2 border-l-transparent hover:border-l-teal"
```

---

### 8.5 CSS Custom Properties for Animated Bars

Progress bars with staggered `fill` animations use CSS custom properties passed via React's inline `style`:
```tsx
<div
  className="progress-teal"
  style={{
    '--bar-width': `${pct}%`,
    '--bar-delay': '120ms',
  } as React.CSSProperties}
/>
```
The `as React.CSSProperties` cast is required because TypeScript doesn't know about custom property keys. The animation reads these in `globals.css`:
```css
.progress-teal {
  @apply progress-bar bg-teal;
  animation: bar-fill 0.6s ease-out var(--bar-delay, 0ms) both;
}
@keyframes bar-fill {
  from { width: 0 }
  to   { width: var(--bar-width, 0%) }
}
```

---

### 8.6 TanStack Query v5 — Per-Row Loading via `variables`

`useMutation` exposes a `variables` field that holds the argument from the most recent `mutate()` call while the mutation is pending. Use it for per-item loading states without extra `useState`:
```typescript
const { mutate: resolve, variables: resolvingId } = useMutation({
  mutationFn: (id: string) => api.patch(`/care-gaps/${id}`),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['care-gaps'] }),
});

// In the row:
<button disabled={resolvingId === gap.id}>
  {resolvingId === gap.id ? <Spinner /> : 'Resolve'}
</button>
```
This pattern scales cleanly to any list with per-item mutations (alerts, care gaps, etc.).

---

### 8.7 CSS Keyframes in React JSX

For complex animations that can't be expressed with Tailwind utilities (multi-stop keyframes, infinite orbits), embed a `<style>` tag directly inside the component JSX. React renders it normally:
```tsx
<style>{`
  @keyframes my-animation {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50%       { transform: translate(20px, -10px) scale(1.05); }
  }
  .my-element { animation: my-animation 20s ease-in-out infinite; }
`}</style>
```
Used in `LoginPage.tsx` for the three background blob/grid animations. Prefix class names with the page/component name (e.g. `login-blob-1`) to avoid collisions.

---

### 8.8 Styling Decisions & Rationale

| Decision | Why |
|----------|-----|
| `box-shadow: inset 4px 0 0` for severity borders on alert cards | `border-l-4` combined with existing `border` class resets to `border-l-4 border-transparent` — box-shadow avoids this conflict entirely |
| `opacity-70` on inactive/resolved cards rather than dimming individual elements | Single opacity on the wrapper is cleaner and more consistent than hunting down each text/icon element |
| `line-clamp-2` on alert body text | Prevents extreme-length clinical text from blowing out the card grid |
| `font-data tabular-nums` on all numeric data (MRN, counts, timestamps) | Fira Code + `font-variant-numeric: tabular-nums` prevents layout jitter when numbers change |
| `live-dot` (pulseDot animation) on Alerts page header | Communicates real-time nature of the feed without requiring explanation |
| `criticalCount` banner above alert list | Clinicians need to see critical issues even when scrolled down into acknowledged items |
| `useMemo` on patient/measure search filter | API returns up to 50 patients/all measures per request; client-side filtering prevents re-fetches on every keystroke |
| `-m-6` escape for Measures page | The 2-column master/detail layout needs the full viewport height; fighting the AppShell wrapper is cleaner than restructuring the route |

---

### 8.9 TipTap Rich Text Editor — Clinical Note Integration

**Setup:** 8 TipTap packages already in `apps/web/package.json`: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-highlight`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-task-item`, `@tiptap/extension-task-list`, `@tiptap/extension-typography`.

**External value sync:** AI-generated content must be pushed into the editor from outside. Use `useEffect` watching the `value` prop:
```tsx
useEffect(() => {
  if (editor && value !== editor.getHTML()) {
    editor.commands.setContent(value || '<p></p>');
  }
}, [value, editor]);
```
Without the `value !== editor.getHTML()` guard, this creates an infinite loop (setContent triggers onUpdate → onChange → new value → setContent → ...).

**Read-only toggle:** When note status changes (draft → finalized), toggle editor editability:
```tsx
useEffect(() => {
  if (editor) editor.setEditable(!readOnly);
}, [readOnly, editor]);
```

**Dark theme prose classes:** TipTap renders into a `div.ProseMirror`. Style it via `editorProps.attributes.class`:
```tsx
editorProps: {
  attributes: {
    class: [
      'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[120px] px-4 py-3',
      'prose-headings:text-bright prose-headings:font-semibold',
      'prose-p:my-2 prose-p:leading-relaxed prose-p:text-dim',
      'prose-a:text-teal prose-a:no-underline hover:prose-a:underline',
      'prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5',
      'prose-li:my-0.5 prose-li:text-dim',
      'prose-blockquote:border-l-2 prose-blockquote:border-teal/40 prose-blockquote:pl-3',
      'prose-code:rounded prose-code:bg-edge/40 prose-code:px-1 prose-code:text-xs',
    ].join(' '),
  },
}
```
This integrates cleanly with Clinical Obsidian tokens without any custom CSS file.

**Auto-save debounce:** Use `useRef` for the timer to avoid stale closures:
```tsx
const saveTimer = useRef<ReturnType<typeof setTimeout>>();
const handleContentChange = (section: string, html: string) => {
  setSections(prev => ({ ...prev, [section]: html }));
  clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(() => updateNote.mutate({ noteId, data: { [section]: html } }), 3000);
};
```

---

### 8.10 SQL `Row[]` Typing — The Tagged Template Trap

**Problem:** The `sql` tagged template from `@medgnosis/db` returns `Row[]` type. Explicit type annotations on `.map()` callbacks conflict:
```typescript
// FAILS: TS2345 — '(c: {condition_name: string}) => string' not assignable to '(value: Row) => string'
conditions.map((c: { condition_name: string }) => c.condition_name)
```

**Fix:** Cast the array to `Record<string, unknown>[]` and access properties without parameter annotations:
```typescript
type R = Record<string, unknown>;
(conditions as R[]).map((c) => `${c.condition_name} (${c.condition_code})`)
```

This pattern is needed wherever SQL query results are processed in route handlers with `.map()`, `.filter()`, or `.reduce()`.

---

### 8.11 Phase 11 — What Still Needs Doing

The following were deferred from the implementation phases. Priority order for Phase 11:

1. **Audit remaining legacy classes** — Search all TSX for `gray-*`, `text-light-*`, `text-dark-*`, `dark:*`, `panel-analytics`, `panel-base`, `accent-primary`. Replace with design tokens.
2. **Shared `PatientAvatar` component** — The same initials/color pattern is duplicated in DashboardPage, PatientsPage, PatientDetailPage, CareListsPage, GlobalSearch. Extract to `src/components/PatientAvatar.tsx`.
3. **Shared `Pagination` component** — PatientsPage has the full implementation. Extract `getPaginationRange()` + the pagination bar to `src/components/Pagination.tsx`.
4. **Wire SettingsPage toggles to API** — Currently all state is local `useState`. Needs PATCH `/users/me/preferences` or similar endpoint.
5. **Settings profile save** — The "Save changes" button in ProfileSection has no `onSubmit` handler wired yet.
6. **CareListsPage resolve flow** — PATCH endpoint path needs verification against actual route. Check `apps/api/src/routes/care-gaps/index.ts`.
7. **Keyboard shortcut ⌘K** — GlobalSearch opens via the topbar button; also needs `useEffect` listener for `Cmd+K` / `Ctrl+K`.

---

## Appendix A — File Change Map

| File | Type of Change | Phase |
|------|---------------|-------|
| `apps/web/index.html` | Add Google Fonts link | 1.1 |
| `apps/web/tailwind.config.ts` | Full replacement of theme | 1.2 |
| `apps/web/src/styles/globals.css` | Full replacement of component classes | 1.3 |
| `apps/web/src/components/AppShell.tsx` | Full rewrite | 2.1 |
| `apps/web/src/components/GlobalSearch.tsx` | Redesign | 2.2 |
| `apps/web/src/pages/DashboardPage.tsx` | New layout + Recharts | 3 |
| `apps/web/src/pages/PatientsPage.tsx` | Table + pagination redesign | 4 |
| `apps/web/src/pages/PatientDetailPage.tsx` | Timeline + gauge | 5 |
| `apps/web/src/pages/MeasuresPage.tsx` | Visual refresh + gauge | 6 |
| `apps/web/src/pages/CareListsPage.tsx` | Priority grouping | 7 |
| `apps/web/src/pages/AlertsPage.tsx` | Severity treatment | 8 |
| `apps/web/src/pages/LoginPage.tsx` | Background + polish | 9 |
| `apps/web/src/pages/SettingsPage.tsx` | Tab layout | 10 |
| `apps/web/src/components/PatientAvatar.tsx` | New component | 11.1 |
| `apps/web/src/components/RiskGauge.tsx` | New component | 11.2 |
| `apps/web/src/utils/time.ts` | New utility | 11.3 |
| `apps/web/src/components/Pagination.tsx` | New component | 11.5 |
| `apps/web/src/pages/EncounterNotePage.tsx` | New page — SOAP encounter note with AI Scribe | 10.3 |
| `apps/web/src/components/encounter/SOAPSectionEditor.tsx` | New component — TipTap rich text editor per SOAP section | 10.3 |
| `apps/web/src/hooks/useApi.ts` | Added 5 clinical note hooks | 10.3 |
| `apps/web/src/App.tsx` | Added `/patients/:patientId/encounter-note` route | 10.3 |
| `apps/api/src/routes/clinical-notes/index.ts` | New route module — CRUD + AI Scribe (7 endpoints) | 10.3 |
| `apps/api/src/routes/index.ts` | Registered `/clinical-notes` prefix | 10.3 |
| `apps/api/src/routes/patients/index.ts` | Added `GET /:id/notes` endpoint | 10.3 |
| `packages/shared/src/types/encounter-note.ts` | New types — ClinicalNote, ScribeRequest/Response | 10.3 |
| `packages/shared/src/schemas/index.ts` | Added 3 clinical note Zod schemas | 10.3 |
| `packages/shared/src/index.ts` | Added encounter-note type exports | 10.3 |
| `packages/db/migrations/012_clinical_notes.sql` | DDL — clinical_note table + indexes | 10.3 |
| `apps/api/src/services/patientContext.ts` | New service — shared patient context fetcher (6 SQL queries) | Abby Chat |
| `apps/web/src/components/patient/AbbyTab.tsx` | New tab — full AI chat with EHR context injection | Abby Chat |
| `apps/api/src/routes/insights/index.ts` | Enhanced — patient_id handling, context injection, aiGateMiddleware | Abby Chat |
| `apps/api/src/routes/clinical-notes/index.ts` | Refactored — scribe uses shared patientContext helper | Abby Chat |
| `apps/web/src/pages/PatientDetailPage.tsx` | Added 'abby' tab (8th tab with Sparkles icon) | Abby Chat |
| `apps/web/src/pages/DashboardPage.tsx` | Bugfix — data.reply → data.response | Abby Chat |
| `apps/web/src/hooks/useApi.ts` | Enhanced — useAiChat with history param | Abby Chat |

---

## Appendix B — Design Token Quick Reference

```
BACKGROUNDS:   void=#060A14  s0=#0C1320  s1=#111B2E  s2=#172239
BORDERS:       dim=rgba(30,68,120,0.35)  mid=rgba(30,68,120,0.65)  hi=rgba(13,217,217,0.35)
TEXT:          bright=#EDF2FF  dim=#5E7FA3  ghost=#2D4060
ACCENTS:       teal=#0DD9D9  amber=#F5A623  crimson=#E8394A  emerald=#10C981  violet=#8B5CF6
FONTS:         UI=Lexend  Data=Fira Code
RADIUS:        panel=12px  card=8px  pill=999px  btn=6px  input=6px
```

---

---

## Appendix C — API Field Reference

*Actual field names from the route handlers. Use these when writing TypeScript interfaces.*

### `GET /patients` → `ApiResponse<PatientRow[]>` + `meta`
```typescript
interface PatientRow {
  id: number;            // NOT patient_id
  first_name: string;
  last_name: string;
  mrn: string;           // Fira Code display
  date_of_birth: string; // ISO date string
  gender: string;        // 'M' | 'F' | 'U'
}
// meta: { page, per_page, total, total_pages }
```

### `GET /patients/:id` → `ApiResponse<PatientDetail>`
```typescript
interface PatientDetail {
  id: number;
  first_name: string;    last_name: string;
  mrn: string;           date_of_birth: string;
  gender: string;        primary_phone?: string;
  email?: string;
  conditions: { id: number; code: string; name: string; status: string; onset_date?: string }[];
  encounters:  { id: number; date: string; type: string; body?: string }[];
  observations:{ id: number; name: string; value: string; unit: string; date: string }[];
  care_gaps:   { id: number; measure: string; status: string; identified_date?: string; resolved_date?: string }[];
}
// NOTE: no risk_score field in this endpoint
```

### `GET /measures` → `ApiResponse<MeasureRow[]>`
```typescript
interface MeasureRow {
  id: number;
  title: string;
  code: string;          // CMS ID in Fira Code
  description: string;
  active_ind: string;
}
```

### `GET /measures/:id` → `ApiResponse<MeasureDetail>`
```typescript
interface MeasureDetail extends MeasureRow {
  population: {
    total_patients: number;
    eligible: number;    // patients meeting denominator criteria
    compliant: number;   // patients meeting numerator criteria
  };
}
// compliance rate = compliant / eligible
```

### `GET /care-gaps` → `ApiResponse<CareGap[]>`
```typescript
interface CareGap {
  id: number;
  patient_id: number;
  patient_name: string;
  measure: string;       // NOT measure_id
  status: string;        // 'open' | 'identified' | 'in_progress' | 'resolved' | 'closed'
  identified_date?: string;  // NOT due_date
  resolved_date?: string;
  active_ind: string;
}
// isOpen: status is 'open' | 'identified' | 'in_progress'
```

### `GET /alerts` → `ApiResponse<Alert[]>`
```typescript
interface Alert {
  id: string;            // UUID — NOT a number
  patient_id: number | null;
  alert_type: string;
  rule_key: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  body: string | null;   // NOT message
  acknowledged_at: string | null;  // null = unread; NOT a boolean field
  auto_resolved: boolean;
  created_at: string;
}
// isActive = !acknowledged_at && !auto_resolved
// filter unread: GET /alerts?acknowledged=false
```

### `GET /dashboard` → `ApiResponse<DashboardData>`
```typescript
interface DashboardData {
  stats: {
    total_patients: number;
    high_risk_patients: number;
    open_care_gaps: number;
    // possibly more fields
  };
  analytics: {
    risk_distribution: { label: string; count: number; pct: number }[];
    care_gap_breakdown: { label: string; count: number; pct: number }[];
    recent_encounters: { patient_id: number; patient_name: string; encounter_type: string; encounter_date: string }[];
  };
}
```

### `POST /clinical-notes` → `ApiResponse<ClinicalNote>`
```typescript
// Request body:
interface CreateNoteRequest {
  patient_id: number;
  visit_type?: string;    // 'followup' | 'initial' | 'urgent' | 'telehealth'
  encounter_id?: number;
  chief_complaint?: string;
}
```

### `GET /clinical-notes/:noteId` → `ApiResponse<ClinicalNote>`
```typescript
interface ClinicalNote {
  note_id: string;         // UUID
  patient_id: number;
  author_user_id: string;  // UUID (matches app_users.id)
  author_name: string;     // JOINed from app_users
  encounter_id?: number;
  visit_type: string;
  status: string;          // 'draft' | 'finalized' | 'amended'
  chief_complaint?: string;
  subjective?: string;     // HTML content
  objective?: string;      // HTML content
  assessment?: string;     // HTML content
  plan_text?: string;      // HTML content
  ai_generated?: {         // JSONB — AI provenance
    sections: string[];
    model: string;
    generated_at: string;
  };
  finalized_at?: string;
  amended_at?: string;
  amendment_reason?: string;
  created_date: string;
  updated_date: string;
}
```

### `PATCH /clinical-notes/:noteId` — Update SOAP sections (auto-save)
```typescript
// Request body (all fields optional):
interface UpdateNoteRequest {
  chief_complaint?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan_text?: string;
  visit_type?: string;
}
// Only draft notes can be updated. Returns 400 if finalized.
```

### `POST /clinical-notes/:noteId/finalize` — Lock note
```typescript
// No body. Sets finalized_at = NOW(), status = 'finalized'.
// Returns 400 if note is already finalized.
```

### `POST /clinical-notes/scribe` — AI Scribe (Ollama/MedGemma)
```typescript
// Request body:
interface ScribeRequest {
  patient_id: number;
  visit_type: string;
  sections: string[];       // ['subjective', 'objective', 'assessment', 'plan_text'] — min 1
  chief_complaint?: string;
  existing_content?: Record<string, string>;  // preserve existing sections
}
// Response:
interface ScribeResponse {
  sections: Record<string, string>;  // HTML content per section
  model: string;                     // e.g. 'gemma:7b'
  provider: string;                  // e.g. 'ollama'
}
// Requires AI consent (aiGateMiddleware). Returns 403 if AI_CONSENT_REQUIRED.
```

### `GET /patients/:id/notes` → `ApiResponse<ClinicalNote[]>`
```typescript
// Optional query param: ?status=draft|finalized|amended
// Returns notes ordered by created_date DESC
// Each note includes author_name JOINed from app_users
```

### Authentication
```typescript
// POST /auth/login → ApiResponse<{ user: User; tokens: AuthTokens }>
// GET  /auth/me    → ApiResponse<User>
// POST /auth/logout
interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  // role is not on the User type — cast as (user as { role?: string })?.role
}
interface AuthTokens {
  access_token: string;
  refresh_token: string;
}
```

---

*This document is the authoritative source for the Medgnosis Clinical Obsidian redesign.
Update the Progress Log and check off todos as implementation proceeds.*
