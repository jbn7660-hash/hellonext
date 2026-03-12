/**
 * Auth Store (Zustand)
 *
 * Global authentication state management.
 * Stores user session, role, and profile data.
 *
 * @module stores/auth-store
 * @dependencies zustand
 * @exports useAuthStore
 */

import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { Tables, UserRole } from '@/lib/supabase/types';

type ProProfile = Tables<'pro_profiles'>;
type MemberProfile = Tables<'member_profiles'>;

interface AuthState {
  /** Current Supabase user */
  user: User | null;
  /** User role determined from profile */
  role: UserRole | null;
  /** User's pro or member profile */
  profile: ProProfile | MemberProfile | null;
  /** Whether auth state is being loaded */
  loading: boolean;

  /** Actions */
  setUser: (user: User | null) => void;
  setRole: (role: UserRole | null) => void;
  setProfile: (profile: ProProfile | MemberProfile | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

const initialState = {
  user: null,
  role: null,
  profile: null,
  loading: true,
};

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState,

  setUser: (user) => set({ user }),
  setRole: (role) => set({ role }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  reset: () => set(initialState),
}));
