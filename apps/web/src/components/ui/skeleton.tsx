import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Loading placeholder. Reuses the token-driven `.skeleton` shimmer. */
function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} {...props} />;
}

export { Skeleton };
