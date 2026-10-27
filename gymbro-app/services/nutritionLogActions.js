import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { sumMealTotals } from './nutritionTargets';

/**
 * Writes to users/{uid}/dailyLogs/{date}.nutritionLog. Both the Nutrition
 * screen and the meal detail screen log meals, so the write lives here
 * rather than in either.
 *
 * A logged meal is one shape regardless of where it came from:
 *
 *   { mealType, userDescription, aiEstimate, loggedAt,
 *     source: 'manual' | 'plan', plannedMealKey? }
 *
 * `source: 'plan'` entries carry the plan meal's known macros as aiEstimate —
 * no AI call, the numbers already exist — and a plannedMealKey so the plan
 * card can show it as logged and so it can be un-logged by identity rather
 * than by matching text.
 */

async function updateMeals(uid, dateId, transform) {
  const ref = doc(db, 'users', uid, 'dailyLogs', dateId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const log = snapshot.data();
    const meals = transform(log?.nutritionLog?.meals ?? []);
    transaction.set(ref, {
      date: dateId,
      uid,
      ...(snapshot.exists() ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
      nutritionLog: {
        ...(log?.nutritionLog ?? {}),
        meals,
        aiEstimatedTotals: sumMealTotals(meals),
      },
    }, { merge: true });
  });
}

export async function appendLoggedMeal({ uid, dateId, entry }) {
  const loggedEntry = { ...entry, entryId: entry.operationId ?? doc(collection(db, 'mealLogIds')).id, loggedAt: new Date() };
  await updateMeals(uid, dateId, (meals) => {
    if ((entry.operationId && meals.some((meal) => meal.operationId === entry.operationId)) ||
        (entry.plannedMealKey && meals.some((meal) => meal.plannedMealKey === entry.plannedMealKey))) {
      return meals;
    }
    return [...meals, loggedEntry];
  });
}

export async function removePlannedMealLog({ uid, dateId, plannedMealKey }) {
  await updateMeals(uid, dateId, (meals) => meals.filter(
    (meal) => meal.plannedMealKey !== plannedMealKey
  ));
}

/** The set of plan meal keys already logged today — for the card badge. */
export function loggedPlanKeys(existingLog) {
  return new Set(
    (existingLog?.nutritionLog?.meals ?? [])
      .map((m) => m.plannedMealKey)
      .filter(Boolean)
  );
}
