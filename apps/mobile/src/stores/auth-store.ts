/**
 * Auth Store (Zustand)
 *
 * Manages authentication state for the mobile app.
 * Mirrors the web app's auth store with mobile-specific adaptations.
 */

import { create } from 'zustand';
import { supabase, signOut as supabaseSignOut } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

// ============================================================
// Types
// ============================================================
type UserRole = 'pro' | 'member' | null;

interface AuthState {
  user: User | null;
  session: Session | null;
  role: UserRole;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

interface AuthActions {
  initialize: () => Promise<void>;
  setSession: (session: Session | null) => void;
  signOut: () => Promise<void>;
  clearError: () => void;
}

// ============================================================
// Store
// ============================================================
export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  // State
  user: null,
  session: null,
  role: null,
  isLoading: true,
  isInitialized: false,
  error: null,

  // Actions
  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      // Get current session
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        // Determine role from user metadata or profile
        const role = await determineUserRole(session.user.id);
        set({
          user: session.user,
          session,
          role,
          isLoading: false,
          isInitialized: true,
        });
      } else {
        set({
          user: null,
          session: null,
          role: null,
          isLoading: false,
          isInitialized: true,
        });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          determineUserRole(session.user.id).then((role) => {
            set({ user: session.user, session, role });
          });
        } else {
          set({ user: null, session: null, role: null });
        }
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '인증 초기화 실패',
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
    });
  },

  signOut: async () => {
    try {
      set({ isLoading: true });
      await supabaseSignOut();
      set({
        user: null,
        session: null,
        role: null,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '로그아웃 실패',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));

// ============================================================
// Helper: Determine user role
// ============================================================
async function determineUserRole(userId: string): Promise<UserRole> {
  try {
    // Check pro_profiles first
    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (proProfile) return 'pro';

    // Check member_profiles
    const { data: memberProfile } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (memberProfile) return 'member';

    return null;
  } catch {
    return null;
  }
}
