import { useEffect, useRef, useState } from 'react';
import { collection, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { createRequestVersion } from '../../services/requestVersion';
import { useUIStore } from '../../store/useUIStore';
import {
  ActivityIndicator,
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
import { MEAL_TYPES } from '../../constants/equipment';
import { radius, spacing, typography } from '../../constants/theme';
import { useCallBackend } from '../../hooks/useCallBackend';
import { useVoiceCapture } from '../../hooks/useVoiceCapture';
import { Button } from '../shared/Button';
import { ChipGroup } from '../onboarding/ChipGroup';
import { Icon } from '../shared/Icon';
import { Eyebrow, Heading } from '../shared/Typography';
import { useThemedStyles } from '../shared/ThemeProvider';

/**
 * The "+ ADD" manual log flow: describe -> estimate -> preview -> save.
 * The estimate is never written automatically; the user confirms it first
 * (Phase 3 §2.5).
 */
export function AddMealSheet({ visible, onClose, onSave }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  const { execute, loadingHint } = useCallBackend();
  const showError = useUIStore((state) => state.showError);
  const [requestVersion] = useState(createRequestVersion);
  const [isEstimating, setIsEstimating] = useState(false);
  const voice = useVoiceCapture({
    enabled: visible,
    onAutoTranscript: (transcript) => {
      requestVersion.invalidate();
      setEstimate(null);
      setIsEstimating(false);
      operationId.current = null;
      setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
    },
  });
  const [mealType, setMealType] = useState('breakfast');
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const operationId = useRef(null);

  useEffect(() => () => requestVersion.invalidate(), [visible, requestVersion]);

  const invalidateEstimate = () => {
    requestVersion.invalidate();
    setEstimate(null);
    setIsEstimating(false);
    operationId.current = null;
  };
  const close = () => {
    if (savingRef.current) return;
    requestVersion.invalidate();
    setIsEstimating(false);
    onClose();
  };
  const reset = () => {
    invalidateEstimate();
    setDescription('');
    setEstimate(null);
    setMealType('breakfast');
    operationId.current = null;
  };

  const handleEstimate = async () => {
    if (!description.trim() || isEstimating || savingRef.current) return;
    const token = requestVersion.next();
    setIsEstimating(true);
    setEstimate(null);
    try {
      const result = await execute('/api/ai/estimate-nutrition', {
        mealDescription: description.trim(), mealType,
      }, { silent: true });
      if (requestVersion.isCurrent(token)) setEstimate(result.data);
    } catch (error) {
      if (requestVersion.isCurrent(token)) showError(error.message || 'Could not estimate this meal.');
    } finally {
      if (requestVersion.isCurrent(token)) setIsEstimating(false);
    }
  };

  const handleSave = async () => {
    if (savingRef.current || !estimate) return;
    savingRef.current = true;
    if (!operationId.current) operationId.current = doc(collection(db, 'mealOperationIds')).id;
    setSaving(true);
    try {
      await onSave({ mealType, userDescription: description.trim(), aiEstimate: estimate, operationId: operationId.current });
      reset();
      onClose();
    } catch {
      // The caller displays the error; keep the draft for retry.
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleMic = async () => {
    if (savingRef.current || voice.isTranscribing) return;
    if (voice.isRecording) {
      invalidateEstimate();
      const token = requestVersion.next();
      const transcript = await voice.stopAndTranscribe();
      if (transcript && requestVersion.isCurrent(token)) {
        setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    } else {
      invalidateEstimate();
      await voice.startRecording();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      {/*
        The sheet is pinned to the bottom, so without this the iOS keyboard
        covers the description field the user is typing into (F2). Same idiom
        as ChatScreen and AuthShell. The inner ScrollView matters once the AI
        estimate renders and the sheet outgrows the space left above the
        keyboard; "handled" keeps buttons tappable on the first press while
        the keyboard is up.
      */}
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
            <Eyebrow>Log a meal</Eyebrow>
            <Heading level={2}>WHAT DID YOU EAT?</Heading>

            <ChipGroup
              options={MEAL_TYPES}
              value={mealType}
              onChange={(v) => {
                if (savingRef.current) return;
                invalidateEstimate();
                setMealType(v);
              }}
            />

            <View style={styles.inputRow}>
              <TextInput
                value={description}
                onChangeText={(t) => {
                  if (savingRef.current) return;
                  invalidateEstimate();
                  setDescription(t);
                }}
                placeholder="1 cup rice, chicken curry, 1 banana"
                placeholderTextColor={colors.text.faint}
                multiline
                editable={!saving}
                style={styles.input}
              />
              <Pressable
                onPress={handleMic}
                disabled={voice.isTranscribing || saving}
                style={[styles.mic, voice.isRecording && styles.micActive]}
                accessibilityRole="button"
                accessibilityLabel={voice.isRecording ? 'Stop recording' : 'Record a voice note'}
              >
                {voice.isTranscribing ? (
                  <ActivityIndicator size="small" color={colors.text.mid} />
                ) : (
                  <Icon
                    name="mic"
                    size={19}
                    color={voice.isRecording ? colors.text.inverse : colors.text.mid}
                  />
                )}
              </Pressable>
            </View>

            {estimate ? (
              <View style={styles.preview}>
                <Eyebrow>AI estimate</Eyebrow>
                <View style={styles.previewRow}>
                  <PreviewStat value={Math.round(estimate.calories)} label="KCAL" />
                  <PreviewStat value={`${Math.round(estimate.proteinG)}g`} label="PRO" />
                  <PreviewStat value={`${Math.round(estimate.carbsG)}g`} label="CARB" />
                  <PreviewStat value={`${Math.round(estimate.fatsG)}g`} label="FAT" />
                </View>
                {(estimate.itemBreakdown ?? []).map((item, i) => (
                  <Text key={i} style={styles.item}>
                    {`• ${item.item} — ${item.calories} kcal`}
                  </Text>
                ))}
              </View>
            ) : null}

            {estimate ? (
              <View style={styles.actions}>
                <Button label="DISCARD" variant="ghost" disabled={saving} onPress={reset} style={styles.flex} />
                <Button label="SAVE" onPress={handleSave} loading={saving} style={styles.flex} />
              </View>
            ) : (
              <Button
                label={loadingHint === 'slow' ? 'STILL WORKING...' : 'ESTIMATE MACROS'}
                onPress={handleEstimate}
                loading={isEstimating}
                disabled={!description.trim() || voice.isRecording || voice.isTranscribing || saving}
              />
            )}

            <Pressable onPress={close} disabled={saving} hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PreviewStat({ value, label }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.previewStat}>
      <Text style={styles.previewValue}>{value}</Text>
      <Text style={styles.previewLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface.primary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    // Bounded so the ScrollView inside it has a height to scroll within.
    // Under this the sheet still wraps its content, so short states (no
    // estimate yet) keep the compact bottom-sheet look.
    maxHeight: '85%',
  },
  // Padding and gap live on the scroll content, not the sheet, or the sheet's
  // padding would sit outside the scrollable area and clip the last row.
  sheetContent: { padding: spacing.xl, gap: spacing.lg },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 70,
    textAlignVertical: 'top',
    color: colors.text.primary,
    backgroundColor: colors.surface.secondary,
    ...typography.body,
  },
  mic: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surface.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: { backgroundColor: colors.brand.red },
  preview: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface.secondary,
  },
  previewRow: { flexDirection: 'row', gap: spacing.sm },
  previewStat: { flex: 1, alignItems: 'center', gap: 1 },
  previewValue: { ...typography.label, fontSize: 15, color: colors.text.primary },
  previewLabel: { ...typography.eyebrow, fontSize: 7, color: colors.text.muted },
  item: { ...typography.small, color: colors.text.muted },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  cancel: { ...typography.small, color: colors.text.muted, textAlign: 'center' },
});
