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
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-bright',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
