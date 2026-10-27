import { create } from 'zustand';
import { toggleEquipmentSelection } from '../constants/equipment';

const EMPTY_DRAFT = {
  fitnessGoal: null,
  experienceLevel: null,
  age: null,
  gender: null,
  heightCm: null,
  weightKg: null,
  targetWeightKg: null,
  availableEquipment: [],
  dietaryPreference: 'none',
  workoutDaysPerWeek: 4,
  preferredDurationMinutes: 45,
  medicalNotes: null,
};

/**
 * In-progress profile spanning the 3 onboarding steps. Deliberately never
 * written to Firestore until the final step submits — avoids leaving a
 * half-populated profile behind if the user abandons the flow.
 */
export const useOnboardingDraftStore = create((set) => ({
  draft: { ...EMPTY_DRAFT },

  setField: (key, value) =>
    set((state) => ({ draft: { ...state.draft, [key]: value } })),

  toggleEquipment: (value) =>
    set((state) => ({
      draft: { ...state.draft, availableEquipment: toggleEquipmentSelection(state.draft.availableEquipment, value) },
    })),

  reset: () => set({ draft: { ...EMPTY_DRAFT } }),
}));
