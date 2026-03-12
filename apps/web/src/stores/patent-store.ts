/**
 * Patent Store (Zustand)
 *
 * Global state management for patent-related functionality.
 * Manages FSM state, verification queue, and confidence states.
 *
 * @module stores/patent-store
 * @dependencies zustand
 * @exports usePatentStore
 */

import { create } from 'zustand';
import type { FsmState } from '@/lib/patent/fsm-client'; // shared + ERROR 확장 포함
import type { ConfidenceState } from '@hellonext/shared'; // Single Source of Truth

interface PatentState {
  /** Current FSM state for voice memo pipeline */
  fsmState: FsmState;
  /** Number of pending verifications in queue */
  verificationQueueCount: number;
  /** Map of measurement_id → confidence state */
  confidenceStates: Map<string, ConfidenceState>;
  /** Current session ID for FSM operations */
  currentSessionId: string | null;
  /** Cache key for FSM */
  fsmCacheKey: string | null;

  /** Actions */
  setFsmState: (state: FsmState) => void;
  updateVerificationCount: (count: number) => void;
  setConfidenceState: (measurementId: string, state: ConfidenceState) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  setFsmCacheKey: (cacheKey: string | null) => void;
  getConfidenceState: (measurementId: string) => ConfidenceState | undefined;
  reset: () => void;
}

const initialState = {
  fsmState: 'UNBOUND' as FsmState,
  verificationQueueCount: 0,
  confidenceStates: new Map<string, ConfidenceState>(),
  currentSessionId: null,
  fsmCacheKey: null,
};

export const usePatentStore = create<PatentState>((set, get) => ({
  ...initialState,

  setFsmState: (state) => set({ fsmState: state }),

  updateVerificationCount: (count) => set({ verificationQueueCount: count }),

  setConfidenceState: (measurementId, state) => {
    set((prevState) => {
      const newMap = new Map(prevState.confidenceStates);
      newMap.set(measurementId, state);
      return { confidenceStates: newMap };
    });
  },

  setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),

  setFsmCacheKey: (cacheKey) => set({ fsmCacheKey: cacheKey }),

  getConfidenceState: (measurementId) => {
    const state = get();
    return state.confidenceStates.get(measurementId);
  },

  reset: () => set(initialState),
}));
