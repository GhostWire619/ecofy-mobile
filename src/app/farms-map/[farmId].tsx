import { useLocalSearchParams } from 'expo-router';

import { FarmMapScreen } from '@/features/farms/map-screen';

export default function FarmMapRoute() {
  const params = useLocalSearchParams<{ farmId: string }>();
  const farmId = Array.isArray(params.farmId) ? params.farmId[0] : params.farmId;

  return <FarmMapScreen farmId={farmId ?? ''} />;
}
