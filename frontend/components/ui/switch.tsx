'use client';

import { forwardRef } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  label?: string;
  description?: string;
  error?: boolean;
  helperText?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({
    checked,
    defaultChecked,
    onCheckedChange,
    disabled = false,
    required = false,
    name,
    value,
    label,
    description,
    error = false,
    helperText,
    size = 'md',
    className,
  }, ref) => {
    const sizes = {
      sm: {
        switch: 'h-4 w-7',
        thumb: 'h-3 w-3',
        translate: 'translate-x-3',
      },
      md: {
        switch: 'h-5 w-9',
        thumb: 'h-4 w-4',
        translate: 'translate-x-4',
      },
      lg: {
        switch: 'h-6 w-11',
        thumb: 'h-5 w-5',
        translate: 'translate-x-5',
      },
    };

    return (
      <div className={cn('space-y-2', className)}>
        {label && (
          <div className="flex items-center justify-between">
            <label
              htmlFor={name}
              className={cn(
                'text-sm font-medium text-dark-text-primary',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {label}
              {required && (
                <span className="ml-1 text-accent-error">*</span>
              )}
            </label>
          </div>
        )}
        <SwitchPrimitive.Root
          ref={ref}
          checked={checked}
          defaultChecked={defaultChecked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          required={required}
          name={name}
          value={value}
          id={name}
          className={cn(
            'group relative inline-flex shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors',
            'focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'data-[state=checked]:bg-accent-primary data-[state=unchecked]:bg-dark-border',
            sizes[size].switch
          )}
        >
          <SwitchPrimitive.Thumb
            className={cn(
              'pointer-events-none block rounded-full bg-white shadow-lg ring-0 transition-transform',
              'group-data-[state=checked]:bg-white group-data-[state=unchecked]:bg-dark-text-primary',
              sizes[size].thumb,
              `group-data-[state=checked]:${sizes[size].translate}`
            )}
          />
        </SwitchPrimitive.Root>
        {description && (
          <p className="text-sm text-dark-text-secondary">
            {description}
          </p>
        )}
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
Switch.displayName = 'Switch';

export interface SwitchGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function SwitchGroup({ children, className }: SwitchGroupProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {children}
    </div>
  );
}

export interface SwitchItemProps extends SwitchProps {
  icon?: React.ComponentType<{ className?: string }>;
}

export function SwitchItem({
  icon: Icon,
  label,
  description,
  className,
  ...props
}: SwitchItemProps) {
  return (
    <div className={cn('flex items-start space-x-4', className)}>
      {Icon && (
        <Icon className="mt-0.5 h-5 w-5 text-dark-text-secondary" />
      )}
      <div className="flex-1">
        <Switch label={label} description={description} {...props} />
      </div>
    </div>
  );
}
