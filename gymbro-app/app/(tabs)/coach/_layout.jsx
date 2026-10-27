import { Stack } from 'expo-router';
import { useTheme } from '../../../components/shared/ThemeProvider';

export default function CoachLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.tertiary },
      }}
    />
  );
}
