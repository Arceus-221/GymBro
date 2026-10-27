// controllers/mealPlanController.js
// Implements POST /api/ai/generate-meal-plan — closes the gap flagged in
// Phase 3 SRS §2.6 (Meal Planner screen) and Phase 3's summary card
// ("Schema Gaps Flagged for Phase 4"). Mirrors generateWorkoutPlan's
// structure (Phase 4 §1) exactly: same validate -> Firestore fetch ->
// onboarding gate -> prompt -> resilient Gemini call -> batch write pattern.
//
// New Firestore sub-collection this controller writes to (not in Phase 1's
// original schema, added here per Phase 3 §2.6):
//
//   users/{uid}/mealPlans/{mealPlanId}
//     mealPlanId              string
//     createdAt               timestamp
//     generatedByModel        string
//     planName                string
//     isActive                boolean       // only one true at a time, same
//                                            // convention as workoutPlans
//     durationWeeks           number
//     weeklyMealSchedule      array<map>    // see mealPlanPrompts.js schema
//     aiGenerationContext     map
//       profileSnapshot       map
//       customInstructions    string|null
//
// Also adds `currentMealPlanId` to users/{uid} root doc, analogous to the
// existing `currentPlanId` field for workout plans (Phase 1 §2).
//
// Remember to add the matching Firestore Security Rules block for
// mealPlans (see firestore.rules) before deploying — Firestore denies by
// default, so a missing rules block means this endpoint's writes will
// succeed (Admin SDK bypasses rules) but the client's own reads of
// mealPlans will be denied until the rule exists.

const admin = require('../config/firebase');
const db = admin.firestore();
const { callGeminiResilient } = require('../services/aiResilienceWrapper');
const { TOKEN_LIMITS } = require('../services/geminiService');
const { MEAL_PLAN_SYSTEM_PROMPT, buildMealPlanUserPrompt } = require('../prompts/mealPlanPrompts');
const { MEAL_DETAIL_SYSTEM_PROMPT, buildMealDetailUserPrompt } = require('../prompts/mealDetailPrompts');
const { SUBSTITUTE_MEAL_SYSTEM_PROMPT, buildSubstituteMealUserPrompt } = require('../prompts/substituteMealPrompts');
const { MODEL_ID } = require('../services/aiProviders/geminiAdapter');
const { identifyMeals } = require('../services/mealIdentity');

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'];

const validateMealPlanShape = (data) =>
  Array.isArray(data.weeklyMealSchedule) &&
  data.weeklyMealSchedule.length === 7 &&
  data.weeklyMealSchedule.every(day =>
    typeof day.dayLabel === 'string' &&
    Array.isArray(day.meals) &&
    day.meals.length > 0 &&
    day.meals.every(meal =>
      MEAL_TYPES.includes(meal.mealType) &&
      typeof meal.description === 'string' &&
      typeof meal.calories === 'number' &&
      typeof meal.proteinG === 'number' &&
      typeof meal.carbsG === 'number' &&
      typeof meal.fatsG === 'number'
    )
  );

exports.generateMealPlan = async (req, res) => {
  const { weekPreference, mealsPerDay, customInstructions } = req.body;

  try {
    const userRef = db.collection('users').doc(req.user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User document does not exist.' });
    }

    const userData = userSnap.data();

    if (!userData.onboardingComplete) {
      return res.status(409).json({
        success: false,
        error: 'ONBOARDING_INCOMPLETE',
        message: 'Complete onboarding before generating a meal plan.',
      });
    }

    const profile = userData.profile;
    const resolvedMealsPerDay = mealsPerDay ?? 3;
    const userPrompt = buildMealPlanUserPrompt(profile, weekPreference, resolvedMealsPerDay, customInstructions);

    const result = await callGeminiResilient(
      MEAL_PLAN_SYSTEM_PROMPT,
      userPrompt,
      TOKEN_LIMITS.MEAL_PLANNER, // 4500 — largest payload in the app (Phase 1 §3E)
      validateMealPlanShape
    );

    // Business-rule check the generic validateShape closure can't see:
    // every day must have exactly resolvedMealsPerDay meals (same philosophy
    // as generateWorkoutPlan's post-callGeminiResilient workoutDaysPerWeek
    // check — Phase 4 §1.3).
    const mealCountMismatch = result.weeklyMealSchedule.some(
      day => day.meals.length !== resolvedMealsPerDay
    );
    if (mealCountMismatch) {
      return res.status(502).json({
        success: false,
        error: 'AI_MALFORMED_OUTPUT',
        message: 'AI returned an unexpected response format.',
      });
    }

    const batch = db.batch();
    const newMealPlanRef = userRef.collection('mealPlans').doc();

    const mealPlanDoc = {
      mealPlanId: newMealPlanRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedByModel: MODEL_ID,
      planName: result.planName,
      isActive: true,
      durationWeeks: result.durationWeeks,
      weeklyMealSchedule: identifyMeals(result.weeklyMealSchedule),
      aiGenerationContext: {
        profileSnapshot: profile,
        customInstructions: customInstructions ?? null,
      },
    };

    batch.set(newMealPlanRef, mealPlanDoc);

    if (userData.currentMealPlanId) {
      const oldMealPlanRef = userRef.collection('mealPlans').doc(userData.currentMealPlanId);
      batch.update(oldMealPlanRef, { isActive: false });
    }

    batch.update(userRef, {
      currentMealPlanId: newMealPlanRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return res.status(200).json({ success: true, data: { mealPlanId: newMealPlanRef.id, ...mealPlanDoc } });

  } catch (error) {
    return res.status(error.httpStatus || 500).json({
      success: false,
      error: error.code || 'AI_UNKNOWN_ERROR',
      message: error.message || 'Something went wrong generating the meal plan.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Recipe detail — POST /api/ai/meal-detail
//
// Expands one plan meal into ingredients (with estimated local prices),
// method and timing. Deliberately NOT part of plan generation: 21 meals'
// worth of this would exceed TOKEN_LIMITS.MEAL_PLANNER several times over.
// The client caches the result into the plan document, so each meal costs
// at most one call over its lifetime.
//
// Prices are estimates in the currency the client sends — derived from the
// device locale — and the client labels them as such. The backend does not
// store or validate real prices; the AI is estimating, not quoting.
// ─────────────────────────────────────────────────────────────────────────

const isFiniteNonNegative = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

const validateMealDetailShape = (data) =>
  data.servings === 1 &&
  isFiniteNonNegative(data.prepMinutes) &&
  isFiniteNonNegative(data.cookMinutes) &&
  Array.isArray(data.ingredients) &&
  data.ingredients.length > 0 &&
  data.ingredients.every(
    (i) =>
      typeof i.item === 'string' &&
      typeof i.quantity === 'string' &&
      isFiniteNonNegative(i.estimatedCost)
  ) &&
  Array.isArray(data.steps) &&
  data.steps.length >= 3 &&
  data.steps.every((step) => typeof step === 'string' && step.trim().length > 0) &&
  isFiniteNonNegative(data.estimatedCost) &&
  typeof data.currency === 'string' &&
  (data.tip === null || typeof data.tip === 'string');

exports.getMealDetail = async (req, res) => {
  const { meal, currency } = req.body;

  try {
    const userSnap = await db.collection('users').doc(req.user.uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User document does not exist.' });
    }
    const profile = userSnap.data().profile ?? {};

    const result = await callGeminiResilient(
      MEAL_DETAIL_SYSTEM_PROMPT,
      buildMealDetailUserPrompt(meal, currency, profile),
      TOKEN_LIMITS.MEAL_DETAIL,
      validateMealDetailShape
    );

    // The model is told to echo the currency; make sure it did rather than
    // trusting it, since the client renders whatever comes back.
    return res.status(200).json({ success: true, data: { ...result, currency } });
  } catch (error) {
    return res.status(error.httpStatus || 500).json({
      success: false,
      error: error.code || 'AI_UNKNOWN_ERROR',
      message: error.message || 'Something went wrong building that recipe.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Meal substitution — POST /api/ai/substitute-meal
//
// The meal counterpart of substituteExercise. Proposes 3 alternatives that
// hold the slot's macros; the client writes the chosen one into the plan
// document directly (firestore.rules grants the owner update on mealPlans).
// Dietary preference and medical notes are read server-side from the
// profile, never trusted from the request, same as generateMealPlan.
// ─────────────────────────────────────────────────────────────────────────

const validateSubstituteMealShape = (data) =>
  Array.isArray(data.alternatives) &&
  data.alternatives.length === 3 &&
  data.alternatives.every(
    (alt) =>
      typeof alt.description === 'string' &&
      alt.description.trim().length > 0 &&
      typeof alt.calories === 'number' &&
      typeof alt.proteinG === 'number' &&
      typeof alt.carbsG === 'number' &&
      typeof alt.fatsG === 'number' &&
      typeof alt.whyItFits === 'string'
  );

exports.substituteMeal = async (req, res) => {
  const { meal, reason } = req.body;

  try {
    const userSnap = await db.collection('users').doc(req.user.uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User document does not exist.' });
    }
    const profile = userSnap.data().profile ?? {};

    const result = await callGeminiResilient(
      SUBSTITUTE_MEAL_SYSTEM_PROMPT,
      buildSubstituteMealUserPrompt(meal, profile, reason),
      TOKEN_LIMITS.SUBSTITUTE_MEAL,
      validateSubstituteMealShape
    );

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.httpStatus || 500).json({
      success: false,
      error: error.code || 'AI_UNKNOWN_ERROR',
      message: error.message || 'Something went wrong finding alternatives.',
    });
  }
};
