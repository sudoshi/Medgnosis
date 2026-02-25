'use client';

import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState, useEffect, useRef, useCallback } from 'react';

import { cn } from '@/lib/utils';

export interface SearchInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  debounce?: number;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  autoFocus?: boolean;
  clearable?: boolean;
}

export function SearchInput({
  value: propValue,
  onChange,
  onSearch,
  placeholder = 'Search...',
  className,
  inputClassName,
  debounce = 300,
  disabled = false,
  error = false,
  helperText,
  autoFocus = false,
  clearable = true,
}: SearchInputProps) {
  const [value, setValue] = useState(propValue || '');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (propValue !== undefined && propValue !== value) {
      setValue(propValue);
    }
  }, [propValue, value]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
    onChange?.(newValue);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (onSearch) {
      debounceTimerRef.current = setTimeout(() => {
        onSearch(newValue);
      }, debounce);
    }
  }, [onChange, onSearch, debounce]);

  const handleClear = useCallback(() => {
    setValue('');
    onChange?.('');
    onSearch?.('');
    inputRef.current?.focus();
  }, [onChange, onSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch?.(value);
    } else if (e.key === 'Escape') {
      handleClear();
    }
  }, [value, onSearch, handleClear]);

  return (
    <div className={cn('space-y-1', className)}>
      <div
        className={cn(
          'group relative flex items-center rounded-md',
          isFocused && 'ring-2 ring-accent-primary ring-offset-2',
          error && 'ring-2 ring-accent-error ring-offset-2',
          disabled && 'opacity-50'
        )}
      >
        <MagnifyingGlassIcon
          className={cn(
            'absolute left-3 h-5 w-5',
            disabled
              ? 'text-dark-text-secondary'
              : isFocused
              ? 'text-accent-primary'
              : 'text-dark-text-secondary group-hover:text-dark-text-primary'
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'h-10 w-full rounded-md border border-dark-border bg-dark-primary pl-10 pr-10',
            'text-dark-text-primary placeholder-dark-text-secondary',
            'focus:outline-none',
            disabled && 'cursor-not-allowed',
            inputClassName
          )}
        />
        {clearable && value && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'absolute right-3 rounded-full p-1',
              disabled
                ? 'text-dark-text-secondary'
                : 'text-dark-text-secondary hover:bg-dark-border hover:text-dark-text-primary'
            )}
            disabled={disabled}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
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
