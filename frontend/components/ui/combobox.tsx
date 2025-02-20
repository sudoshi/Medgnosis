'use client';

import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useState, useRef, useCallback } from 'react';

import { cn } from '@/lib/utils';

import { Input } from './input';
import { Popover } from './popover';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  searchable?: boolean;
  clearable?: boolean;
  loading?: boolean;
  emptyMessage?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select option',
  className,
  disabled = false,
  error = false,
  helperText,
  searchable = true,
  clearable = true,
  loading = false,
  emptyMessage = 'No options found',
}: ComboboxProps) {
  const [, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(option => option.value === value);

  const filteredOptions = searchable
    ? options.filter(option =>
        option.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  const handleSelect = useCallback((option: ComboboxOption) => {
    if (option.disabled) return;
    onChange?.(option.value);
    setIsOpen(false);
    setSearchQuery('');
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange?.('');
    setSearchQuery('');
    inputRef.current?.focus();
  }, [onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!searchable) return;
    setSearchQuery(e.target.value);
    setIsOpen(true);
  }, [searchable]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredOptions.length === 1) {
      handleSelect(filteredOptions[0]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchQuery('');
    }
  }, [filteredOptions, handleSelect]);

  return (
    <div className={cn('relative', className)}>
      <Popover
        trigger={
          <div>
            <Input
              ref={inputRef}
              value={searchable ? searchQuery : selectedOption?.label || ''}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              error={error}
              helperText={helperText}
              className="pr-10"
              readOnly={!searchable}
            />
            <div className="absolute right-0 top-0 flex h-10 items-center pr-2">
              {clearable && value && !disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-full p-1 text-dark-text-secondary hover:bg-dark-border hover:text-dark-text-primary"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
              <ChevronUpDownIcon className="h-5 w-5 text-dark-text-secondary" />
            </div>
          </div>
        }
      >
        <div className="max-h-60 overflow-auto rounded-md bg-dark-secondary p-1">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-border border-t-accent-primary" />
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="py-2 px-3 text-sm text-dark-text-secondary">
              {emptyMessage}
            </div>
          ) : (
            filteredOptions.map(option => (
              <button
                key={option.value}
                onClick={() => handleSelect(option)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm',
                  option.value === value
                    ? 'bg-accent-primary text-white'
                    : 'text-dark-text-primary hover:bg-dark-border',
                  option.disabled && 'cursor-not-allowed opacity-50'
                )}
                disabled={option.disabled}
              >
                {option.label}
                {option.value === value && (
                  <CheckIcon className="h-4 w-4" />
                )}
              </button>
            ))
          )}
        </div>
      </Popover>
    </div>
  );
}
