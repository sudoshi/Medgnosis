'use client';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  className?: string;
  disabled?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  className,
  disabled = false,
}: PaginationProps) {
  const paginationRange = useMemo(() => {
    const totalPageNumbers = siblingCount * 2 + 3;

    if (totalPageNumbers >= totalPages) {
      return range(1, totalPages);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(
      currentPage + siblingCount,
      totalPages
    );

    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 1;

    if (!shouldShowLeftDots && shouldShowRightDots) {
      const leftItemCount = 3 + 2 * siblingCount;
      return [...range(1, leftItemCount), 'dots', totalPages];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
      const rightItemCount = 3 + 2 * siblingCount;
      return [
        1,
        'dots',
        ...range(totalPages - rightItemCount + 1, totalPages),
      ];
    }

    return [
      1,
      'dots',
      ...range(leftSiblingIndex, rightSiblingIndex),
      'dots',
      totalPages,
    ];
  }, [totalPages, currentPage, siblingCount]);

  if (totalPages <= 1) return null;

  const handlePageChange = (page: number) => {
    if (disabled) return;
    if (page === currentPage) return;
    if (page < 1 || page > totalPages) return;
    onPageChange(page);
  };

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn('flex items-center justify-center space-x-1', className)}
    >
      <button
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1 || disabled}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm',
          'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
          disabled || currentPage === 1
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-dark-border'
        )}
        aria-label="Previous page"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>

      {paginationRange.map((pageNumber, i) =>
        pageNumber === 'dots' ? (
          <span
            key={`dots-${i}`}
            className="flex h-8 w-8 items-center justify-center"
          >
            <EllipsisHorizontalIcon className="h-4 w-4" />
          </span>
        ) : (
          <button
            key={pageNumber}
            onClick={() => handlePageChange(pageNumber as number)}
            disabled={disabled}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm',
              'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
              pageNumber === currentPage
                ? 'bg-accent-primary text-white'
                : 'hover:bg-dark-border',
              disabled && 'cursor-not-allowed opacity-50'
            )}
            aria-label={`Page ${pageNumber}`}
            aria-current={pageNumber === currentPage ? 'page' : undefined}
          >
            {pageNumber}
          </button>
        )
      )}

      <button
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages || disabled}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm',
          'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
          disabled || currentPage === totalPages
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-dark-border'
        )}
        aria-label="Next page"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </nav>
  );
}

// Helper function to create a range of numbers
function range(start: number, end: number): number[] {
  const length = end - start + 1;
  return Array.from({ length }, (_, i) => start + i);
}

export interface PaginationInfoProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  className?: string;
}

export function PaginationInfo({
  currentPage,
  pageSize,
  totalItems,
  className,
}: PaginationInfoProps) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <p className={cn('text-sm text-dark-text-secondary', className)}>
      Showing {start} to {end} of {totalItems} results
    </p>
  );
}
