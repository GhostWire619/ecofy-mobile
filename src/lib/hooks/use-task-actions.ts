import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { taskRepository } from '@/lib/db/repositories';
import type { TaskRecord } from '@/lib/domain/types';
import { tapHaptic } from '@/lib/utils/haptics';

const REFRESH_KEYS = [['journey-screen'], ['today-screen'], ['home-dashboard']] as const;

/**
 * Snooze / skip flexibility for a task. `open(task)` shows the actions sheet;
 * spread `sheet` into <TaskActionsSheet/>.
 */
export function useTaskActions() {
  const queryClient = useQueryClient();
  const [task, setTask] = useState<TaskRecord | null>(null);

  const open = useCallback((t: TaskRecord) => {
    tapHaptic();
    setTask(t);
  }, []);

  const onCancel = useCallback(() => setTask(null), []);

  const refresh = useCallback(
    () => Promise.all(REFRESH_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key }))),
    [queryClient],
  );

  const onSnooze = useCallback(
    async (days: number) => {
      const t = task;
      if (!t) return;
      setTask(null);
      await taskRepository.snoozeTaskOffline(t.id, days);
      await refresh();
    },
    [task, refresh],
  );

  const onSkip = useCallback(
    async (reason: string) => {
      const t = task;
      if (!t) return;
      setTask(null);
      await taskRepository.skipTaskOffline(t.id, reason);
      await refresh();
    },
    [task, refresh],
  );

  return {
    open,
    sheet: { visible: Boolean(task), task, onSnooze, onSkip, onCancel },
  };
}
