import { useCallback, useEffect, useRef, useState } from 'react';

import type { CompletionProof } from '@/components/tasks/task-completion-sheet';
import { useCompleteTask } from '@/lib/hooks/use-complete-task';
import type { AchievementBadge, TaskRecord } from '@/lib/domain/types';
import { tapHaptic } from '@/lib/utils/haptics';

const UNDO_WINDOW_MS = 5000;

/**
 * End-to-end task-completion flow for a screen:
 * `begin(task)` opens the confirmation sheet; on confirm it completes the task
 * (with proof) and shows an Undo snackbar for a few seconds.
 *
 * Spread `sheet` into <TaskCompletionSheet/> and `toast` into <UndoToast/>.
 */
export function useTaskCompletion(ctx: {
  farmId?: string | null;
  journeyId?: string | null;
  plotId?: string | null;
  onAchievement?: (badge: AchievementBadge) => void;
}) {
  const { mutation, undo } = useCompleteTask({ onAchievement: ctx.onAchievement });
  const [sheetTask, setSheetTask] = useState<TaskRecord | null>(null);
  const [pending, setPending] = useState<{ task: TaskRecord; logId: string | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const begin = useCallback((task: TaskRecord) => {
    tapHaptic();
    setSheetTask(task);
  }, []);
  const onCancel = useCallback(() => setSheetTask(null), []);

  const onConfirm = useCallback(
    async (proof: CompletionProof) => {
      const task = sheetTask;
      if (!task) return;
      setSheetTask(null);
      const result = await mutation.mutateAsync({
        task,
        note: proof.note,
        photoUri: proof.photoUri,
        mimeType: proof.mimeType,
        farmId: ctx.farmId ?? null,
        journeyId: ctx.journeyId ?? null,
        plotId: ctx.plotId ?? null,
      });
      clearTimer();
      setPending({ task: result.task, logId: result.logId });
      timer.current = setTimeout(() => setPending(null), UNDO_WINDOW_MS);
    },
    [sheetTask, mutation, ctx.farmId, ctx.journeyId, ctx.plotId, clearTimer],
  );

  const onUndo = useCallback(async () => {
    if (!pending) return;
    clearTimer();
    const snapshot = pending;
    setPending(null);
    await undo(snapshot.task, snapshot.logId);
  }, [pending, undo, clearTimer]);

  return {
    begin,
    isCompleting: mutation.isPending,
    sheet: { visible: Boolean(sheetTask), task: sheetTask, onConfirm, onCancel },
    toast: { visible: Boolean(pending), message: 'Task marked done', onUndo },
  };
}
