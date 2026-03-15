/**
 * Auth Callback Route Handler
 *
 * Handles the OAuth callback from Kakao, Google, and email confirmation links.
 * Exchanges the auth code for a session, then redirects to the appropriate page.
 *
 * Flow:
 * 1. Receive auth code from Supabase Auth redirect
 * 2. Exchange code for session
 * 3. Check if user has a profile (pro or member)
 * 4. Redirect new users to onboarding or existing users to their dashboard
 *
 * Query Params:
 * - code: Auth code from Supabase Auth
 * - redirect: Destination after successful auth (optional, defaults to role-based home)
 * - error: OAuth error message
 *
 * @route GET /callback
 * @feature F-007 가입/인증
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const errorParam = searchParams.get('error');

  // Handle OAuth error — redirect back to login with error message
  if (errorParam) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', encodeURIComponent(errorParam));
    return NextResponse.redirect(loginUrl);
  }

  // If no code, redirect to login
  if (!code) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', encodeURIComponent('no_auth_code'));
    return NextResponse.redirect(loginUrl);
  }

  try {
    // Exchange the code for a session
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Auth exchange failed:', exchangeError.message, exchangeError.status);
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', encodeURIComponent(`auth_exchange_failed`));
      loginUrl.searchParams.set('detail', encodeURIComponent(exchangeError.message));
      return NextResponse.redirect(loginUrl);
    }

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', encodeURIComponent('user_fetch_failed'));
      return NextResponse.redirect(loginUrl);
    }

    // Check if user has a pro profile
    const { data: proProfileRaw, error: proError } = await supabase
      .from('pro_profiles')
      .select('id, studio_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const proProfile = proProfileRaw as { id: string; studio_name: string | null } | null;

    // Handle query error (not found is ok, it's an error but expected)
    if (proError && proError.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', encodeURIComponent('profile_check_failed'));
      return NextResponse.redirect(loginUrl);
    }

    if (proProfile) {
      // Pro user exists — check if onboarding is complete
      if (!proProfile.studio_name) {
        return NextResponse.redirect(new URL('/onboarding', origin));
      }
      // Existing pro user — redirect to dashboard or next param
      const targetUrl = nextParam ? decodeURIComponent(nextParam) : '/dashboard';
      return NextResponse.redirect(new URL(targetUrl, origin));
    }

    // Check if user has a member profile
    const { data: memberProfileRaw, error: memberError } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const memberProfile = memberProfileRaw as { id: string } | null;

    if (memberError && memberError.code !== 'PGRST116') {
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', encodeURIComponent('profile_check_failed'));
      return NextResponse.redirect(loginUrl);
    }

    if (memberProfile) {
      // Existing member user — redirect to swingbook or next param
      const targetUrl = nextParam ? decodeURIComponent(nextParam) : '/swingbook';
      return NextResponse.redirect(new URL(targetUrl, origin));
    }

    // New user with no profile — they'll be created by trigger
    // Redirect to role-based onboarding determined by signup flow
    // For now, default to member onboarding (can be enhanced)
    return NextResponse.redirect(new URL('/swingbook', origin));
  } catch (err) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', encodeURIComponent('unexpected_error'));
    return NextResponse.redirect(loginUrl);
  }
}
