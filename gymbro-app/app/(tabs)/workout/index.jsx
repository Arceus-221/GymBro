import { useFocusEffect, useRouter } from 'expo-router';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Icon } from '../../../components/shared/Icon';
import { ReadError } from '../../../components/shared/ReadError';
import { Eyebrow } from '../../../components/shared/Typography';
import { ExerciseSelectorStrip } from '../../../components/workout/ExerciseSelectorStrip';
import { InlineRestTimerCard } from '../../../components/workout/InlineRestTimerCard';
import { SetLogTable } from '../../../components/workout/SetLogTable';
import { WorkoutSummaryModal } from '../../../components/workout/WorkoutSummaryModal';
import { radius, spacing, typography } from '../../../constants/theme';
import { formatWeight } from '../../../constants/units';
import { useFirestoreDoc } from '../../../hooks/useFirestoreDoc';
import { useRestTimer } from '../../../hooks/useRestTimer';
import { useToday } from '../../../hooks/useToday';
import { streakAfterWorkout } from '../../../services/workoutStreak';
import { db } from '../../../services/firebase';
import { useActiveWorkoutStore } from '../../../store/useActiveWorkoutStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useUIStore } from '../../../store/useUIStore';
import { useUserProfileStore } from '../../../store/useUserProfileStore';
import { useThemedStyles } from '../../../components/shared/ThemeProvider';

export default function WorkoutMode() {
  const { styles, colors } = useThemedStyles(makeStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const userDoc = useUserProfileStore((s) => s.userDoc);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const showToast = useUIStore((s) => s.showToast);
  const showError = useUIStore((s) => s.showError);

  const session = useActiveWorkoutStore();
  const { dateId: today, dayLabel } = useToday();
  const restTimer = useRestTimer();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const finishing = useRef(false);
  useFocusEffect(useCallback(() => {
    finishing.current = false;
    setFocused(true);
    return () => setFocused(false);
  }, []));

  const { data: plan, isLoading, error: planError, retry: retryPlan } = useFirestoreDoc(
    user && userDoc?.currentPlanId
      ? `users/${user.uid}/workoutPlans/${userDoc.currentPlanId}`
      : null
  );

  const todaysPlanDay = useMemo(() => {
    if (!plan?.weeklySchedule) return null;
    return plan.weeklySchedule.find((d) => d.dayLabel === dayLabel) ?? null;
  }, [plan, dayLabel]);

  // Seed the in-memory session once today's plan day is known. Everything from
  // here is local state until "Finish Workout" (Phase 3 §3.2).
  useEffect(() => {
    if (!focused || finishing.current || !todaysPlanDay || todaysPlanDay.isRestDay) return;
    if (session.isActive) return;
    session.startSession({
      planId: plan?.planId ?? null,
      sessionName: todaysPlanDay.sessionName,
      exercises: todaysPlanDay.exercises ?? [],
      workoutDate: today,
      schedule: plan?.weeklySchedule,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaysPlanDay, plan?.planId, focused, session.isActive, today]);

  const exercise = session.exercises[session.exerciseIndex];
  const currentSetIndex = exercise ? exercise.sets.findIndex((s) => !s.completed) : -1;
  const allSetsDone = exercise && currentSetIndex === -1;
  const isLastExercise = session.exerciseIndex === session.exercises.length - 1;

  const handleLogSet = () => {
    if (!exercise || currentSetIndex === -1) return;
    session.logCurrentSet(session.exerciseIndex, currentSetIndex);
    restTimer.start(exercise.restSeconds ?? 90);
  };

  const handleFinish = async ({ perceivedExertion, notes }) => {
    if (!user || saving) return;
    if (!session.exercises.some((item) => item.sets.some((set) => set.completed))) {
      showError('Log at least one set before saving.');
      return;
    }
    setSaving(true);
    const workoutDate = session.workoutDate ?? today;

    try {
      const payload = session.buildSessionPayload({ perceivedExertion, notes });
      const logRef = doc(db, 'users', user.uid, 'dailyLogs', workoutDate);
      const userRef = doc(db, 'users', user.uid);

      // Transactions require connectivity and only succeed after server acknowledgement.
      // Keep the active session available when the save fails.
      await runTransaction(db, async (transaction) => {
        const [logSnapshot, userSnapshot] = await Promise.all([
          transaction.get(logRef),
          transaction.get(userRef),
        ]);
        if (!userSnapshot.exists()) throw new Error('User profile not found');
        const previousSession = logSnapshot.data()?.workoutSession;
        if (previousSession?.completionStatus === 'completed' && payload.completionStatus !== 'completed') {
          throw new Error('Complete all sets before replacing a completed workout.');
        }
        const alreadySaved = previousSession?.sessionId === session.sessionId ||
          (!previousSession?.sessionId && previousSession?.startTime?.toMillis?.() === session.startTime);
        const stats = userSnapshot.data().stats ?? {};
        const nextStreak = streakAfterWorkout(stats, session.schedule, workoutDate);

        transaction.set(logRef, {
          date: workoutDate,
          uid: user.uid,
          ...(logSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
          workoutSession: payload,
        }, { merge: true });
        if (!alreadySaved) {
          const becameCompleted = payload.completionStatus === 'completed' &&
            previousSession?.completionStatus !== 'completed';
          const updates = {
            updatedAt: serverTimestamp(),
            ...(!previousSession ? { 'stats.totalWorkoutsCompleted': (stats.totalWorkoutsCompleted ?? 0) + 1 } : {}),
            ...(becameCompleted && nextStreak !== null ? {
              'stats.currentStreakDays': nextStreak,
              'stats.longestStreakDays': Math.max(stats.longestStreakDays ?? 0, nextStreak),
              'stats.lastWorkoutDate': workoutDate,
            } : {}),
          };
          transaction.update(userRef, updates);
        }
      });

      if (useAuthStore.getState().user?.uid !== user.uid) return;
      finishing.current = true;
      session.endSession();
      setSummaryOpen(false);
      showToast('Workout saved ✓', 'success');
      router.replace('/(tabs)');
    } catch (error) {
      showError(error?.message === 'Complete all sets before replacing a completed workout.'
        ? error.message
        : 'Could not save that workout. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  if (planError) return <ReadError message="Could not load your workout plan." onRetry={retryPlan} />;
  if (isLoading) {
    return <DarkShell insets={insets}><Text style={styles.muted}>Loading your plan...</Text></DarkShell>;
  }

  if (!todaysPlanDay && !session.isActive) {
    return (
      <DarkShell insets={insets}>
        <EmptyState
          title="No session today"
          message="You don’t have an active plan with a session for today."
          actionLabel="BACK TO HOME"
          onAction={() => router.replace('/(tabs)')}
        />
      </DarkShell>
    );
  }

  if (todaysPlanDay?.isRestDay && !session.isActive) {
    return (
      <DarkShell insets={insets}>
        <EmptyState
          title="Rest & recovery"
          message="Today is a programmed rest day. Recovery is where the adaptation happens."
          actionLabel="BACK TO HOME"
          onAction={() => router.replace('/(tabs)')}
        />
      </DarkShell>
    );
  }

  if (!exercise) {
    return <DarkShell insets={insets}><Text style={styles.muted}>Preparing session...</Text></DarkShell>;
  }

  const currentSetNumber = currentSetIndex === -1 ? exercise.sets.length : currentSetIndex + 1;
  const targetSet = exercise.sets[currentSetIndex === -1 ? exercise.sets.length - 1 : currentSetIndex];

  return (
    <View style={styles.flex}>
      <View style={styles.glow} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backRow}
          accessibilityLabel="Go back"
        >
          <Icon name="back" size={15} color={colors.text.inverseMuted} />
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>WORKOUT MODE</Text>
          <Text style={styles.headerDay} numberOfLines={1}>
            {session.sessionName || todaysPlanDay?.sessionName}
          </Text>
        </View>
        <Text style={styles.headerCount}>
          {`${session.exerciseIndex + 1}/${session.exercises.length}`}
        </Text>
      </View>

      <ExerciseSelectorStrip
        exercises={session.exercises}
        activeIndex={session.exerciseIndex}
        onSelect={(index) => {
          session.setExerciseIndex(index);
          restTimer.stop();
        }}
      />

      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Eyebrow color={colors.text.inverseMuted}>
            {exercise.primaryMuscleGroup || 'Target'}
          </Eyebrow>
          <Text style={styles.exerciseName}>{exercise.name.toUpperCase()}</Text>
          {exercise.formCue ? <Text style={styles.cue}>{exercise.formCue}</Text> : null}
        </View>

        <View style={styles.tiles}>
          <BigTile label="SET" value={`${currentSetNumber} of ${exercise.sets.length}`} />
          <BigTile label="REPS" value={String(targetSet?.repsCompleted || exercise.repsRange || '—')} />
          <BigTile label="WEIGHT" value={formatWeight(targetSet?.weightKg ?? 0, weightUnit)} />
        </View>

        <SetLogTable
          // Remount per exercise so the table's in-progress weight drafts,
          // which are keyed by row index, can't carry over to the next
          // exercise's rows.
          key={session.exerciseIndex}
          sets={exercise.sets}
          targetUnit={exercise.targetUnit}
          currentSetIndex={currentSetIndex}
          onChangeSet={(setIndex, patch) =>
            session.updateSet(session.exerciseIndex, setIndex, patch)
          }
        />

        {restTimer.isRunning ? (
          <InlineRestTimerCard secondsLeft={restTimer.secondsLeft} onSkip={restTimer.stop} />
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={allSetsDone ? undefined : handleLogSet}
            disabled={allSetsDone}
            style={[styles.logButton, allSetsDone && styles.logButtonDone]}
          >
            <Icon name="check" size={16} color={colors.text.inverse} />
            <Text style={styles.logButtonText}>
              {allSetsDone ? 'ALL SETS DONE' : 'LOG SET'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => restTimer.start(exercise.restSeconds ?? 90)}
            style={styles.restButton}
          >
            <Icon name="timer" size={16} color={colors.text.inverse} />
            <Text style={styles.restButtonText}>REST</Text>
          </Pressable>
        </View>

        {isLastExercise ? (
          <Pressable onPress={() => setSummaryOpen(true)} style={styles.finish}>
            <Text style={styles.finishText}>FINISH WORKOUT</Text>
            <Icon name="forward" size={16} color={colors.brand.redText} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              session.setExerciseIndex(session.exerciseIndex + 1);
              restTimer.stop();
            }}
            style={styles.next}
          >
            <Text style={styles.nextText} numberOfLines={1}>
              {`NEXT: ${session.exercises[session.exerciseIndex + 1]?.name ?? ''}`}
            </Text>
            <Icon name="forward" size={13} color={colors.text.inverseMuted} />
          </Pressable>
        )}
      </ScrollView>

      <WorkoutSummaryModal
        visible={summaryOpen}
        saving={saving}
        onCancel={() => setSummaryOpen(false)}
        onConfirm={handleFinish}
        stats={summarize(session)}
      />
    </View>
  );
}

function DarkShell({ children, insets }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={[styles.flex, styles.centered, { paddingTop: insets.top + 40 }]}>{children}</View>
  );
}

function BigTile({ label, value }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function summarize(session) {
  const completedSets = session.exercises.reduce(
    (total, ex) => total + ex.sets.filter((s) => s.completed).length,
    0
  );
  const volumeKg = session.exercises.reduce(
    (total, ex) =>
      total +
      ex.sets.reduce((t, s) => (s.completed ? t + s.repsCompleted * s.weightKg : t), 0),
    0
  );
  const durationMinutes = session.startTime
    ? Math.max(1, Math.round((Date.now() - session.startTime) / 60000))
    : 0;
  return { completedSets, volumeKg: Math.round(volumeKg), durationMinutes };
}

const makeStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface.inverseDeep },
  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  muted: { ...typography.body, color: colors.text.inverseMuted },
  glow: {
    position: 'absolute',
    top: -110,
    left: -60,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.brand.red,
    opacity: 0.16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { ...typography.small, color: colors.text.inverseMuted, fontWeight: '700' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerEyebrow: { ...typography.eyebrow, fontSize: 9, color: colors.text.inverseMuted },
  headerDay: { ...typography.label, fontSize: 12, color: colors.text.inverse },
  headerCount: { ...typography.eyebrow, fontSize: 10, color: colors.brand.redText },
  body: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: 120 },
  exerciseName: { ...typography.hero, fontSize: 34, color: colors.brand.redText, marginTop: 4 },
  cue: { ...typography.small, color: colors.text.inverseMuted, marginTop: 6, lineHeight: 18 },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.onInverse.raised,
    gap: 4,
  },
  tileLabel: { ...typography.eyebrow, fontSize: 8, color: colors.text.inverseMuted },
  tileValue: { ...typography.h2, fontSize: 17, color: colors.text.inverse },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  logButton: {
    flex: 2,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.brand.red,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  logButtonDone: { backgroundColor: colors.onInverse.raisedStrong },
  logButtonText: { ...typography.label, fontSize: 13, color: colors.text.inverse, letterSpacing: 1.5 },
  restButton: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.onInverse.placeholder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  restButtonText: { ...typography.label, fontSize: 12, color: colors.text.inverse },
  next: { paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextText: {
    ...typography.eyebrow,
    fontSize: 10,
    color: colors.text.inverseMuted,
    flexShrink: 1,
  },
  finish: {
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.brand.red,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  finishText: { ...typography.label, fontSize: 13, color: colors.brand.redText, letterSpacing: 1.5 },
});
