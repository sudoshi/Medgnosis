import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Variants map onto Clinical Obsidian semantic tokens (see tailwind.config.ts
// bridge): `primary` follows the runtime palette engine (--primary), the rest
// resolve to channel tokens so light/dark theming + /opacity modifiers work.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn text-sm font-medium font-ui ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow hover:bg-primary-dark hover:-translate-y-px active:translate-y-0 active:scale-[0.98]',
        destructive:
          'border border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/20',
        outline:
          'border border-input bg-transparent text-bright hover:bg-secondary hover:border-edge',
        secondary:
          'border border-edge/50 bg-secondary text-secondary-foreground hover:bg-muted',
        ghost: 'text-dim hover:bg-muted hover:text-bright',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 gap-1.5 rounded-btn px-3 text-xs',
        lg: 'h-10 rounded-btn px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
