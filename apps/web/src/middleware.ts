/**
 * Next.js Middleware
 *
 * Handles authentication and role-based route protection.
 *
 * Route structure:
 * - /login, /signup, /callback: Public auth routes
 * - /(pro)/*: Pro-only routes (dashboard, reports, onboarding, etc.)
 * - /(member)/*: Member-only routes (swingbook, practice, etc.)
 * - /api/*, /_next/*: Pass-through routes
 *
 * Flow:
 * 1. Refresh auth token via Supabase middleware client
 * 2. Check authentication status
 * 3. Redirect unauthenticated users to /login?next=<pathname>
 * 4. Enforce role-based access (pro vs member routes)
 * 5. Allow authenticated users to access their role-specific routes
 *
 * @module middleware
 * @dependencies lib/supabase/middleware
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';

/** Routes that don't require authentication */
const PUBLIC_ROUTES = new Set([
  '/login',
  '/signup',
  '/callback',
  '/invite',
]);

/** Pro-only routes (Next.js route groups are NOT part of the URL) */
const PRO_ROUTES = new Set([
  '/dashboard',
  '/reports',
  '/onboarding',
  '/coupons',
  '/subscription',
]);

/** Member-only routes */
const MEMBER_ROUTES = new Set([
  '/swingbook',
  '/practice',
  '/progress',
  '/redeem',
]);

/**
 * Checks if a pathname matches any public route.
 */
function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;

  // Allow invite links with codes: /invite/[code]
  if (pathname.startsWith('/invite/')) return true;

  // Allow API routes and static assets
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) return true;

  return false;
}

/**
 * Determines user role from their profile data.
 * Checks pro_profiles first, falls back to member.
 */
async function getUserRole(
  supabase: Awaited<ReturnType<typeof createClient>>['supabase'],
  userId: string
): Promise<'pro' | 'member' | null> {
  const { data: proProfile } = await supabase
    .from('pro_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (proProfile) return 'pro';

  const { data: memberProfile } = await supabase
    .from('member_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (memberProfile) return 'member';

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for public routes and static assets
  // Also treat /offline, /invite/* as public
  if (isPublicRoute(pathname) || pathname === '/offline') {
    // Still refresh the auth token for public routes
    const { supabaseResponse } = await createClient(request);
    return supabaseResponse;
  }

  try {
    // Create Supabase client and refresh token
    const { supabase, supabaseResponse, user } = await createClient(request);

    // Redirect unauthenticated users to login
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Role-based route protection
    const role = await getUserRole(supabase, user.id);

    if (!role) {
      // User exists but has no profile — redirect back to login
      // This shouldn't happen in production (trigger creates profile), but handle gracefully
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'no_profile');
      return NextResponse.redirect(loginUrl);
    }

    // Helper: get the first path segment (e.g. /dashboard, /reports/123 → /dashboard, /reports)
    const firstSegment = '/' + pathname.split('/').filter(Boolean)[0];

    // Enforce pro-only routes
    if ((PRO_ROUTES.has(firstSegment) || PRO_ROUTES.has(pathname)) && role !== 'pro') {
      return NextResponse.redirect(new URL('/swingbook', request.url));
    }

    // Enforce member-only routes
    if ((MEMBER_ROUTES.has(firstSegment) || MEMBER_ROUTES.has(pathname)) && role !== 'member') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Root redirect based on role
    if (pathname === '/') {
      const homeUrl = role === 'pro'
        ? new URL('/dashboard', request.url)
        : new URL('/swingbook', request.url);
      return NextResponse.redirect(homeUrl);
    }

    return supabaseResponse;
  } catch (err) {
    // Log error for debugging but fail open (allow request through)
    // This prevents auth issues from breaking the entire app
    console.error('Middleware error:', err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
