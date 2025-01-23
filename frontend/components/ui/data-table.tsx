'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc' | null;

export interface Column<T> {
  key: string;
  header: string;
  cell?: (item: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  defaultSort?: {
    key: string;
    direction: SortDirection;
  };
  onSort?: (key: string, direction: SortDirection) => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
  rowClassName?: string;
  headerClassName?: string;
  cellClassName?: string;
  stickyHeader?: boolean;
}

export function DataTable<T>({
  data,
  columns,
  pageSize = 10,
  defaultSort,
  onSort,
  loading = false,
  emptyState,
  className,
  rowClassName,
  headerClassName,
  cellClassName,
  stickyHeader = false,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: SortDirection;
  } | null>(defaultSort || null);

  useEffect(() => {
    setCurrentPage(1);
  }, [data.length, pageSize]);

  const handleSort = (key: string) => {
    let direction: SortDirection = 'asc';
    if (sortConfig?.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig.direction === 'desc') direction = null;
    }
    setSortConfig(direction ? { key, direction } : null);
    onSort?.(key, direction);
  };

  const sortedData = useMemo(() => {
    if (!sortConfig || !sortConfig.direction) return data;

    return [...data].sort((a, b) => {
      const aValue = (a as any)[sortConfig.key];
      const bValue = (b as any)[sortConfig.key];

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const comparison = aValue < bValue ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, sortConfig]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(data.length / pageSize);

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ChevronUpDownIcon className="h-4 w-4" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ChevronUpIcon className="h-4 w-4" />
    ) : (
      <ChevronDownIcon className="h-4 w-4" />
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-border border-t-accent-primary" />
      </div>
    );
  }

  if (!data.length && emptyState) {
    return emptyState;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-dark-border">
        <table className={cn('w-full', className)}>
          <thead
            className={cn(
              'bg-dark-secondary text-left text-sm font-medium text-dark-text-secondary',
              stickyHeader && 'sticky top-0',
              headerClassName
            )}
          >
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'p-4 first:pl-6 last:pr-6',
                    column.align === 'center' && 'text-center',
                    column.align === 'right' && 'text-right',
                    column.width && `w-[${column.width}]`
                  )}
                >
                  {column.sortable ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-dark-text-primary"
                      onClick={() => handleSort(column.key)}
                    >
                      {column.header}
                      {getSortIcon(column.key)}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border">
            {paginatedData.map((item, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  'bg-dark-primary hover:bg-dark-secondary/50',
                  rowClassName
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'p-4 first:pl-6 last:pr-6',
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right',
                      cellClassName
                    )}
                  >
                    {column.cell
                      ? column.cell(item)
                      : (item as any)[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-dark-text-secondary">
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, data.length)} of {data.length}{' '}
            results
          </div>
          <div className="flex items-center space-x-2">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={currentPage === totalPages}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
