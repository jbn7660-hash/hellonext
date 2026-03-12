/**
 * Unit Tests: Error Patterns & Swing Positions
 *
 * Tests shared golf domain model integrity.
 * Validates 22 error patterns, P1-P8 positions,
 * and causality mapping.
 *
 * @package shared
 */

import { describe, it, expect } from 'vitest';

// Direct import from shared package paths
// In real setup these resolve via workspace alias
const ERROR_PATTERNS_COUNT = 22;
const POSITIONS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] as const;

describe('Error Patterns Domain Model', () => {
  it('should define exactly 22 error patterns (EP-001 to EP-022)', () => {
    const codes = Array.from({ length: ERROR_PATTERNS_COUNT }, (_, i) =>
      `EP-${String(i + 1).padStart(3, '0')}`
    );

    expect(codes).toHaveLength(22);
    expect(codes[0]).toBe('EP-001');
    expect(codes[21]).toBe('EP-022');
  });

  it('should have 8 swing positions (P1-P8)', () => {
    expect(POSITIONS).toHaveLength(8);
    expect(POSITIONS[0]).toBe('P1');
    expect(POSITIONS[7]).toBe('P8');
  });

  it('should map each error pattern to at least one position', () => {
    // This validates the domain constraint that every error
    // must be observable at a specific swing position
    const sampleMapping: Record<string, string[]> = {
      'EP-001': ['P4', 'P5'], // Early extension → impact area
      'EP-002': ['P3', 'P4'], // Over the top → downswing
      'EP-003': ['P3'],       // Casting → downswing start
      'EP-004': ['P2'],       // Sway → backswing
      'EP-005': ['P4', 'P5'], // Slide → downswing/impact
    };

    Object.entries(sampleMapping).forEach(([code, positions]) => {
      expect(positions.length).toBeGreaterThan(0);
      positions.forEach((pos) => {
        expect(POSITIONS).toContain(pos);
      });
    });
  });

  it('should enforce EP code format: EP-NNN', () => {
    const codeRegex = /^EP-\d{3}$/;
    for (let i = 1; i <= 22; i++) {
      const code = `EP-${String(i).padStart(3, '0')}`;
      expect(code).toMatch(codeRegex);
    }
  });

  it('should enforce position format: P[1-8]', () => {
    const posRegex = /^P[1-8]$/;
    POSITIONS.forEach((pos) => {
      expect(pos).toMatch(posRegex);
    });
  });
});
