import { Stack } from 'expo-router/stack';

import { theme } from '@/lib/theme';

export default function ExpertLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Expert consultations', headerLargeTitle: true }} />
      <Stack.Screen name="consults/[consultId]" options={{ title: 'Review case' }} />
    </Stack>
  );
}
