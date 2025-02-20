import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const Table = ({
  className,
  ...props
}: HTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-auto">
    <table
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
);
Table.displayName = 'Table';

const TableHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('[&_tr]:border-b border-dark-border', className)} {...props} />
);
TableHeader.displayName = 'TableHeader';

const TableBody = ({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
);
TableBody.displayName = 'TableBody';

const TableFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) => (
  <tfoot
    className={cn(
      'border-t border-dark-border bg-dark-secondary/50 font-medium [&>tr]:last:border-b-0',
      className
    )}
    {...props}
  />
);
TableFooter.displayName = 'TableFooter';

const TableRow = ({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    className={cn(
      'border-b border-dark-border transition-colors hover:bg-dark-secondary/50 data-[state=selected]:bg-dark-secondary',
      className
    )}
    {...props}
  />
);
TableRow.displayName = 'TableRow';

const TableHead = ({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn(
      'h-12 px-4 text-left align-middle font-medium text-dark-text-secondary [&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
);
TableHead.displayName = 'TableHead';

const TableCell = ({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td
    className={cn(
      'p-4 align-middle [&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
);
TableCell.displayName = 'TableCell';

const TableCaption = ({
  className,
  ...props
}: HTMLAttributes<HTMLTableCaptionElement>) => (
  <caption
    className={cn('mt-4 text-sm text-dark-text-secondary', className)}
    {...props}
  />
);
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
