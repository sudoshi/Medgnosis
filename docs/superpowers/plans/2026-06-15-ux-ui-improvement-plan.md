# Medgnosis — Comprehensive UX/UI Improvement Plan

**Date:** 2026-06-15
**Author:** UX/UI audit (7 parallel page-group audits + design-system review)
**Scope:** All 21 routed pages, the app shell, and ~30 shared/feature components in `apps/web/src/`
**Status:** Proposed — awaiting sequencing sign-off

---

## 1. Executive summary

Medgnosis sits on a **genuinely mature design system** — "Clinical Obsidian v2.0": a three-layer token architecture (`tokens-base/dark/light.css`), fluid typography with intentional serif/sans/mono families, a full shadcn/Radix primitive set (`components/ui/`), and a rich component layer (`.surface*`, `.badge-*`, `.alert-*`, `.stats-strip`, `.progress-*`, `.gauge-*`, `.timeline-*`, `.empty-state`, `.skeleton-*`). The bones are excellent and there are several **exemplary** pages that prove the system works.

The problem is **not** the design system — it is that **most of the app does not use it**, and the gaps cluster in exactly the places a *clinical* product cannot afford them: patient-safety legibility, error/empty distinction, and accessibility.

The single most telling metric:

> **14 of 21 pages import zero `components/ui/` primitives.** Only 7 pages use the shadcn primitive layer at all.

Everything else hand-rolls tables, tabs, switches, modals, badges, charts, and severity colors — drifting from the tokens, losing the built-in accessibility, and re-implementing the same components 3–5 times each.

**Overall app grade: C+ / B−.** The ceiling (CareGapsTab, CareListsPage, the admin tabs, NotFoundPage) is A-grade; the floor (the TipTap editor, the patient roster, the auth surface) is D/C-grade. Closing that gap is the work.

### The six exemplars (the standard already exists in-repo)

These files already do it right. The plan is largely *propagating their patterns* to the rest of the app:

| Exemplar | What it models |
|---|---|
| `pages/CareGapsTab` *(components/patient/CareGapsTab.tsx)* | All three of loading / error / empty states; accessible accordions; correct badge usage |
| `pages/CareListsPage.tsx` + `pages/care-lists/*` | Clean small-file decomposition; real states; keyboard-accessible custom controls; toast feedback |
| `pages/admin/*` (UsersTab, FhirTab, AuditTab, …) | Uses shadcn `Table`/`Dialog`/`Select`; shared `RoleBadge`/`StatusBadge`/`MetricCard` helpers |
| `pages/NotFoundPage.tsx` | The auth/entry surface done on-token in 23 lines |
| `components/patient/ObservationTrendChart.tsx` | Theme-reactive Recharts via a `tok()` token helper; abnormal-point redundancy |
| `pages/DataQualityPage.tsx` FeedBoard cells | Pass/fail encoded with **color *and* `aria-label`** — the redundant-encoding model |

---

## 2. How this was assessed

- **Method:** Static code audit. Seven independent senior-designer/engineer agents, one per functional page group, each applying an identical **7-dimension rubric**: (1) Information architecture & hierarchy, (2) Visual consistency vs the design system, (3) Interaction design & states, (4) Accessibility, (5) Responsive/layout, (6) Clinical-workflow efficiency, (7) Polish & microinteractions.
- **Grounding:** Every finding cites a real `file:line`. The highest-stakes "Critical" claims were independently re-verified with `grep` (typography plugin absence, `USE_MOCK_SCHEDULE`, zero `aria-live`, dead `GlobalSearch`, native `confirm()`, raw `<table>` inventory, primitive-import coverage).
- **Visual ground-truth — DONE (2026-06-15):** a Playwright sweep logged in (admin@acumenus.net) and captured all 21 routes in **both** dark and light themes (42 screenshots, `/tmp/mg-ui-sweep/`). Findings below in §2a. Re-run after fixes to validate (see §8).

---

## 2a. Visual ground-truth addendum (2026-06-15)

A live screenshot sweep against the running stack (vite dev → API :3081, real data, admin login) **confirmed every P0 claim** and surfaced refinements. Net: the static audit was accurate, with two corrections that make the picture *better* than feared (light mode) and a few *new* defects only visible at runtime.

### Confirmed on screen
- **Auth doesn't theme.** `/login` is byte-identical in dark and light; `/register` is also hard-pinned dark in light mode. (Login-as-dark-splash is defensible; register is not.)
- **The TipTap editor renders as a blank empty box** in both themes — no placeholder prompts at all. Confirms dead typography + missing Placeholder (S5).
- **Dashboard "Today's Schedule" is the mock** — the named fake patients (Sheldon Koelpin, Renato Sipes, Brant Daugherty…) render live (S22). Greeting reads **"Good evening, Dr. Admin"** — role-unaware honorific on an *admin* account.
- **The RiskTierCard mislabel is stark.** A patient with "No active conditions," "No encounters on record," and "No condition bundles apply" is flagged **"High Risk / 0% / Based on care bundle compliance"** (S3). Visually damning — a patient with nothing wrong reads as high-risk.
- **Duplicate "← All Patients" back link** renders twice, stacked, on the patient chart.
- **Roster confirmed:** columns are only Patient/MRN/DOB/Gender; sort arrows are fake; "1 / **50,290** pages" at 20/page over ~1M patients; no risk sort (S17).
- **Color-only severity confirmed:** Surveillance encodes the MEWS score by number color (RRT **5** red vs **1** green); Bundles' risk-distribution bar is pure color; Care-Lists priority dots are color-only (S1).
- **Measures:** "27% vs last month" with no trend value (dead `TrendBadge`) and no benchmark line; "Not compliant" isn't a drill-down (S18, S21).
- **"Real-Time Surveillance"** has a manual "Advance stream" button and no live refresh/`live-dot` (S19/realtime).
- **Settings:** the Role field renders as a broken-looking disabled/empty input; left-nav IA is otherwise good.

### New defects (only visible at runtime — add to scope)
- **N1 — Dashboard metrics look miswired:** *Total Patients* and *Active Patients* show the **identical** value (1,005,791), and *High Risk* = **0 / 0% of population** while *Open Care Gaps* = 17,581 and 7 critical alerts exist. The hero KPI strip is internally inconsistent — likely unwired/placeholder. (Promote alongside S22.)
- **N2 — MRN UUIDs wrap to 3 lines** in the roster table (the MRN is a full UUID), wasting ~3× the vertical space per row and hurting scannability. Display a truncated/short MRN with copy-on-click.
- **N3 — Pervasive stale demo data:** every alert reads "4 months ago"; the dataset is a frozen snapshot. Not a UI bug per se, but it makes the app feel dead — worth a fresh seed for demos/screenshots.

### Corrections that make the picture better than the static audit implied
- **Light mode is genuinely excellent across the entire app shell and pages** — sidebar, topbar, cards, tables, forms all switch cleanly and look professional. The theming defect is **isolated to the auth surface** (login/register/forced modal) plus the fixed-hex `.progress-*` bars (which remain legible on white). This narrows S13's theming scope considerably.
- **AlertsPage already does redundant severity encoding** (warning/info **icon** + text **badge** + left **border**) — it's the best triage page for legibility; its real gaps are sort-order, bulk actions, and the inline-hex `boxShadow` (not the redundancy itself).
- **CareListsPage and the admin tabs are bona-fide exemplars** on screen — polished, dense, well-structured. The "make everything match these" framing holds.

---

## 3. Per-page scorecard

Grades are the auditors' current-state assessment. "Top issue" is the single highest-impact problem; full findings are in §5 and the appendix.

### Auth & entry
| Page | Grade | Top issue |
|---|---|---|
| `LoginPage.tsx` | C+ | ~490 lines inline `<style>` with hardcoded hex + non-system fonts; doesn't theme; password toggle `tabIndex={-1}` |
| `RegisterPage.tsx` | C+ | Near-verbatim duplicated off-system styles; success state doesn't move focus |
| `ChangePasswordModal.tsx` | C | Forced security modal is hand-rolled — **no focus trap, no `role="dialog"`, no `aria-modal`** |
| `AuthGuard.tsx` | B | 4th distinct spinner; loading state has no `role="status"` |
| `NotFoundPage.tsx` | **A−** | *(exemplar)* — minor: dead-ends unauthenticated users |

### Shell, dashboard & search
| Page | Grade | Top issue |
|---|---|---|
| `components/AppShell.tsx` | B− | Flat 16-item nav, no grouping; no mobile drawer; no skip link; nav link hand-rolled ×3 |
| `DashboardPage.tsx` | B | **Flagship "Today's Schedule" is 18 mock patients** (`USE_MOCK_SCHEDULE = true`) |
| `components/CommandPalette.tsx` | C+ | Covers only 7 of 16 routes; diverges from sidebar nav list |
| `components/GlobalSearch.tsx` | D *(dead)* | Richer search component, **imported nowhere**; competes with CommandPalette |

### Patient workspace
| Page | Grade | Top issue |
|---|---|---|
| `PatientsPage.tsx` | C | Roster has **no risk tier / care-gap count**; sort affordances are **fake** (icons not wired) |
| `PatientDetailPage.tsx` | B− | Duplicate/scattered actions; no timeline view despite `.timeline-*` tokens existing |
| `components/patient/OverviewTab.tsx` | C+ | **`RiskTierCard` mislabels care-bundle compliance % as "Risk"** (inverted semantics) |
| `components/patient/CareGapsTab.tsx` | **A−** | *(exemplar)* |
| `components/patient/FlowsheetGrid.tsx` | B | Abnormal cells encoded **color-only** (no glyph) |
| `components/patient/ObservationTrendChart.tsx` | B+ | *(exemplar)* — Recharts `formatter` missing `as never` cast |
| PatientBanner / Conditions / Medications / Encounters / LabsVitals | B / B / B− / B− / B | Missing error states; color-only severity; local `statusBadge`/`formatDate` copies |

### Clinical documentation
| Page | Grade | Top issue |
|---|---|---|
| `EncounterNotePage.tsx` | C− | **No unsaved-changes guard** (3s autosave loss window); hand-rolled sign-off modal; silent on all errors |
| `components/encounter/SOAPSectionEditor.tsx` | D+ | **`@tailwindcss/typography` not installed → all `prose` styling is dead**; `prose-invert` breaks light theme; no placeholders |
| `SuperNotePage.tsx` | B− | No autosave at all; A&P uses bare `<textarea>`; finalize has no confirm |

### Population health & quality
| Page | Grade | Top issue |
|---|---|---|
| `MeasuresPage.tsx` | B | No benchmark/target; "Not compliant" (the gap list) **isn't a drill-down link**; `TrendBadge` hardcoded to 0 |
| `BundlesPage.tsx` | B− | 813-line monolith; risk stacked-bar color-only; measure rows not clickable (broken drill-down) |
| `CareListsPage.tsx` + `care-lists/*` | **B+** | *(exemplar)* — off-theme `blue`/`cyan` (non-tokens); hand-rolled Sheet/Dialog; error → false "all done" |
| `PopulationFinderPage.tsx` | B | Hand-rolled tabs; permanent "Does not have" dismissal with no confirm |
| `CohortManagerPage.tsx` | C+ | Least-polished; no loading/error on primary queries; hardcoded disposition strings |

### Surveillance, alerts & ops
| Page | Grade | Top issue |
|---|---|---|
| `AlertsPage.tsx` | C+ | Reinvents `.alert-*` with inline-hex `boxShadow`; **not sorted most-urgent-first**; no bulk/snooze; realtime is silent |
| `SurveillancePage.tsx` | C | **MEWS/NEWS2 severity color-only** (RRT trigger vs stable = hue alone); "Real-Time" page doesn't auto-refresh |
| `CloseTheLoopPage.tsx` | B− | Color-only overdue; hand-rolled stat strip; API-order (not severity) |
| `DataQualityPage.tsx` | C | Raw `<table>` against in-repo migration note; Confirm styled as danger (inverted) |
| `AnticipatoryPage.tsx` | C | Co-sign & MTM sections render **false-empty on API error**; bare range input |
| `CodingPage.tsx` | C+ | Capture-health color-only; 3 hand-rolled bar styles; sections vanish on missing data |

### Settings & admin
| Page | Grade | Top issue |
|---|---|---|
| `SettingsPage.tsx` | B− | 957-line file; hand-rolled `Toggle`/`<select>` (primitives exist); 3 inconsistent save paradigms |
| `AdminPage.tsx` + `admin/*` | B | *(tabs are exemplars)* — **route has no RBAC guard** (render-time only); destructive ops have no confirm |

---

## 4. Foundational building blocks (build these first — everything depends on them)

These 8 shared pieces each unblock fixes across many pages. Build them before the phase work; they are the highest-leverage investments.

| # | Building block | Replaces / fixes | Touches |
|---|---|---|---|
| F1 | **`<DataBoundary>`** (or a `useQueryStates` convention) wrapping loading → error → empty → data, with a standard `<QueryError onRetry>` | The systemic **false-empty-on-error** bug | ~15 pages/tabs |
| F2 | **`<SeverityIndicator>` / `<SeverityBadge>`** — color **+ icon + text label** + left-border variant; one source of truth for crimson/amber/teal severity | Color-only clinical encoding everywhere | Patients, Alerts, Surveillance, CloseTheLoop, Coding, Bundles, CareLists |
| F3 | **`components/charts/`** — `ArcGauge`, `ComplianceBar`, `RiskBar`, `Donut` — token-driven, `role="img"` + `aria-label`, built on the `tok()` helper from ObservationTrendChart | Duplicated `ArcGauge`, hand-rolled bars/SVG, `aria-hidden` charts | Measures, Bundles, Overview, CareGaps, Dashboard, Coding |
| F4 | **Shared grouped nav registry** `{group, label, icon, to, roles}[]` consumed by **both** AppShell and the command palette | Nav drift (16 vs 7), flat IA, opaque labels | AppShell, CommandPalette |
| F5 | **`useUnsavedChangesGuard()`** — React Router `useBlocker` + `beforeunload`, keyed off a dirty flag | Documentation **data-loss** risk | EncounterNote, SuperNote, Settings, Schedule |
| F6 | **Global `aria-live` announcer** (a context + visually-hidden assertive/polite regions) | Zero `aria-live` in app; silent realtime + save status | App-wide (alerts, save indicators, validation) |
| F7 | **Typography fix:** install `@tailwindcss/typography`, register it, theme `.prose` via CSS-var tokens (drop `prose-invert`), add `@tiptap/extension-placeholder` | The dead TipTap editor styling | SOAPSectionEditor (+ any future rich text) |
| F8 | **Destructive-action convention:** standardize on the existing Radix `AlertDialog` via a small `useConfirm()` / `<ConfirmModal>` wrapper | Single-click destructive ops; native `confirm()` | Admin, PopulationFinder, EncounterNote, Settings |

---

## 5. Cross-cutting systemic findings (ranked by severity)

### 🔴 P0 — Patient safety & data integrity

**S1 — Color-only encoding of clinical severity.** The most pervasive and most dangerous pattern. Clinical urgency is conveyed by hue *alone* in: MEWS/NEWS2 scores (`SurveillancePage.tsx:22-31,44`), glucose chips (`:137`), flowsheet abnormal cells (`FlowsheetGrid.tsx:179-190` — pure color, no glyph), overdue loops (`CloseTheLoopPage.tsx:84`), HCC capture (`CodingPage.tsx:18-22`), allergy chips (`PatientBanner.tsx:170-177`), measure pass/fail (`MeasuresPage.tsx:176`), bundle risk bar (`BundlesPage.tsx:359-407`), priority dots (`care-lists/helpers.tsx:44-57`). A red/green-deficient clinician (≈8% of males) or anyone on a glare/monochrome display **cannot triage**. *Fix: F2 everywhere; `DataQualityPage` FeedBoard is the model.*

**S2 — Missing error states render as false-empty success.** ~15 surfaces destructure only `data`/`isLoading` and fall through to an empty state on fetch failure. Clinically, "No medications on record" ≠ "couldn't load medications." Worst case: `CareListsPage.tsx:216` shows **"All care gaps resolved — excellent work!"** when the request actually *failed*. Also `OverviewTab`, `ConditionsTab`, `MedicationsTab`, `EncountersTab`, `LabsVitalsTab`, `FlowsheetGrid`, `PatientsPage`, `BundlesPage` (×3), `CohortManagerPage` (×2), `AnticipatoryPage` (co-sign + MTM), `CodingPage` (×3), admin tabs. *Fix: F1.*

**S3 — Clinical mislabel: compliance presented as "Risk."** `OverviewTab.tsx:50-93` `RiskTierCard` maps care-bundle compliance % to a "Risk tier" with inverted semantics (`pct ≥ 80 → "Low Risk"`, `aria-label="Risk tier…"`). A patient with no applicable bundles reads identical to a genuinely low-acuity patient; process adherence is mislabeled as patient acuity. *Fix: rename to "Care Bundle Compliance," or wire a real acuity score (CHADS₂-VASc/Charlson).*

**S4 — Documentation data-loss.** No unsaved-changes guard or `beforeunload` anywhere (`grep` = 0). `EncounterNotePage` relies on a 3s autosave debounce (guaranteed loss window on nav/close) and is **silent on every error** (`onError` only resets the indicator; finalize has no `onError` at all). `SuperNotePage` has **no autosave** — A&P plans persist only on finalize. *Fix: F5 + F6 + Sonner error toasts.*

**S5 — The flagship rich-text editor is visually broken.** `@tailwindcss/typography` is not installed/registered, so the SOAP editor's entire `prose`-based styling generates **zero CSS** (no bullets, no heading sizing, no spacing). Compounded by hardcoded `prose-invert` (breaks light theme), no Placeholder extension (the clinical prompt strings never render), and phantom classes `surface-alt`/`label-text`/`bg-surface`-as-color. *Fix: F7.*

**S6 — Destructive actions fire on a single click.** Deactivate user (`UsersTab.tsx:200`), delete FHIR endpoint (`FhirTab.tsx:266`), sign-out-all-devices (`SettingsPage.tsx:718`), permanent "Does not have" dismissal (`PopulationFinderPage.tsx:109`), delete draft via native `confirm()` (`EncounterNotePage.tsx:499`). The Radix `AlertDialog` is shipped and used nowhere. *Fix: F8.*

### 🟠 P1 — Accessibility baseline

**S7 — No `aria-live` anywhere.** `useAlertSocket` pushes new alerts in real time but the arrival is silent to screen readers and has no visual flash; save-status spans and validation hints are unannounced. *Fix: F6.*

**S8 — Hand-rolled modals lack focus management.** The two most security/clinically-significant modals — the forced `ChangePasswordModal` and the encounter **sign-off** dialog (`EncounterNotePage.tsx:547-578`) — plus `care-lists/OrderPanel` and `BatchOrderModal` are hand-rolled `fixed inset-0` divs with no focus trap, ESC, scroll-lock, or focus restoration. Radix `Dialog`/`Sheet`/`AlertDialog` provide all of this. *Fix: migrate to primitives (preserve the non-dismissable contract via `preventDefault` on outside/escape).*

**S9 — Keyboard & ARIA gaps.** `tabIndex={-1}` on 4 password toggles (unreachable); no skip-to-content link (despite `id="main-content"`); the sidebar-collapse logo isn't keyboard-operable; expand/collapse buttons lack `aria-expanded`/`aria-controls` (recurs in Conditions, Encounters, Surveillance, Bundles, CareGaps, admin); icon-only buttons and charts lack accessible names; tables lack `<th scope>`. *Fix: per-component, mostly free once primitives are adopted.*

**S10 — Contrast & color choices.** `opacity-75` + `text-xs` on already-`text-dim` past meds (`MedicationsTab.tsx:134`) risks failing AA; must-read "unmet requirement" hints use ghost-level color (`ChangePasswordModal.tsx:239`); `DataQualityPage` styles the *constructive* Confirm as danger-crimson. *Fix: token-correct colors.*

### 🟡 P2 — Design-system consistency

**S11 — Primitives exist but 14/21 pages use none.** Raw `<table>` in `BundlesPage`, `BatchOrderModal`, `FlowsheetGrid`, `DataQualityPage` (only admin uses `Table`); ≥5 distinct hand-rolled tab implementations (AlertsPage, SurveillancePage ×2, CloseTheLoop, Anticipatory, PopulationFinder, CohortManager, AdminPage — Radix `Tabs` used nowhere); `SettingsPage` hand-rolls a `Toggle` (Radix `Switch` exists) and a native `<select>` *in the same file that uses `Select` elsewhere*. *Fix: systematic primitive migration, page by page.*

**S12 — Component-layer classes bypassed.** `.alert-*` reinvented with inline hex (`AlertsPage.tsx:36-62`); `.stats-strip` hand-rolled (`CloseTheLoopPage.tsx:35-62`, `dashboard/StatsStrip.tsx`); `.progress-*` hand-rolled with inline-width divs (`CodingPage`, `OverviewTab`); `.gauge-*` hand-rolled as SVG arcs and **`ArcGauge` duplicated verbatim** across Measures + Bundles; `.timeline-*` shipped but **entirely unused** despite the patient chart promising a timeline; `.empty-state` bypassed with ad-hoc icons carrying dead `text-2xl` classes. *Fix: F3 + adopt the existing classes.*

**S13 — Off-token colors & dead theming.** Non-existent tokens referenced: `bg-blue`/`text-blue` (`care-lists/PatientBundleGroup.tsx:65`), `bg-cyan` (`care-lists/helpers.tsx:31`), `surface-alt`, `label-text`. `.progress-*` gradients hardcode hex (`globals.css:307-310`) so performance bars **don't theme** in light mode. The entire auth surface (Login/Register/ChangePassword) is ~930 lines of inline `<style>` with hardcoded hex and non-system fonts (EB Garamond/DM Sans/Fira Code vs Source Serif 4/Source Sans 3/IBM Plex Mono) that **stays dark in light mode**. *Fix: replace non-tokens; convert `.progress-*` to `rgb(var(--…))`; re-skin auth onto tokens (preserve the intentionally-dark login splash).*

### 🟢 P3 — Information architecture & navigation

**S14 — Flat, un-grouped 16-item nav.** `AppShell` renders one flat array with no section headers, opaque labels ("Finder", "Loops"), and a **duplicate `ShieldCheck` icon** (Loops *and* Admin) — a real wayfinding bug in the collapsed icon rail. *Fix: F4 with grouping — Clinical / Quality & Care Gaps / Population / Data & Ops.*

**S15 — Two search components, one dead; nav lists drift.** `GlobalSearch` (richer) is imported nowhere; `CommandPalette` (thinner, 7 of 16 routes) is live; they even expect different API shapes (`patients` vs `results`). *Fix: consolidate to one on the `command.tsx` primitive, driven by F4.*

**S16 — No mobile nav, no breadcrumbs.** The 60px rail persists on phones (no `Sheet` drawer though `sheet.tsx` exists); the roster *hides the MRN* on mobile (the clinical identifier disappears); Settings' two-pane crushes on narrow; deep routes have no breadcrumb trail. *Fix: responsive shell + keep MRN at all breakpoints.*

### 🔵 P4 — Clinical workflow depth

**S17 — The roster fails its core job.** `PatientsPage` is a name/MRN browser with **fake sort icons**, no risk tier, no open-care-gap count, no last-encounter, no default risk sort, no filters, no bulk actions. A population-health clinician can't triage *who needs attention* without opening every chart. The data already exists in the detail `summary` + bundle endpoints. *Fix: real columns + default risk-desc sort + filters + bulk select.*

**S18 — Drill-down spine broken in the middle.** Bundle → measure → patient: the measure tier is rarely clickable (`BundlesPage.tsx:442-454` inert rows), and `MeasuresPage`'s **"Not compliant" cohort — the actual gap list — isn't a link** though Eligible/Compliant are. *Fix: make every measure/gap count a `Link` to `/patients?measure=X&cohort=gap`.*

**S19 — Nothing is sorted most-urgent-first.** AlertsPage, SurveillancePage, CloseTheLoop, CodingPage all render API order on triage surfaces where urgency is the axis. *Fix: client-side severity/score/overdue sort.*

**S20 — No bulk actions or optimistic updates on worklists.** AlertsPage = 50 clicks to acknowledge 50; every acknowledge/resolve/disposition triggers a full-list refetch with visible flicker and no undo. *Fix: bulk-action bars + optimistic `onMutate` with rollback + undo toasts.*

**S21 — No benchmarks on quality pages.** Measures/Bundles have zero target comparison (no goal line, no MIPS threshold, no percentile); the only trend (`TrendBadge`) is hardcoded to 0. A quality lead can't tell if 68% is good. *Fix: benchmark markers + "gap-to-target"; wire or remove the dead trend.*

**S22 — Dashboard & mock/dead data erode trust.** `USE_MOCK_SCHEDULE = true` (flagship panel is fake), hardcoded login hero stats + demo creds in the bundle, "1M+ patients" in dead search, hardcoded cohort dispositions. *Fix: wire live data or gate mocks behind an env flag with a visible "Demo data" badge.*

### ⚪ P5 — Decomposition & polish

**S23 — Monoliths.** `BundlesPage.tsx` (813 lines, one 339-line god-component) → decompose into `bundles/` mirroring `care-lists/`. `SettingsPage.tsx` (957 lines) → split into `pages/settings/sections/*`. `CohortManagerPage` → expand from its terse single file into `cohort-manager/`.

**S24 — DRY drift.** ~6 local `formatDate()` copies, ~3 divergent `statusBadge()` (with "Active" = amber in one place, teal in another), duplicated `ArcGauge`/`complianceColor`, `PatientAvatar` size map disagreeing with `.patient-avatar-*` tokens. *Fix: consolidate to `utils/` + shared components.*

**S25 — Microinteraction gaps.** No entrance highlight on newly-arrived alerts; dynamic `stagger-${idx}` classes at purge risk; ASCII vs glyph ellipsis drift; Recharts `formatter` missing `as never` (build-fragile per project convention).

---

## 6. Prioritized remediation roadmap

Sequenced so that **high-leverage foundational work lands first** (one fix resolving many findings), then safety, then accessibility, then consistency, then IA/workflow, then polish. Each phase has a clear definition of done. Phases are sized to land as **sequential commits on `main`**, not long-lived worktrees.

### Phase 0 — Foundations (F1–F8)
Build the 8 shared building blocks in §4. No page rewrites yet — just the primitives/hooks/components the rest of the plan consumes.
**DoD:** `<DataBoundary>`, `<SeverityIndicator>`, `components/charts/*`, nav registry, `useUnsavedChangesGuard`, aria-live announcer, typography pipeline, and `useConfirm` all exist with unit tests; `npx tsc --noEmit` + `npx vite build` green.

### Phase 1 — Patient safety & data integrity (S1–S6) 🔴
The clinical-risk phase. Highest priority regardless of polish.
- Apply `<SeverityIndicator>` (F2) to every color-only surface (S1).
- Wrap every clinical data query in `<DataBoundary>` (F1) — kill false-empty (S2). Start with `CareListsPage` (it actively lies on error).
- Relabel/repair `RiskTierCard` (S3).
- Adopt `useUnsavedChangesGuard` + Sonner error toasts in EncounterNote & SuperNote; add SuperNote autosave (S4).
- Ship the typography fix (S5 / F7) so the editor renders.
- Route destructive ops through `useConfirm` (S6 / F8).
**DoD:** No clinical surface conveys severity by color alone; no query renders empty-on-error; the editor renders styled prose in both themes; every destructive action confirms. Verified by the Playwright pass in both themes + a CVD-simulation screenshot check.

### Phase 2 — Accessibility baseline (S7–S10) 🟠
- aria-live announcer wired to alerts arrival + save indicators + validation (S7 / F6).
- Migrate hand-rolled modals to Radix `Dialog`/`Sheet`/`AlertDialog` — **this single move fixes focus-trap/ESC/restore for the sign-off and forced-password modals** (S8).
- Remove `tabIndex={-1}` toggles; add skip link; make the collapse control a real `<button>`; add `aria-expanded`/`aria-controls` to all disclosures; `aria-label` icon-only buttons & charts; `<th scope>` on tables (S9).
- Fix contrast/inverted-color choices (S10).
**DoD:** axe-core/Lighthouse a11y pass clean on the top 10 routes; keyboard-only walkthrough of login → chart → note → sign-off succeeds.

### Phase 3 — Design-system consistency (S11–S13) 🟡
Page-by-page primitive migration (the 14 zero-primitive pages), in this order of impact:
1. Tables → shadcn `Table` (`BundlesPage`, `FlowsheetGrid`, `DataQualityPage`, `BatchOrderModal`).
2. Tabs → shadcn `Tabs` (all ≥5 hand-rolled instances).
3. `SettingsPage` `Toggle`→`Switch`, native `<select>`→`Select`.
4. Charts/bars/gauges → `components/charts/*` (F3); adopt `.alert-*`/`.stats-strip`/`.progress-*`/`.timeline-*`/`.empty-state`.
5. Replace non-tokens (`blue`/`cyan`/`surface-alt`/`label-text`); convert `.progress-*` gradients to tokens; re-skin the auth surface onto tokens (S13).
**DoD:** `grep` shows zero raw `<table>` outside `ui/`, zero hand-rolled tabs, zero non-token color classes; auth pages respond to the light theme; the primitive-import coverage metric goes from 7/21 → 21/21.

### Phase 4 — IA & navigation (S14–S16) 🟢
- Grouped nav registry (F4) driving both shell and a single consolidated search; delete `GlobalSearch` dead code; relabel/disambiguate icons (S14–S15).
- Responsive shell: `Sheet` drawer under a breakpoint; keep MRN at all widths; breadcrumbs for deep routes (S16).
**DoD:** nav is grouped with section headers; one search component; mobile renders a drawer; `/patients/:id/supernote` shows a breadcrumb.

### Phase 5 — Clinical workflow depth (S17–S22) 🔵
- Rebuild the roster as a real triage surface (risk tier, gap count, last-encounter, default risk-desc sort, filters, bulk select) (S17).
- Wire the drill-down spine: every measure/gap count → filtered patient list (S18).
- Sort all triage surfaces most-urgent-first (S19).
- Bulk actions + optimistic updates + undo on worklists (S20).
- Benchmark markers + gap-to-target on Measures/Bundles; wire or remove the dead trend (S21).
- Wire the dashboard schedule to live data (or flag+label the mock) and purge marketing/dead data (S22).
**DoD:** a clinician can go roster → highest-risk patient → open gap → patient list → bulk order without a dead end; the dashboard shows real data.

### Phase 6 — Decomposition & polish (S23–S25) ⚪
- Decompose `BundlesPage`, `SettingsPage`, `CohortManagerPage`.
- Consolidate `formatDate`/`statusBadge`/avatar-size DRY drift.
- Microinteraction polish; safelist stagger classes; `as never` on Recharts formatters.
**DoD:** no file > 800 lines; one `formatDate`, one severity badge; entrance animations survive prod build.

---

## 7. Suggested sequencing & checkpoints

- **Recommended order:** Phase 0 → 1 → 2 → 3 → 4 → 5 → 6. Safety and a11y (1–2) before cosmetics (3) is the clinically correct order, and Phase 0 makes 1–3 fast.
- **Natural review gates** (per the working-style preference — check in at gates, not after every step): after Phase 0 (foundations land), after Phase 1 (safety — recommend a clinician review), and after Phase 4 (IA changes are user-visible).
- **Worktree caution:** these are sequential `main` commits, not long-lived worktrees (avoids the sweep-regression hazard). One phase ≈ a small series of commits.

## 8. Verification & rollout

- **Per change:** `npx tsc --noEmit` **and** `npx vite build` (vite is stricter and catches `UNRESOLVED_IMPORT`/purge issues tsc misses), plus `vitest run`.
- **Visual:** Playwright screenshot sweep across all 21 routes in **both** dark and light themes (this also closes the "not yet visually verified" gap from §2). Add a CVD-simulation pass for the severity work.
- **A11y:** axe-core in the Playwright run; manual keyboard-only walkthrough of the critical flows.
- **Deploy:** prod is `systemd medgnosis-api` + Apache serving `apps/web/dist`; rebuild with `./deploy.sh --frontend`, then `chmod -R o+rX dist`. Verify end-to-end before declaring done.

## 9. What this plan deliberately does *not* do

- **No design-system rebuild.** The tokens, primitives, and component layer are good; the work is *adoption*, not replacement.
- **No auth-flow changes.** All auth recommendations are presentation-only and preserve the protected contract in `.claude/rules/auth-system.md` (Create-Account link, non-dismissable forced modal, `must_change_password`, enumeration-safe copy, rate limiting, sender).
- **No backend/API redesign.** Where data is missing (benchmarks, structured exclusions, stable A&P ids, real risk scores), the plan notes the API need but scopes the frontend fix.

---

## Appendix — notable page-specific items not elevated above

- `PatientAvatar.getInitials` (`:38-40`) can throw on empty/space-only names (unguarded `parts[0][0]`).
- `EncountersTab` re-implements pagination instead of the shared `<Pagination>` (which is A−-grade and used by the roster).
- `ObservationTrendChart.parseReferenceRange` (`:43-59`) mis-parses compound BP ranges (`<120/80` → `high:120`) — a wrong reference line is clinical misinformation; prefer structured low/high from the API.
- `FhirTab` sync & schedule-type `Select` share a single `isPending` across all rows (clicking one disables all).
- `MeasuresPage` collapses denominator exclusions/exceptions into "compliant/eligible" — quality leads audit exclusions as a distinct bucket.
- `AdminPage` `/admin` route has no `RequireRole` guard — authorization lives in a component body (security smell + content flash).
- `SuperNotePage` "Include in note" checkbox and Login "Keep me signed in" are wired to state but never used (dead controls).
