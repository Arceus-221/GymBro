// constants/equipment.js — the 7 availableEquipment enum values (Phase 1 §2).
// Values must match the enum exactly; the backend prompt reads them verbatim.

export const EQUIPMENT_OPTIONS = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'cables', label: 'Cables' },
  { value: 'machines', label: 'Machines' },
  { value: 'resistance_bands', label: 'Resistance Bands' },
  { value: 'pull_up_bar', label: 'Pull-Up Bar' },
  { value: 'bodyweight_only', label: 'Bodyweight Only' },
];

export const FITNESS_GOALS = [
  { value: 'fat_loss', label: 'Fat Loss', sub: 'Burn calories & lean out' },
  { value: 'muscle_gain', label: 'Muscle Gain', sub: 'Build strength & size' },
  { value: 'endurance', label: 'Endurance', sub: 'Boost stamina & cardio' },
  { value: 'maintenance', label: 'Maintenance', sub: 'Stay where you are' },
];

export const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export const DIETARY_PREFERENCES = [
  { value: 'none', label: 'No restriction' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'halal', label: 'Halal' },
  { value: 'keto', label: 'Keto' },
];

export const DURATION_OPTIONS = [30, 45, 60, 90];

export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'pre_workout', label: 'Pre-Workout' },
  { value: 'post_workout', label: 'Post-Workout' },
];

/** Toggle equipment while keeping bodyweight-only exclusive. */
export function toggleEquipmentSelection(current, value) {
  if (value === 'bodyweight_only') return current.includes(value) ? [] : [value];
  const choices = current.filter((item) => item !== 'bodyweight_only');
  return choices.includes(value) ? choices.filter((item) => item !== value) : [...choices, value];
}
