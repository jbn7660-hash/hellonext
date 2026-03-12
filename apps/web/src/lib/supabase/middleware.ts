/**
 * Supabase Middleware Client
 *
 * Creates a Supabase client specifically for Next.js middleware.
 * Handles auth token refresh and cookie synchronization between
 * request and response objects.
 *
 * @module lib/supabase/middleware
 * @dependencies @supabase/ssr
 * @exports createClient
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './types';

/**
 * Creates a Supabase client for middleware with request/response cookie handling.
 *
 * This function:
 * 1. Refreshes expired auth tokens via supabase.auth.getUser()
 * 2. Passes refreshed tokens to Server Components via request cookies
 * 3. Passes refreshed tokens to the browser via response cookies
 */
export async function createClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables in middleware.'
    );
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Set cookies on the request for downstream Server Components
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );

        // Create a new response with updated request
        supabaseResponse = NextResponse.next({
          request,
        });

        // Set cookies on the response for the browser
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the auth token — IMPORTANT: must use getUser() not getSession()
  // getUser() sends a request to the Supabase Auth server to revalidate
  // the token, whereas getSession() only reads from the local storage/cookies
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, supabaseResponse, user };
}
