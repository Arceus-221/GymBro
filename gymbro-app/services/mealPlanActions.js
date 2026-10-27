import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Writes against users/{uid}/mealPlans/{planId} from the client. The rules
 * grant the owner update on that path, so editing a plan needs no backend
 * round trip — only *proposing* alternatives does (that is an AI call).
 *
 * Firestore cannot address one element of a nested array, so every edit
 * rewrites weeklyMealSchedule whole. The document is small (7 days × a few
 * meals) and only its owner writes it, so this is fine.
 */

/** Plan, slot and revision together identify the actual dish that was eaten.
 * Old plans have no mealId: their existing day/index slot remains stable.
 * Old positional-only log keys remain historical entries and are not matched,
 * because they cannot safely identify a plan or a replacement.
 */
export function mealKey(planId, dayLabel, index, meal) {
  if (!planId || !meal) return null;
  return JSON.stringify([planId, meal.mealId ?? `legacy:${dayLabel}:${index}`, meal.revision ?? 'original']);
}

/** The four macro fields a logged meal's aiEstimate needs, and nothing else. */
export function macrosOf(meal) {
  return {
    calories: meal.calories ?? 0,
    proteinG: meal.proteinG ?? 0,
    carbsG: meal.carbsG ?? 0,
    fatsG: meal.fatsG ?? 0,
  };
}

function withMealReplaced(schedule, dayLabel, index, transform) {
  return schedule.map((day) => {
    if (day.dayLabel !== dayLabel) return day;
    return {
      ...day,
      meals: day.meals.map((meal, i) => (i === index ? transform(meal) : meal)),
    };
  });
}

// A revision distinguishes a replacement even if its description is identical.
function sameMeal(current, expected) {
  return current && expected &&
    (current.mealId ?? null) === (expected.mealId ?? null) &&
    (current.revision ?? null) === (expected.revision ?? null) &&
    ['mealType', 'description', 'calories', 'proteinG', 'carbsG', 'fatsG']
      .every((field) => current[field] === expected[field]);
}

async function updateMeal({ uid, planId, dayLabel, index, expectedMeal, transform }) {
  const ref = doc(db, 'users', uid, 'mealPlans', planId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const schedule = snapshot.data()?.weeklyMealSchedule;
    const current = schedule?.find((day) => day.dayLabel === dayLabel)?.meals?.[index];
    if (!sameMeal(current, expectedMeal)) return false;
    transaction.update(ref, {
      weeklyMealSchedule: withMealReplaced(schedule, dayLabel, index, transform),
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}

export async function replaceMeal({ uid, planId, dayLabel, index, expectedMeal, replacement }) {
  const revision = doc(collection(db, 'users', uid, 'mealPlans')).id;
  const changed = await updateMeal({ uid, planId, dayLabel, index, expectedMeal, transform: (meal) => ({
    mealType: meal.mealType,
    ...(meal.mealId ? { mealId: meal.mealId } : {}),
    description: replacement.description,
    ...macrosOf(replacement),
    revision,
    replacedAt: new Date(),
  }) });
  if (!changed) throw new Error('Meal changed before the swap completed');
}

export async function cacheMealDetail({ uid, planId, dayLabel, index, expectedMeal, detail }) {
  return updateMeal({ uid, planId, dayLabel, index, expectedMeal, transform: (meal) => ({
    ...meal,
    detail: { ...detail, generatedAt: new Date() },
  }) });
}
