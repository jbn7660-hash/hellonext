/**
 * Unit Tests: Utility Functions
 *
 * Tests format.ts, cn.ts utility functions
 * covering edge cases and boundary values.
 */

import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils/cn';

describe('cn (className merger)', () => {
  it('should merge class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });

  it('should handle undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });

  it('should resolve Tailwind conflicts (last wins)', () => {
    // tailwind-merge resolves p-2 vs p-4 → p-4
    const result = cn('p-2 text-sm', 'p-4');
    expect(result).toContain('p-4');
    expect(result).not.toContain('p-2');
  });

  it('should handle empty strings', () => {
    expect(cn('', 'foo', '')).toBe('foo');
  });
});
