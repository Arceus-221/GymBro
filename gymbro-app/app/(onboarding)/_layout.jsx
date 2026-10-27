import { Stack } from 'expo-router';
import { useTheme } from '../../components/shared/ThemeProvider';

export default function OnboardingLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Back is driven by the footer's explicit Back button, not a swipe —
        // an accidental swipe mid-wizard is easy to do and confusing.
        gestureEnabled: false,
        contentStyle: { backgroundColor: colors.surface.primary },
      }}
    />
  );
}
