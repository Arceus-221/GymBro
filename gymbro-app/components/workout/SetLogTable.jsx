import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, spacing, typography } from '../../constants/theme';
import { round1, toDisplayWeight, toStoredWeight } from '../../constants/units';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Icon } from '../shared/Icon';
import { useThemedStyles } from '../shared/ThemeProvider';

/**
 * Per-set log rows. Reps/weight are editable inline so a user can record what
 * they actually lifted rather than what was programmed.
 *
 * The weight column is entered and shown in the user's preferred unit but
 * ALWAYS stored as kg — `set.weightKg` is written straight to Firestore, so a
 * display value must never reach it unconverted (see constants/units.js).
 */
export function SetLogTable({ sets, targetUnit = 'reps', currentSetIndex, onChangeSet }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  const weightUnit = useSettingsStore((s) => s.weightUnit);

  // While a weight field is being typed into, show exactly what was typed.
  // Rendering the stored kg back out on every keystroke would round-trip the
  // number and visibly drift it under the cursor — the same reason the profile
  // editor holds its form in display units (app/(profile)/edit.jsx).
  const [drafts, setDrafts] = useState({});

  const weightValue = (set, index) => {
    if (drafts[index] !== undefined) return drafts[index];
    if (!set.weightKg) return '';
    return String(round1(toDisplayWeight(set.weightKg, weightUnit)));
  };

  const handleWeightChange = (index, text) => {
    const typed = text.replace(/[^0-9.]/g, '');
    setDrafts((prev) => ({ ...prev, [index]: typed }));
    // Commit on each keystroke rather than on blur: "LOG SET" is reachable
    // while this field still holds focus, and a blur-only commit would drop
    // the last thing typed.
    onChangeSet(index, { weightKg: toStoredWeight(Number(typed) || 0, weightUnit) });
  };

  const handleWeightBlur = (index) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <Text style={[styles.header, styles.colSet]}>SET</Text>
        <Text style={[styles.header, styles.colInput]}>{targetUnit === 'seconds' ? 'SECONDS' : targetUnit === 'meters' ? 'METERS' : 'REPS'}</Text>
        <Text style={[styles.header, styles.colInput]}>{weightUnit.toUpperCase()}</Text>
        <Text style={[styles.header, styles.colStatus]}>STATUS</Text>
      </View>

      {sets.map((set, index) => {
        const isCurrent = index === currentSetIndex;
        return (
          <View
            key={set.setNumber}
            style={[styles.row, isCurrent && styles.rowCurrent, set.completed && styles.rowDone]}
          >
            <Text style={[styles.cell, styles.colSet]}>{set.setNumber}</Text>

            <TextInput
              value={(targetUnit === 'reps' ? set.repsCompleted : set.targetCompleted) ? String(targetUnit === 'reps' ? set.repsCompleted : set.targetCompleted) : ''}
              onChangeText={(t) =>
                onChangeSet(index, { [targetUnit === 'reps' ? 'repsCompleted' : 'targetCompleted']: Number(t.replace(/[^0-9]/g, '')) || 0 })
              }
              keyboardType="number-pad"
              style={[styles.input, styles.colInput]}
              placeholder="0"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />

            <TextInput
              value={weightValue(set, index)}
              onChangeText={(t) => handleWeightChange(index, t)}
              onBlur={() => handleWeightBlur(index)}
              keyboardType="decimal-pad"
              style={[styles.input, styles.colInput]}
              placeholder="0"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />

            <View style={[styles.colStatus, styles.status]}>
              <Icon
                name={set.completed ? 'check' : isCurrent ? 'dot' : 'circle'}
                size={set.completed ? 17 : 13}
                color={set.completed ? colors.brand.redText : colors.text.inverseMuted}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  table: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.onInverse.hairline,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.onInverse.raisedSoft,
  },
  header: { ...typography.eyebrow, fontSize: 9, color: colors.text.inverseMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.onInverse.divider,
  },
  rowCurrent: { backgroundColor: colors.onInverse.brandWash },
  rowDone: { opacity: 0.75 },
  cell: { ...typography.body, color: colors.text.inverse, fontWeight: '700' },
  input: {
    ...typography.body,
    color: colors.text.inverse,
    fontWeight: '700',
    paddingVertical: 6,
  },
  status: { alignItems: 'flex-end' },
  colSet: { width: 42 },
  colInput: { flex: 1 },
  colStatus: { width: 58, textAlign: 'right' },
});
