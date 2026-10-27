import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '../../constants/theme';
import { Icon } from '../shared/Icon';
import { useThemedStyles } from '../shared/ThemeProvider';

/**
 * The dashboard's hero card: red→black gradient feel with the day's session,
 * muscle-group tags, and an inline start CTA (Phase 3 §2.2).
 * Gradient is faked with layered translucent blocks so we don't need to add
 * expo-linear-gradient for one surface.
 */
export function TodayWorkoutCard({ day, onStart, completed }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  if (!day) return null;

  if (day.isRestDay) {
    return (
      <View style={[styles.card, styles.restCard]}>
        <Text style={styles.eyebrow}>Today’s Workout</Text>
        <Text style={styles.title}>REST & RECOVERY</Text>
        <Text style={styles.restCopy}>
          No session programmed today. Move a little, eat well, sleep more.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>Today’s Workout</Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{`DURATION ${day.estimatedDurationMinutes}M`}</Text>
          <Text style={styles.metaText}>{`${day.exercises?.length ?? 0} EXERCISES`}</Text>
        </View>
      </View>

      <Text style={styles.title}>{day.sessionName?.toUpperCase()}</Text>

      <View style={styles.tags}>
        {(day.targetMuscleGroups ?? []).map((group) => (
          <View key={group} style={styles.tag}>
            <Text style={styles.tagText}>{group}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onStart}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Icon name={completed ? 'check' : 'play'} size={15} color={colors.text.inverse} />
        <Text style={styles.ctaText}>
          {completed ? 'COMPLETED — TRAIN AGAIN' : 'START WORKOUT'}
        </Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface.inverse,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    overflow: 'hidden',
  },
  restCard: { backgroundColor: colors.surface.inverseDeep },
  glowOne: {
    position: 'absolute',
    top: -70,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.brand.red,
    opacity: 0.5,
  },
  glowTwo: {
    position: 'absolute',
    top: -20,
    right: 10,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.brand.red,
    opacity: 0.35,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { ...typography.eyebrow, color: colors.onInverse.subtle },
  meta: { alignItems: 'flex-end', gap: 2 },
  metaText: { ...typography.eyebrow, fontSize: 9, color: colors.onInverse.subtle },
  title: { ...typography.h1, color: colors.text.inverse },
  restCopy: { ...typography.small, color: colors.text.inverseMuted, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.onInverse.raisedStrong,
  },
  tagText: { ...typography.eyebrow, fontSize: 9, color: colors.text.inverse, letterSpacing: 1 },
  cta: {
    marginTop: spacing.sm,
    backgroundColor: colors.brand.red,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: { ...typography.label, fontSize: 13, color: colors.text.inverse, letterSpacing: 1.5 },
});
