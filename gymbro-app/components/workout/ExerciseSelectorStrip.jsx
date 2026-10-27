import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { radius, spacing, typography } from '../../constants/theme';
import { Icon } from '../shared/Icon';
import { useThemedStyles } from '../shared/ThemeProvider';

/** Horizontal pill scroller — ✓ for finished exercises, tap to jump. */
export function ExerciseSelectorStrip({ exercises, activeIndex, onSelect }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.strip}
    >
      {exercises.map((exercise, index) => {
        const done = exercise.sets.every((s) => s.completed);
        const active = index === activeIndex;
        return (
          <Pressable
            key={exercise.exerciseId}
            onPress={() => onSelect(index)}
            style={[styles.pill, done && styles.pillDone, active && styles.pillActive]}
          >
            <Text
              style={[styles.text, (done || active) && styles.textOn]}
              numberOfLines={1}
            >
              {`${index + 1}. ${exercise.name}`}
            </Text>
            {done ? <Icon name="check" size={13} color={colors.text.inverse} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  strip: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.onInverse.outline,
    // Must be OPAQUE, not a translucent white lift like the rest of this
    // screen: the red glow is absolutely positioned behind the strip, and
    // anything see-through lets it bleed through the label (F3). ink.black
    // over the screen's ink.deep also reads as a slight raise.
    backgroundColor: colors.surface.inverse,
  },
  pillDone: { backgroundColor: colors.brand.red, borderColor: colors.brand.red },
  pillActive: { borderColor: colors.text.inverse, borderWidth: 2 },
  text: { ...typography.eyebrow, fontSize: 9, color: colors.text.inverseMuted },
  textOn: { color: colors.text.inverse },
});
