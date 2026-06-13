// =============================================================================
// TEMP: shadcn adoption spike — remove before merge (public route /shadcn-spike)
// Showcases the full ShadCN primitive library wired to Clinical Obsidian tokens,
// for light/dark + palette visual verification (Phase 3.6 acceptance gate).
// =============================================================================

import { useState } from 'react';
import { Stethoscope, MoreHorizontal } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useThemeStore } from '@/stores/theme';

const PALETTES = ['clinical-teal', 'arctic', 'sage', 'sapphire', 'plum'] as const;
const BADGES = ['crimson', 'amber', 'teal', 'emerald', 'violet', 'info', 'dim'] as const;

export function ShadcnSpikePage() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const paletteId = useThemeStore((s) => s.paletteId);
  const setPalette = useThemeStore((s) => s.setPalette);
  const [cohort, setCohort] = useState('eligible');

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-void p-10 font-ui text-bright">
        <div className="mx-auto max-w-4xl space-y-6">
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
            <h2 className="data-label">Button — variants &amp; sizes</h2>
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
              <Button size="lg">Large</Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" aria-label="Icon button">
                    <Stethoscope />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Tooltip on an icon button</TooltipContent>
              </Tooltip>
              <Button disabled>Disabled</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                  <DropdownMenuItem className="text-crimson">Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </section>

          <section className="surface space-y-4">
            <h2 className="data-label">Form controls</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="q">Search</Label>
                <Input id="q" placeholder="Search measures…" />
              </div>
              <div className="space-y-1.5">
                <Label>Cohort</Label>
                <Select value={cohort} onValueChange={setCohort}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select cohort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eligible">Eligible</SelectItem>
                    <SelectItem value="compliant">Compliant</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Note</Label>
              <Textarea id="note" placeholder="Clinical note…" rows={2} />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-dim">
                <Checkbox defaultChecked /> Include inactive
              </label>
              <label className="flex items-center gap-2 text-sm text-dim">
                <Switch defaultChecked /> Live updates
              </label>
            </div>
          </section>

          <section className="surface space-y-3">
            <h2 className="data-label">Badge — semantic variants</h2>
            <div className="flex flex-wrap gap-2">
              {BADGES.map((v) => (
                <Badge key={v} variant={v}>
                  {v}
                </Badge>
              ))}
            </div>
          </section>

          <section className="surface space-y-3">
            <h2 className="data-label">Tabs + Table</h2>
            <Tabs defaultValue="population">
              <TabsList>
                <TabsTrigger value="population">Population</TabsTrigger>
                <TabsTrigger value="trend">Trend</TabsTrigger>
              </TabsList>
              <TabsContent value="population">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Measure</TableHead>
                      <TableHead>Eligible</TableHead>
                      <TableHead>Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>CBP — Controlling BP</TableCell>
                      <TableCell className="font-data tabular-nums">1,204</TableCell>
                      <TableCell className="font-data tabular-nums text-emerald">78%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>A1c Poor Control</TableCell>
                      <TableCell className="font-data tabular-nums">842</TableCell>
                      <TableCell className="font-data tabular-nums text-amber">61%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="trend">
                <div className="space-y-2 py-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </TabsContent>
            </Tabs>
          </section>

          <section className="surface space-y-3">
            <h2 className="data-label">Dialog &amp; Separator</h2>
            <div className="flex items-center gap-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">Open dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Measure definition</DialogTitle>
                    <DialogDescription>
                      Accessible Radix dialog — focus trap, ESC, scrim + blur — token-themed.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-card border border-edge/40 bg-s1 p-3 text-sm text-dim">
                    One dialog primitive replaces the hand-rolled modals across the app.
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
              <Separator orientation="vertical" className="h-8" />
              <button type="button" className="btn-primary">
                Legacy primary
              </button>
              <span className="text-xs text-dim">same palette-driven --primary</span>
            </div>
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
    </TooltipProvider>
  );
}
