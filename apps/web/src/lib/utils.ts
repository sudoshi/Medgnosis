import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and resolve Tailwind utility conflicts.
 * Standard shadcn/ui helper — `clsx` for conditionals, `tailwind-merge`
 * so later utilities win (e.g. `px-2` overridden by a passed `px-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
