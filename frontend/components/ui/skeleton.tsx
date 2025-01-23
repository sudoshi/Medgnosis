import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'circle' | 'rounded';
  animated?: boolean;
}

export function Skeleton({
  className,
  variant = 'default',
  animated = true,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-dark-border',
        animated && 'animate-pulse',
        {
          'rounded-md': variant === 'default',
          'rounded-full': variant === 'circle',
          'rounded-lg': variant === 'rounded',
        },
        className
      )}
      {...props}
    />
  );
}

export interface SkeletonTextProps extends SkeletonProps {
  lines?: number;
  lastLineWidth?: string;
}

export function SkeletonText({
  className,
  lines = 3,
  lastLineWidth = '75%',
  ...props
}: SkeletonTextProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', {
            [`w-[${lastLineWidth}]`]: i === lines - 1,
          })}
          {...props}
        />
      ))}
    </div>
  );
}

export interface SkeletonCardProps extends SkeletonProps {
  header?: boolean;
  footer?: boolean;
}

export function SkeletonCard({
  className,
  header = true,
  footer = false,
  ...props
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dark-border bg-dark-secondary p-4',
        className
      )}
      {...props}
    >
      {header && (
        <div className="mb-4 space-y-3">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      <div className="space-y-3">
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      {footer && (
        <div className="mt-4 flex justify-end space-x-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
      )}
    </div>
  );
}

export interface SkeletonAvatarProps extends SkeletonProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function SkeletonAvatar({
  className,
  size = 'md',
  ...props
}: SkeletonAvatarProps) {
  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-14 w-14',
  };

  return (
    <Skeleton
      variant="circle"
      className={cn(sizes[size], className)}
      {...props}
    />
  );
}

export interface SkeletonButtonProps extends SkeletonProps {
  size?: 'sm' | 'md' | 'lg';
}

export function SkeletonButton({
  className,
  size = 'md',
  ...props
}: SkeletonButtonProps) {
  const sizes = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-12',
  };

  return (
    <Skeleton
      variant="rounded"
      className={cn(sizes[size], 'w-20', className)}
      {...props}
    />
  );
}

export interface SkeletonImageProps extends SkeletonProps {
  aspectRatio?: number;
}

export function SkeletonImage({
  className,
  aspectRatio = 16 / 9,
  ...props
}: SkeletonImageProps) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-lg', className)}
      style={{ paddingBottom: `${(1 / aspectRatio) * 100}%` }}
    >
      <Skeleton
        className="absolute inset-0 h-full w-full"
        {...props}
      />
    </div>
  );
}
