import { useEffect, useState } from 'react';
import { createRequestVersion } from '../../services/requestVersion';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { radius, spacing, typography } from '../../constants/theme';
import { useCallBackend } from '../../hooks/useCallBackend';
import { Button } from '../shared/Button';
import { Icon } from '../shared/Icon';
import { LoadingSpinner, backendLoadingMessage } from '../shared/LoadingSpinner';
import { useThemedStyles } from '../shared/ThemeProvider';
import { Eyebrow, Heading } from '../shared/Typography';

/**
 * Replace one plan meal: optional reason -> 3 AI alternatives that hold the
 * slot's macros -> pick one. The pick is handed back to the caller, which owns
 * the plan write; this sheet only proposes.
 *
 * The alternatives request fires as soon as the sheet opens, without waiting
 * for a reason — most swaps are "something else, please", and a reason should
 * refine the results, not gate them.
 */
export function SwapMealSheet({ visible, meal, onClose, onPick }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  const { execute, loadingHint } = useCallBackend();
  const [requestVersion] = useState(createRequestVersion);
  const [isLoading, setIsLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [alternatives, setAlternatives] = useState([]);
  const [failed, setFailed] = useState(false);

  const fetchAlternatives = async (withReason) => {
    if (!meal) return;
    const token = requestVersion.next();
    setFailed(false);
    setAlternatives([]);
    setIsLoading(true);
    try {
      const result = await execute('/api/ai/substitute-meal', {
        meal: pickMealFields(meal),
        ...(withReason?.trim() ? { reason: withReason.trim() } : {}),
      }, { silent: true });
      if (requestVersion.isCurrent(token)) setAlternatives(result.data.alternatives ?? []);
    } catch {
      if (requestVersion.isCurrent(token)) setFailed(true);
    } finally {
      if (requestVersion.isCurrent(token)) setIsLoading(false);
    }
  };

  const close = () => {
    requestVersion.invalidate();
    setIsLoading(false);
    onClose();
  };

  const changeReason = (value) => {
    requestVersion.invalidate();
    setIsLoading(false);
    setAlternatives([]);
    setFailed(false);
    setReason(value);
  };

  const identity = meal ? JSON.stringify([meal.mealId, meal.revision, ...Object.values(pickMealFields(meal))]) : null;
  useEffect(() => {
    if (!visible || !meal) return undefined;
    setReason('');
    setAlternatives([]);
    fetchAlternatives('');
    return () => requestVersion.invalidate();
    // A recipe cache update does not change meal identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, identity, requestVersion]);

  if (!meal) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Eyebrow>Swap meal</Eyebrow>
            <Heading level={2}>SOMETHING ELSE?</Heading>
            <Text style={styles.original} numberOfLines={2}>
              {`Replacing: ${meal.description}`}
            </Text>

            <View style={styles.reasonRow}>
              <TextInput
                value={reason}
                onChangeText={changeReason}
                placeholder="Optional — e.g. no eggs, want something lighter"
                placeholderTextColor={colors.text.faint}
                style={styles.reasonInput}
                returnKeyType="search"
                onSubmitEditing={() => { if (!isLoading) fetchAlternatives(reason); }}
              />
              <Pressable
                onPress={() => fetchAlternatives(reason)}
                disabled={isLoading}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Refresh alternatives"
                style={[styles.refresh, isLoading && styles.refreshBusy]}
              >
                <Icon name="refresh" size={18} color={colors.text.mid} />
              </Pressable>
            </View>

            {isLoading ? (
              <LoadingSpinner
                message={backendLoadingMessage(loadingHint, 'Finding alternatives that fit this slot…')}
              />
            ) : failed ? (
              <View style={styles.loading}>
                <Text style={styles.loadingText}>Couldn’t fetch alternatives.</Text>
                <Button label="TRY AGAIN" variant="secondary" onPress={() => fetchAlternatives(reason)} />
              </View>
            ) : alternatives.length === 0 ? (
              <Button label="FIND ALTERNATIVES" variant="secondary" onPress={() => fetchAlternatives(reason)} />
            ) : (
              alternatives.map((alt, i) => (
                <Pressable
                  key={`${alt.description}-${i}`}
                  onPress={() => { requestVersion.invalidate(); onPick(alt); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose: ${alt.description}`}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                >
                  <View style={styles.optionHeader}>
                    <Text style={styles.optionRank}>{i === 0 ? 'CLOSEST MATCH' : `OPTION ${i + 1}`}</Text>
                    <Text style={styles.optionKcal}>{`${Math.round(alt.calories)} kcal`}</Text>
                  </View>
                  <Text style={styles.optionTitle}>{alt.description}</Text>
                  <Text style={styles.optionWhy}>{alt.whyItFits}</Text>
                  <Text style={styles.optionMacros}>
                    {`${Math.round(alt.proteinG)}g protein · ${Math.round(alt.carbsG)}g carbs · ${Math.round(alt.fatsG)}g fat`}
                  </Text>
                </Pressable>
              ))
            )}

            <Pressable onPress={close} hitSlop={8}>
              <Text style={styles.cancel}>Keep the original</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface.primary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
  },
  sheetContent: { padding: spacing.xl, gap: spacing.md },
  original: { ...typography.small, color: colors.text.muted, lineHeight: 18 },
  reasonRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  reasonInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    backgroundColor: colors.surface.secondary,
    ...typography.body,
  },
  refresh: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBusy: { opacity: 0.4 },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  loadingText: { ...typography.small, color: colors.text.muted, textAlign: 'center' },
  option: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.primary,
    gap: 4,
  },
  optionPressed: { backgroundColor: colors.surface.secondary, borderColor: colors.brand.red },
  optionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionRank: { ...typography.eyebrow, fontSize: 8, color: colors.brand.redText },
  optionKcal: { ...typography.label, fontSize: 11, color: colors.text.primary },
  optionTitle: { ...typography.body, fontWeight: '700', color: colors.text.primary, lineHeight: 20 },
  optionWhy: { ...typography.small, color: colors.text.mid, lineHeight: 17 },
  optionMacros: { ...typography.small, fontSize: 11, color: colors.text.muted, marginTop: 2 },
  cancel: { ...typography.small, color: colors.text.muted, textAlign: 'center', paddingTop: spacing.sm },
});
