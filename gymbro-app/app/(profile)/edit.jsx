import { useRouter } from 'expo-router';
import { updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChipGroup } from '../../components/onboarding/ChipGroup';
import { NumberField } from '../../components/onboarding/NumberField';
import { Field } from '../../components/shared/AuthShell';
import { Button } from '../../components/shared/Button';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { Eyebrow } from '../../components/shared/Typography';
import {
  DIETARY_PREFERENCES,
  DURATION_OPTIONS,
  EQUIPMENT_OPTIONS,
  toggleEquipmentSelection,
  EXPERIENCE_LEVELS,
  FITNESS_GOALS,
  GENDERS,
} from '../../constants/equipment';
import { radius, spacing, typography } from '../../constants/theme';
import { round1, toDisplayWeight, toStoredWeight } from '../../constants/units';
import { auth, db } from '../../services/firebase';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useUIStore';
import { useUserProfileStore } from '../../store/useUserProfileStore';
import { useThemedStyles } from '../../components/shared/ThemeProvider';

const DAY_OPTIONS = [2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n} days` }));
const DURATION_CHIPS = DURATION_OPTIONS.map((n) => ({ value: n, label: `${n} min` }));
const GOAL_CHIPS = FITNESS_GOALS.map(({ value, label }) => ({ value, label }));

/**
 * Edits the same users/{uid}.profile block the onboarding wizard writes, so the
 * field set is kept deliberately identical — the AI prompts read these values
 * verbatim and a field missing here would silently degrade plan quality.
 */
export default function EditProfile() {
  const { styles, colors } = useThemedStyles(makeStyles);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userDoc = useUserProfileStore((s) => s.userDoc);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const showToast = useUIStore((s) => s.showToast);
  const showError = useUIStore((s) => s.showError);

  const [form, setForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Seed once the shared subscription delivers the document. Weights are held
  // in *display* units while editing and converted back to kg on save — keeping
  // them in kg would round-trip every keystroke through a conversion and drift.
  useEffect(() => {
    if (!userDoc || form) return;
    const profile = userDoc.profile ?? {};
    setForm({
      displayName: userDoc.displayName ?? '',
      age: profile.age ?? null,
      gender: profile.gender ?? null,
      heightCm: profile.heightCm ?? null,
      weight: round1(toDisplayWeight(profile.weightKg, weightUnit)),
      targetWeight: round1(toDisplayWeight(profile.targetWeightKg, weightUnit)),
      fitnessGoal: profile.fitnessGoal ?? null,
      experienceLevel: profile.experienceLevel ?? null,
      availableEquipment: (profile.availableEquipment ?? []).length > 1
        ? profile.availableEquipment.filter((item) => item !== 'bodyweight_only')
        : (profile.availableEquipment ?? []),
      dietaryPreference: profile.dietaryPreference ?? 'none',
      workoutDaysPerWeek: profile.workoutDaysPerWeek ?? 4,
      preferredDurationMinutes: profile.preferredDurationMinutes ?? 45,
      medicalNotes: profile.medicalNotes ?? '',
    });
  }, [userDoc, form, weightUnit]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleEquipment = (value) =>
    setForm((prev) => ({
      ...prev,
      availableEquipment: toggleEquipmentSelection(prev.availableEquipment, value),
    }));

  const isComplete =
    form &&
    form.displayName.trim() &&
    form.fitnessGoal &&
    form.experienceLevel &&
    form.gender &&
    form.age > 0 &&
    form.heightCm > 0 &&
    form.weight > 0 &&
    form.availableEquipment.length > 0;

  const handleSave = async () => {
    if (!user || !isComplete) return;
    setIsSaving(true);

    try {
      const name = form.displayName.trim();

      // `uid` is repeated on the write because the update rule requires
      // request.resource.data.uid == uid on the post-merge document.
      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          displayName: name,
          profile: {
            age: form.age,
            gender: form.gender,
            heightCm: form.heightCm,
            weightKg: toStoredWeight(form.weight, weightUnit),
            targetWeightKg: toStoredWeight(form.targetWeight, weightUnit),
            fitnessGoal: form.fitnessGoal,
            experienceLevel: form.experienceLevel,
            availableEquipment: form.availableEquipment,
            dietaryPreference: form.dietaryPreference,
            workoutDaysPerWeek: form.workoutDaysPerWeek,
            preferredDurationMinutes: form.preferredDurationMinutes,
            medicalNotes: form.medicalNotes?.trim() || null,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Keep the Auth record in step with the document — sign-up sets both, and
      // several screens fall back to user.displayName.
      if (auth.currentUser && auth.currentUser.displayName !== name) {
        await updateProfile(auth.currentUser, { displayName: name });
      }

      showToast('Profile updated ✓', 'success');
      router.back();
    } catch {
      showError('Couldn’t save your profile — please retry.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!form) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="EDIT PROFILE" onBack={() => router.back()} />
        <Text style={styles.loading}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="EDIT PROFILE" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Field
          label="Name"
          value={form.displayName}
          onChangeText={(t) => setField('displayName', t)}
          placeholder="Your name"
          autoCapitalize="words"
        />

        <ChipGroup
          label="Goal"
          options={GOAL_CHIPS}
          value={form.fitnessGoal}
          onChange={(v) => setField('fitnessGoal', v)}
        />

        <ChipGroup
          label="Experience level"
          options={EXPERIENCE_LEVELS}
          value={form.experienceLevel}
          onChange={(v) => setField('experienceLevel', v)}
        />

        <View style={styles.row}>
          <NumberField
            label="Age"
            value={form.age}
            onChange={(v) => setField('age', v)}
            placeholder="21"
          />
          <NumberField
            label="Height"
            suffix="cm"
            value={form.heightCm}
            onChange={(v) => setField('heightCm', v)}
            placeholder="175"
          />
        </View>

        <View style={styles.row}>
          <NumberField
            label="Weight"
            suffix={weightUnit}
            value={form.weight}
            onChange={(v) => setField('weight', v)}
            placeholder={weightUnit === 'kg' ? '72' : '159'}
          />
          <NumberField
            label="Target"
            suffix={`${weightUnit}, optional`}
            value={form.targetWeight}
            onChange={(v) => setField('targetWeight', v)}
            placeholder={weightUnit === 'kg' ? '68' : '150'}
          />
        </View>

        <ChipGroup
          label="Gender"
          options={GENDERS}
          value={form.gender}
          onChange={(v) => setField('gender', v)}
        />

        <ChipGroup
          label="Available equipment"
          options={EQUIPMENT_OPTIONS}
          value={form.availableEquipment}
          onChange={toggleEquipment}
          multi
        />

        <ChipGroup
          label="Dietary preference"
          options={DIETARY_PREFERENCES}
          value={form.dietaryPreference}
          onChange={(v) => setField('dietaryPreference', v)}
        />

        <ChipGroup
          label="Workout days per week"
          options={DAY_OPTIONS}
          value={form.workoutDaysPerWeek}
          onChange={(v) => setField('workoutDaysPerWeek', v)}
        />

        <ChipGroup
          label="Preferred session length"
          options={DURATION_CHIPS}
          value={form.preferredDurationMinutes}
          onChange={(v) => setField('preferredDurationMinutes', v)}
        />

        <View style={styles.notes}>
          <Eyebrow>Injuries or medical notes (optional)</Eyebrow>
          <TextInput
            value={form.medicalNotes}
            onChangeText={(t) => setField('medicalNotes', t)}
            placeholder="e.g. bad knees, avoid deep squats"
            placeholderTextColor={colors.text.faint}
            multiline
            style={styles.notesInput}
          />
        </View>

        <Text style={styles.hint}>
          Changing your goal, equipment or schedule affects future AI plans — your current
          plan stays as it is until you generate a new one.
        </Text>

        <Button
          label="SAVE CHANGES"
          onPress={handleSave}
          loading={isSaving}
          disabled={!isComplete}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface.primary },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  loading: { ...typography.body, color: colors.text.muted, padding: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.lg },
  notes: { gap: spacing.xs },
  notesInput: {
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 84,
    textAlignVertical: 'top',
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.primary,
    backgroundColor: colors.surface.secondary,
  },
  hint: { ...typography.small, color: colors.text.muted, lineHeight: 18 },
});
