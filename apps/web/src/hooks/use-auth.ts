/**
 * useAuth Hook
 *
 * Provides authentication state and actions for client components.
 * Listens to Supabase auth state changes and syncs with the auth store.
 *
 * @module hooks/use-auth
 * @dependencies lib/supabase/client, stores/auth-store
 * @exports useAuth
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { logger } from '@/lib/utils/logger';
import type { UserRole } from '@/lib/supabase/types';

export function useAuth() {
  const router = useRouter();
  const supabase = createClient();
  const {
    user,
    role,
    profile,
    loading,
    setUser,
    setRole,
    setProfile,
    setLoading,
    reset,
  } = useAuthStore();

  /** Fetch user profile and determine role */
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      // Check pro profile first
      const { data: proProfile } = await supabase
        .from('pro_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (proProfile) {
        setRole('pro');
        setProfile(proProfile);
        return;
      }

      // Check member profile
      const { data: memberProfile } = await supabase
        .from('member_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (memberProfile) {
        setRole('member');
        setProfile(memberProfile);
        return;
      }

      logger.warn('User has no profile', { userId });
    } catch (err) {
      logger.error('Failed to fetch profile', { userId, error: err });
    }
  }, [supabase, setRole, setProfile]);

  /** Listen to auth state changes */
  useEffect(() => {
    setLoading(true);

    // Get initial session
    const initAuth = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (currentUser) {
        setUser(currentUser);
        await fetchProfile(currentUser.id);
      }

      setLoading(false);
    };

    void initAuth();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.info('Auth state changed', { event });

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          reset();
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, setUser, setLoading, fetchProfile, reset]);

  /** Sign out */
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      reset();
      router.push('/login');
      router.refresh();
    } catch (err) {
      logger.error('Sign out failed', { error: err });
    }
  }, [supabase, reset, router]);

  return {
    user,
    role,
    profile,
    loading,
    signOut,
    isAuthenticated: !!user,
    isPro: role === 'pro',
    isMember: role === 'member',
  };
}
