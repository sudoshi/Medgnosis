'use client';

import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  className?: string;
  separator?: React.ReactNode;
  homeHref?: string;
  showHome?: boolean;
}

export function Breadcrumbs({
  items = [],
  className,
  separator = <ChevronRightIcon className="h-4 w-4" />,
  homeHref = '/',
  showHome = true,
}: BreadcrumbsProps) {
  const pathname = usePathname();

  // If no items are provided, generate them from the pathname
  const breadcrumbItems: BreadcrumbItem[] = items.length
    ? items
    : pathname
        .split('/')
        .filter(Boolean)
        .map((segment, index, array) => {
          const href = `/${array.slice(0, index + 1).join('/')}`;
          return {
            label: segment
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' '),
            href,
            icon: undefined,
          };
        });

  // Add home item if showHome is true
  const allItems: BreadcrumbItem[] = showHome
    ? [{ label: 'Home', href: homeHref, icon: HomeIcon }, ...breadcrumbItems]
    : breadcrumbItems;

  if (!allItems.length) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol
        className={cn(
          'flex items-center space-x-2 text-sm text-dark-text-secondary',
          className
        )}
      >
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;
          const Icon = item.icon;

          return (
            <li
              key={item.href || item.label}
              className="flex items-center space-x-2"
            >
              {index > 0 && (
                <span
                  className="text-dark-text-secondary"
                  aria-hidden="true"
                >
                  {separator}
                </span>
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center space-x-1 hover:text-dark-text-primary',
                    Icon && 'hover:text-accent-primary'
                  )}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <div
                  className={cn(
                    'flex items-center space-x-1',
                    isLast
                      ? 'font-medium text-dark-text-primary'
                      : 'text-dark-text-secondary'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  <span>{item.label}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface BreadcrumbsWithIconsProps extends BreadcrumbsProps {
  _iconClassName?: string;
}

export function BreadcrumbsWithIcons({
  items = [],
  _iconClassName,
  ...props
}: BreadcrumbsWithIconsProps) {
  // Add default icons based on position
  const itemsWithIcons = items.map((item, index) => ({
    ...item,
    icon: item.icon || (index === 0 ? HomeIcon : undefined),
  }));

  return (
    <Breadcrumbs
      items={itemsWithIcons}
      {...props}
      className={cn('text-base', props.className)}
    />
  );
}
