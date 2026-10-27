import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '../../constants/theme';
import { Icon } from '../shared/Icon';
import { useThemedStyles } from '../shared/ThemeProvider';

/**
 * Full-width option row: icon tile, label + sub-label, trailing check circle.
 * Selected state gets a red border, tinted fill, and a filled check (Phase 3 §2.1).
 */
export function SelectRow({ label, sub, icon, selected, onPress }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected]}
    >
      {selected ? <View style={styles.stripe} /> : null}
      <View style={[styles.iconTile, selected && styles.iconTileSelected]}>
        <Icon
          name={icon}
          size={26}
          color={selected ? colors.brand.redText : colors.text.mid}
        />
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <View style={[styles.check, selected && styles.checkSelected]}>
        {selected ? <Icon name="check" size={15} color={colors.text.inverse} /> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    backgroundColor: colors.surface.primary,
    overflow: 'hidden',
  },
  rowSelected: {
    borderWidth: 2.5,
    borderColor: colors.brand.red,
    backgroundColor: colors.brand.redTint,
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: colors.brand.red,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // surface.primary, not text.inverse: this is a background, not a glyph.
  // Identical in light mode (both were #FFFFFF), but in dark a near-white tile
  // would be the brightest thing on the screen — here it reads as a subtle
  // inset against the red-tinted selected row instead.
  iconTileSelected: { backgroundColor: colors.surface.primary },
  text: { flex: 1, gap: 2 },
  label: { ...typography.h2, fontSize: 17, color: colors.text.primary },
  sub: { ...typography.small, color: colors.text.muted },
  check: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: { backgroundColor: colors.brand.red, borderColor: colors.brand.red },
});
