# ShadCN/ui Adoption & Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt ShadCN/ui as the shared component primitive layer for the Medgnosis web app — replacing hand-rolled buttons, modals, inputs, selects, tables, menus, and toasts with accessible Radix-based primitives — while preserving the existing "Clinical Obsidian" token system, palette engine, and light/dark theming unchanged.

**Architecture:** ShadCN components are *copied into* the repo (`src/components/ui/`) and styled with Tailwind utilities that resolve to Clinical Obsidian channel tokens via a ~40-line semantic bridge in `tailwind.config.ts`. We do NOT use ShadCN's default slate/HSL theme — its semantic class names (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`) are aliased onto our existing `--void/--s0/--bright/--edge/--primary` tokens so the entire ShadCN surface themes for free. `primary`/`ring` point at the palette-engine var (`--primary`) so runtime palette switching also drives ShadCN. Legacy CSS component classes (`.btn`, `.input-field`, `.modal-*`) coexist with ShadCN during migration and are retired only in the final phase, so the app builds and works at every commit.

**Tech Stack:** React 19, TypeScript (strict), Vite 6, Tailwind 3.4, `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `cmdk`, `sonner`, `lucide-react`, Vitest + Testing Library (jsdom).

---

## Status: Foundation already proven (spike, branch `feature/shadcn-spike`)

The following exist and are verified (`tsc` exit 0, `vite build` clean, light+dark screenshots confirmed):

- `src/lib/utils.ts` — `cn()` helper
- `components.json` — ShadCN CLI config (style `new-york`, aliases `@/components`, `@/lib/utils`)
- `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx` — token-wired
- `tailwind.config.ts` — semantic bridge (`background/foreground/border/input/ring/primary/secondary/muted/card/popover/destructive`) + `tailwindcss-animate` plugin
- `@radix-ui/react-dialog` dependency added
- TEMP: `src/pages/ShadcnSpike.tsx` + public `/shadcn-spike` route (removed in Phase F)
- Real integration: "Definition" Dialog in `src/pages/MeasuresPage.tsx`

This plan formalizes that foundation (Phase 0 closes two gaps the spike deferred: the `accent` mapping and a CLI workflow decision) and extends it to the full component set and page migration.

---

## Migration Principles (apply throughout)

1. **The bridge does the theming.** Generated/added ShadCN components reference semantic names that already alias to our tokens. Do NOT hardcode hex/slate colors in any `ui/` component.
2. **One commit per primitive, one commit per migrated file.** The app must `vite build` clean at every commit.
3. **Coexistence.** Never delete a legacy CSS class until the final phase confirms zero references.
4. **Protected zones (project rule `auth-system.md`):** `LoginPage.tsx`, `RegisterPage.tsx`, `ChangePasswordModal.tsx`, `AuthGuard.tsx` are **additions-only**. The `ChangePasswordModal` must stay non-dismissable — when migrating it to a Dialog primitive you MUST keep `onOpenChange` a no-op and omit any close affordance. Re-verify the `must_change_password` flow after touching these.
5. **Verify, don't assert.** Every primitive gets an RTL smoke test; every migrated page must build clean and pass a visual spot-check.

---

## Component → Token bridge (reference — established in Phase 0)

| ShadCN semantic name | Clinical Obsidian token | Notes |
|---|---|---|
| `background` / `foreground` | `--s0` / `--bright` | elevated surface |
| `card` / `card-foreground` | `--s1` / `--bright` | |
| `popover` / `popover-foreground` | `--s0` / `--bright` | |
| `primary` / `primary-foreground` | `var(--primary)` / `--accent-fg` | **palette-aware** (full value, no alpha) |
| `primary-dark` | `var(--primary-dark)` | hover fill |
| `secondary` / `secondary-foreground` | `--s1` / `--bright` | |
| `muted` / `muted-foreground` | `--s2` / `--dim` | |
| `accent` / `accent-foreground` | `--s2` / `--bright` | ShadCN hover surface (added Phase 0; 0 collisions confirmed) |
| `destructive` / `destructive-foreground` | `--crimson` / `--accent-fg` | |
| `border` / `input` | `--edge` / `--edge` | |
| `ring` | `var(--primary)` | focus ring |

Radius: Tailwind default `rounded-md` (6px) ≈ `--radius-btn`, `rounded-lg` (8px) ≈ `--radius-card` — generated components align without `--radius` wiring (proven in spike).

## Legacy class → ShadCN primitive map (the Migration Recipe reference)

| Legacy pattern | Replace with | Component file |
|---|---|---|
| `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-icon` `.btn-sm` `.btn-lg` | `<Button variant=… size=…>` | `ui/button.tsx` |
| `.input-field` | `<Input>` | `ui/input.tsx` |
| `<label>` for a field | `<Label>` | `ui/label.tsx` |
| `.select-field`, native `<select>` | `<Select>` + parts | `ui/select.tsx` |
| `<textarea class=input-field>` | `<Textarea>` | `ui/textarea.tsx` |
| custom checkbox `<input type=checkbox>` | `<Checkbox>` | `ui/checkbox.tsx` |
| `@radix-ui/react-switch` inline | `<Switch>` | `ui/switch.tsx` |
| `.badge` `.badge-crimson` … | `<Badge variant=…>` | `ui/badge.tsx` |
| `.surface` / `.card` div with header | `<Card>`/`CardHeader`/`CardContent` | `ui/card.tsx` |
| `.modal-backdrop`+`.modal-container` (generic) | `<Dialog>` + parts | `ui/dialog.tsx` |
| confirm/cancel modal (`ConfirmModal`) | `<AlertDialog>` + parts | `ui/alert-dialog.tsx` |
| custom dropdown menu (`absolute z-… setOpen`) | `<DropdownMenu>` + parts | `ui/dropdown-menu.tsx` |
| custom filter popover | `<Popover>` + parts | `ui/popover.tsx` |
| `title=""` hover tooltips (key ones) | `<Tooltip>` + parts | `ui/tooltip.tsx` |
| `cmdk` usage (`CommandPalette`, `GlobalSearch`) | `<Command>` + parts | `ui/command.tsx` |
| `Toast.tsx` custom toaster | `<Toaster>` (sonner) + `toast()` | `ui/sonner.tsx` |
| `.data-table` | `<Table>` + parts | `ui/table.tsx` |
| `.divider` | `<Separator>` | `ui/separator.tsx` |
| `.skeleton*` | `<Skeleton>` | `ui/skeleton.tsx` |
| right-side slide-in panel (`OrderPanel`) | `<Sheet>` + parts | `ui/sheet.tsx` |

---

## File Structure

**Created (component library):** `src/components/ui/{input,label,select,textarea,checkbox,switch,badge,card,tabs,tooltip,dropdown-menu,popover,command,sonner,table,alert-dialog,separator,skeleton,sheet}.tsx` and matching `*.test.tsx` smoke tests under the same directory. Plus `scripts/ui-shot.mjs` (reusable visual-check harness, promoted from the spike throwaway).

**Modified (bridge/infra):** `tailwind.config.ts` (accent mapping), `package.json` (radix deps + sonner), `src/App.tsx` (sonner `<Toaster>` mount; remove spike route in Phase F), `src/styles/globals.css` (retire legacy classes in Phase F).

**Migrated (consumers, by area):** shared components (`ConfirmModal`, `Toast`, `CommandPalette`, `GlobalSearch`, `Pagination`, `TabBar`, `AppShell`), then pages grouped: admin (`UsersTab`, `AuditTab`, `EtlTab`, `FhirTab`, `DashboardTab`), care-lists (`OrderPanel`, `BatchOrderModal`, `CareListsPage`, `PatientBundleGroup`), patient (`*Tab.tsx`), and top-level pages (`MeasuresPage`, `BundlesPage`, `PatientsPage`, `SettingsPage`, `EncounterNotePage`, `SuperNotePage`, `SurveillancePage`, …).

---

## Phase 0 — Foundation hardening (close spike gaps)

### Task 0.1: Add the `accent` mapping to the bridge

**Files:**
- Modify: `apps/web/tailwind.config.ts` (colors block, after `destructive`)

- [ ] **Step 1: Add the mapping.** Insert after the `destructive` color object:

```ts
        // ShadCN hover surface (NOT our brand accent — legacy `accent` object
        // below has 0 class usages, confirmed by grep). Distinct top-level key.
        accent: {
          DEFAULT:    'rgb(var(--s2) / <alpha-value>)',
          foreground: 'rgb(var(--bright) / <alpha-value>)',
        },
```

- [ ] **Step 2: Remove the now-dead legacy `accent` object.** Delete the legacy block:

```ts
        accent: {
          primary: 'rgb(var(--teal) / <alpha-value>)',
          success: 'rgb(var(--emerald) / <alpha-value>)',
          warning: 'rgb(var(--amber) / <alpha-value>)',
          error:   'rgb(var(--crimson) / <alpha-value>)',
        },
```

- [ ] **Step 3: Verify build.** Run: `cd apps/web && npx vite build`. Expected: clean build, no errors. (0 files use `accent-primary` etc., confirmed by inventory.)

- [ ] **Step 4: Commit.**

```bash
git add apps/web/tailwind.config.ts
git commit -m "feat(ui): map shadcn accent token; drop unused legacy accent object"
```

### Task 0.2: Promote the visual-check harness

**Files:**
- Create: `apps/web/scripts/ui-shot.mjs`

- [ ] **Step 1: Write the harness** (parameterized route + theme list; serves the built app on a free port externally — the operator runs `npx vite preview --port 4180 --strictPort` first):

```js
import { chromium } from '@playwright/test';

const ROUTE = process.argv[2] ?? '/shadcn-spike';
const BASE = `http://localhost:4180${ROUTE}`;
const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => {
    localStorage.setItem('mg_theme', t);
    localStorage.setItem('mg_palette', 'clinical-teal');
  }, theme);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const slug = ROUTE.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root';
  await page.screenshot({ path: `/tmp/ui-${slug}-${theme}.png`, fullPage: true });
  await ctx.close();
  console.log(`captured ${theme} ${ROUTE}`);
}
await browser.close();
```

- [ ] **Step 2: Smoke-run it.** Run (two terminals): `cd apps/web && npx vite build && npx vite preview --port 4180 --strictPort` then `node apps/web/scripts/ui-shot.mjs /shadcn-spike`. Expected: `/tmp/ui-shadcn-spike-dark.png` and `-light.png` written.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/scripts/ui-shot.mjs
git commit -m "chore(ui): add reusable light/dark screenshot harness"
```

---

## Phase 1 — Form primitives

Each task follows the same shape: **add component → re-theme if needed → write RTL smoke test → run test → build → commit.** Full code is given for hand-authored components; for CLI-generated ones the exact post-generation checklist is given (it is complete, not a placeholder).

### CLI generation post-step checklist (referenced by Phase 1–3 tasks)

When a task says "generate via CLI", run `cd apps/web && npx shadcn@latest add <name>` then ALWAYS:
1. Open the generated `src/components/ui/<name>.tsx`.
2. If the CLI appended a CSS variable block (`:root { --background: … }`, `.dark { … }`) to `src/styles/globals.css`, **delete that block** — our bridge maps names in `tailwind.config.ts`, so those vars are dead and would not match our channel format.
3. Search the component for hardcoded colors (`bg-black`, `bg-white`, `text-slate-*`, `/80`, `border-zinc-*`); replace per the token bridge (overlays → `bg-[var(--overlay-backdrop,rgba(0,0,0,0.6))]`).
4. Convert any `export default` to a named export (project rule: named exports only).
5. Confirm imports use `@/lib/utils` and `@/components/ui/*`.

### Task 1.1: Input

**Files:**
- Create: `apps/web/src/components/ui/input.tsx`
- Test: `apps/web/src/components/ui/input.test.tsx`

- [ ] **Step 1: Write the failing test.**

```tsx
import { render, screen } from '@testing-library/react';
import { Input } from './input';

test('renders an input that accepts a placeholder and value', () => {
  render(<Input placeholder="Search measures" defaultValue="abc" aria-label="q" />);
  const el = screen.getByLabelText('q') as HTMLInputElement;
  expect(el).toBeInTheDocument();
  expect(el).toHaveAttribute('placeholder', 'Search measures');
  expect(el.value).toBe('abc');
});
```

- [ ] **Step 2: Run test, verify it fails.** Run: `cd apps/web && npx vitest run src/components/ui/input.test.tsx`. Expected: FAIL ("Cannot find module './input'").

- [ ] **Step 3: Write the component** (token-wired, mirrors `.input-field`):

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-input border border-edge/50 bg-s0 px-3 py-2 text-sm text-bright font-ui',
        'placeholder:text-ghost transition-colors',
        'focus-visible:outline-none focus-visible:border-[var(--border-focus)] focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
```

- [ ] **Step 4: Run test, verify it passes.** Run: `cd apps/web && npx vitest run src/components/ui/input.test.tsx`. Expected: PASS.

- [ ] **Step 5: Build + commit.**

```bash
cd apps/web && npx vite build && cd ../..
git add apps/web/src/components/ui/input.tsx apps/web/src/components/ui/input.test.tsx
git commit -m "feat(ui): add Input primitive wired to Clinical Obsidian tokens"
```

### Task 1.2: Label

**Files:**
- Create: `apps/web/src/components/ui/label.tsx`
- Test: `apps/web/src/components/ui/label.test.tsx`

- [ ] **Step 1: Failing test.**

```tsx
import { render, screen } from '@testing-library/react';
import { Label } from './label';

test('associates with a control via htmlFor', () => {
  render(<Label htmlFor="email">Email</Label>);
  expect(screen.getByText('Email')).toHaveAttribute('for', 'email');
});
```

- [ ] **Step 2: Run, verify fail.** Run: `cd apps/web && npx vitest run src/components/ui/label.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Install dep + write component.** Run: `npm install @radix-ui/react-label@^2.1.1 -w @medgnosis/web --legacy-peer-deps`. Then:

```tsx
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium font-ui text-dim leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';

export { Label };
```

- [ ] **Step 4: Run, verify pass.** Run: `cd apps/web && npx vitest run src/components/ui/label.test.tsx`. Expected: PASS.

- [ ] **Step 5: Build + commit.**

```bash
cd apps/web && npx vite build && cd ../..
git add apps/web/src/components/ui/label.tsx apps/web/src/components/ui/label.test.tsx apps/web/package.json package-lock.json
git commit -m "feat(ui): add Label primitive"
```

### Task 1.3: Select

**Files:**
- Create: `apps/web/src/components/ui/select.tsx`
- Test: `apps/web/src/components/ui/select.test.tsx`

- [ ] **Step 1: Failing test.**

```tsx
import { render, screen } from '@testing-library/react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './select';

test('renders a closed select trigger with placeholder', () => {
  render(
    <Select>
      <SelectTrigger aria-label="status"><SelectValue placeholder="Any status" /></SelectTrigger>
      <SelectContent><SelectItem value="active">Active</SelectItem></SelectContent>
    </Select>,
  );
  expect(screen.getByLabelText('status')).toHaveTextContent('Any status');
});
```

- [ ] **Step 2: Run, verify fail.** Run: `cd apps/web && npx vitest run src/components/ui/select.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Generate via CLI** (`npx shadcn@latest add select`), then apply the **CLI post-step checklist** above. Verify the trigger uses `border-input bg-s0`, the content uses `bg-popover text-popover-foreground border-border`, and the focused item uses `focus:bg-accent focus:text-accent-foreground` (now token-mapped). `@radix-ui/react-select` is added by the CLI.

- [ ] **Step 4: Run, verify pass.** Run: `cd apps/web && npx vitest run src/components/ui/select.test.tsx`. Expected: PASS.

- [ ] **Step 5: Build + commit.**

```bash
cd apps/web && npx vite build && cd ../..
git add apps/web/src/components/ui/select.tsx apps/web/src/components/ui/select.test.tsx apps/web/package.json package-lock.json
git commit -m "feat(ui): add Select primitive (token-rethemed)"
```

### Task 1.4: Textarea — same shape as Input

**Files:** Create `apps/web/src/components/ui/textarea.tsx` + test.

- [ ] **Step 1: Failing test** (`renders a textarea with rows`, asserts `getByRole('textbox')`). Run to fail.
- [ ] **Step 2: Component:**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-input border border-edge/50 bg-s0 px-3 py-2 text-sm text-bright font-ui',
        'placeholder:text-ghost transition-colors',
        'focus-visible:outline-none focus-visible:border-[var(--border-focus)] focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
```

- [ ] **Step 3: Run pass → build → commit** `feat(ui): add Textarea primitive`.

### Task 1.5: Checkbox — generate via CLI

- [ ] **Step 1:** Failing test (`renders an unchecked checkbox`, `getByRole('checkbox')`). Run to fail.
- [ ] **Step 2:** `npx shadcn@latest add checkbox` + CLI post-step checklist. Verify checked state uses `bg-primary text-primary-foreground border-primary`.
- [ ] **Step 3:** Run pass → build → commit `feat(ui): add Checkbox primitive`.

### Task 1.6: Switch — generate via CLI (replaces inline `@radix-ui/react-switch`)

- [ ] **Step 1:** Failing test (`renders a switch`, `getByRole('switch')`). Run to fail.
- [ ] **Step 2:** `npx shadcn@latest add switch` + CLI post-step checklist. Verify checked track uses `data-[state=checked]:bg-primary`, unchecked `data-[state=unchecked]:bg-muted`.
- [ ] **Step 3:** Run pass → build → commit `feat(ui): add Switch primitive`.

---

## Phase 2 — Overlay & navigation primitives

### Task 2.1: AlertDialog (for ConfirmModal semantics) — generate via CLI

- [ ] **Step 1:** Failing test: render an open `AlertDialog` with title "Delete?" and assert `getByRole('alertdialog')` + the title text. Run to fail.
- [ ] **Step 2:** `npx shadcn@latest add alert-dialog` + CLI post-step checklist. Re-theme overlay scrim to `bg-[var(--overlay-backdrop,rgba(0,0,0,0.6))] backdrop-blur-sm` and content to `bg-background border-border rounded-panel shadow-panel` (match `ui/dialog.tsx`). The action button should use `buttonVariants()` default; cancel uses `buttonVariants({ variant: 'outline' })`.
- [ ] **Step 3:** Run pass → build → commit `feat(ui): add AlertDialog primitive (token-rethemed)`.

### Task 2.2: DropdownMenu — generate via CLI

- [ ] **Step 1:** Failing test: render `DropdownMenu` with `DropdownMenuTrigger` "Actions" and assert the trigger button renders. Run to fail.
- [ ] **Step 2:** `npx shadcn@latest add dropdown-menu` + CLI post-step checklist. Verify content `bg-popover text-popover-foreground border-border`, items `focus:bg-accent focus:text-accent-foreground`.
- [ ] **Step 3:** Run pass → build → commit `feat(ui): add DropdownMenu primitive`.

### Task 2.3: Popover — generate via CLI

- [ ] **Step 1:** Failing test (render trigger). Run to fail.
- [ ] **Step 2:** `npx shadcn@latest add popover` + checklist (`bg-popover border-border`).
- [ ] **Step 3:** Run pass → build → commit `feat(ui): add Popover primitive`.

### Task 2.4: Tooltip — generate via CLI

- [ ] **Step 1:** Failing test (render `TooltipProvider`+`Tooltip` with trigger). Run to fail.
- [ ] **Step 2:** `npx shadcn@latest add tooltip` + checklist. Content uses `bg-s1 text-bright border border-edge/50` (override default popover for a denser tooltip surface).
- [ ] **Step 3:** Run pass → build → commit `feat(ui): add Tooltip primitive`. Mount one `<TooltipProvider>` near the app root in a later task (Task 4.6, AppShell).

### Task 2.5: Command — generate via CLI (wraps existing `cmdk`)

- [ ] **Step 1:** Failing test: render `Command` + `CommandInput` (`getByRole('combobox')` or placeholder text). Run to fail.
- [ ] **Step 2:** `npx shadcn@latest add command` + checklist. It depends on `cmdk` (already installed) and `ui/dialog.tsx` (exists). Verify `CommandDialog` reuses our `DialogContent`.
- [ ] **Step 3:** Run pass → build → commit `feat(ui): add Command primitive`.

### Task 2.6: Sonner (Toaster) — generate via CLI, replaces `Toast.tsx`

**Files:** Create `apps/web/src/components/ui/sonner.tsx`; Modify `apps/web/src/App.tsx`.

- [ ] **Step 1:** Failing test: render `<Toaster />` (from `ui/sonner`) and assert it mounts without throwing (`container.querySelector('[data-sonner-toaster]')` after a tick) — or simpler, assert the module exports `Toaster`. Run to fail.
- [ ] **Step 2:** `npm install sonner@^1.7.1 -w @medgnosis/web --legacy-peer-deps`, then `npx shadcn@latest add sonner` + checklist. Wire the toaster `theme` to the store: read `useThemeStore((s) => s.resolvedTheme)` and pass `theme={resolvedTheme}` and a `toastOptions` classNames block using token classes (`bg-s1 text-bright border-edge/50`).
- [ ] **Step 3:** Mount in `App.tsx` — add `import { Toaster } from './components/ui/sonner.js';` and render `<Toaster />` just inside `<AppProviders>`, before `<CommandPalette />`.
- [ ] **Step 4:** Run pass → build → commit `feat(ui): add sonner Toaster; mount at app root`.

---

## Phase 3 — Layout & data primitives

### Task 3.1: Card — hand-authored

**Files:** Create `apps/web/src/components/ui/card.tsx` + test.

- [ ] **Step 1:** Failing test (`renders Card with CardTitle text`). Run to fail.
- [ ] **Step 2:** Component (maps to `.surface` treatment):

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-panel border border-edge/35 bg-s1 text-bright shadow-panel', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-4', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-heading font-semibold leading-none tracking-tight text-bright', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-dim', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-4 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

- [ ] **Step 3:** Run pass → build → commit `feat(ui): add Card primitive`.

### Task 3.2: Badge — hand-authored cva mirroring semantic badges

**Files:** Create `apps/web/src/components/ui/badge.tsx` + test.

- [ ] **Step 1:** Failing test (`renders crimson badge with text "Overdue"`). Run to fail.
- [ ] **Step 2:** Component:

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-pill border px-2.5 py-0.5 text-xs font-medium font-ui',
  {
    variants: {
      variant: {
        crimson: 'border-crimson/25 bg-crimson/10 text-crimson',
        amber: 'border-amber/25 bg-amber/10 text-amber',
        teal: 'border-teal/25 bg-teal/10 text-teal',
        emerald: 'border-emerald/25 bg-emerald/10 text-emerald',
        violet: 'border-violet/25 bg-violet/10 text-violet',
        info: 'border-info/25 bg-info/10 text-info',
        dim: 'border-edge/35 bg-s2 text-dim',
      },
    },
    defaultVariants: { variant: 'dim' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

- [ ] **Step 3:** Run pass → build → commit `feat(ui): add Badge primitive mirroring semantic badge classes`.

### Task 3.3: Tabs — generate via CLI

- [ ] **Step 1:** Failing test: render `Tabs` with two `TabsTrigger`s, assert `getByRole('tab', { name: 'Overview' })`. Run to fail.
- [ ] **Step 2:** `npx shadcn@latest add tabs` + checklist. Active trigger uses `data-[state=active]:bg-s1 data-[state=active]:text-teal data-[state=active]:shadow-sm`, list uses `bg-s0 border border-edge/35`.
- [ ] **Step 3:** Run pass → build → commit `feat(ui): add Tabs primitive`.

### Task 3.4: Table — generate via CLI

- [ ] **Step 1:** Failing test: render `Table>TableHeader>TableRow>TableHead("Name")`, assert `getByRole('columnheader', { name: 'Name' })`. Run to fail.
- [ ] **Step 2:** `npx shadcn@latest add table` + checklist. Header `text-dim`, row hover `hover:bg-s1`, borders `border-edge/20` to match `.data-table`.
- [ ] **Step 3:** Run pass → build → commit `feat(ui): add Table primitive`.

### Task 3.5: Separator, Skeleton, Sheet — generate via CLI (batch)

- [ ] **Step 1:** `npx shadcn@latest add separator skeleton sheet` + CLI post-step checklist for each. Skeleton uses our shimmer: `className` base `animate-shimmer bg-[length:300%_100%] bg-shimmer rounded-card`. Sheet overlay reuses the dialog scrim; content `bg-background border-edge/35`.
- [ ] **Step 2:** One smoke test per component (render, assert in document). Run to pass.
- [ ] **Step 3:** Build → commit `feat(ui): add Separator, Skeleton, Sheet primitives`.

### Task 3.6: Visual checkpoint — extend the spike showcase

**Files:** Modify `apps/web/src/pages/ShadcnSpike.tsx`.

- [ ] **Step 1:** Add sections rendering Input, Select, Checkbox, Switch, Badge (all variants), Tabs, a Table, and a DropdownMenu.
- [ ] **Step 2:** Run: `cd apps/web && npx vite build && npx vite preview --port 4180 --strictPort` then `node apps/web/scripts/ui-shot.mjs /shadcn-spike`. Inspect `/tmp/ui-shadcn-spike-{dark,light}.png` — every primitive must be legible and correctly themed in BOTH modes.
- [ ] **Step 3:** Commit `chore(ui): expand spike showcase with full primitive set`. **This is the Phase 0–3 acceptance gate — do not proceed to page migration until both screenshots are clean.**

---

## Migration Recipe R1 (page/component consumer migration — referenced by Phases 4–5)

This is the complete, repeatable procedure. "Apply R1 to file X" means execute every step below against file X.

1. **Inventory the file.** Grep it for legacy patterns from the *Legacy class → primitive map* table. List each site.
2. **Add imports** for the needed `@/components/ui/*` primitives.
3. **Replace each site** per the map. Specifics:
   - `.btn-primary` → `<Button>`; `.btn-secondary` → `<Button variant="secondary">`; `.btn-ghost` → `<Button variant="ghost">`; `.btn-danger` → `<Button variant="destructive">`; `.btn-icon` → `<Button variant="ghost" size="icon">`; size `.btn-sm` → `size="sm"`. If the element is an `<a>`/`<Link>`, use `<Button asChild>`.
   - `.input-field` → `<Input>` (preserve `value`/`onChange`/`placeholder`/`aria-label`).
   - native `<select>`/`.select-field` → `<Select>` with `SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`. Wire `value` + `onValueChange` (note: ShadCN Select is value-based, not event-based — map `onChange={(e)=>set(e.target.value)}` to `onValueChange={set}`).
   - generic modal (`.modal-backdrop`+`.modal-container`, manual open state) → `<Dialog open onOpenChange>` + `DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`. Delete the hand-rolled backdrop/escape/click-away code — Radix handles it.
   - confirm/cancel modal → `<AlertDialog>` with `AlertDialogAction`/`AlertDialogCancel`.
   - custom dropdown (`absolute z-… useState(open)`) → `<DropdownMenu>`; delete click-away listeners.
   - `.badge-*` → `<Badge variant="…">`.
   - `.data-table` → `<Table>` parts.
4. **Delete now-dead local state/handlers** (open booleans, refs, keydown/click-away effects) that the primitive replaces.
5. **Typecheck + build.** Run: `cd apps/web && npx tsc --noEmit && npx vite build`. Both must pass.
6. **Visual spot-check.** If the file is reachable at a known route, screenshot it via `ui-shot.mjs <route>` in dark+light and confirm parity. (Auth-gated routes: log in manually with the dev server, or temporarily point the harness at a public wrapper.)
7. **Commit** with `refactor(ui): migrate <file> to shadcn primitives`.

---

## Phase 4 — Shared component migration (apply Recipe R1 unless noted)

### Task 4.1: ConfirmModal → AlertDialog
- [ ] Apply R1 to `apps/web/src/components/ConfirmModal.tsx`, mapping to `<AlertDialog>`. Keep the existing `open`/`onConfirm`/`onCancel`/`title`/`message` props as the public API (internal rewrite only — all call sites keep working). Verify build + that callers (`grep -rl ConfirmModal src`) still typecheck. Commit.

### Task 4.2: Toast.tsx → sonner
- [ ] Replace the custom toaster. Find all `Toast` usages (`grep -rln "from.*Toast" src`); convert each `showToast(...)` call to `toast(...)` / `toast.success(...)` / `toast.error(...)` from `sonner`. Remove `components/Toast.tsx` only after all call sites migrate (defer file deletion to Phase F if any remain). Build + commit `refactor(ui): replace custom Toast with sonner`.

### Task 4.3: CommandPalette → ui/command
- [ ] Apply R1 to `apps/web/src/components/CommandPalette.tsx`, replacing direct `cmdk` `Command` imports with `@/components/ui/command` parts (`Command`, `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`, `CommandEmpty`). Preserve the Cmd+K/`/` open behavior and patient-search logic. Build + visual check (open palette) + commit.

### Task 4.4: GlobalSearch → ui/command
- [ ] Apply R1 to `apps/web/src/components/GlobalSearch.tsx` (same as 4.3). Build + commit.

### Task 4.5: Pagination → Button
- [ ] Apply R1 to `apps/web/src/components/Pagination.tsx` (prev/next/page buttons → `<Button variant="outline" size="sm">` / `size="icon"`). Build + commit.

### Task 4.6: TabBar → Tabs; AppShell switch/buttons + mount TooltipProvider
- [ ] Apply R1 to `apps/web/src/components/patient/TabBar.tsx` → `<Tabs>`. In `apps/web/src/components/AppShell.tsx`: convert any inline switch/icon buttons to `<Switch>`/`<Button size="icon">`, and wrap the routed outlet in a single `<TooltipProvider delayDuration={200}>`. Build + visual check (sidebar + a patient page) + commit.

---

## Phase 5 — Page migration (apply Recipe R1; ordered low→high risk)

Each task = apply R1 to the listed file(s), one commit each. Inventory column lists the confirmed legacy sites to convert.

### Admin area
- [ ] **Task 5.1** `pages/admin/UsersTab.tsx` — inventory: `.input-field`, native `<select>`, modal, `.data-table`. (Highest-density admin file — do first as the template.)
- [ ] **Task 5.2** `pages/admin/AuditTab.tsx` — `.data-table`.
- [ ] **Task 5.3** `pages/admin/EtlTab.tsx` — `.data-table`.
- [ ] **Task 5.4** `pages/admin/FhirTab.tsx` — `.input-field`, `<select>`, modal.
- [ ] **Task 5.5** `pages/admin/DashboardTab.tsx` + `pages/AdminPage.tsx` (tab shell → `<Tabs>`).

### Care-lists area
- [ ] **Task 5.6** `pages/care-lists/OrderPanel.tsx` — `.input-field`, overlay → consider `<Sheet>` if it's a side panel, else `<Dialog>`.
- [ ] **Task 5.7** `pages/care-lists/BatchOrderModal.tsx` — modal → `<Dialog>`.
- [ ] **Task 5.8** `pages/CareListsPage.tsx` — `.input-field`. `pages/care-lists/PatientBundleGroup.tsx` — custom dropdown → `<DropdownMenu>`. `pages/care-lists/StatsStrip.tsx` — keep (display only).

### Top-level pages
- [ ] **Task 5.9** `pages/MeasuresPage.tsx` — `.input-field` (search) → `<Input>`; the Dialog already migrated in the spike. The list-item `<button>` stays custom (complex selectable row — not a Button candidate).
- [ ] **Task 5.10** `pages/BundlesPage.tsx` — `.input-field`, custom dropdown/menu → `<DropdownMenu>`.
- [ ] **Task 5.11** `pages/PatientsPage.tsx` — `.input-field` (search/filters).
- [ ] **Task 5.12** `pages/SettingsPage.tsx` — `<select>`, switches → `<Select>`/`<Switch>`. **Note:** Settings hosts the theme/palette controls; verify theme toggle + palette switch still work after migration.
- [ ] **Task 5.13** `pages/EncounterNotePage.tsx` + `components/encounter/SOAPSectionEditor.tsx` — `.input-field`, `<select>`, `<textarea>` → `<Textarea>`, custom menu → `<DropdownMenu>`.
- [ ] **Task 5.14** `pages/SurveillancePage.tsx` — custom menu → `<DropdownMenu>` / `<Popover>` filters.
- [ ] **Task 5.15** `components/patient/AbbyTab.tsx` — `.input-field`. Other `patient/*Tab.tsx` — convert any `.badge-*`/buttons encountered; most are display-only and need no change.
- [ ] **Task 5.16** Sweep remaining pages (`dashboard/RecentActivitySection.tsx` `.input-field`, `SuperNotePage`, `CloseTheLoopPage`, `AnticipatoryPage`, `DataQualityPage`, `CohortManagerPage`, `CodingPage`, `PopulationFinderPage`, `AlertsPage`): grep each for legacy patterns, apply R1 where present, skip where clean. One commit per file that changes.

---

## Phase F — Finalize: retire legacy CSS + remove spike artifacts

### Task F.1: Confirm zero legacy references
- [ ] **Step 1:** Run, expect empty output for migrated classes:

```bash
cd apps/web/src
grep -rn "btn-primary\|btn-secondary\|btn-ghost\|btn-danger\|btn-icon\|input-field\|select-field\|modal-backdrop\|modal-container\|data-table\b" --include="*.tsx" . | grep -v "components/ui/"
```

- [ ] **Step 2:** For any remaining hit, apply Recipe R1 to that file and commit. Repeat until the grep is empty.

### Task F.2: Remove the legacy component CSS
- [ ] **Step 1:** In `apps/web/src/styles/globals.css`, delete the now-unused `@layer components` blocks: `.btn*`, `.input-field`, `.select-field`, `.modal-backdrop`, `.modal-container`, `.modal-content`, `.modal-animate`, `.data-table*`. **Keep** `.surface*`, `.badge*` (if any non-migrated remain), `.skeleton*` (now via Skeleton — verify), `.nav-item*`, `.timeline*`, `.progress*`, `.stats-strip*`, `.patient-avatar*`, and other non-component utilities unless their grep is also empty.
- [ ] **Step 2:** Run: `cd apps/web && npx vite build`. Expected: clean. CSS bundle should shrink.
- [ ] **Step 3:** Commit `refactor(ui): retire legacy component CSS superseded by shadcn primitives`.

### Task F.3: Remove the temporary spike route
- [ ] **Step 1:** Delete `apps/web/src/pages/ShadcnSpike.tsx`. In `apps/web/src/App.tsx` remove the `ShadcnSpikePage` import and the `/shadcn-spike` route (both lines marked `TEMP`).
- [ ] **Step 2:** Run: `cd apps/web && npx tsc --noEmit && npx vite build`. Expected: clean.
- [ ] **Step 3:** Commit `chore(ui): remove temporary shadcn spike route`.

### Task F.4: Full verification + deploy
- [ ] **Step 1:** Run the full suite: `cd apps/web && npx vitest run && npx tsc --noEmit && npx vite build`. All green.
- [ ] **Step 2:** Visual regression pass: with the dev server running and logged in, click through Dashboard, Patients, Patient Detail, Measures, Care Lists, Admin, Settings in BOTH dark and light + at least two non-default palettes. No regressions.
- [ ] **Step 3:** Re-verify protected auth flow (project rule): Create Account → temp password → forced `ChangePasswordModal` (non-dismissable) → full access. Confirm unchanged.
- [ ] **Step 4:** Deploy per project convention: `./deploy.sh --frontend`.
- [ ] **Step 5:** Update memory `project_medgnosis_theme_system.md` noting ShadCN primitive layer is now the standard, bridge lives in `tailwind.config.ts`.

---

## Self-Review (completed against spec)

- **Spec coverage:** Pain points were (a) component consistency and (b) polish/motion/density. (a) is covered by the shared primitive library (Phases 1–3) replacing 123 raw buttons / ~8 bespoke modals / 11 input files / 3 tables; (b) by consistent token-driven primitives + framer/animate motion retained. Light/dark + palette preservation is enforced by the bridge (Phase 0) and the visual gates (Tasks 3.6, F.4).
- **Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". The CLI post-step checklist and Recipe R1 are fully specified once and invoked by reference (DRY, not placeholder). Hand-authored components include complete source.
- **Type/name consistency:** Component+export names match the import lists in the recipe and the bridge table (`Button`, `Input`, `Select`+parts, `Badge`, `Card`+parts, `Dialog`/`AlertDialog`, `DropdownMenu`, `Toaster`/`toast`). All exports are named (project rule).
- **Known risk flagged:** protected auth components are additions-only with explicit re-verification steps (Principles #4, Task F.4 #3).
