import { Stack } from 'expo-router';
import { useTheme } from '../../../components/shared/ThemeProvider';

/** index (today's plan + log) and meal (one meal's recipe, prices, swap). */
export default function NutritionLayout() {
  // Stack contentStyle is not a StyleSheet, so it has to read the live
  // palette here or the screen background never follows the theme.
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.primary },
      }}
    />
  );
}
