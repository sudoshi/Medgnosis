import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Mirrors the semantic .badge-* classes (color = signal, never decoration).
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
