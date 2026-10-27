// schemas/aiSchemas.js
const { z } = require('zod');

const nonEmptyTrimmedString = (maxLen, fieldName) =>
  z.string()
    .trim()
    .min(1, { message: `${fieldName} must not be empty.` })
    .max(maxLen, { message: `${fieldName} must be ${maxLen} characters or fewer.` });

const generatePlanRequestSchema = z.object({
  weekPreference: z.number().int().min(1).max(12).optional(),
  customInstructions: nonEmptyTrimmedString(500, 'customInstructions').nullable().optional(),
});

// ── POST /api/ai/generate-meal-plan ─────────────────────────────────
// Mirrors generatePlanRequestSchema's shape — same "weekPreference +
// customInstructions" contract, since a meal plan is structurally analogous
// to a workout plan (Phase 1 workoutPlans schema; Phase 3 §2.6 flagged this
// endpoint as missing). mealsPerDay lets the client override the profile
// default (breakfast/lunch/dinner = 3) without a separate onboarding field.

const generateMealPlanRequestSchema = z.object({
  weekPreference: z.number().int().min(1).max(4).optional(), // meal plans regenerate more
                                                              // often than workout plans;
                                                              // capped tighter than the 12
                                                              // weeks allowed for workout plans
  mealsPerDay: z.number().int().min(2).max(6).optional(),
  customInstructions: nonEmptyTrimmedString(500, 'customInstructions').nullable().optional(),
});

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'];

const estimateNutritionRequestSchema = z.object({
  mealDescription: nonEmptyTrimmedString(300, 'mealDescription'),
  mealType: z.enum(MEAL_TYPES, {
    errorMap: () => ({ message: `mealType must be one of: ${MEAL_TYPES.join(', ')}` }),
  }),
});

const recoveryScoreRequestSchema = z.object({
  sleepHours: z.number().min(0).max(12),
  sleepQuality: z.number().int().min(1).max(5),
  muscleSoreness: z.number().int().min(1).max(5),
  energyLevel: z.number().int().min(1).max(5),
  stressLevel: z.number().int().min(1).max(5),
  moodRating: z.number().int().min(1).max(5),
});

// One meal as it sits in a plan document. Shared by the two endpoints that
// take a plan meal as input. Macros are bounded to catch garbage rather than
// to enforce nutrition — a 5000 kcal single meal is a client bug, not a diet.
const planMealSchema = z.object({
  mealType: z.enum(MEAL_TYPES),
  description: nonEmptyTrimmedString(300, 'meal.description'),
  calories: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  carbsG: z.number().min(0).max(1000),
  fatsG: z.number().min(0).max(500),
});

const mealDetailRequestSchema = z.object({
  meal: planMealSchema,
  // ISO 4217. The client derives it from the device locale; the backend only
  // passes it through to the prompt, so a strict shape is all that matters.
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO code'),
});

const substituteMealRequestSchema = z.object({
  meal: planMealSchema,
  reason: nonEmptyTrimmedString(300, 'reason').optional(),
});

const substituteExerciseRequestSchema = z.object({
  exerciseName: nonEmptyTrimmedString(100, 'exerciseName'),
  reason: nonEmptyTrimmedString(300, 'reason'),
  availableEquipment: z.array(z.string()).max(10).optional().default([]),
});

const CONTEXT_TYPES = ['general', 'workout_advice', 'nutrition', 'recovery', 'motivation'];

const chatRequestSchema = z.object({
  message: nonEmptyTrimmedString(2000, 'message'),
  contextType: z.enum(CONTEXT_TYPES).optional(),
  conversationId: z.string().min(1).max(128).optional(),
});

module.exports = {
  generatePlanRequestSchema,
  generateMealPlanRequestSchema,
  estimateNutritionRequestSchema,
  recoveryScoreRequestSchema,
  substituteExerciseRequestSchema,
  mealDetailRequestSchema,
  substituteMealRequestSchema,
  chatRequestSchema,
};