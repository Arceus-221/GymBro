import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, spacing, typography } from '../../constants/theme';
import { formatWeight } from '../../constants/units';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Button } from '../shared/Button';
import { Eyebrow, Heading } from '../shared/Typography';
import { useThemedStyles } from '../shared/ThemeProvider';

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function WorkoutSummaryModal({ visible, onCancel, onConfirm, saving, stats }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const [perceivedExertion, setPerceivedExertion] = useState(7);
  const [notes, setNotes] = useState('');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={saving ? undefined : onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Eyebrow>Finish workout</Eyebrow>
          <Heading level={1}>NICE WORK</Heading>

          <View style={styles.statRow}>
            <SummaryStat value={stats.completedSets} label="Sets done" />
            <SummaryStat value={`${stats.durationMinutes}m`} label="Duration" />
            <SummaryStat value={formatWeight(stats.volumeKg, weightUnit)} label="Volume" />
          </View>

          <View style={styles.block}>
            <Eyebrow>How hard did that feel? (RPE)</Eyebrow>
            <View style={styles.rpeRow}>
              {RPE_VALUES.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setPerceivedExertion(value)}
                  style={[styles.rpe, perceivedExertion === value && styles.rpeActive]}
                >
                  <Text
                    style={[
                      styles.rpeText,
                      perceivedExertion === value && styles.rpeTextActive,
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.block}>
            <Eyebrow>Notes (optional)</Eyebrow>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Felt strong on the last set..."
              placeholderTextColor={colors.text.faint}
              multiline
              style={styles.notes}
            />
          </View>

          <Button
            label="SAVE WORKOUT"
            loading={saving}
            onPress={() => onConfirm({ perceivedExertion, notes })}
          />
          <Pressable onPress={onCancel} disabled={saving} hitSlop={8}>
            <Text style={styles.cancel}>Keep training</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SummaryStat({ value, label }) {
  const { styles } = useThemedStyles(makeStyles);
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface.primary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  statRow: { flexDirection: 'row', gap: spacing.md },
  summaryStat: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface.secondary,
    gap: 2,
  },
  summaryValue: { ...typography.stat, fontSize: 18, color: colors.text.primary },
  summaryLabel: { ...typography.eyebrow, fontSize: 8, color: colors.text.muted },
  block: { gap: spacing.sm },
  rpeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rpe: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeActive: { backgroundColor: colors.brand.red, borderColor: colors.brand.red },
  rpeText: { ...typography.small, fontWeight: '800', color: colors.text.mid },
  rpeTextActive: { color: colors.text.inverse },
  notes: {
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 70,
    textAlignVertical: 'top',
    color: colors.text.primary,
    backgroundColor: colors.surface.secondary,
  },
  cancel: { ...typography.small, color: colors.text.muted, textAlign: 'center' },
});
