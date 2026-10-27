import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SwapMealSheet } from '../../../components/nutrition/SwapMealSheet';
import { Button } from '../../../components/shared/Button';
import { Card } from '../../../components/shared/Card';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Icon } from '../../../components/shared/Icon';
import { LoadingSpinner, backendLoadingMessage } from '../../../components/shared/LoadingSpinner';
import { ScreenHeader } from '../../../components/shared/ScreenHeader';
import { ReadError } from '../../../components/shared/ReadError';
import { useThemedStyles } from '../../../components/shared/ThemeProvider';
import { Eyebrow, Heading } from '../../../components/shared/Typography';
import { deviceCurrency, formatMoney } from '../../../constants/currency';
import { radius, spacing, typography } from '../../../constants/theme';
import { useCallBackend } from '../../../hooks/useCallBackend';
import { useFirestoreDoc } from '../../../hooks/useFirestoreDoc';
import { useToday } from '../../../hooks/useToday';
import { cacheMealDetail, macrosOf, mealKey, replaceMeal } from '../../../services/mealPlanActions';
import {
  appendLoggedMeal,
  loggedPlanKeys,
  removePlannedMealLog,
} from '../../../services/nutritionLogActions';
import { useAuthStore } from '../../../store/useAuthStore';
import { useUIStore } from '../../../store/useUIStore';
import { useUserProfileStore } from '../../../store/useUserProfileStore';

/**
 * One meal from the active plan: macros, recipe with estimated prices, log it
 * into today, or swap it for an alternative.
 *
 * Addressed by (day, index) rather than by an id because plan meals have none
 * and the same dish can appear twice in a week. The plan document is read
 * live, so a swap or a cached recipe shows up here without a refetch.
 */
export default function MealDetail() {
  const { styles, colors } = useThemedStyles(makeStyles);
  const router = useRouter();
  const { day, index: indexParam } = useLocalSearchParams();
  const index = Number(indexParam);

  const user = useAuthStore((s) => s.user);
  const userDoc = useUserProfileStore((s) => s.userDoc);
  const showToast = useUIStore((s) => s.showToast);
  const showError = useUIStore((s) => s.showError);
  const { execute, isLoading: isFetchingRecipe, loadingHint } = useCallBackend();

  const planId = userDoc?.currentMealPlanId ?? null;
  const { data: plan, isLoading: planLoading, error: planError, retry: retryPlan } = useFirestoreDoc(
    user && planId ? `users/${user.uid}/mealPlans/${planId}` : null
  );
  const { dateId: today, dayLabel } = useToday();
  const { data: todayLog, isLoading: logLoading, error: logError, retry: retryLog } = useFirestoreDoc(user ? `users/${user.uid}/dailyLogs/${today}` : null);

  const meal = useMemo(() => {
    if (!planId || plan?.id !== planId) return null;
    const dayEntry = plan?.weeklyMealSchedule?.find((d) => d.dayLabel === day);
    return dayEntry?.meals?.[index] ?? null;
  }, [plan, planId, day, index]);

  const isToday = day === dayLabel;
  const key = meal ? mealKey(planId, day, index, meal) : null;
  const loggedToday = isToday && key ? loggedPlanKeys(todayLog).has(key) : false;

  const [swapOpen, setSwapOpen] = useState(false);
  const [recipeFailed, setRecipeFailed] = useState(false);
  // Bumped by "try again" so the fetch effect re-enters for the same dish.
  const [attempt, setAttempt] = useState(0);

  // Fetch the recipe once per dish. Keyed on the description so a swap — which
  // drops the cached detail — refetches for the new dish, while a re-render of
  // the same meal does not. The ref guards against the effect re-running on
  // the plan snapshot that arrives when the cache write lands.
  const requestedFor = useRef(null);
  const currency = useMemo(() => deviceCurrency(), []);

  useEffect(() => {
    if (!user || !planId || !plan || !meal || meal.detail) return;
    const requestKey = mealKey(planId, day, index, meal);
    if (requestedFor.current === requestKey) return;
    requestedFor.current = requestKey;

    (async () => {
      setRecipeFailed(false);
      try {
        const result = await execute('/api/ai/meal-detail', {
          meal: pickMealFields(meal),
          currency,
        });
        await cacheMealDetail({
          uid: user.uid,
          planId,
          expectedMeal: meal,
          dayLabel: day,
          index,
          detail: result.data,
        });
      } catch {
        // useCallBackend surfaced the toast; allow a manual retry.
        if (requestedFor.current === requestKey) {
          requestedFor.current = null;
          setRecipeFailed(true);
        }
      }
    })();
  }, [user, planId, plan, meal, day, index, currency, execute, attempt]);

  const retryRecipe = () => {
    requestedFor.current = null;
    setRecipeFailed(false);
    setAttempt((n) => n + 1);
  };

  const handleToggleLog = async () => {
    if (!user || !meal || !key) return;
    try {
      if (loggedToday) {
        await removePlannedMealLog({ uid: user.uid, dateId: today, existingLog: todayLog, plannedMealKey: key });
        showToast('Removed from today’s log', 'success');
      } else {
        await appendLoggedMeal({
          uid: user.uid,
          dateId: today,
          existingLog: todayLog,
          entry: {
            mealType: meal.mealType,
            userDescription: meal.description,
            aiEstimate: macrosOf(meal),
            source: 'plan',
            plannedMealKey: key,
          },
        });
        showToast('Added to today’s log ✓', 'success');
      }
    } catch {
      showError('Couldn’t update your log — please retry.');
    }
  };

  const handlePickAlternative = async (alternative) => {
    if (!user || !planId || !plan) return;
    setSwapOpen(false);
    try {
      await replaceMeal({
        uid: user.uid,
        planId,
        expectedMeal: meal,
        dayLabel: day,
        index,
        replacement: alternative,
      });
      // A replacement receives a new revision. Existing log entries remain
      // untouched and the new dish can be logged separately.
      showToast('Meal swapped ✓', 'success');
    } catch {
      showError('Couldn’t swap that meal — please retry.');
    }
  };

  if (planError || logError) return <ReadError message="Could not load this meal." onRetry={() => Promise.all([retryPlan(), retryLog()])} />;
  if (planLoading || logLoading) return <LoadingSpinner message="Loading meal..." />;
  if (!meal) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="MEAL" onBack={() => router.back()} />
        <EmptyState title="Meal not found" message="This slot is no longer in your plan." />
      </View>
    );
  }

  const detail = meal.detail ?? null;

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title={labelize(meal.mealType).toUpperCase()}
        onBack={() => router.back()}
        action={{ icon: 'refresh', label: 'Swap meal', onPress: () => setSwapOpen(true) }}
      />

      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <Eyebrow>{isToday ? 'Today' : day}</Eyebrow>
          <Heading level={2} style={styles.title}>
            {meal.description}
          </Heading>
        </View>

        <View style={styles.macroRow}>
          <Macro value={Math.round(meal.calories)} label="KCAL" accent />
          <Macro value={`${Math.round(meal.proteinG)}g`} label="PROTEIN" />
          <Macro value={`${Math.round(meal.carbsG)}g`} label="CARBS" />
          <Macro value={`${Math.round(meal.fatsG)}g`} label="FAT" />
        </View>

        {isToday ? (
          <Button
            label={loggedToday ? 'LOGGED FOR TODAY  ✓' : 'LOG THIS MEAL'}
            variant={loggedToday ? 'secondary' : 'primary'}
            onPress={handleToggleLog}
          />
        ) : (
          <Text style={styles.hint}>Meals can be logged from today’s plan.</Text>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Eyebrow>Recipe</Eyebrow>
            {detail ? (
              <Text style={styles.timing}>
                {`${detail.prepMinutes} min prep${detail.cookMinutes ? ` · ${detail.cookMinutes} min cook` : ''}`}
              </Text>
            ) : null}
          </View>

          {detail ? (
            <>
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>INGREDIENTS</Text>
                  <Text style={styles.estimateTag}>{`EST. PRICES · ${detail.currency}`}</Text>
                </View>
                {detail.ingredients.map((ing, i) => (
                  <View key={`${ing.item}-${i}`} style={styles.ingredient}>
                    <View style={styles.ingredientText}>
                      <Text style={styles.ingredientItem}>{ing.item}</Text>
                      <Text style={styles.ingredientQty}>{ing.quantity}</Text>
                    </View>
                    <Text style={styles.ingredientCost}>
                      {formatMoney(ing.estimatedCost, detail.currency)}
                    </Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>ESTIMATED TOTAL</Text>
                  <Text style={styles.totalValue}>
                    {formatMoney(detail.estimatedCost, detail.currency)}
                  </Text>
                </View>
                <Text style={styles.disclaimer}>
                  Prices are AI estimates for a typical local store and will vary.
                </Text>
              </Card>

              <Card style={styles.card}>
                <Text style={styles.cardTitle}>METHOD</Text>
                {detail.steps.map((step, i) => (
                  <View key={i} style={styles.step}>
                    <Text style={styles.stepNumber}>{i + 1}</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </Card>

              {detail.tip ? (
                <Card dark style={styles.tip}>
                  <View style={styles.tipHeader}>
                    <Icon name="coachActive" size={13} color={colors.brand.redText} />
                    <Text style={styles.tipEyebrow}>COACH TIP</Text>
                  </View>
                  <Text style={styles.tipText}>{detail.tip}</Text>
                </Card>
              ) : null}
            </>
          ) : recipeFailed ? (
            <Card style={styles.card}>
              <Text style={styles.failedText}>Couldn’t build the recipe.</Text>
              <Button label="TRY AGAIN" variant="secondary" onPress={retryRecipe} />
            </Card>
          ) : (
            <LoadingSpinner
              message={backendLoadingMessage(
                loadingHint,
                isFetchingRecipe ? 'Writing up the recipe and pricing it…' : 'Loading…'
              )}
            />
          )}
        </View>

        <Pressable
          onPress={() => setSwapOpen(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.swapRow, pressed && styles.swapRowPressed]}
        >
          <Icon name="refresh" size={16} color={colors.brand.redText} />
          <Text style={styles.swapText}>Don’t fancy this? Swap it for something else</Text>
          <Icon name="chevron" size={14} color={colors.text.faint} />
        </Pressable>
      </ScrollView>

      <SwapMealSheet
        visible={swapOpen}
        meal={meal}
        onClose={() => setSwapOpen(false)}
        onPick={handlePickAlternative}
      />
    </View>
  );
}

function Macro({ value, label, accent = false }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.macro}>
      <Text style={[styles.macroValue, accent && styles.macroAccent]}>{value}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

/** Only the fields the request schema accepts — a cached `detail` must not go up. */
function pickMealFields(meal) {
  return {
    mealType: meal.mealType,
    description: meal.description,
    calories: meal.calories,
    proteinG: meal.proteinG,
    carbsG: meal.carbsG,
    fatsG: meal.fatsG,
  };
}

function labelize(value) {
  if (!value) return 'Meal';
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const makeStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface.primary },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  title: { marginTop: spacing.xs, lineHeight: 28 },
  macroRow: { flexDirection: 'row', gap: spacing.sm },
  macro: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface.secondary,
    alignItems: 'center',
    gap: 2,
  },
  macroValue: { ...typography.stat, fontSize: 18, color: colors.text.primary },
  macroAccent: { color: colors.brand.redText },
  macroLabel: { ...typography.eyebrow, fontSize: 7, color: colors.text.muted },
  hint: { ...typography.small, color: colors.text.muted, textAlign: 'center' },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timing: { ...typography.small, fontSize: 11, color: colors.text.muted },
  card: { gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { ...typography.eyebrow, fontSize: 9, color: colors.text.muted },
  estimateTag: { ...typography.eyebrow, fontSize: 7, color: colors.text.faint },
  ingredient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  ingredientText: { flex: 1, gap: 1 },
  ingredientItem: { ...typography.body, fontWeight: '600', color: colors.text.primary },
  ingredientQty: { ...typography.small, fontSize: 11, color: colors.text.muted },
  ingredientCost: { ...typography.label, fontSize: 12, color: colors.text.mid },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  totalLabel: { ...typography.eyebrow, fontSize: 9, color: colors.text.primary },
  totalValue: { ...typography.h2, fontSize: 18, color: colors.brand.redText },
  disclaimer: { ...typography.small, fontSize: 10, color: colors.text.faint, lineHeight: 14 },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNumber: {
    ...typography.label,
    fontSize: 11,
    color: colors.brand.redText,
    width: 18,
    paddingTop: 2,
  },
  stepText: { ...typography.body, color: colors.text.primary, lineHeight: 21, flex: 1 },
  failedText: { ...typography.small, color: colors.text.muted, textAlign: 'center' },
  tip: { gap: spacing.sm },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tipEyebrow: { ...typography.eyebrow, fontSize: 9, color: colors.brand.redText },
  tipText: { ...typography.body, color: colors.text.inverse, lineHeight: 20 },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.primary,
  },
  swapRowPressed: { backgroundColor: colors.surface.secondary },
  swapText: { ...typography.body, fontWeight: '600', color: colors.text.primary, flex: 1 },
});
