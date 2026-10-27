import { create } from 'zustand';

/**
 * Cached mirror of users/{uid} — read by Dashboard, Workout, Nutrition, Coach.
 * Kept in sync by the onSnapshot subscription in app/_layout.jsx so screens
 * don't each re-subscribe to the same document.
 */
export const useUserProfileStore = create((set) => ({
  userDoc: null,
  isLoading: true,
  error: null,

  setUserDoc: (userDoc) => set({ userDoc, isLoading: false, error: null }),
  setError: (error) => set({ userDoc: null, isLoading: false, error }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ userDoc: null, isLoading: true, error: null }),
}));
