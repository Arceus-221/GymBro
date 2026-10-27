import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/** Create a missing user document without replacing an existing profile. */
export async function ensureUserDocument(user, displayName = user.displayName) {
  const ref = doc(db, 'users', user.uid);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) {
      if (displayName && !snapshot.data().displayName) {
        transaction.update(ref, { displayName, updatedAt: serverTimestamp() });
      }
      return;
    }
    transaction.set(ref, {
      uid: user.uid,
      displayName: displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      onboardingComplete: false,
      currentPlanId: null,
      currentMealPlanId: null,
      stats: { totalWorkoutsCompleted: 0, currentStreakDays: 0, longestStreakDays: 0, lastWorkoutDate: null },
    });
  });
}
