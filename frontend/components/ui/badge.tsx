import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-accent-primary/10 text-accent-primary',
        secondary: 'bg-dark-secondary text-dark-text-primary',
        success: 'bg-accent-success/10 text-accent-success',
        warning: 'bg-accent-warning/10 text-accent-warning',
        error: 'bg-accent-error/10 text-accent-error',
        outline: 'border border-dark-border',
      },
      size: {
        default: 'text-xs',
        sm: 'text-[0.625rem]',
        lg: 'text-sm',
      },
      glow: {
        true: 'shadow-glow',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({
  className,
  variant,
  size,
  glow,
  children,
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size, glow }), className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
