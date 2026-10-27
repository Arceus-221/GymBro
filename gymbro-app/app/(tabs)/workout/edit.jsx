import { useRouter } from 'expo-router';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../../components/shared/Button';
import { LoadingSpinner } from '../../../components/shared/LoadingSpinner';
import { ReadError } from '../../../components/shared/ReadError';
import { ScreenHeader } from '../../../components/shared/ScreenHeader';
import { useThemedStyles } from '../../../components/shared/ThemeProvider';
import { radius, spacing, typography } from '../../../constants/theme';
import { useCallBackend } from '../../../hooks/useCallBackend';
import { useFirestoreDoc } from '../../../hooks/useFirestoreDoc';
import { DAY_LABELS } from '../../../hooks/useToday';
import { exerciseTarget } from '../../../services/exerciseTarget';
import { db } from '../../../services/firebase';
import { useActiveWorkoutStore } from '../../../store/useActiveWorkoutStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useUIStore } from '../../../store/useUIStore';
import { useUserProfileStore } from '../../../store/useUserProfileStore';

const WEEKDAYS = [...DAY_LABELS.slice(1), DAY_LABELS[0]];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function normalize(schedule) {
  return schedule.map((day) => ({
    ...day,
    sessionName: day.sessionName?.trim() || 'Workout',
    exercises: day.isRestDay ? [] : day.exercises.map(({ targetEdited, ...exercise }) => ({
      ...exercise,
      name: exercise.name?.trim(),
      sets: Number(exercise.sets),
      targetValue: Number(exercise.targetValue),
      repsRange: targetEdited || !exercise.repsRange ? `${Number(exercise.targetValue)} ${exercise.targetUnit}` : exercise.repsRange,
    })),
  }));
}

function validationError(schedule) {
  if (!schedule.some((day) => !day.isRestDay)) return 'Choose at least one training day.';
  for (const day of schedule) {
    if (day.isRestDay) continue;
    if (!day.sessionName?.trim()) return `Add a session name for ${day.dayLabel}.`;
    if (!day.exercises.length) return `Add at least one exercise for ${day.dayLabel}.`;
    if (day.exercises.length > 20) return `Use no more than 20 exercises for ${day.dayLabel}.`;
    for (const exercise of day.exercises) {
      if (!exercise.name?.trim() || exercise.name.trim().length > 100) return 'Exercise names must be between 1 and 100 characters.';
      if (!Number.isInteger(Number(exercise.sets)) || Number(exercise.sets) < 1 || Number(exercise.sets) > 20) return 'Sets must be a whole number between 1 and 20.';
      if (!Number.isFinite(Number(exercise.targetValue)) || Number(exercise.targetValue) <= 0) return 'Enter a target greater than zero for each exercise.';
    }
  }
  return null;
}

function prepare(schedule) {
  return WEEKDAYS.map((label) => {
    const day = schedule.find((item) => item?.dayLabel === label);
    return {
      ...day,
      dayLabel: label,
      isRestDay: day?.isRestDay ?? true,
      sessionName: day?.sessionName || '',
      targetMuscleGroups: day?.targetMuscleGroups ?? [],
      estimatedDurationMinutes: day?.estimatedDurationMinutes ?? 0,
      exercises: (Array.isArray(day?.exercises) ? day.exercises : []).map((exercise) => {
        const target = exerciseTarget(exercise);
        return { ...exercise, sets: String(exercise.sets ?? ''), targetUnit: target.unit, targetValue: String(target.value || '') };
      }),
    };
  });
}

export default function EditWorkoutPlan() {
  const { styles, colors } = useThemedStyles(makeStyles);
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const planId = useUserProfileStore((state) => state.userDoc?.currentPlanId);
  const { data: plan, isLoading, error, retry } = useFirestoreDoc(user && planId ? `users/${user.uid}/workoutPlans/${planId}` : null);
  const { execute, isLoading: adjusting } = useCallBackend();
  const showError = useUIStore((state) => state.showError);
  const showToast = useUIStore((state) => state.showToast);
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(0);
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const baseline = useRef(null);
  const identity = useRef(null);

  useEffect(() => {
    const key = user && planId ? `${user.uid}/${planId}` : null;
    if (identity.current !== key) {
      identity.current = key;
      baseline.current = null;
      setDraft(null);
    }
    if (plan && key && !baseline.current && Array.isArray(plan.weeklySchedule)) {
      baseline.current = JSON.stringify(stable(plan.weeklySchedule));
      setDraft(prepare(plan.weeklySchedule));
    }
  }, [plan, planId, user]);

  const updateDay = (patch) => setDraft((previous) => previous.map((day, index) => index === selected ? { ...day, ...patch } : day));
  const updateExercise = (index, patch) => updateDay({ exercises: draft[selected].exercises.map((exercise, i) => i === index ? { ...exercise, ...patch } : exercise) });
  const current = draft?.[selected];

  const adjust = async () => {
    const problem = validationError(draft);
    if (problem) return showError(problem);
    if (!instructions.trim()) return showError('Describe what you want the AI to change.');
    try {
      const response = await execute('/api/ai/adjust-plan', { planId, instructions: instructions.trim(), weeklySchedule: normalize(draft) });
      if (identity.current !== `${user.uid}/${planId}`) return;
      setDraft(prepare(response.data.weeklySchedule));
      showToast('AI changes are ready to review. Save when you are happy.', 'success');
    } catch { /* useCallBackend shows the error */ }
  };

  const savePlan = async () => {
    const problem = validationError(draft);
    if (problem) return showError(problem);
    const active = useActiveWorkoutStore.getState();
    if (active.isActive && active.exercises.some((exercise) => exercise.sets.some((set) => set.completed))) {
      return showError('Finish your active workout before changing the plan.');
    }
    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const planRef = doc(db, 'users', user.uid, 'workoutPlans', planId);
      await runTransaction(db, async (transaction) => {
        const [userSnap, planSnap] = await Promise.all([transaction.get(userRef), transaction.get(planRef)]);
        if (!userSnap.exists() || userSnap.data().currentPlanId !== planId || !planSnap.exists() ||
          JSON.stringify(stable(planSnap.data().weeklySchedule)) !== baseline.current) {
          throw new Error('PLAN_CHANGED');
        }
        const session = useActiveWorkoutStore.getState();
        if (session.isActive && session.exercises.some((exercise) => exercise.sets.some((set) => set.completed))) {
          throw new Error('ACTIVE_WORKOUT');
        }
        transaction.update(planRef, { weeklySchedule: normalize(draft), updatedAt: serverTimestamp() });
      });
      if (useAuthStore.getState().user?.uid !== user.uid) return;
      const latest = useActiveWorkoutStore.getState();
      if (latest.isActive && !latest.exercises.some((exercise) => exercise.sets.some((set) => set.completed))) latest.endSession();
      showToast('Workout plan updated.', 'success');
      router.back();
    } catch (err) {
      showError(err.message === 'PLAN_CHANGED' ? 'Your plan changed elsewhere. Reopen the editor to review it.' : err.message === 'ACTIVE_WORKOUT' ? 'Finish your active workout before changing the plan.' : 'Could not save your plan. Check your connection and try again.');
    } finally { setSaving(false); }
  };

  const save = () => {
    const active = useActiveWorkoutStore.getState();
    if (active.isActive && !active.exercises.some((exercise) => exercise.sets.some((set) => set.completed))) {
      Alert.alert('Refresh current workout?', 'Saving this plan will restart your current workout and clear any unsaved set entries.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save plan', onPress: savePlan },
      ]);
      return;
    }
    savePlan();
  };

  const goBack = () => Alert.alert('Discard changes?', 'Unsaved changes will be lost.', [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: () => router.back() },
  ]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="EDIT WORKOUT PLAN" onBack={draft ? goBack : () => router.back()} />
      {error ? <ReadError message="Could not load your workout plan." onRetry={retry} /> : isLoading || (plan && !draft) ? (
        <LoadingSpinner message="Loading your plan..." />
      ) : !draft ? <Text style={styles.notice}>No workout plan is available. Return home to generate one.</Text> : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>EDIT YOUR WEEK</Text>
          <Text style={styles.notice}>Choose a day to edit. Changes are saved only when you tap Save plan.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days} pointerEvents={adjusting || saving ? 'none' : 'auto'}>
            {draft.map((day, index) => (
              <Pressable key={day.dayLabel} accessibilityRole="button" accessibilityState={{ selected: index === selected }} onPress={() => setSelected(index)} style={[styles.dayButton, index === selected && styles.daySelected]}>
                <Text style={[styles.dayText, index === selected && styles.dayTextSelected]}>{day.dayLabel.slice(0, 3).toUpperCase()}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.card} pointerEvents={adjusting || saving ? 'none' : 'auto'}>
            <Text style={styles.title}>{current.dayLabel}</Text>
            <Button label={current.isRestDay ? 'MAKE TRAINING DAY' : 'MAKE REST DAY'} variant="secondary" onPress={() => updateDay({ isRestDay: !current.isRestDay })} />
            {current.isRestDay ? <Text style={styles.notice}>Exercises on this day will be removed when you save.</Text> : (
              <>
                <Text style={styles.label}>SESSION NAME</Text>
                <TextInput accessibilityLabel="Session name" value={current.sessionName} onChangeText={(text) => updateDay({ sessionName: text })} maxLength={100} style={styles.input} placeholder="Workout name" placeholderTextColor={colors.text.muted} />
                {current.exercises.map((exercise, index) => (
                  <View key={`${exercise.exerciseId}-${index}`} style={styles.exercise}>
                    <View style={styles.row}>
                      <Text style={styles.label}>{`EXERCISE ${index + 1}`}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove exercise ${index + 1}`} onPress={() => updateDay({ exercises: current.exercises.filter((_, i) => i !== index) })}><Text style={styles.remove}>REMOVE</Text></Pressable>
                    </View>
                    <TextInput accessibilityLabel={`Exercise ${index + 1} name`} value={exercise.name ?? ''} onChangeText={(text) => updateExercise(index, { name: text, formCue: '', primaryMuscleGroup: '', substituteExercises: [] })} maxLength={100} style={styles.input} placeholder="Exercise name" placeholderTextColor={colors.text.muted} />
                    <View style={styles.row}>
                      <View style={styles.field}><Text style={styles.label}>SETS</Text><TextInput accessibilityLabel={`Exercise ${index + 1} sets`} value={String(exercise.sets)} onChangeText={(text) => updateExercise(index, { sets: text })} keyboardType="number-pad" style={styles.input} /></View>
                      <View style={styles.field}><Text style={styles.label}>TARGET PER SET</Text><TextInput accessibilityLabel={`Exercise ${index + 1} target`} value={String(exercise.targetValue)} onChangeText={(text) => updateExercise(index, { targetValue: text, targetEdited: true })} keyboardType="decimal-pad" style={styles.input} /></View>
                    </View>
                    <View style={styles.units}>
                      {['reps', 'seconds', 'meters'].map((unit) => <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: exercise.targetUnit === unit }} onPress={() => updateExercise(index, { targetUnit: unit, targetEdited: true })} style={[styles.unit, exercise.targetUnit === unit && styles.unitSelected]}><Text style={[styles.unitText, exercise.targetUnit === unit && styles.unitTextSelected]}>{unit}</Text></Pressable>)}
                    </View>
                    {!exercise.targetEdited && exercise.repsRange ? <Text style={styles.notice}>{`Current target: ${exercise.repsRange}`}</Text> : null}
                  </View>
                ))}
                <Button label="ADD EXERCISE" variant="ghost" onPress={() => updateDay({ exercises: [...current.exercises, { exerciseId: `manual_${Date.now()}_${current.exercises.length}`, name: '', sets: '3', targetUnit: 'reps', targetValue: '10', repsRange: '10 reps', category: 'compound', primaryMuscleGroup: '', restSeconds: 90, formCue: '', substituteExercises: [] }] })} />
              </>
            )}
          </View>
          <View style={styles.card} pointerEvents={adjusting || saving ? 'none' : 'auto'}>
            <Text style={styles.title}>Adjust with AI</Text>
            <Text style={styles.notice}>Describe changes to your draft. Review the result before saving.</Text>
            <TextInput accessibilityLabel="AI adjustment instructions" value={instructions} onChangeText={setInstructions} maxLength={500} multiline style={[styles.input, styles.multiline]} placeholder="For example, replace barbell exercises with dumbbells" placeholderTextColor={colors.text.muted} />
            <Button label="UPDATE WITH AI" variant="secondary" onPress={adjust} loading={adjusting} disabled={saving} />
          </View>
          <Button label="SAVE PLAN" onPress={save} loading={saving} disabled={adjusting} />
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.primary },
  body: { padding: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.lg },
  heading: { ...typography.h1, color: colors.text.primary },
  title: { ...typography.h2, color: colors.text.primary },
  notice: { ...typography.body, color: colors.text.muted, lineHeight: 20 },
  days: { gap: spacing.sm },
  dayButton: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border.default },
  daySelected: { backgroundColor: colors.brand.red, borderColor: colors.brand.red },
  dayText: { ...typography.label, color: colors.text.primary },
  dayTextSelected: { color: colors.text.inverse },
  card: { backgroundColor: colors.surface.secondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  label: { ...typography.eyebrow, color: colors.text.muted },
  input: { ...typography.body, color: colors.text.primary, borderWidth: 1, borderColor: colors.border.default, borderRadius: radius.sm, backgroundColor: colors.surface.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  exercise: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border.default, paddingTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, justifyContent: 'space-between' },
  field: { flex: 1, gap: spacing.sm },
  remove: { ...typography.label, color: colors.brand.redText },
  units: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  unit: { borderWidth: 1, borderColor: colors.border.default, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  unitSelected: { backgroundColor: colors.surface.inverse, borderColor: colors.surface.inverse },
  unitText: { ...typography.small, color: colors.text.primary },
  unitTextSelected: { color: colors.text.inverse },
});
