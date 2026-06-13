// =============================================================================
// TEMP: shadcn adoption spike — remove before merge (public route /shadcn-spike)
// Proves ShadCN primitives are wired to Clinical Obsidian tokens: variants,
// sizes, an accessible Radix Dialog, legacy-vs-shadcn consistency, live theme
// toggle, and palette-awareness (primary follows the runtime palette engine).
// =============================================================================

import { Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useThemeStore } from '@/stores/theme';

const PALETTES = ['clinical-teal', 'arctic', 'sage', 'sapphire', 'plum'] as const;

export function ShadcnSpikePage() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const paletteId = useThemeStore((s) => s.paletteId);
  const setPalette = useThemeStore((s) => s.setPalette);

  return (
    <div className="min-h-screen bg-void p-10 font-ui text-bright">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">ShadCN ⇄ Clinical Obsidian — Spike</h1>
            <p className="mt-1 text-sm text-dim">
              Theme: <span className="text-teal">{resolvedTheme}</span> · Palette:{' '}
              <span className="text-teal">{paletteId}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleTheme}>
            Toggle theme
          </Button>
        </header>

        <section className="surface space-y-4">
          <h2 className="data-label">ShadCN Button — variants</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Icon button">
              <Stethoscope />
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <section className="surface space-y-3">
          <h2 className="data-label">Legacy .btn-primary vs ShadCN &lt;Button&gt;</h2>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="btn-primary">
              Legacy primary
            </button>
            <Button>ShadCN primary</Button>
            <span className="text-xs text-dim">
              — same palette-driven <code className="text-teal">--primary</code>, same radius token
            </span>
          </div>
        </section>

        <section className="surface space-y-3">
          <h2 className="data-label">ShadCN Dialog (Radix) — focus trap + ESC, token-themed</h2>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Measure definition</DialogTitle>
                <DialogDescription>
                  Accessible Radix dialog — focus trap, ESC to close, scrim + blur — styled entirely
                  by your Clinical Obsidian tokens, theming live in dark and light.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-card border border-edge/40 bg-s1 p-3 text-sm text-dim">
                One dialog primitive replaces the 11 hand-rolled modals across the app.
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>Confirm</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>

        <section className="surface space-y-3">
          <h2 className="data-label">Palette-awareness — primary follows your palette engine</h2>
          <div className="flex flex-wrap gap-2">
            {PALETTES.map((p) => (
              <Button
                key={p}
                variant={paletteId === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPalette(p)}
              >
                {p}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
