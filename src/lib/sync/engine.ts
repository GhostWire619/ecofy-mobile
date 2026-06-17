import * as BackgroundTask from 'expo-background-task';
import NetInfo from '@react-native-community/netinfo';
import * as TaskManager from 'expo-task-manager';

import { ApiError } from '@/lib/api/client';
import { mobileApi } from '@/lib/api/mobile';
import type {
  FarmRecord,
  JourneyRecord,
  LogImageRecord,
  LogRecord,
  MilestoneRecord,
  PlotRecord,
  StageRecord,
  SyncConflictRecord,
  SyncQueueRecord,
  TaskRecord,
} from '@/lib/domain/types';
import {
  farmRepository,
  journeyRepository,
  logRepository,
  plotRepository,
  replaceBootstrapData,
  sessionRepository,
  syncRepository,
} from '@/lib/db/repositories';
import { createId } from '@/lib/utils/id';
import { parseJson } from '@/lib/utils/json';

const BACKGROUND_SYNC_TASK = 'ecofy-background-sync';
let activeOnlineFlush: Promise<{ processed: number }> | null = null;

function isNetworkReachable(
  networkState:
    | {
        isConnected: boolean | null;
        isInternetReachable?: boolean | null;
      }
    | null
    | undefined,
) {
  return Boolean(networkState?.isConnected && networkState.isInternetReachable !== false);
}

async function processJob(job: SyncQueueRecord) {
  if (job.entity_type === 'farm' && job.job_type === 'upsert') {
    const payload = parseJson<{ farm: FarmRecord; plot?: PlotRecord | null }>(
      job.payload_json,
      { farm: {} as FarmRecord },
    );
    const response = await mobileApi.syncFarm(payload);
    await farmRepository.saveFarm(response.farm);
    if (response.plot) {
      await plotRepository.savePlot(response.plot);
      await syncRepository.markEntitySynced('plots', response.plot.id);
    }
    await syncRepository.markEntitySynced('farms', job.entity_id);
    return;
  }

  if (job.entity_type === 'journey' && job.job_type === 'create') {
    const payload = parseJson<{
      journey: JourneyRecord;
      stages: StageRecord[];
      milestones: MilestoneRecord[];
      tasks: TaskRecord[];
    }>(job.payload_json, {
      journey: {} as JourneyRecord,
      stages: [],
      milestones: [],
      tasks: [],
    });
    const response = await mobileApi.syncJourney(payload);
    await replaceBootstrapData(response);
    return;
  }

  if (job.entity_type === 'log' && job.job_type === 'create') {
    const payload = parseJson<{ log: LogRecord; images: LogImageRecord[] }>(job.payload_json, {
      log: {} as LogRecord,
      images: [],
    });
    await mobileApi.syncLog(payload);
    await syncRepository.markEntitySynced('logs', job.entity_id);
    return;
  }

  if (job.entity_type === 'task' && job.job_type === 'complete') {
    const payload = parseJson<{ task: TaskRecord }>(job.payload_json, {
      task: {} as TaskRecord,
    });
    await mobileApi.completeTask(payload.task);
    await syncRepository.markEntitySynced('tasks', payload.task.id);
    return;
  }

  if (job.entity_type === 'profile' && job.job_type === 'update') {
    const payload = parseJson<Record<string, string>>(job.payload_json, {});
    await mobileApi.updateProfile(payload);
    const session = await sessionRepository.getSession();
    if (session) {
      await sessionRepository.upsertSession({
        ...session,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await flushSyncQueueIfOnline();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSyncAsync() {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    return false;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (!isRegistered) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15,
    });
  }

  return true;
}

export async function flushSyncQueue() {
  const networkState = await NetInfo.fetch();
  if (!isNetworkReachable(networkState)) {
    return { processed: 0 };
  }

  const queue = await syncRepository.listQueue();
  let processed = 0;

  for (const job of queue) {
    await syncRepository.markProcessing(job.id);

    try {
      await processJob(job);
      await syncRepository.removeJob(job.id);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      await syncRepository.markFailed(job.id, message);

      if (error instanceof ApiError && error.status === 409) {
        const conflict: SyncConflictRecord = {
          id: createId('conflict'),
          entity_type: job.entity_type,
          entity_id: job.entity_id,
          local_payload_json: job.payload_json,
          remote_payload_json: JSON.stringify(error.payload ?? {}),
          message: error.message,
          created_at: new Date().toISOString(),
        };

        await syncRepository.saveConflict(conflict);
        continue;
      }

      break;
    }
  }

  return { processed };
}

export async function flushSyncQueueIfOnline() {
  if (activeOnlineFlush) {
    return activeOnlineFlush;
  }

  activeOnlineFlush = (async () => {
    const networkState = await Promise.resolve(NetInfo.fetch()).catch(() => null);
    if (!isNetworkReachable(networkState)) {
      return { processed: 0 };
    }

    try {
      return await flushSyncQueue();
    } catch {
      return { processed: 0 };
    } finally {
      activeOnlineFlush = null;
    }
  })();

  return activeOnlineFlush;
}

function triggerBackgroundFlush() {
  void flushSyncQueueIfOnline();
}

export async function queueFarmSync(farm?: FarmRecord, plot?: PlotRecord | null) {
  const resolvedFarm = farm ?? (await farmRepository.listFarms())[0];
  if (!resolvedFarm) {
    return;
  }

  const resolvedPlot =
    plot ?? (await plotRepository.listPlotsForFarm(resolvedFarm.id))[0] ?? null;

  await syncRepository.enqueueJob('farm', resolvedFarm.id, 'upsert', {
    farm: resolvedFarm,
    plot: resolvedPlot,
  });
  triggerBackgroundFlush();
}

export async function queueJourneySync(journey: JourneyRecord) {
  const [stages, milestones, tasks] = await Promise.all([
    journeyRepository.listStages(journey.id),
    journeyRepository.listMilestones(journey.id),
    journeyRepository.listTasks(journey.id),
  ]);

  await syncRepository.enqueueJob('journey', journey.id, 'create', {
    journey,
    stages,
    milestones,
    tasks,
  });
  triggerBackgroundFlush();
}

export async function queueLogSync(log: LogRecord) {
  const images = await logRepository.listImagesForLog(log.id);
  await syncRepository.enqueueJob('log', log.id, 'create', { log, images });
  triggerBackgroundFlush();
}

export async function queueTaskCompletionSync(task: TaskRecord) {
  await syncRepository.enqueueJob('task', task.id, 'complete', { task });
  triggerBackgroundFlush();
}

/** Cancel a still-queued task-completion job (best effort) when the user taps Undo. */
export async function removeTaskCompletionSync(taskId: string) {
  await syncRepository.removeQueuedJob('task', taskId, 'complete');
}

/** Cancel a still-queued log-create job (used to roll back a task-completion proof on undo). */
export async function removeLogSync(logId: string) {
  await syncRepository.removeQueuedJob('log', logId, 'create');
}
