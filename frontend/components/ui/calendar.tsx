'use client';

import { useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

interface CalendarProps {
  value?: Date;
  onChange?: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  disabled?: boolean;
}

export function Calendar({
  value = new Date(),
  onChange,
  minDate,
  maxDate,
  className,
  disabled = false,
}: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(value);
  const [selectedDate, setSelectedDate] = useState(value);

  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  ).getDay();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handlePrevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
  };

  const handleDateClick = (day: number) => {
    if (disabled) return;

    const newDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    );

    if (
      (minDate && newDate < minDate) ||
      (maxDate && newDate > maxDate)
    ) {
      return;
    }

    setSelectedDate(newDate);
    onChange?.(newDate);
  };

  const isDateDisabled = (day: number) => {
    if (disabled) return true;

    const date = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    );

    return (
      (minDate && date < minDate) ||
      (maxDate && date > maxDate)
    );
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getDate() === day &&
      today.getMonth() === currentDate.getMonth() &&
      today.getFullYear() === currentDate.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    return (
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === currentDate.getMonth() &&
      selectedDate.getFullYear() === currentDate.getFullYear()
    );
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-dark-border bg-dark-secondary p-4',
        className
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={handlePrevMonth}
          disabled={
            disabled ||
            (minDate &&
              new Date(
                currentDate.getFullYear(),
                currentDate.getMonth()
              ) <= new Date(minDate.getFullYear(), minDate.getMonth()))
          }
          className="rounded-md p-1 hover:bg-dark-border disabled:opacity-50"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="text-lg font-medium">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </div>
        <button
          onClick={handleNextMonth}
          disabled={
            disabled ||
            (maxDate &&
              new Date(
                currentDate.getFullYear(),
                currentDate.getMonth()
              ) >= new Date(maxDate.getFullYear(), maxDate.getMonth()))
          }
          className="rounded-md p-1 hover:bg-dark-border disabled:opacity-50"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Days of Week */}
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-sm font-medium text-dark-text-secondary">
        {dayNames.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {[...Array(firstDayOfMonth)].map((_, index) => (
          <div key={`empty-${index}`} />
        ))}
        {[...Array(daysInMonth)].map((_, index) => {
          const day = index + 1;
          const isDisabled = isDateDisabled(day);

          return (
            <button
              key={day}
              onClick={() => handleDateClick(day)}
              disabled={isDisabled}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
                isSelected(day) &&
                  'bg-accent-primary text-white hover:bg-accent-primary/90',
                !isSelected(day) &&
                  !isDisabled &&
                  'hover:bg-dark-border',
                isToday(day) && !isSelected(day) && 'font-bold',
                isDisabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
