/**
 * Vitest Configuration
 *
 * Test pyramid: Unit (70%) / Integration (20%) / E2E (10%)
 * Coverage target: 80%+ on core business logic
 *
 * Patent Coverage:
 * - Patent 1: Data layer separation (DC-1, DC-4)
 * - Patent 3: Confidence tiers (DC-2, DC-3)
 * - Patent 4: FSM voice lifecycle (DC-5)
 *
 * Error Patterns: EP-001~EP-022 (22 patterns)
 * Swing Positions: P1-P8 (8 positions)
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: [
      'src/__tests__/unit/**/*.test.{ts,tsx}',
      'src/__tests__/integration/**/*.test.{ts,tsx}',
    ],
    exclude: ['src/__tests__/e2e/**'],

    // Test timeout configuration per layer
    testTimeout: 10000, // Unit/Integration default: 10s
    hookTimeout: 5000,

    // Reporter configuration: verbose in CI
    reporters: process.env.CI
      ? ['verbose', 'junit']
      : ['default'],
    outputFile: process.env.CI
      ? {
          junit: './test-results/junit.xml',
        }
      : undefined,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/lib/**/*.ts',
        'src/hooks/**/*.ts',
        'src/app/api/**/*.ts',
        'src/components/**/*.tsx',
      ],
      exclude: [
        'src/__tests__/**',
        'src/**/*.d.ts',
        'src/lib/supabase/types.ts',
      ],

      // Global thresholds: enforce 80% minimum
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,

      // Per-path thresholds for critical business logic
      thresholds: {
        // Patent 1: Data layer separation (DC-1, DC-4)
        'src/lib/data-layer/': {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },

        // Patent 3: Confidence calculation (DC-2, DC-3)
        'src/lib/confidence/': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },

        // Patent 4: FSM state transitions (DC-5)
        'src/lib/voice-fsm/': {
          statements: 85,
          branches: 90,
          functions: 85,
          lines: 85,
        },

        // Core business logic: 80%+
        'src/lib/payments/': { branches: 80, functions: 80, lines: 80, statements: 80 },
        'src/lib/utils/': { branches: 80, functions: 80, lines: 80, statements: 80 },
      },
    },

    // Test groups for patents
    include: [
      'src/__tests__/unit/**/*.test.{ts,tsx}',
      'src/__tests__/integration/**/*.test.{ts,tsx}',
    ],

    alias: {
      '@': path.resolve(__dirname, './src'),
      '@hellonext/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },

    // Environment setup
    env: {
      VITEST: 'true',
      TEST_PYRAMID: 'unit:0.7,integration:0.2,e2e:0.1',
    },
  },
});
