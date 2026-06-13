# Light Mode + UX/UI Density & Readability Overhaul — Design

**Date:** 2026-06-13
**Branch:** `feature/light-mode-ux-density`
**Status:** Draft — awaiting user review
**Scope:** `apps/web` (frontend only). No backend/API/auth changes.

---

## 1. Goals

From the request:

1. **Full UX/UI audit** with concrete improvements (this doc carries the audit).
2. **Implement a light mode** — a true second theme, not a tint.
3. **Font readability** — fix low-contrast text colors across the app.
4. **No wasted screen real estate**, especially in lists/tables.

Two refinements from review:

- **Adjust the dark theme too** — dark is not frozen. It gets the same readability +
  density treatment; the "Clinical Obsidian" identity is preserved, not redesigned.
- **All surfaces** — density/readability/cleanup reaches every surface (worklists,
  tables, patient chart tabs, encounter/super-note editors, modals, admin, settings),
  and the surface *token values* are tuned in both themes.

### Non-goals (explicit)

- No Tailwind v4 upgrade.
- No changes to the protected auth system (`/.claude/rules/auth-system.md`).
- No backend, API, schema, or data changes.
- No speculative component rewrites — consolidation only where a file is already being
  touched.

---

## 2. Current architecture (what we build on)

The app already has a real design-token foundation — the work *extends* it, not replaces it.

- **`src/styles/themes/tokens-base.css`** — theme-agnostic tokens (type scale, spacing,
  radius, z-index, easings). Unchanged.
- **`src/styles/themes/tokens-dark.css`** — the dark palette (surfaces, text hierarchy,
  borders, semantic colors). Becomes the `:root` baseline.
- **`src/styles/globals.css`** — `@layer base/components/utilities`: the shared classes
  (`.surface`, `.data-table`, `.badge-*`, `.btn-*`, `.stats-strip`, `.input-field`, …).
- **`tailwind.config.ts`** — **today hardcodes hex** for the named tokens
  (`void/s0/s1/s2`, `bright/dim/ghost`, `edge`, `teal/amber/crimson/…`).
- **`src/styles/palettes.ts` + `src/stores/theme.ts`** — a 5-accent palette switcher that
  already overrides `--primary`/`--accent` CSS vars at runtime and persists to
  `localStorage`. Wired into **Settings → Appearance**.

### The structural fact that makes this tractable

Across `src/**/*.tsx`:

- `text-bright|dim|ghost` — **801 occurrences / 54 files**
- `bg-void|s0|s1|s2` — **132 / 33 files**
- `border-edge` — **144 / 40 files**

All reference the **named** Tailwind tokens. If those tokens resolve to CSS variables
instead of hardcoded hex, **every one of them becomes theme-aware for free**. The only
manual work is the **~119 inline hex/rgba literals in 12 files** (charts, gauges, SVG
tracks, inline `rgba()` accents) that bypass the token system.

---

## 3. Audit findings (the deliverable)

### 3.1 Wasted screen real estate (top priority)

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| R1 | Table/list rows ~44px (`py-3`/`py-3.5`) | `PatientsPage.tsx:184`, `BundlesPage.tsx:491`, `DataQualityPage.tsx:34`, `.data-table td` (`globals.css:591`) | Rows → ~34px (`py-2`); ≈2–3 more rows/fold |
| R2 | Shell over-pads (`p-6` = 24px) | `AppShell.tsx:434` | `p-4` |
| R3 | Single-column where multi fits | `OverviewTab.tsx:120` (locked 2-col), `LabsVitalsTab.tsx:170` (1/row list) | `xl:grid-cols-3` |
| R4 | Ad-hoc stat cards re-roll layout | `CodingPage.tsx:35`, `MeasuresPage.tsx:178`, `CloseTheLoopPage.tsx:36`, `BundlesPage.tsx:309` | Use existing `.stats-strip` |
| R5 | Fixed-height panels truncate / leave dead space | `panel-list` `h-[400px]` (`globals.css:224`), `WorkspaceSection.tsx:66` (`max-h-[480px]`), `RecentActivitySection.tsx:61` (`max-h-[200px]`), `ObservationTrendChart.tsx:140` (220px) | Min/auto + viewport-aware caps |
| R6 | Editor surfaces roomy | `SuperNotePage.tsx:83` (`p-2.5` 4-col), `EncountersTab.tsx:104` (~120px/encounter) | Tighten padding; denser interval grid |
| R7 | Admin tables uncapped / compress on narrow | `UsersTab.tsx:128`, `AuditTab.tsx:70`, `EtlTab.tsx:63` | `overflow-x-auto` + `min-w` + density |

### 3.2 Font readability / contrast

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| C1 | `text-ghost` (#2D4060, ≈2–4:1) used for **content** (labels, MRNs, timestamps, due dates, code badges) — ~30 spots | `StatsStrip.tsx:43`, `Pagination.tsx:72`, `AlertsPage.tsx:143`, `CloseTheLoopPage.tsx:93`, `OverviewTab.tsx:89/140/169/177/207/258`, `WorkspaceSection.tsx:100/183`, `MeasureRow` LOINC/CPT badges, … | `ghost → dim` for content; keep `ghost` for true chrome only |
| C2 | Sub-12px data (`text-[10px]`/`text-[11px]`) | `AlertsPage.tsx:143`, `BundlesPage.tsx:170`, `SurveillancePage.tsx:48`, `DashboardTab.tsx:62`, `PatientBanner.tsx` demographics | → `text-xs` |
| C3 | Token values themselves are low-contrast on dark | `dim`/`ghost` in `tokens-dark.css:34-35` | Lift `dim`/`ghost` channels (see §4.4) |
| C4 | Recharts/SVG tick labels hardcoded low-contrast | `ObservationTrendChart.tsx` (~14 hex/rgba) | Route through chart tokens |

### 3.3 Consistency / polish

- Buttons re-rolled as inline strings with padding drift (`px-2.5` vs `px-3`) across
  `AlertsPage`, `PopulationFinderPage`, `CohortManagerPage`, `OrderPanel`,
  `PatientBundleGroup` → apply existing `.btn-sm` / `.btn-danger`.
- Tab-underline pattern duplicated across `SurveillancePage`, `CloseTheLoopPage`,
  `PopulationFinderPage` → one shared `.tab-underline` class.
- Two near-identical stats strips (`dashboard/StatsStrip.tsx`,
  `care-lists/StatsStrip.tsx`) → converge on `.stats-strip`.
- `ConfirmModal` hardcodes `bg-crimson text-white` instead of `.btn-danger`.

### 3.4 Light-mode blockers — inline hex/rgba (12 files, ~119 literals)

`AppShell.tsx` (inline `#0DD9D9`, legacy `gray-*`), `ChangePasswordModal.tsx`,
`ErrorBoundary.tsx`, `patient/ObservationTrendChart.tsx` (~14, Recharts),
`patient/OverviewTab.tsx` (gauge `#10C981/#F5A623/#E8394A`),
`AlertsPage.tsx`, `BundlesPage.tsx` (`complianceColor()` hex + SVG `#172239`),
`dashboard/PopulationHealthSection.tsx` (donut hex + `#172239`),
`LoginPage.tsx`, `MeasuresPage.tsx` (ArcGauge hex), `RegisterPage.tsx`,
`SettingsPage.tsx`. Plus `RecentActivitySection.tsx` / `WorkspaceSection.tsx` inline
`rgba()` section-accents, and `text-white`/`text-black` on accent buttons
(`ConfirmModal.tsx`, `care-lists/OrderPanel.tsx`).

---

## 4. Design — theming system

### 4.1 Two orthogonal axes

```
theme   ∈ { auto, dark, light }     ← NEW (this work)
palette ∈ { clinical-teal, arctic, sage, sapphire, plum }   ← EXISTS
```

`theme` controls surfaces/text/borders/semantic accents. `palette` controls the
primary/accent hue. They compose: e.g. *Light + Sapphire*.

### 4.2 Token → CSS variable remap (the linchpin)

In `tailwind.config.ts`, every themed color becomes channel-backed:

```ts
// Channel format REQUIRED so /opacity modifiers keep working:
//   border-edge/35  →  rgb(var(--edge) / 0.35)
void:    'rgb(var(--void) / <alpha-value>)',
s0:      'rgb(var(--s0) / <alpha-value>)',
s1:      'rgb(var(--s1) / <alpha-value>)',
s2:      'rgb(var(--s2) / <alpha-value>)',
edge:    'rgb(var(--edge) / <alpha-value>)',
bright:  'rgb(var(--bright) / <alpha-value>)',
dim:     'rgb(var(--dim) / <alpha-value>)',
ghost:   'rgb(var(--ghost) / <alpha-value>)',
teal:   { DEFAULT: 'rgb(var(--teal) / <alpha-value>)', dark: 'rgb(var(--teal-dark) / <alpha-value>)' },
amber:   'rgb(var(--amber) / <alpha-value>)',
crimson: 'rgb(var(--crimson) / <alpha-value>)',
emerald: 'rgb(var(--emerald) / <alpha-value>)',
violet:  'rgb(var(--violet) / <alpha-value>)',
info:    'rgb(var(--info) / <alpha-value>)',
gold:    'rgb(var(--gold) / <alpha-value>)',
// legacy gray/dark/light/accent aliases → mapped to the same channel vars
```

CSS variables therefore hold **space-separated RGB channels** (`--s1: 17 27 46`), not
hex. This is the single mechanical gotcha and it is non-negotiable for the 144
`border-edge/35`-style usages and all `bg-x/10 text-x` chips.

`color-scheme`, panel **shadows**, panel **gradients**, **skeleton** shimmer,
**scrollbar** thumb, and **`::selection`** in `globals.css` are also routed through
theme vars (`--shadow-panel`, `--gradient-panel*`, `--skeleton-*`, `--scrollbar-thumb`,
`--selection-bg`) so they invert correctly instead of staying dark-only.

### 4.3 New `--accent-fg` token

Solid-accent surfaces (`.btn-primary`, solid badges, `live-dot` text) need a foreground
that's readable on the accent fill in **both** themes:

- dark: `--accent-fg: 6 10 20` (near-black on bright teal — current behavior)
- light: `--accent-fg: 255 255 255` (white on deep teal)

`.btn-primary { color: rgb(var(--accent-fg)); }` replaces the current
`color: var(--surface-base)`. Removes the `text-void`/`text-black`/`text-white`
button hacks.

### 4.4 Token value tables

All pairs **verified ≥4.5:1 (normal text) / ≥3:1 (large text + UI)** during Phase 1;
values below are the implementation starting point.

**Dark — adjusted (`:root` baseline, was `tokens-dark.css`)**

| Token | Now | New | Why |
|-------|-----|-----|-----|
| void  | `#060A14` | `#060A14` (6 10 20) | keep |
| s0    | `#0C1320` | `#0C1320` (12 19 32) | keep |
| s1    | `#111B2E` | `#111B2E` (17 27 46) | keep |
| s2    | `#172239` | `#172239` (23 34 57) | keep |
| edge  | `#1E4478` | `#1E4478` (30 68 120) | keep |
| bright| `#EDF2FF` | `#EDF2FF` (237 242 255) | keep |
| **dim**   | `#5E7FA3` | **`#7A98BC`** (122 152 188) | lift secondary text to AA on s0/s1 |
| **ghost** | `#2D4060` | **`#48618A`** (72 97 138) | lift tertiary so it's legible chrome, not invisible |
| accent-fg | (surface-base) | `#060A14` (6 10 20) | explicit on-accent text |

Semantic accents (teal/amber/crimson/emerald/violet/info/gold) keep their dark values —
already AA on dark. (Note: the **`dim` lift is global** — ~800 usages brighten slightly.
Intended; flagged.)

**Light — Soft Clinical (`[data-theme="light"]` override)**

| Token | Value | Role |
|-------|-------|------|
| void  | `#F4F6FB` (244 246 251) | page canvas |
| s0    | `#FFFFFF` (255 255 255) | cards / inputs / table header |
| s1    | `#EDF1F7` (237 241 247) | hover rows / raised tint |
| s2    | `#E0E6F0` (224 230 240) | chips / toggles-off / elevated hover |
| edge  | `#D3DCE8` (211 220 232) | borders |
| bright (ink) | `#16243B` (22 36 59) | primary text ≈12:1 |
| dim   | `#4A627E` (74 98 126) | secondary text ≈6:1 |
| ghost | `#76849C` (118 132 156) | tertiary chrome ≈3.6:1 |
| accent-fg | `#FFFFFF` (255 255 255) | text on solid accent |

Light semantic accents (deepened for AA on white, both as text and as solid fills):

| Accent | Light value |
|--------|-------------|
| teal / teal-dark | `#0B7A7A` / `#096868` |
| amber  | `#B5790F` |
| crimson| `#C4283A` |
| emerald| `#0A7D54` |
| info   | `#2D6FA8` |
| violet | `#6D3FD4` |
| gold   | `#9A6E12` |

`bg-x/10 text-x` chips → light wash + AA-colored text on white. Solid fills pair with
`--accent-fg: white`.

### 4.5 Palettes become theme-aware

`palettes.ts`: each non-default palette gains a `light` variable block (deepened
primary/accent for white backgrounds); `clinical-teal` derives from the token defaults.
`applyPalette(id, resolvedTheme)` selects the dark or light block. Called whenever theme
*or* palette changes.

### 4.6 Theme store + toggle UX

`src/stores/theme.ts`:

```ts
theme: 'auto' | 'dark' | 'light'      // persisted: localStorage 'mg_theme'
resolvedTheme: 'dark' | 'light'        // derived
setTheme(t), toggleTheme()
initFromStorage(): reads mg_theme + mg_palette, sets data-theme, applies palette,
  and (for 'auto') subscribes to matchMedia('(prefers-color-scheme: dark)')
```

- Applies by setting `document.documentElement.dataset.theme = resolvedTheme`.
- **Default = `auto`** (follows OS).
- **Topbar** (`AppShell`): sun/moon quick-toggle (dark⇄light instant).
- **Settings → Appearance**: `Theme: Auto / Dark / Light` segmented control above the
  existing palette grid. Both axes persist independently.
- No FOUC: `initFromStorage()` already runs in `main.tsx` before render.

---

## 5. Design — density (Compact, fixed, all surfaces)

Most density lands centrally in `globals.css` so it applies everywhere at once:

- `.data-table th` `py-3 → py-2`; `td` `py-3.5 → py-2` (≈34px rows).
- `--padding-page 1.5rem → 1rem`; `--padding-panel 1.25rem → 1rem`;
  `--padding-compact 0.75rem → 0.625rem`.
- `.stats-strip-cell` `px-6 → px-4`; `.surface` padding via the tokens above.
- Shell content `p-6 → p-4` (`AppShell`).

Per-surface (cannot be centralized):

- Worklist/table pages: row padding `py-3 → py-2` (Patients, Bundles table, DataQuality,
  CloseTheLoop, Surveillance, admin tables).
- Ad-hoc stat cards → `.stats-strip` (Coding, Measures, CloseTheLoop, Bundles).
- Patient chart tabs + editors (`OverviewTab`, `EncountersTab`, `LabsVitalsTab`,
  `EncounterNotePage`, `SuperNotePage`): tighten card padding, denser grids.
- Replace fixed `h-[400px]`/`max-h-[…]` panels with `min-h` + viewport-aware caps.

Target: ≈2–3 additional rows per fold on lists; no dead space on tall screens.

---

## 6. Design — readability pass

- `text-ghost → text-dim` for the ~30 content spots in §3.2/C1; `ghost` retained only for
  disabled states and tertiary hints.
- Sub-12px data (`text-[10px]`/`[11px]`) → `text-xs`.
- Token-level `dim`/`ghost` lift (dark) and AA light values (§4.4) raise the floor
  everywhere automatically.

---

## 7. Design — inline-hex cleanup (enables both themes)

Convert the 12 files in §3.4 to tokens:

- Risk gauges / `complianceColor()` / ArcGauge: return `var(--emerald|amber|crimson)`
  (or `rgb(var(--…))`) instead of hex.
- SVG track `#172239` → `var(--s2)` equivalent.
- Donut + Recharts: a small **chart token set** — `--chart-grid`, `--chart-axis`,
  `--chart-label` — defined per theme; series colors reference semantic tokens.
- Inline `rgba()` section accents → a `.section-accent-{teal,crimson,amber,violet}`
  utility driven by tokens.
- `AppShell` inline `#0DD9D9` → `var(--primary)`; legacy `gray-*` → token classes.
- `text-white`/`text-black` on accent buttons → `--accent-fg`.

---

## 8. Design — wide-monitor layouts (`xl`/`2xl`)

Additive responsive classes, smaller breakpoints unaffected:

- `OverviewTab` 2-col → `xl:grid-cols-3`.
- `LabsVitalsTab` 1/row list → `xl:grid-cols-2 2xl:grid-cols-3` grid.
- Charts grow (`ObservationTrendChart` height/width caps raised on `xl`).
- Tables use full container width; admin dashboards `2xl:grid-cols-6`.

---

## 9. Implementation phases (each gated by `tsc --noEmit` **and** `vite build`)

1. **Token plumbing** — `tailwind.config.ts` channel remap; rename/rework
   `tokens-dark.css` (adjusted) as baseline; add `tokens-light.css`; route shadows/
   gradients/skeleton/scrollbar/selection through vars; add `--accent-fg`; extend
   `theme.ts` (auto/dark/light + matchMedia) and `palettes.ts` (light blocks); topbar
   toggle + Settings segmented control. → **Light mode live for all tokenized UI.**
2. **Inline-hex cleanup** (§7) — charts, gauges, donut, SVG tracks, AppShell, section
   accents, button fg. → **Nothing stuck dark.**
3. **Density** (§5) — central CSS + per-surface rows/padding, stat-strip conversions,
   fixed-height panel fixes. All surfaces.
4. **Readability** (§6) + **wide-monitor** (§8).
5. **Consistency** (§3.3) + **final verification** (§10).

---

## 10. Verification

- **Build:** `npx tsc --noEmit` AND `npx vite build` after every phase (vite is stricter).
- **Both themes:** smoke each top-level route in dark, light, and `auto`; confirm the
  topbar toggle + Settings control + persistence across reload.
- **Palette × theme:** spot-check one non-teal palette in light.
- **Contrast:** verify the §4.4 token pairs and the migrated `ghost→dim` spots meet
  WCAG AA (≥4.5 normal, ≥3 large/UI).
- **Density/real-estate:** confirm row-per-fold gain on Patients/Bundles; no dead space
  on a tall viewport; no truncation regressions from removed fixed heights.
- **Charts/SVG:** gauges, donut, trend chart legible in both themes.
- Deploy is the user's call (`./deploy.sh --frontend` per project norm).

---

## 11. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Channel-format miss on any token breaks `/opacity` utilities silently | Convert all themed tokens at once; grep for residual hardcoded hex in config; vite build + visual smoke |
| Global `dim` lift over-brightens dark UI | Conservative lift; review dark screenshots before finalizing value |
| Light accents fail AA on white fills | `--accent-fg` + deepened accent values; contrast check in §10 |
| Removed fixed heights cause layout shift | Replace with `min-h` + `max-h` viewport caps, not unbounded |
| Touching 50+ files risks auth/protected surfaces | Auth files (`auth-system.md`) excluded; changes are additive token/className edits |
| Recharts tooltip typing friction | Per project convention, cast formatter as `never` |

---

## 12. Files touched (approximate)

- **Core:** `tailwind.config.ts`, `styles/globals.css`, `styles/themes/tokens-dark.css`,
  **new** `styles/themes/tokens-light.css`, `styles/palettes.ts`, `stores/theme.ts`,
  `components/AppShell.tsx`, `pages/SettingsPage.tsx`.
- **Inline-hex (12):** per §3.4.
- **Density/readability/wide-monitor:** the worklist pages, patient chart tabs, editors,
  admin tabs, and shared list/table components — predominantly className edits, centralized
  where possible via `globals.css`.
