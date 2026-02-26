// =============================================================================
// Medgnosis — Pagination
// Numbered paginator with ellipsis, Prev/Next buttons, and item count label.
// =============================================================================

import { ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Range calculation ────────────────────────────────────────────────────────

function getPaginationRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) {
    return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '…', current - 1, current, current + 1, '…', total];
}

// ─── Shared button class factories ───────────────────────────────────────────

function navBtnClass(disabled: boolean): string {
  return [
    'flex items-center justify-center w-8 h-8 rounded-card border transition-colors duration-100',
    disabled
      ? 'text-ghost/30 border-edge/15 cursor-not-allowed'
      : 'text-dim border-edge/35 hover:text-bright hover:bg-s1 hover:border-edge/55',
  ].join(' ');
}

function pageBtnClass(active: boolean): string {
  return [
    'w-8 h-8 flex items-center justify-center rounded-card',
    'font-data text-xs tabular-nums border transition-colors duration-100',
    active
      ? 'bg-teal/15 text-teal border-teal/30 font-medium'
      : 'text-dim border-edge/35 hover:text-bright hover:bg-s1 hover:border-edge/55',
  ].join(' ');
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional: used to render an item-range label on the left side. */
  totalItems?: number;
  perPage?: number;
  /** Label for the item noun — e.g., "patients", "gaps". Defaults to "items". */
  itemLabel?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  perPage,
  itemLabel = 'items',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = perPage ? (currentPage - 1) * perPage + 1 : undefined;
  const to   = perPage && totalItems
    ? Math.min(currentPage * perPage, totalItems)
    : undefined;

  return (
    <div className="flex items-center justify-between">
      {/* Item count label */}
      {from !== undefined && to !== undefined && totalItems !== undefined ? (
        <p className="text-xs text-ghost font-data tabular-nums">
          {from.toLocaleString()}–{to.toLocaleString()} of{' '}
          {totalItems.toLocaleString()} {itemLabel}
        </p>
      ) : (
        <span />
      )}

      {/* Page buttons */}
      <div className="flex items-center gap-1" role="navigation" aria-label="Pagination">
        {/* Previous */}
        <button
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className={navBtnClass(currentPage <= 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
        </button>

        {/* Page numbers */}
        {getPaginationRange(currentPage, totalPages).map((p, i) =>
          p === '…' ? (
            <span
              key={`ell-${i}`}
              className="w-8 h-8 flex items-center justify-center font-data text-xs text-ghost"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={pageBtnClass(p === currentPage)}
              aria-label={`Page ${p}`}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}

        {/* Next */}
        <button
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className={navBtnClass(currentPage >= totalPages)}
          aria-label="Next page"
        >
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
