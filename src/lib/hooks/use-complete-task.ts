import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import { newlyUnlocked } from '@/components/game/helpers';
import { useXpGain } from '@/components/game';
import { logRepository, taskRepository } from '@/lib/db/repositories';
import type { AchievementBadge, EngagementSummary, TaskRecord } from '@/lib/domain/types';
import { ENGAGEMENT_QUERY_KEY } from '@/lib/hooks/use-engagement';
import {
  queueLogSync,
  queueTaskCompletionSync,
  removeLogSync,
  removeTaskCompletionSync,
} from '@/lib/sync/engine';

/** Proof + context captured by the completion sheet. */
export type CompleteTaskInput = {
  task: TaskRecord;
  note?: string | null;
  photoUri?: string | null;
  mimeType?: string | null;
  farmId?: string | null;
  journeyId?: string | null;
  plotId?: string | null;
};

export type CompleteTaskResult = { task: TaskRecord; logId: string | null };

function recomputeLevel(totalXp: number) {
  const level = Math.max(1, Math.floor(totalXp / 100) + 1);
  const xpIntoLevel = totalXp % 100;
  return {
    level,
    xp_into_level: xpIntoLevel,
    xp_for_next_level: 100,
    progress_to_next: Math.round((xpIntoLevel / 100) * 1000) / 1000,
  };
}

const REFRESH_KEYS = [['journey-screen'], ['today-screen'], ['home-dashboard']] as const;

/**
 * Completing a task across screens — now proof-aware and reversible.
 *
 * - Completes offline + queues the sync job (server awards real XP)
 * - If a photo or note is attached, writes a logbook entry (best effort) so the
 *   completion leaves a real field record instead of a bare tap
 * - Fires instant feedback: floating "+XP" + success haptic
 * - Optimistically bumps the cached engagement level bar
 * - `undo()` reverts the completion, rolls back XP, cancels the queued sync,
 *   and soft-deletes the proof log — for the few-second undo window
 *
 * @param onAchievement called with the newest newly-unlocked badge (show a modal)
 */
export function useCompleteTask(opts?: { onAchievement?: (badge: AchievementBadge) => void }) {
  const queryClient = useQueryClient();
  const { award } = useXpGain();
  const seenKeys = useRef<Set<string>>(new Set());

  const mutation = useMutation<CompleteTaskResult, Error, CompleteTaskInput>({
    mutationFn: async ({ task, note, photoUri, mimeType, farmId, journeyId, plotId }) => {
      await taskRepository.completeTaskOffline(task.id, note ?? undefined);
      await queueTaskCompletionSync({
        ...task,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });

      // Record every completion in the logbook so accomplished tasks show up in
      // Notes — with the farmer's photo/note when they added one, otherwise a
      // simple "did <task>" entry.
      let logId: string | null = null;
      if (farmId) {
        try {
          const { log } = await logRepository.createOfflineLog({
            farm_id: farmId,
            plot_id: plotId ?? task.plot_id ?? null,
            journey_id: journeyId ?? task.journey_id ?? null,
            operation_type: task.task_type ?? 'other',
            date: new Date().toISOString().slice(0, 10),
            notes: note ?? task.title ?? null,
            images: photoUri
              ? [{ local_uri: photoUri, mime_type: mimeType ?? 'image/jpeg' }]
              : [],
          });
          await queueLogSync(log);
          logId = log.id;
        } catch {
          // Logging is best-effort; the task completion itself still stands.
        }
      }

      return { task, logId };
    },
    onSuccess: async ({ task }) => {
      const xp = task.xp_value ?? 10;
      award(xp);
      queryClient.setQueryData<EngagementSummary | undefined>(ENGAGEMENT_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        if (seenKeys.current.size === 0) {
          for (const a of prev.achievements) if (a.achievement_key) seenKeys.current.add(a.achievement_key);
        }
        const total = prev.total_xp + xp;
        return { ...prev, total_xp: total, ...recomputeLevel(total) };
      });
      await Promise.all(REFRESH_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key })));
      // Reconcile with server truth after sync has a chance to flush.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ENGAGEMENT_QUERY_KEY }).then(() => {
          const fresh = queryClient.getQueryData<EngagementSummary>(ENGAGEMENT_QUERY_KEY);
          if (!fresh) return;
          const unlocked = newlyUnlocked(fresh.achievements, seenKeys.current);
          for (const b of unlocked) if (b.achievement_key) seenKeys.current.add(b.achievement_key);
          if (unlocked.length > 0) opts?.onAchievement?.(unlocked[0]);
        });
      }, 2500);
    },
  });

  const undo = useCallback(
    async (task: TaskRecord, logId: string | null) => {
      await taskRepository.undoCompleteOffline(task.id);
      await removeTaskCompletionSync(task.id);
      if (logId) {
        await logRepository.softDeleteLog(logId);
        await removeLogSync(logId);
      }
      const xp = task.xp_value ?? 10;
      queryClient.setQueryData<EngagementSummary | undefined>(ENGAGEMENT_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const total = Math.max(0, prev.total_xp - xp);
        return { ...prev, total_xp: total, ...recomputeLevel(total) };
      });
      await Promise.all(REFRESH_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    },
    [queryClient],
  );

  return { mutation, undo };
}
