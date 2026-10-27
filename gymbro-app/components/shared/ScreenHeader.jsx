import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography } from '../../constants/theme';
import { Icon } from './Icon';
import { useThemedStyles } from './ThemeProvider';

/**
 * Black bar with a back chevron and a centered title — the same treatment
 * Progress and Workout Mode use, extracted so the stacked (profile) screens
 * can't drift from it.
 *
 * @param {{icon: string, label: string, onPress: () => void}} [action] trailing button;
 *   `icon` is a name from components/shared/Icon.jsx
 */
export function ScreenHeader({ title, onBack, action = null }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="back" size={22} color={colors.text.inverse} />
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Icon name={action.icon} size={22} color={colors.text.inverse} />
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface.inverse,
  },
  title: { ...typography.label, fontSize: 13, color: colors.text.inverse },
  spacer: { width: 22 },
});
