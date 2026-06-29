import { useLocalSearchParams } from 'expo-router';

import { PlotsScreen } from '@/features/plots/screen';

export default function PlotsRoute() {
  const params = useLocalSearchParams<{ farmId: string }>();
  const farmId = Array.isArray(params.farmId) ? params.farmId[0] : params.farmId;

  return <PlotsScreen farmId={farmId ?? ''} />;
}
