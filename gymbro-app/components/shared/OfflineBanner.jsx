import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography } from '../../constants/theme';
import { useConnectivityStore } from '../../store/useConnectivityStore';
import { useThemedStyles } from './ThemeProvider';

/**
 * Global strip in the root layout. Path A keeps working offline, so this is
 * informational rather than blocking — it exists so stale cached data never
 * silently reads as live (Phase 3 §3.3).
 */
export function OfflineBanner() {
  const { styles } = useThemedStyles(makeStyles);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]}>
      <Text style={styles.text}>Offline - some actions need a connection</Text>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  banner: {
    backgroundColor: colors.surface.inverse,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  text: {
    ...typography.eyebrow,
    color: colors.text.inverse,
    textAlign: 'center',
    letterSpacing: 1,
  },
});
