import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { farmRepository, journeyRepository } from '@/lib/db/repositories';

export const ACTIVE_FARM_QUERY_KEY = ['active-farm-selection'] as const;

export function useActiveFarmSelection() {
  return useQuery({
    queryKey: ACTIVE_FARM_QUERY_KEY,
    queryFn: () => farmRepository.getSelectedFarmId(),
  });
}

export function useSetActiveFarmSelection() {
  const queryClient = useQueryClient();

  return useCallback(async ({ farmId, journeyId }: { farmId: string; journeyId?: string | null }) => {
    await farmRepository.setSelectedFarmId(farmId);
    await journeyRepository.setSelectedJourney(journeyId ?? null);

    // Publish the selection synchronously to every mounted tab. Their farm-scoped
    // query keys include this value, so they switch immediately instead of
    // waiting for SQLite to be reread or for a tab to remount.
    queryClient.setQueryData(ACTIVE_FARM_QUERY_KEY, farmId);

    // A farm switch is rare and changes the meaning of every dashboard query.
    // Invalidate all dependent data rather than maintaining a fragile list of
    // individual keys that silently misses new screens.
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== ACTIVE_FARM_QUERY_KEY[0],
    });
  }, [queryClient]);
}
