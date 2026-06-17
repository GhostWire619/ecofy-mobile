import { useLocalSearchParams } from 'expo-router';

import { FarmWorkspaceScreen } from '@/features/farms/workspace-screen';

export default function FarmWorkspaceRoute() {
  const params = useLocalSearchParams<{ farmId: string }>();
  const farmId = Array.isArray(params.farmId) ? params.farmId[0] : params.farmId;

  return <FarmWorkspaceScreen farmId={farmId ?? ''} />;
}
