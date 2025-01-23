'use client';

import { forwardRef, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  helperText?: string;
  options: Array<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, helperText, options, children, ...props }, ref) => {
    return (
      <div className="space-y-1">
        <select
          className={cn(
            'appearance-none block w-full px-3 py-2 border border-dark-border rounded-md shadow-sm',
            'bg-dark-primary text-dark-text-primary',
            'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors',
            error && 'border-accent-error focus:ring-accent-error',
            className
          )}
          ref={ref}
          {...props}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className="bg-dark-primary text-dark-text-primary"
            >
              {option.label}
            </option>
          ))}
          {children}
        </select>
        {helperText && (
          <p
            className={cn(
              'text-sm',
              error ? 'text-accent-error' : 'text-dark-text-secondary'
            )}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
