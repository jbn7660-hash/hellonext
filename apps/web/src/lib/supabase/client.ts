/**
 * Supabase Browser Client
 *
 * Creates a Supabase client for use in Client Components (browser).
 * Uses cookie-based auth via @supabase/ssr for proper SSR support.
 *
 * Usage:
 *   import { createClient } from '@/lib/supabase/client';
 *   const supabase = createClient();
 *
 * @module lib/supabase/client
 * @dependencies @supabase/ssr, @supabase/supabase-js
 * @exports createClient
 */

'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Creates or returns a singleton Supabase browser client.
 * Singleton pattern prevents creating multiple GoTrueClient instances.
 */
export function createClient() {
  if (client) {
    return client;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    );
  }

  client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

  return client;
}
