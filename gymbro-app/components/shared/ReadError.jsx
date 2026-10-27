import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { useThemedStyles } from './ThemeProvider';

export function ReadError({ message = 'Could not load this data.', onRetry }) {
  const { styles } = useThemedStyles(makeStyles);
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryFailed(false);
    try { await onRetry(); } catch { setRetryFailed(true); } finally { setRetrying(false); }
  };
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{retryFailed ? 'Retry failed. Check your connection and try again.' : message}</Text>
      <Button label="TRY AGAIN" onPress={retry} loading={retrying} />
      {router.canGoBack() ? <Button label="BACK" variant="ghost" onPress={() => router.back()} /> : null}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  wrap: { padding: 20, gap: 12, alignItems: 'center' },
  text: { color: colors.text.primary, textAlign: 'center' },
});
