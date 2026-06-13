# Light Mode + UX Density/Readability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Auto/Dark/Light theme system, tune both themes for WCAG-AA readability, and compact the whole app for clinical density — without breaking the existing palette switcher or protected auth surfaces.

**Architecture:** Remap Tailwind's named color tokens to channel-format CSS variables (`rgb(var(--x) / <alpha-value>)`) so all 800+ existing token usages become theme-aware for free. A `[data-theme]` attribute on `<html>` switches between `tokens-dark.css` (`:root` baseline) and a new `tokens-light.css`. The Zustand theme store gains an `auto|dark|light` axis orthogonal to the existing 5-accent palette axis. Density/readability land mostly in shared `globals.css`, with per-surface className edits where they can't be centralized.

**Tech Stack:** React 19, TypeScript (strict), Vite 6, Tailwind v3.4, Zustand, Vitest + jsdom, Recharts.

**Spec:** `docs/superpowers/specs/2026-06-13-light-mode-ux-density-design.md`

**Verification reality:** This is theming/CSS/className work. The real gate after every task is `npx tsc --noEmit` **and** `npx vite build` (vite is stricter), plus a visual smoke check in both themes. Only the theme store has pure logic worth unit-testing — it gets real Vitest TDD. Run all build commands from `apps/web/`.

---

## Phase 1 — Theme plumbing (the linchpin)

Outcome: light mode goes live for every already-tokenized surface; topbar + Settings toggles work; choice persists; no FOUC.

### Task 1.1: Convert dark tokens to channel format + adjust dim/ghost

**Files:**
- Modify: `apps/web/src/styles/themes/tokens-dark.css`

- [ ] **Step 1: Rewrite `tokens-dark.css` as the `:root` baseline using RGB channels.** Replace every hex value with space-separated RGB channels, keep the same variable *names* the rest of the system already uses, and add the surface/text channel vars plus `--accent-fg`. Adjust `dim` and `ghost` upward (spec §4.4). Keep the `rgba()`-style composite vars (`--primary-bg`, gradients) but rebuild them from channels.

```css
/* tokens-dark.css — Dark baseline (Clinical Obsidian). Channel format: "R G B". */
:root {
  color-scheme: dark;

  /* ── Surface channels ── */
  --void: 6 10 20;       /* #060A14 */
  --s0:   12 19 32;      /* #0C1320 */
  --s1:   17 27 46;      /* #111B2E */
  --s2:   23 34 57;      /* #172239 */
  --edge: 30 68 120;     /* #1E4478 */

  /* ── Text channels (dim/ghost lifted for AA) ── */
  --bright: 237 242 255; /* #EDF2FF */
  --dim:    122 152 188; /* #7A98BC  (was #5E7FA3) */
  --ghost:  72 97 138;   /* #48618A  (was #2D4060) */

  /* ── Semantic accent channels ── */
  --teal: 13 217 217; --teal-dark: 11 181 181;
  --amber: 245 166 35;
  --crimson: 232 57 74;
  --emerald: 16 201 129;
  --violet: 139 92 246;
  --info: 75 158 219;
  --gold: 242 203 77;

  /* Text shown on top of a SOLID accent fill (buttons/badges) */
  --accent-fg: 6 10 20;  /* near-black on bright accents */

  /* ── Surface aliases used by JS/inline (keep names, derive from channels) ── */
  --surface-darkest: rgb(3 8 16);
  --surface-base:    rgb(var(--void));
  --surface-raised:  rgb(var(--s0));
  --surface-overlay: rgb(var(--s1));
  --surface-elevated:rgb(var(--s2));
  --sidebar-bg:       #040912;
  --sidebar-bg-light: rgb(var(--void));

  /* ── Primary/accent (palette engine overrides these at runtime) ── */
  --primary: rgb(var(--teal));
  --primary-light: #3FE5E5;
  --primary-dark: rgb(var(--teal-dark));
  --primary-bg:     rgb(var(--teal) / 0.08);
  --primary-border: rgb(var(--teal) / 0.25);
  --primary-glow:   rgb(var(--teal) / 0.20);
  --accent: rgb(var(--amber));
  --accent-light: #F9C168;
  --accent-dark: #D4891E;
  --accent-bg:  rgb(var(--amber) / 0.10);
  --accent-glow: rgb(var(--amber) / 0.18);

  /* ── Text hierarchy aliases (legacy consumers) ── */
  --text-primary:   rgb(var(--bright));
  --text-secondary: rgb(var(--dim));
  --text-muted:     rgb(var(--ghost));
  --text-ghost:     rgb(var(--ghost));

  /* ── Borders ── */
  --border-default: rgb(var(--edge) / 0.45);
  --border-subtle:  rgb(var(--edge) / 0.25);
  --border-hover:   rgb(var(--teal) / 0.30);
  --border-focus:   rgb(var(--teal) / 0.60);

  /* ── Theme-aware effects (so light can override) ── */
  --shadow-panel: 0 1px 3px rgb(0 0 0 / 0.5), 0 4px 20px rgb(0 0 0 / 0.4), inset 0 1px 0 rgb(255 255 255 / 0.05);
  --shadow-panel-hover: 0 4px 16px rgb(0 0 0 / 0.6), 0 12px 40px rgb(0 0 0 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.07);
  --gradient-panel:        linear-gradient(135deg, rgb(255 255 255 / 0.022) 0%, rgb(255 255 255 / 0.004) 100%);
  --gradient-panel-raised: linear-gradient(135deg, rgb(255 255 255 / 0.035) 0%, rgb(255 255 255 / 0.008) 100%);
  --gradient-panel-inset:  linear-gradient(135deg, rgb(0 0 0 / 0.12) 0%, rgb(0 0 0 / 0.04) 100%);
  --skeleton-base:  rgb(var(--s1));
  --skeleton-mid:   rgb(var(--edge) / 0.6);
  --skeleton-flash: rgb(var(--teal) / 0.08);
  --scrollbar-thumb: rgb(var(--edge) / 0.5);
  --scrollbar-thumb-hover: rgb(var(--edge) / 0.8);
  --selection-bg: rgb(var(--teal) / 0.20);
  --overlay-backdrop: rgb(6 10 20 / 0.85);

  /* ── Semantic composite vars ── */
  --critical: rgb(var(--crimson)); --critical-bg: rgb(var(--crimson) / 0.12); --critical-border: rgb(var(--crimson) / 0.28);
  --warning:  rgb(var(--amber));   --warning-bg:  rgb(var(--amber) / 0.12);
  --success:  rgb(var(--emerald)); --success-bg:  rgb(var(--emerald) / 0.12);
  --info-color: rgb(var(--info));  --info-bg:     rgb(var(--info) / 0.12);
  --violet-color: rgb(var(--violet)); --violet-bg: rgb(var(--violet) / 0.12);

  /* ── Chart tokens ── */
  --chart-grid:  rgb(var(--edge) / 0.25);
  --chart-axis:  rgb(var(--dim));
  --chart-label: rgb(var(--dim));
  --chart-track: rgb(var(--s2));
}
```

- [ ] **Step 2: Verify the app still builds and looks ~identical in dark.**

Run (from `apps/web/`): `npx tsc --noEmit && npx vite build`
Expected: build succeeds. Dark theme renders the same except `dim`/`ghost` text is slightly brighter.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/styles/themes/tokens-dark.css
git commit -m "refactor(theme): channel-format dark tokens + AA dim/ghost lift"
```

### Task 1.2: Point Tailwind tokens at the channel vars

**Files:**
- Modify: `apps/web/tailwind.config.ts` (colors block, lines ~23-97)

- [ ] **Step 1: Replace the hardcoded hex `colors` with `rgb(var(--x) / <alpha-value>)`.** Keep the legacy `gray/dark/light/accent` alias keys but point them at the same channel vars so unmigrated consumers theme too.

```ts
colors: {
  void:    'rgb(var(--void) / <alpha-value>)',
  s0:      'rgb(var(--s0) / <alpha-value>)',
  s1:      'rgb(var(--s1) / <alpha-value>)',
  s2:      'rgb(var(--s2) / <alpha-value>)',
  edge:    'rgb(var(--edge) / <alpha-value>)',
  bright:  'rgb(var(--bright) / <alpha-value>)',
  dim:     'rgb(var(--dim) / <alpha-value>)',
  ghost:   'rgb(var(--ghost) / <alpha-value>)',
  'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
  teal:    { DEFAULT: 'rgb(var(--teal) / <alpha-value>)', dark: 'rgb(var(--teal-dark) / <alpha-value>)' },
  amber:   'rgb(var(--amber) / <alpha-value>)',
  crimson: 'rgb(var(--crimson) / <alpha-value>)',
  emerald: 'rgb(var(--emerald) / <alpha-value>)',
  violet:  'rgb(var(--violet) / <alpha-value>)',
  info:    'rgb(var(--info) / <alpha-value>)',
  gold:    'rgb(var(--gold) / <alpha-value>)',
  dark:  { primary: 'rgb(var(--s0))', secondary: 'rgb(var(--s1))', card: 'rgb(var(--s1))', border: 'rgb(var(--edge))',
           text: { primary: 'rgb(var(--bright))', secondary: 'rgb(var(--dim))' } },
  light: { primary: 'rgb(var(--s0))', secondary: 'rgb(var(--s1))', card: 'rgb(var(--s2))', border: 'rgb(var(--edge))',
           text: { primary: 'rgb(var(--bright))', secondary: 'rgb(var(--dim))' } },
  accent: { primary: 'rgb(var(--teal))', success: 'rgb(var(--emerald))', warning: 'rgb(var(--amber))', error: 'rgb(var(--crimson))' },
  gray: { 50:'rgb(var(--s0))',100:'rgb(var(--s1))',200:'rgb(var(--s2))',300:'rgb(var(--edge))',
          400:'rgb(var(--dim))',500:'rgb(var(--dim))',600:'rgb(var(--dim))',700:'rgb(var(--s1))',800:'rgb(var(--s0))',900:'rgb(var(--void))' },
},
```

- [ ] **Step 2: Build and confirm opacity modifiers still work.**

Run: `npx tsc --noEmit && npx vite build`
Expected: success. Spot-check that `border-edge/35`, `bg-teal/10`, `bg-s1` render (no transparent/black surfaces).

- [ ] **Step 3: Commit.**

```bash
git add apps/web/tailwind.config.ts
git commit -m "refactor(theme): Tailwind tokens resolve to channel CSS vars"
```

### Task 1.3: Add `tokens-light.css` + wire effects through vars in globals.css

**Files:**
- Create: `apps/web/src/styles/themes/tokens-light.css`
- Modify: `apps/web/src/styles/globals.css` (imports + the hardcoded rgba in `.surface`, `.skeleton`, `.scrollbar-thin`, `::selection`, `.overlay-backdrop`, `.gauge-track`, root `color-scheme`)

- [ ] **Step 1: Create `tokens-light.css` (Soft Clinical), overriding only what changes.**

```css
/* tokens-light.css — Soft Clinical light theme. Overrides dark baseline. */
[data-theme="light"] {
  color-scheme: light;

  --void: 244 246 251;   /* #F4F6FB page */
  --s0:   255 255 255;   /* #FFFFFF cards/inputs */
  --s1:   237 241 247;   /* #EDF1F7 hover/raised */
  --s2:   224 230 240;   /* #E0E6F0 chips/elevated */
  --edge: 211 220 232;   /* #D3DCE8 borders */

  --bright: 22 36 59;    /* #16243B ink ~12:1 */
  --dim:    74 98 126;   /* #4A627E ~6:1 */
  --ghost:  118 132 156; /* #76849C ~3.6:1 chrome */

  --teal: 11 122 122; --teal-dark: 9 104 104;  /* #0B7A7A */
  --amber: 181 121 15;     /* #B5790F */
  --crimson: 196 40 58;    /* #C4283A */
  --emerald: 10 125 84;    /* #0A7D54 */
  --violet: 109 63 212;    /* #6D3FD4 */
  --info: 45 111 168;      /* #2D6FA8 */
  --gold: 154 110 18;      /* #9A6E12 */

  --accent-fg: 255 255 255; /* white on solid accents */

  --surface-darkest: rgb(231 235 242);
  --sidebar-bg:       rgb(var(--s0));
  --sidebar-bg-light: rgb(var(--void));

  /* Softer, grey depth on light */
  --shadow-panel: 0 1px 2px rgb(15 23 42 / 0.06), 0 2px 8px rgb(15 23 42 / 0.08);
  --shadow-panel-hover: 0 4px 12px rgb(15 23 42 / 0.10), 0 8px 24px rgb(15 23 42 / 0.12);
  --gradient-panel: none;
  --gradient-panel-raised: none;
  --gradient-panel-inset: linear-gradient(135deg, rgb(15 23 42 / 0.04) 0%, transparent 100%);
  --skeleton-base: rgb(var(--s1));
  --skeleton-mid:  rgb(var(--s2));
  --skeleton-flash: rgb(var(--teal) / 0.10);
  --scrollbar-thumb: rgb(15 23 42 / 0.2);
  --scrollbar-thumb-hover: rgb(15 23 42 / 0.35);
  --selection-bg: rgb(var(--teal) / 0.18);
  --overlay-backdrop: rgb(15 23 42 / 0.35);
}
```

- [ ] **Step 2: Import the light tokens in `globals.css` (after dark, before tailwind).**

```css
@import './themes/tokens-base.css';
@import './themes/tokens-dark.css';
@import './themes/tokens-light.css';
```

- [ ] **Step 3: Replace the dark-only hardcoded effects in `globals.css` with the vars.** Remove `color-scheme: dark` from the `@layer base :root` block (now set per-theme). In `.surface`/`.surface-interactive` use `box-shadow: var(--shadow-panel)` / `var(--shadow-panel-hover)`. In `.skeleton` rebuild the gradient from `--skeleton-base/-mid/-flash`. In `.scrollbar-thin` thumb use `var(--scrollbar-thumb[-hover])`. In `::selection` use `background: var(--selection-bg)`. In `.overlay-backdrop`/`.modal-backdrop` use `background: var(--overlay-backdrop)`. In `.gauge-track` use `stroke: var(--chart-track)`.

- [ ] **Step 4: Build, then manually flip the theme to verify light works.**

Run: `npx tsc --noEmit && npx vite build`
Then `npx vite preview`, open the app, and in devtools run `document.documentElement.dataset.theme='light'`.
Expected: the whole app flips to the Soft Clinical light theme; text legible; cards white on `#F4F6FB`.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/styles/themes/tokens-light.css apps/web/src/styles/globals.css
git commit -m "feat(theme): add Soft Clinical light tokens; route effects through theme vars"
```

### Task 1.4: Theme store — auto/dark/light (TDD)

**Files:**
- Modify: `apps/web/src/styles/palettes.ts` (theme-aware `applyPalette`)
- Modify: `apps/web/src/stores/theme.ts`
- Create: `apps/web/src/stores/theme.test.ts`

- [ ] **Step 1: Write failing tests for theme resolution + persistence.**

```ts
// apps/web/src/stores/theme.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useThemeStore } from './theme.js';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  // jsdom has no matchMedia — stub it (default: OS prefers dark)
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('dark'),
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
  }));
});

describe('theme store', () => {
  it('defaults to auto and resolves from prefers-color-scheme', () => {
    useThemeStore.getState().initFromStorage();
    expect(useThemeStore.getState().theme).toBe('auto');
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('setTheme("light") persists and sets data-theme', () => {
    useThemeStore.getState().setTheme('light');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('mg_theme')).toBe('light');
  });

  it('toggleTheme flips resolved dark<->light and pins an explicit mode', () => {
    useThemeStore.getState().setTheme('dark');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('initFromStorage restores a saved explicit theme', () => {
    localStorage.setItem('mg_theme', 'light');
    useThemeStore.getState().initFromStorage();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
  });
});
```

- [ ] **Step 2: Run tests; confirm they fail.**

Run: `npx vitest run src/stores/theme.test.ts`
Expected: FAIL (`theme`, `resolvedTheme`, `setTheme`, `toggleTheme` don't exist).

- [ ] **Step 3: Make `applyPalette` theme-aware in `palettes.ts`.** Add an optional `lightVariables` field to the `Palette` interface and to each non-default palette (deepened primary/accent for white — e.g. arctic light `--primary: #0E7C95`, etc.; `clinical-teal` light derives from `--teal` token so leave `{}`). Change the signature to `applyPalette(id: string, resolvedTheme: 'dark' | 'light')` and apply `resolvedTheme === 'light' ? palette.lightVariables ?? palette.variables : palette.variables`.

```ts
export interface Palette { id: string; name: string; description: string;
  primary: string; accent: string;
  variables: Record<string, string>;
  lightVariables?: Record<string, string>; }

export function applyPalette(id: string, resolvedTheme: 'dark' | 'light'): void {
  const palette = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
  const style = document.documentElement.style;
  for (const v of MANAGED_VARIABLES) style.removeProperty(v);
  const vars = resolvedTheme === 'light' ? (palette.lightVariables ?? palette.variables) : palette.variables;
  for (const [k, v] of Object.entries(vars)) style.setProperty(k, v);
}
```

- [ ] **Step 4: Rewrite `theme.ts` with the auto/dark/light axis.**

```ts
import { create } from 'zustand';
import { applyPalette } from '../styles/palettes.js';

type ThemeMode = 'auto' | 'dark' | 'light';
type Resolved = 'dark' | 'light';
const THEME_KEY = 'mg_theme';
const PALETTE_KEY = 'mg_palette';
const DEFAULT_PALETTE = 'clinical-teal';

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
const resolve = (m: ThemeMode): Resolved => m === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : m;

interface ThemeStore {
  theme: ThemeMode; resolvedTheme: Resolved; paletteId: string;
  initFromStorage(): void; setTheme(m: ThemeMode): void; toggleTheme(): void; setPalette(id: string): void;
}

function apply(resolved: Resolved, paletteId: string) {
  document.documentElement.dataset.theme = resolved;
  applyPalette(paletteId, resolved);
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'auto', resolvedTheme: 'dark', paletteId: DEFAULT_PALETTE,

  initFromStorage() {
    const theme = (localStorage.getItem(THEME_KEY) as ThemeMode) ?? 'auto';
    const paletteId = localStorage.getItem(PALETTE_KEY) ?? DEFAULT_PALETTE;
    const resolvedTheme = resolve(theme);
    apply(resolvedTheme, paletteId);
    set({ theme, resolvedTheme, paletteId });
    if (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (get().theme !== 'auto') return;
        const r = resolve('auto'); apply(r, get().paletteId); set({ resolvedTheme: r });
      });
    }
  },
  setTheme(theme) {
    const resolvedTheme = resolve(theme);
    apply(resolvedTheme, get().paletteId);
    localStorage.setItem(THEME_KEY, theme);
    set({ theme, resolvedTheme });
  },
  toggleTheme() { get().setTheme(get().resolvedTheme === 'dark' ? 'light' : 'dark'); },
  setPalette(paletteId) {
    apply(get().resolvedTheme, paletteId);
    localStorage.setItem(PALETTE_KEY, paletteId);
    set({ paletteId });
  },
}));
```

- [ ] **Step 5: Run tests; confirm pass; then full build.**

Run: `npx vitest run src/stores/theme.test.ts && npx tsc --noEmit && npx vite build`
Expected: tests PASS, build succeeds.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/stores/theme.ts apps/web/src/stores/theme.test.ts apps/web/src/styles/palettes.ts
git commit -m "feat(theme): auto/dark/light store with OS-follow + theme-aware palettes"
```

### Task 1.5: Topbar toggle + Settings segmented control

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx` (topbar, between `<WsIndicator />` (line ~406) and the Alerts `<Link>`; import `Sun`/`Moon` from lucide)
- Modify: `apps/web/src/pages/SettingsPage.tsx` (`PaletteSection`, add Theme control above the palette grid)

- [ ] **Step 1: Add the topbar quick-toggle in `AppShell.tsx`.**

```tsx
// imports: add Sun, Moon to the lucide-react import; add:
import { useThemeStore } from '../stores/theme.js';
// inside the component body:
const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
const toggleTheme = useThemeStore((s) => s.toggleTheme);
// in the topbar, before the Alerts <Link>:
<button
  onClick={toggleTheme}
  className="p-2 rounded-card text-dim hover:text-bright hover:bg-s1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"
  aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
  title={resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}
>
  {resolvedTheme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
</button>
```

- [ ] **Step 2: Add the `Theme: Auto / Dark / Light` segmented control to `PaletteSection`** (above the existing palette `surface`), using `theme`/`setTheme` from the store.

```tsx
const theme = useThemeStore((s) => s.theme);
const setTheme = useThemeStore((s) => s.setTheme);
// ...
<div className="surface p-5">
  <h3 className="text-xs font-semibold text-bright uppercase tracking-widest mb-4">Theme</h3>
  <div className="inline-flex rounded-card border border-edge/35 overflow-hidden" role="group" aria-label="Theme mode">
    {(['auto','dark','light'] as const).map((m) => (
      <button key={m} onClick={() => setTheme(m)} aria-pressed={theme === m}
        className={['px-4 py-2 text-sm font-ui capitalize transition-colors duration-150',
          theme === m ? 'bg-teal/10 text-teal' : 'text-dim hover:bg-s2 hover:text-bright'].join(' ')}>
        {m}
      </button>
    ))}
  </div>
  <p className="text-xs text-ghost mt-3">Auto follows your operating system. Saved locally.</p>
</div>
```

- [ ] **Step 3: Build + manual smoke.**

Run: `npx tsc --noEmit && npx vite build`
Then preview: click the topbar sun/moon → app flips instantly; Settings → Appearance shows Auto/Dark/Light + palette; reload preserves choice; toggle a non-teal palette in light and confirm accents are readable.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/components/AppShell.tsx apps/web/src/pages/SettingsPage.tsx
git commit -m "feat(theme): topbar quick-toggle + Settings theme control"
```

**☑ Phase 1 checkpoint:** Light mode live for all tokenized UI. Report before Phase 2. Known remaining: charts/gauges/inline-hex still dark-only (Phase 2).

---

## Phase 2 — Inline-hex cleanup (un-stick the 12 files)

Outcome: charts, gauges, donut, SVG tracks, section accents, and accent-button text all theme correctly.

### Task 2.1: Chart + gauge color helpers → tokens

**Files (modify):** `components/patient/ObservationTrendChart.tsx`, `components/patient/OverviewTab.tsx`, `pages/MeasuresPage.tsx`, `pages/BundlesPage.tsx`, `pages/dashboard/PopulationHealthSection.tsx`

- [ ] **Step 1: Replace hardcoded hex with `var(--token)`/`rgb(var(--token))`.** For Recharts string props use the computed color via a tiny helper that reads a CSS var so values stay reactive to theme:

```ts
// add near top of files that need runtime hex (Recharts/SVG stroke/fill strings):
const cssVar = (name: string) => `rgb(var(${name}))`;
// usages:
//  stroke="#172239"            -> stroke="var(--chart-track)"
//  gauge emerald/amber/crimson -> cssVar('--emerald') | cssVar('--amber') | cssVar('--crimson')
//  Recharts tick fill '#5E7FA3'-> 'var(--chart-axis)'  (or cssVar('--dim'))
//  CartesianGrid stroke        -> 'var(--chart-grid)'
//  complianceColor() returns   -> cssVar('--emerald' | '--amber' | '--crimson')
```

Replace every `#RRGGBB` in these five files with the matching token. Donut series in `PopulationHealthSection` use `cssVar('--crimson'|'--amber'|'--emerald')`; its track circle `#172239` → `var(--chart-track)`.

- [ ] **Step 2: Build + visual check both themes.**

Run: `npx tsc --noEmit && npx vite build`
Then preview a patient with a trend chart + the dashboard donut + a measures gauge in dark AND light. Expected: legible, theme-appropriate; no black strokes on light.

- [ ] **Step 3: Commit.** `git commit -am "fix(theme): route charts/gauges/donut through theme tokens"`

### Task 2.2: Section accents, AppShell, modal/button foregrounds

**Files (modify):** `pages/dashboard/RecentActivitySection.tsx`, `pages/dashboard/WorkspaceSection.tsx`, `components/AppShell.tsx`, `components/ConfirmModal.tsx`, `pages/care-lists/OrderPanel.tsx`, `components/ChangePasswordModal.tsx`, `components/ErrorBoundary.tsx`, `pages/LoginPage.tsx`, `pages/RegisterPage.tsx`, `pages/AlertsPage.tsx`, `pages/SettingsPage.tsx`

- [ ] **Step 1: Add a tokenized section-accent utility to `globals.css @layer components`:**

```css
.section-accent-teal    { border-top: 2px solid rgb(var(--teal) / 0.5); }
.section-accent-crimson { border-top: 2px solid rgb(var(--crimson) / 0.55); }
.section-accent-amber   { border-top: 2px solid rgb(var(--amber) / 0.45); }
.section-accent-violet  { border-top: 2px solid rgb(var(--violet) / 0.45); }
```

- [ ] **Step 2: Replace inline `style={{ borderTopColor: 'rgba(...)' }}`** in RecentActivitySection/WorkspaceSection with the matching `.section-accent-*` class (keep the conditional crimson-vs-amber logic by swapping the class). Replace `AppShell` inline `boxShadow: 'inset 3px 0 0 #0DD9D9'` with `var(--primary)`. Replace `text-white`/`text-black` on accent buttons (`ConfirmModal`, `OrderPanel`, and the schedule save button in `SettingsPage`) with `text-accent-fg`. Convert any remaining `#hex` in LoginPage/RegisterPage/ChangePasswordModal/ErrorBoundary/AlertsPage to the nearest token or `rgb(var(--…))`.

- [ ] **Step 3: Build + verify both themes have no hardcoded-color regressions.**

Run: `npx tsc --noEmit && npx vite build`
Then: `grep -rnE '#[0-9A-Fa-f]{6}' apps/web/src --include='*.tsx' | grep -v 'tokens-' || echo "no inline hex left"`
Expected: build OK; only intentional/explained hex remain (ideally none).

- [ ] **Step 4: Commit.** `git commit -am "fix(theme): tokenize section accents, AppShell, modal/button foregrounds"`

**☑ Phase 2 checkpoint:** Nothing stuck dark. Report before Phase 3.

---

## Phase 3 — Density (Compact, all surfaces)

Outcome: ≈34px rows, tighter padding everywhere, ad-hoc stat cards unified, fixed-height panels fixed.

### Task 3.1: Central density in globals.css

**Files (modify):** `apps/web/src/styles/globals.css`, `apps/web/src/components/AppShell.tsx`

- [ ] **Step 1: Tighten the spatial tokens and shared classes.** In the `@layer base :root` spatial block: `--padding-page: 1rem; --padding-panel: 1rem; --padding-compact: 0.625rem;`. In `.data-table th` change `py-3 → py-2`; in `.data-table td` change `py-3.5 → py-2`. In `.stats-strip-cell` change `px-6 → px-4 py-2 → py-1.5`. Change `AppShell.tsx` line ~434 `<div className="p-6">` → `p-4`.

- [ ] **Step 2: Build + smoke a table-heavy page (Patients) — confirm ~34px rows, no clipping.**

Run: `npx tsc --noEmit && npx vite build`

- [ ] **Step 3: Commit.** `git commit -am "feat(density): compact spatial tokens, table rows, shell padding"`

### Task 3.2: Per-surface row/padding + stat-strip conversions

**Files (modify):** `pages/PatientsPage.tsx`, `pages/BundlesPage.tsx`, `pages/DataQualityPage.tsx`, `pages/SurveillancePage.tsx`, `pages/CloseTheLoopPage.tsx`, `pages/CodingPage.tsx`, `pages/MeasuresPage.tsx`, `pages/admin/UsersTab.tsx`, `pages/admin/AuditTab.tsx`, `pages/admin/EtlTab.tsx`

- [ ] **Step 1: Drop bespoke row padding to `py-2`** on the non-`.data-table` lists/rows flagged in spec §3.1 (Patients table rows, Bundles patient table `py-3.5`, DataQuality `p-2→p-1`, Surveillance census rows, CloseTheLoop rows). Add `overflow-x-auto` + `min-w-[760px]` wrappers to the admin tables.

- [ ] **Step 2: Convert the ad-hoc stat cards to `.stats-strip`** in CodingPage (Overall Capture), MeasuresPage (stats trio), CloseTheLoopPage (4-up), BundlesPage (summary) — use `.stats-strip` / `.stats-strip-cell` / `.stats-strip-value` / `.stats-strip-label`.

- [ ] **Step 3: Build + smoke each touched page in both themes.** `npx tsc --noEmit && npx vite build`

- [ ] **Step 4: Commit.** `git commit -am "feat(density): per-surface row compaction + stats-strip unification"`

### Task 3.3: Patient chart tabs + editors + fixed-height panels

**Files (modify):** `components/patient/OverviewTab.tsx`, `components/patient/EncountersTab.tsx`, `components/patient/LabsVitalsTab.tsx`, `pages/EncounterNotePage.tsx`, `pages/SuperNotePage.tsx`, `pages/dashboard/WorkspaceSection.tsx`, `pages/dashboard/RecentActivitySection.tsx`, `apps/web/src/styles/globals.css` (`.panel-list`)

- [ ] **Step 1: Tighten editor/card padding** (encounter rows `py-3→py-2`, SuperNote interval grid `p-2.5→p-1.5`). Replace fixed `h-[400px]`/`max-h-[480px]`/`max-h-[200px]` with `min-h-0` + a viewport-relative cap (e.g. `max-h-[min(480px,55vh)]`); change `.panel-list` `h-[400px]` → `max-h-[min(400px,50vh)]`.

- [ ] **Step 2: Build + smoke patient chart + a note editor on a tall and a short viewport.** `npx tsc --noEmit && npx vite build`

- [ ] **Step 3: Commit.** `git commit -am "feat(density): compact patient chart tabs, note editors, fixed-height panels"`

**☑ Phase 3 checkpoint:** Report row-per-fold gain before Phase 4.

---

## Phase 4 — Readability + wide-monitor layouts

### Task 4.1: `ghost → dim` content sweep

**Files (modify):** the ~30 spots in spec §3.2/C1 — incl. `dashboard/StatsStrip.tsx`, `Pagination.tsx`, `AlertsPage.tsx`, `CloseTheLoopPage.tsx`, `patient/OverviewTab.tsx`, `dashboard/WorkspaceSection.tsx`, `care-lists/PatientBundleGroup.tsx`, `care-lists/OrderPanel.tsx`, `BundlesPage.tsx`, `MeasuresPage.tsx`, `SurveillancePage.tsx`, `DataQualityPage.tsx`, admin tabs.

- [ ] **Step 1: Enumerate every content (non-chrome) `text-ghost`** and bump sub-12px data:

```bash
grep -rn 'text-ghost' apps/web/src --include='*.tsx'   # review each
grep -rnE 'text-\[1[01]px\]' apps/web/src --include='*.tsx'
```

- [ ] **Step 2: Replace content `text-ghost` → `text-dim`** (labels, MRNs, timestamps, due dates, code badges, counts). **Keep `text-ghost`** only for: disabled inputs, search placeholder, `⌘K` kbd, and tertiary hint sublines. Bump `text-[10px]`/`text-[11px]` on data to `text-xs`.

- [ ] **Step 3: Build + visual contrast check in both themes.** `npx tsc --noEmit && npx vite build`

- [ ] **Step 4: Commit.** `git commit -am "fix(a11y): lift low-contrast ghost text to dim; enforce >=text-xs on data"`

### Task 4.2: Wide-monitor `xl`/`2xl` layouts

**Files (modify):** `components/patient/OverviewTab.tsx`, `components/patient/LabsVitalsTab.tsx`, `components/patient/ObservationTrendChart.tsx`, `pages/admin/DashboardTab.tsx`

- [ ] **Step 1: Add responsive columns** — OverviewTab grid `lg:grid-cols-2 → lg:grid-cols-2 xl:grid-cols-3`; LabsVitalsTab list → `grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4`; raise ObservationTrendChart height cap on `xl`; admin DashboardTab metrics `lg:grid-cols-4 2xl:grid-cols-6`.

- [ ] **Step 2: Build + smoke at ≥1600px and at laptop width (no regressions at small sizes).** `npx tsc --noEmit && npx vite build`

- [ ] **Step 3: Commit.** `git commit -am "feat(layout): xl/2xl multi-column for patient chart + admin"`

**☑ Phase 4 checkpoint.**

---

## Phase 5 — Consistency + final verification

### Task 5.1: Opportunistic consolidation

**Files (modify):** `globals.css` (add `.tab-underline`), the re-rolled buttons/tabs flagged in spec §3.3.

- [ ] **Step 1: Add `.tab-underline` to `globals.css`:**

```css
.tab-underline { @apply px-3 py-2 text-sm font-ui border-b-2 -mb-px transition-colors; border-color: transparent; }
.tab-underline:hover { @apply text-bright; }
.tab-underline-active { color: var(--primary); border-color: var(--primary); }
```

- [ ] **Step 2: Swap duplicated inline button strings for `.btn-sm`/`.btn-danger`** and the duplicated tab strings for `.tab-underline[-active]` in SurveillancePage/CloseTheLoopPage/PopulationFinderPage/AlertsPage/CohortManagerPage/ConfirmModal. Behavior-preserving only.

- [ ] **Step 3: Build.** `npx tsc --noEmit && npx vite build`

- [ ] **Step 4: Commit.** `git commit -am "refactor(ui): shared tab-underline + btn-sm/btn-danger consolidation"`

### Task 5.2: Full verification sweep

- [ ] **Step 1: Run the whole test suite + both builds.**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`
Expected: all green.

- [ ] **Step 2: Manual cross-theme matrix.** For each top-level route (Dashboard, Patients, Patient Detail, Care Lists, Measures, Coding, Alerts, Surveillance, Anticipatory, Population Finder, Close the Loop, Data Quality, Bundles, Cohort Manager, Admin, Settings, Login): load in **dark**, **light**, and **auto**; confirm legibility, no black-on-white / white-on-white, accent readability, working toggle + persistence.

- [ ] **Step 3: Residual-hardcoded-color audit.**

Run: `grep -rnE '#[0-9A-Fa-f]{6}|text-white|bg-white|text-black' apps/web/src --include='*.tsx' | grep -v 'tokens-'`
Expected: empty or only deliberately-justified entries.

- [ ] **Step 4: Final commit + summary.**

```bash
git commit -am "chore: final verification pass for light mode + density overhaul" --allow-empty
```

---

## Self-review notes (coverage vs spec)

- Spec §4.2 channel remap → Tasks 1.1–1.2. §4.3 accent-fg → 1.1 + 2.2. §4.4 token tables → 1.1/1.3. §4.5 theme-aware palettes → 1.4. §4.6 store+toggle → 1.4–1.5. §5 density → Phase 3 (all surfaces incl. editors in 3.3). §6 readability → 4.1 + token lifts in 1.1/1.3. §7 inline-hex → Phase 2. §8 wide-monitor → 4.2. §3.3 consistency → 5.1. §10 verification → 5.2. No gaps.
- Types consistent across tasks: `applyPalette(id, resolvedTheme)`, `ThemeMode`, `resolvedTheme`, `--accent-fg`, `--chart-*`, `.section-accent-*`, `.tab-underline` used the same everywhere.
