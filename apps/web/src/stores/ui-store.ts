/**
 * UI Store (Zustand)
 *
 * Global UI state management for tabs, modals, and navigation.
 *
 * @module stores/ui-store
 * @dependencies zustand
 * @exports useUIStore
 */

/**
 * UI Store (Zustand)
 *
 * Global UI state management for:
 * - Navigation tab state (member/pro layouts)
 * - Modal and bottom sheet visibility
 * - UI interaction state
 *
 * @module stores/ui-store
 * @dependencies zustand
 * @exports useUIStore
 * @example
 * const { memberActiveTab, setMemberActiveTab } = useUIStore();
 */

import { create } from 'zustand';

type ProTab = 'dashboard' | 'reports' | 'members' | 'settings';
type MemberTab = 'practice' | 'swingbook' | 'progress' | 'profile';

interface UIState {
  /** Current active tab for pro view */
  proActiveTab: ProTab;
  setProActiveTab: (tab: ProTab) => void;

  /** Current active tab for member view */
  memberActiveTab: MemberTab;
  setMemberActiveTab: (tab: MemberTab) => void;

  /** Whether bottom sheet is visible */
  isBottomSheetOpen: boolean;
  /** Bottom sheet content identifier */
  bottomSheetContent: string | null;
  openBottomSheet: (content: string) => void;
  closeBottomSheet: () => void;

  /** Whether any modal is visible */
  isModalOpen: boolean;
  /** Modal content identifier */
  modalContent: string | null;
  openModal: (content: string) => void;
  closeModal: () => void;
}

/**
 * Create UI store with Zustand
 * Manages global UI state for navigation, modals, and sheets
 */
export const useUIStore = create<UIState>((set) => ({
  // Pro tab state
  proActiveTab: 'dashboard',
  setProActiveTab: (tab) => set({ proActiveTab: tab }),

  // Member tab state
  memberActiveTab: 'practice',
  setMemberActiveTab: (tab) => set({ memberActiveTab: tab }),

  // Bottom sheet state
  isBottomSheetOpen: false,
  bottomSheetContent: null,
  openBottomSheet: (content) =>
    set({ isBottomSheetOpen: true, bottomSheetContent: content }),
  closeBottomSheet: () =>
    set({ isBottomSheetOpen: false, bottomSheetContent: null }),

  // Modal state
  isModalOpen: false,
  modalContent: null,
  openModal: (content) =>
    set({ isModalOpen: true, modalContent: content }),
  closeModal: () =>
    set({ isModalOpen: false, modalContent: null }),
}));
