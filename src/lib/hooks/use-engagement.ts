import { useQuery, useQueryClient } from '@tanstack/react-query';

import { mobileApi } from '@/lib/api/mobile';
import { engagementRepository } from '@/lib/db/repositories';
import type { EngagementSummary } from '@/lib/domain/types';

export const ENGAGEMENT_QUERY_KEY = ['engagement-summary'] as const;

/**
 * Live engagement summary (XP, level, streaks, achievements).
 *
 * Server is the source of truth — XP is awarded backend-side on task completion.
 * Offline-first: we write each successful fetch through to SQLite and fall back
 * to that cache when the network is unavailable, so the level bar survives cold
 * offline starts. Optimistic local XP (useXpGain) handles instant feedback.
 */
export function useEngagement(enabled = true) {
  return useQuery<EngagementSummary | undefined>({
    queryKey: ENGAGEMENT_QUERY_KEY,
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      try {
        const fresh = await mobileApi.getEngagementSummary();
        if (fresh) {
          await engagementRepository.save(fresh).catch(() => undefined);
        }
        return fresh;
      } catch (err) {
        // Offline / server error → fall back to the last persisted summary
        const cached = await engagementRepository.get().catch(() => null);
        if (cached) return cached;
        throw err;
      }
    },
  });
}

/** Invalidate the engagement summary so the bar/streak refetch server truth. */
export function useRefreshEngagement() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ENGAGEMENT_QUERY_KEY });
}
