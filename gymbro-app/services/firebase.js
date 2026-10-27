// services/firebase.js — client SDK init (Path A).
//
// Deviation from Phase 3 §3.3, decided during implementation: the SRS assumed
// @react-native-firebase for Auth alongside the JS SDK for Firestore. That
// combination requires a custom dev build (native modules), which rules out
// Expo Go. This app uses the Firebase JS SDK for BOTH Auth and Firestore so it
// runs in Expo Go unmodified.
import { Platform } from 'react-native';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { createFirebaseAuth } from './firebaseAuth';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = createFirebaseAuth(app);

// Phase 3 §3.3 specifies persistentLocalCache for offline-across-restarts.
// That cache is IndexedDB-backed and IndexedDB does not exist in React
// Native, so on native we use the in-memory cache instead. The practical
// difference: onSnapshot still serves cached data and queued writes still
// flush within a session, but the cache does not survive an app restart.
// Restoring the SRS's full offline guarantee means moving Firestore to
// @react-native-firebase, which in turn requires a custom dev build.
export const db = initializeFirestore(app, {
  localCache:
    Platform.OS === 'web'
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
});

export default app;
