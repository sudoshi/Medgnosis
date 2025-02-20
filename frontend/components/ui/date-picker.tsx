'use client';

import { CalendarIcon } from '@heroicons/react/24/outline';
import { useState, useRef, useEffect } from 'react';

import { cn } from '@/lib/utils';

import { Calendar } from './calendar';
import { Input } from './input';
import { Popover } from './popover';


export interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Select date',
  className,
  disabled = false,
  error = false,
  helperText,
}: DatePickerProps) {
  const [date, setDate] = useState<Date | undefined>(value);
  const [inputValue, setInputValue] = useState(
    date ? formatDate(date) : ''
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      setDate(value);
      setInputValue(formatDate(value));
    }
  }, [value]);

  const handleDateSelect = (selectedDate: Date) => {
    setDate(selectedDate);
    setInputValue(formatDate(selectedDate));
    onChange?.(selectedDate);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    const parsedDate = parseDate(value);
    if (parsedDate) {
      setDate(parsedDate);
      onChange?.(parsedDate);
    }
  };

  const handleInputBlur = () => {
    if (!date && inputValue) {
      setInputValue('');
    } else if (date) {
      setInputValue(formatDate(date));
    }
  };

  return (
    <div className={cn('relative', className)}>
      <Popover
        trigger={
          <div className="relative">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              placeholder={placeholder}
              disabled={disabled}
              error={error}
              helperText={helperText}
              className="pr-10"
            />
            <CalendarIcon className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-dark-text-secondary" />
          </div>
        }
        align="start"
      >
        <Calendar
          value={date || new Date()}
          onChange={handleDateSelect}
          minDate={minDate}
          maxDate={maxDate}
          disabled={disabled}
        />
      </Popover>
    </div>
  );
}

// Helper functions for date formatting and parsing
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

function parseDate(dateString: string): Date | null {
  const parts = dateString.split('/');
  if (parts.length !== 3) return null;

  const month = parseInt(parts[0]) - 1;
  const day = parseInt(parts[1]);
  const year = parseInt(parts[2]);

  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;

  const date = new Date(year, month, day);
  if (
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getFullYear() !== year
  ) {
    return null;
  }

  return date;
}

export interface DateRangePickerProps {
  startDate?: Date;
  endDate?: Date;
  onStartDateChange?: (date: Date) => void;
  onEndDateChange?: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  minDate,
  maxDate,
  className,
  disabled = false,
  error = false,
  helperText,
}: DateRangePickerProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DatePicker
        value={startDate}
        onChange={onStartDateChange}
        minDate={minDate}
        maxDate={endDate || maxDate}
        placeholder="Start date"
        disabled={disabled}
        error={error}
        helperText={helperText}
      />
      <span className="text-dark-text-secondary">to</span>
      <DatePicker
        value={endDate}
        onChange={onEndDateChange}
        minDate={startDate || minDate}
        maxDate={maxDate}
        placeholder="End date"
        disabled={disabled}
        error={error}
        helperText={helperText}
      />
    </div>
  );
}
