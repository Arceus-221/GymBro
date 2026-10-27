import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '../../constants/theme';
import { useThemedStyles } from './ThemeProvider';

export function LoadingSpinner({ message, dark = false, style }) {
  const { styles, colors } = useThemedStyles(makeStyles);
  return (
    <View style={[styles.wrap, style]}>
      <ActivityIndicator color={dark ? colors.text.inverse : colors.brand.redText} size="large" />
      {message ? (
        <Text style={[styles.message, dark && styles.messageDark]}>{message}</Text>
      ) : null}
    </View>
  );
}

/** Give a generic wait message without guessing why a response is slow. */
export function backendLoadingMessage(loadingHint, normalMessage = 'Thinking...') {
  return loadingHint === 'slow' ? 'Still working on your request...' : normalMessage;
}

const makeStyles = (colors) => StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  message: { ...typography.small, color: colors.text.muted, textAlign: 'center' },
  messageDark: { color: colors.text.inverseMuted },
});
