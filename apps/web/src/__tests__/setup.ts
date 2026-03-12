/**
 * Test Setup
 *
 * Global mocks and environment configuration for Vitest.
 */

import { vi, beforeAll, afterEach } from 'vitest';
import '@testing-library/jest-dom';

// ─── Global Mocks ────────────────────────────────────────────

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabaseClient()),
}));

// Mock logger (suppress console output in tests)
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Supabase Mock Factory ──────────────────────────────────

export function mockSupabaseClient(overrides?: Record<string, unknown>) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
      }),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => chainable),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    ...overrides,
  };
}

// ─── Fetch Mock ─────────────────────────────────────────────

export function mockFetch(responses: Record<string, { status?: number; data: unknown }>) {
  return vi.fn((url: string, init?: RequestInit) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    const response = key ? responses[key] : { status: 404, data: { error: 'Not found' } };

    return Promise.resolve({
      ok: (response?.status ?? 200) < 400,
      status: response?.status ?? 200,
      json: () => Promise.resolve(response?.data),
      text: () => Promise.resolve(JSON.stringify(response?.data)),
    });
  });
}

// ─── Cleanup ────────────────────────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Environment Variables ──────────────────────────────────

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.TOSS_SECRET_KEY = 'test_sk_test_key';
  process.env.TOSS_CLIENT_KEY = 'test_ck_test_key';
});
