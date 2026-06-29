import { useLocalSearchParams } from 'expo-router';

import { ResourcesScreen } from '@/features/resources/screen';

export default function ResourcesRoute() {
  const params = useLocalSearchParams<{ farmId: string }>();
  const farmId = Array.isArray(params.farmId) ? params.farmId[0] : params.farmId;

  return <ResourcesScreen farmId={farmId ?? ''} />;
}
