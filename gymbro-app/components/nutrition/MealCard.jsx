import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '../../constants/theme';
import { Icon } from '../shared/Icon';
import { useThemedStyles } from '../shared/ThemeProvider';

const MEAL_ICONS = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'plate',
  snack: 'meals',
  pre_workout: 'bolt',
  post_workout: 'drink',
};

function MacroStat({ value, label }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.macroStat}>
      <Text style={styles.macroValue}>{value}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

/**
 * One meal, from either source.
 *
 * `source="plan"` renders a generated plan meal (`description` + macros on the
 * meal itself). It can be logged into today's diet in one tap — the macros are
 * already known, so no AI call — and tapped to open its recipe.
 *
 * `source="log"` renders an entry from today's nutritionLog (`userDescription`
 * + `aiEstimate`). Read-only here.
 */
export function MealCard({
  meal,
  source = 'plan',
  loggedToday = false,
  onPress,
  onToggleLog,
}) {
  const { styles, colors } = useThemedStyles(makeStyles);
  const isLog = source === 'log';
  const macros = isLog ? meal.aiEstimate ?? {} : meal;
  const description = isLog ? meal.userDescription : meal.description;
  const fromPlan = isLog && meal.source === 'plan';

  const body = (
    <>
      <View style={styles.header}>
        <View style={styles.typeRow}>
          <Icon name={MEAL_ICONS[meal.mealType] ?? 'plate'} size={14} color={colors.text.muted} />
          <Text style={styles.type}>{labelize(meal.mealType)}</Text>
          {fromPlan ? <Text style={styles.planTag}>FROM PLAN</Text> : null}
        </View>

        {isLog ? (
          <Text style={styles.badge}>LOGGED</Text>
        ) : onToggleLog ? (
          <Pressable
            onPress={onToggleLog}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={loggedToday ? 'Remove from today’s log' : 'Log this meal'}
            style={[styles.logButton, loggedToday && styles.logButtonDone]}
          >
            {loggedToday ? (
              <Icon name="check" size={12} color={colors.text.inverse} />
            ) : null}
            <Text style={[styles.logText, loggedToday && styles.logTextDone]}>
              {loggedToday ? 'LOGGED' : 'LOG'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.description}>{description}</Text>

      <View style={styles.macros}>
        <MacroStat value={Math.round(macros.calories ?? 0)} label="KCAL" />
        <MacroStat value={`${Math.round(macros.proteinG ?? 0)}g`} label="PRO" />
        <MacroStat value={`${Math.round(macros.carbsG ?? 0)}g`} label="CARB" />
        <MacroStat value={`${Math.round(macros.fatsG ?? 0)}g`} label="FAT" />
      </View>

      {onPress ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {meal.detail ? 'Recipe & prices' : 'Tap for recipe & prices'}
          </Text>
          <Icon name="chevron" size={14} color={colors.text.faint} />
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.card, loggedToday && styles.cardLogged]}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${labelize(meal.mealType)}: ${description}. Open recipe`}
      style={({ pressed }) => [
        styles.card,
        loggedToday && styles.cardLogged,
        pressed && styles.cardPressed,
      ]}
    >
      {body}
    </Pressable>
  );
}

function labelize(value) {
  if (!value) return 'Meal';
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const makeStyles = (colors) => StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.primary,
    gap: spacing.sm,
  },
  // A logged plan meal keeps its place in the plan but reads as done.
  cardLogged: { borderColor: colors.success },
  cardPressed: { backgroundColor: colors.surface.secondary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  type: { ...typography.eyebrow, fontSize: 9, color: colors.text.muted },
  planTag: {
    ...typography.eyebrow,
    fontSize: 7,
    color: colors.text.faint,
    marginLeft: 2,
  },
  badge: { ...typography.eyebrow, fontSize: 8, color: colors.brand.redText },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.brand.red,
  },
  logButtonDone: { backgroundColor: colors.success, borderColor: colors.success },
  logText: { ...typography.eyebrow, fontSize: 9, color: colors.brand.redText },
  logTextDone: { color: colors.text.inverse },
  description: { ...typography.body, fontWeight: '700', color: colors.text.primary, lineHeight: 20 },
  macros: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  macroStat: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface.secondary,
    alignItems: 'center',
    gap: 1,
  },
  macroValue: { ...typography.label, fontSize: 13, color: colors.text.primary },
  macroLabel: { ...typography.eyebrow, fontSize: 7, color: colors.text.muted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  footerText: { ...typography.small, fontSize: 11, color: colors.text.faint },
});
