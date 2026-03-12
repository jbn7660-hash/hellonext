/**
 * Class Name Utility
 *
 * Combines clsx and tailwind-merge for optimal Tailwind CSS class merging.
 *
 * @module lib/utils/cn
 * @exports cn
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names with Tailwind CSS conflict resolution.
 * @example cn('px-4 py-2', isActive && 'bg-brand-500', 'px-6') => 'py-2 bg-brand-500 px-6'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
