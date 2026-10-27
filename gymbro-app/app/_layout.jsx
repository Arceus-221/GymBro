import NetInfo from '@react-native-community/netinfo';
import { Slot, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorToast } from '../components/shared/ErrorToast';
import { OfflineBanner } from '../components/shared/OfflineBanner';

import { useActiveWorkoutStore } from '../store/useActiveWorkoutStore';
import { useOnboardingDraftStore } from '../store/useOnboardingDraftStore';
import { ensureUserDocument } from '../services/userProvisioning';
import { wakeBackend } from '../services/apiClient';
import { auth, db } from '../services/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { useConnectivityStore } from '../store/useConnectivityStore';
import { useUserProfileStore } from '../store/useUserProfileStore';
import { ThemeProvider, useThemedStyles } from '../components/shared/ThemeProvider';

const WAKE_THROTTLE_MS = 60_000;

export default function RootLayout() {
  const setUser = useAuthStore((s) => s.setUser);
  const setUserDoc = useUserProfileStore((s) => s.setUserDoc);
  const clearProfile = useUserProfileStore((s) => s.clear);
  const setOnline = useConnectivityStore((s) => s.setOnline);
  const lastWakeRef = useRef(0);
  const [profileAttempt, setProfileAttempt] = useState(0);

  // Layer 1 of cold-start handling: start Render's container booting during
  // splash/auth time rather than at the user's first real AI request.
  useEffect(() => {
    wakeBackend();
    lastWakeRef.current = Date.now();

    const sub = AppState.addEventListener('change', (state) => {
      const now = Date.now();
      if (state === 'active' && now - lastWakeRef.current > WAKE_THROTTLE_MS) {
        lastWakeRef.current = now;
        wakeBackend();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return unsub;
  }, [setOnline]);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    const previousUid = useAuthStore.getState().user?.uid ?? null;
    if (previousUid !== (nextUser?.uid ?? null)) {
      useActiveWorkoutStore.getState().endSession();
      useOnboardingDraftStore.getState().reset();
      clearProfile();
    }
    setUser(nextUser);
  }), [setUser, clearProfile]);

  // One shared subscription to users/{uid} for the whole app — screens read it
  // from the store instead of each opening their own listener.
  const user = useAuthStore((s) => s.user);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    let seenExisting = false;
    let provisioning = false;
    useUserProfileStore.getState().clear();
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (!active) return;
        if (snap.exists()) {
          seenExisting = true;
          setUserDoc({ id: snap.id, ...snap.data() });
        } else if (snap.metadata.fromCache && !isOnline && !seenExisting) {
          useUserProfileStore.getState().setError('Your profile is not cached. Connect to the internet and retry.');
        } else if (!snap.metadata.fromCache && !seenExisting && !provisioning) {
          provisioning = true;
          ensureUserDocument(user).catch(() => {
            if (active) useUserProfileStore.getState().setError('Could not create your profile. Check your connection and try again.');
          });
        } else if (!snap.metadata.fromCache && seenExisting) {
          useUserProfileStore.getState().setError('Your profile is unavailable.');
        }
      },
      () => {
        if (active) useUserProfileStore.getState().setError('Could not load your profile. Check your connection and try again.');
      }
    );
    return () => { active = false; unsubscribe(); };
  }, [user, setUserDoc, profileAttempt, isOnline]);

  useProtectedRoute();

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedShell onRetryProfile={() => setProfileAttempt((n) => n + 1)} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Everything that reads the theme lives below the provider. Split out of
 * RootLayout because a component cannot consume a context it renders itself.
 */
function ThemedShell({ onRetryProfile }) {
  const { styles, scheme } = useThemedStyles(makeStyles);
  const user = useAuthStore((s) => s.user);
  const profileError = useUserProfileStore((s) => s.error);

  return (
    <>
      {/*
        Driven by the resolved scheme, not "auto". "auto" follows the OS, which
        is wrong the moment a user forces a theme that differs from it — dark
        status-bar glyphs on our dark ground.
      */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.root}>
        <OfflineBanner />
        {user && profileError ? (
          <View style={styles.profileError}>
            <Text>{profileError}</Text>
            <Pressable onPress={onRetryProfile}><Text>TRY AGAIN</Text></Pressable>
            <Pressable onPress={() => signOut(auth)}><Text>SIGN OUT</Text></Pressable>
          </View>
        ) : <Slot key={user?.uid ?? 'signed-out'} />}
        <ErrorToast />
      </View>
    </>
  );
}

/**
 * Single routing authority: signed out -> (auth), signed in but not onboarded
 * -> (onboarding), otherwise -> (tabs). Runs on every segment change so a
 * user can't land somewhere their auth state doesn't allow.
 */
function useProtectedRoute() {
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const user = useAuthStore((s) => s.user);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const userDoc = useUserProfileStore((s) => s.userDoc);

  useEffect(() => {
    // The navigator must be mounted before router.replace() does anything.
    if (!navigationState?.key) return;
    if (isInitializing) return;

    const group = segments[0];

    // On the index route, app/index.jsx owns routing declaratively via
    // <Redirect>. Racing it from here is what stranded the app on the splash
    // screen, so this guard only handles transitions *after* the first route
    // is established (signing out, finishing onboarding).
    if (!group) return;

    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    if (!user) {
      if (!inAuth) router.replace('/(auth)/sign-in');
      return;
    }

    // Wait for the user document before deciding onboarding state — routing on
    // a null doc would bounce a fully-onboarded user back through the wizard.
    if (userDoc === null) return;

    if (!userDoc.onboardingComplete) {
      if (!inOnboarding) router.replace('/(onboarding)/goal');
      return;
    }

    if (inAuth || inOnboarding) router.replace('/(tabs)');
  }, [navigationState?.key, user, userDoc, isInitializing, segments, router]);
}

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.primary },
  profileError: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 20 },
});
