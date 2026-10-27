import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../../components/shared/EmptyState';
import { LoadingSpinner } from '../../../components/shared/LoadingSpinner';
import { ReadError } from '../../../components/shared/ReadError';
import { ScreenHeader } from '../../../components/shared/ScreenHeader';
import { useThemedStyles } from '../../../components/shared/ThemeProvider';
import { radius, spacing, typography } from '../../../constants/theme';
import { useFirestoreDoc } from '../../../hooks/useFirestoreDoc';
import { DAY_LABELS, useToday } from '../../../hooks/useToday';
import { useAuthStore } from '../../../store/useAuthStore';
import { useUserProfileStore } from '../../../store/useUserProfileStore';

const WEEKDAYS = [...DAY_LABELS.slice(1), DAY_LABELS[0]];

export default function WeeklyWorkoutPlan() {
  const { styles } = useThemedStyles(makeStyles);
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const planId = useUserProfileStore((state) => state.userDoc?.currentPlanId);
  const { dayLabel } = useToday();
  const { data: plan, isLoading, error, retry } = useFirestoreDoc(
    user && planId ? `users/${user.uid}/workoutPlans/${planId}` : null
  );
  const schedule = Array.isArray(plan?.weeklySchedule) ? plan.weeklySchedule : [];

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/workout');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="WEEKLY WORKOUT PLAN" onBack={goBack} />
      {isLoading ? <LoadingSpinner message="Loading your plan..." /> : error ? (
        <ReadError message="Could not load your workout plan." onRetry={retry} />
      ) : !schedule.length ? (
        <EmptyState
          title="No weekly plan yet"
          message="Generate a workout plan from the home screen to see your week here."
          actionLabel="GO TO HOME"
          onAction={() => router.replace('/(tabs)')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>YOUR TRAINING SCHEDULE</Text>
            <Text style={styles.heading}>THE WEEK AHEAD</Text>
            <Text style={styles.description}>Your workouts and recovery days, all in one place.</Text>
          </View>
          {WEEKDAYS.map((label) => {
            const day = schedule.find((entry) => entry?.dayLabel === label);
            const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
            const isToday = label === dayLabel;
            return (
              <View key={label} style={[styles.card, isToday && styles.todayCard]}>
                <View style={styles.dayHeader}>
                  <Text style={styles.day}>{label.toUpperCase()}</Text>
                  {isToday ? <Text style={styles.today}>TODAY</Text> : null}
                </View>
                {!day ? (
                  <Text style={styles.muted}>No session in this plan.</Text>
                ) : day.isRestDay ? (
                  <>
                    <Text style={styles.session}>Rest & recovery</Text>
                    <Text style={styles.muted}>Take time to recharge.</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.session}>{day.sessionName || 'Workout'}</Text>
                    <Text style={styles.meta}>
                      {`${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}${day.estimatedDurationMinutes ? `  ·  ${day.estimatedDurationMinutes} min` : ''}`}
                    </Text>
                    {exercises.map((exercise, index) => (
                      <View key={`${exercise.exerciseId ?? exercise.name ?? 'exercise'}-${index}`} style={styles.exerciseRow}>
                        <Text style={styles.exerciseNumber}>{String(index + 1).padStart(2, '0')}</Text>
                        <View style={styles.exerciseContent}>
                          <Text style={styles.exerciseName}>{exercise.name || 'Exercise'}</Text>
                          {(exercise.sets != null || exercise.repsRange) ? (
                            <Text style={styles.exerciseTarget}>
                              {[exercise.sets != null ? `${exercise.sets} sets` : null, exercise.repsRange].filter(Boolean).join('  ·  ')}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.primary },
  body: { padding: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  intro: { gap: spacing.sm, marginBottom: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.brand.redText },
  heading: { ...typography.h1, color: colors.text.primary },
  description: { ...typography.body, color: colors.text.muted, lineHeight: 20 },
  card: { backgroundColor: colors.surface.secondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border.default, padding: spacing.lg, gap: spacing.sm },
  todayCard: { borderColor: colors.brand.redText },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  day: { ...typography.eyebrow, color: colors.text.muted },
  today: { ...typography.eyebrow, color: colors.brand.redText, fontSize: 9 },
  session: { ...typography.h2, color: colors.text.primary, fontSize: 20 },
  meta: { ...typography.small, color: colors.text.muted },
  muted: { ...typography.body, color: colors.text.muted, lineHeight: 20 },
  exerciseRow: { flexDirection: 'row', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border.default, paddingTop: spacing.md },
  exerciseNumber: { ...typography.label, color: colors.brand.redText },
  exerciseContent: { flex: 1, gap: spacing.xs },
  exerciseName: { ...typography.body, color: colors.text.primary, fontWeight: '700' },
  exerciseTarget: { ...typography.small, color: colors.text.muted },
});
