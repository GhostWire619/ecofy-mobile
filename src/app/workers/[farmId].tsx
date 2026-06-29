import { useLocalSearchParams } from 'expo-router';

import { WorkersScreen } from '@/features/workers/screen';

export default function WorkersRoute() {
  const params = useLocalSearchParams<{ farmId: string }>();
  const farmId = Array.isArray(params.farmId) ? params.farmId[0] : params.farmId;

  return <WorkersScreen farmId={farmId ?? ''} />;
}
