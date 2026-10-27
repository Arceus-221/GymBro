import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';
import { ReadError } from '../../components/shared/ReadError';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { Eyebrow, Heading } from '../../components/shared/Typography';
import { radius, spacing, typography } from '../../constants/theme';
import { formatWeight } from '../../constants/units';
import { useFirestoreDoc } from '../../hooks/useFirestoreDoc';
import { useToday } from '../../hooks/useToday';
import { currentWorkoutStreak } from '../../services/workoutStreak';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';
import { useThemedStyles } from '../../components/shared/ThemeProvider';

/**
 * Read-only view of users/{uid}. Everything here comes from the shared
 * subscription in app/_layout.jsx, so this screen opens no listener of its own
 * and reflects edits from /(profile)/edit the moment they're written.
 */
export default function Profile() {
  const { styles } = useThemedStyles(makeStyles);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userDoc = useUserProfileStore((s) => s.userDoc);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const { dateId: today } = useToday();
  const { data: plan, isLoading: planLoading, error: planError, retry: retryPlan } = useFirestoreDoc(user && userDoc?.currentPlanId ? `users/${user.uid}/workoutPlans/${userDoc.currentPlanId}` : null);

  const profile = userDoc?.profile ?? {};
  const stats = userDoc?.stats ?? {};
  const displayName = userDoc?.displayName || user?.displayName || 'Athlete';
  const email = userDoc?.email || user?.email || '—';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title="PROFILE"
        onBack={() => router.back()}
        action={{
          icon: 'settings',
          label: 'Open settings',
          onPress: () => router.push('/(profile)/settings'),
        }}
      />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.identityText}>
            <Heading level={2}>{displayName.toUpperCase()}</Heading>
            <Text style={styles.email} numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <StatTile value={stats.totalWorkoutsCompleted ?? 0} label="Workouts" />
          <StatTile value={planError || planLoading ? '?' : currentWorkoutStreak(stats, plan?.weeklySchedule, today)} label="Streak" />
          <StatTile value={stats.longestStreakDays ?? 0} label="Best" />
        </View>

        {planError ? <ReadError message="Could not load your workout schedule." onRetry={retryPlan} /> : null}

        <Card style={styles.setup}>
          <Eyebrow>Your setup</Eyebrow>
          <DetailRow label="Goal" value={labelize(profile.fitnessGoal)} />
          <DetailRow label="Experience" value={labelize(profile.experienceLevel)} />
          <DetailRow label="Age" value={profile.age ? `${profile.age}` : '—'} />
          <DetailRow label="Gender" value={labelize(profile.gender)} />
          <DetailRow
            label="Height"
            value={profile.heightCm ? `${profile.heightCm} cm` : '—'}
          />
          <DetailRow label="Weight" value={formatWeight(profile.weightKg, weightUnit)} />
          <DetailRow
            label="Target weight"
            value={formatWeight(profile.targetWeightKg, weightUnit)}
          />
          <DetailRow
            label="Equipment"
            value={(profile.availableEquipment ?? []).map(labelize).join(', ') || '—'}
          />
          <DetailRow label="Diet" value={labelize(profile.dietaryPreference)} />
          <DetailRow
            label="Schedule"
            value={
              profile.workoutDaysPerWeek
                ? `${profile.workoutDaysPerWeek}× / week · ${profile.preferredDurationMinutes ?? '—'} min`
                : '—'
            }
          />
          {profile.medicalNotes ? (
            <DetailRow label="Notes" value={profile.medicalNotes} />
          ) : null}
        </Card>

        <View style={styles.actions}>
          <Button label="EDIT PROFILE" onPress={() => router.push('/(profile)/edit')} />
          <Button
            label="VIEW PROGRESS"
            variant="secondary"
            onPress={() => router.push('/(profile)/progress')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function StatTile({ value, label }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

/** 'muscle_gain' -> 'Muscle gain' */
function labelize(value) {
  if (!value) return '—';
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const makeStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface.primary },
  body: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.brand.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.hero, fontSize: 28, color: colors.text.inverse },
  identityText: { flex: 1, gap: 2 },
  email: { ...typography.small, color: colors.text.muted },
  statRow: { flexDirection: 'row', gap: spacing.md },
  tile: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface.secondary,
    gap: 2,
  },
  tileValue: { ...typography.stat, fontSize: 20, color: colors.text.primary },
  tileLabel: { ...typography.eyebrow, fontSize: 8, color: colors.text.muted },
  setup: { gap: spacing.sm, backgroundColor: colors.surface.secondary },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  detailLabel: { ...typography.small, color: colors.text.muted },
  detailValue: {
    ...typography.small,
    fontWeight: '700',
    color: colors.text.primary,
    flexShrink: 1,
    textAlign: 'right',
  },
  actions: { gap: spacing.md },
});
