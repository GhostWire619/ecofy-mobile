import { Stack } from 'expo-router';

import { FarmSetupScreen } from '@/features/farms/setup-screen';

export default function NewFarmScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FarmSetupScreen mode="add" />
    </>
  );
}
