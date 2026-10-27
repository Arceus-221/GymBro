import { getAuth } from 'firebase/auth';

export function createFirebaseAuth(app) {
  return getAuth(app);
}
