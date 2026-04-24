import type { FarmRecord, OfflineMapRegionRecord } from '@/lib/domain/types';
import { env } from '@/lib/constants/env';
import { offlineMapRepository } from '@/lib/db/repositories';
import { createId } from '@/lib/utils/id';

type MapboxOfflineModule = {
  setAccessToken?: (token: string) => void;
  offlineManager?: {
    createPack: (
      options: {
        name: string;
        styleURL: string;
        minZoom: number;
        maxZoom: number;
        bounds: [[number, number], [number, number]];
      },
      progressListener: (
        pack: unknown,
        status: {
          percentage: number;
        },
      ) => void | Promise<void>,
      errorListener?: (
        pack: unknown,
        error: {
          message: string;
        },
      ) => void | Promise<void>,
    ) => Promise<void>;
    setProgressEventThrottle?: (value: number) => void;
    unsubscribe?: (name: string) => void;
  };
};

export function createOfflinePackName(farmId: string) {
  return `farm-${farmId}`;
}

export function createOfflinePackBounds(
  farm: Pick<FarmRecord, 'latitude' | 'longitude'>,
): [[number, number], [number, number]] {
  return [
    [farm.longitude + 0.03, farm.latitude + 0.03],
    [farm.longitude - 0.03, farm.latitude - 0.03],
  ];
}

function getMapboxOfflineModule(): MapboxOfflineModule | null {
  if (!env.mapboxAccessToken) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mapbox = require('@rnmapbox/maps') as MapboxOfflineModule;
    mapbox.setAccessToken?.(env.mapboxAccessToken);
    return mapbox;
  } catch {
    return null;
  }
}

export async function downloadOfflineFarmRegion(
  farm: FarmRecord,
  existingRegion?: OfflineMapRegionRecord | null,
) {
  if (existingRegion?.status === 'downloaded') {
    return existingRegion;
  }

  const mapbox = getMapboxOfflineModule();
  if (!mapbox?.offlineManager) {
    throw new Error(
      env.mapboxAccessToken
        ? 'Offline map downloads require a native development build or production build.'
        : 'Mapbox access is not configured yet.',
    );
  }

  const offlineManager = mapbox.offlineManager;
  const bounds = createOfflinePackBounds(farm);
  const packName = createOfflinePackName(farm.id);
  const baseRecord = {
    id: existingRegion?.id ?? createId('map'),
    farm_id: farm.id,
    name: `${farm.name} field region`,
    style_url: env.mapboxStyleUrl,
    min_zoom: 11,
    max_zoom: 16,
    bounds_json: JSON.stringify(bounds),
  } satisfies Omit<OfflineMapRegionRecord, 'status' | 'progress' | 'updated_at'>;

  const saveRegion = async (
    status: OfflineMapRegionRecord['status'],
    progress: number,
  ) => {
    const record: OfflineMapRegionRecord = {
      ...baseRecord,
      status,
      progress,
      updated_at: new Date().toISOString(),
    };

    await offlineMapRepository.saveRegion(record);
    return record;
  };

  await saveRegion('downloading', 0);
  offlineManager.setProgressEventThrottle?.(500);

  return new Promise<OfflineMapRegionRecord>((resolve, reject) => {
    let settled = false;

    const complete = async (
      status: OfflineMapRegionRecord['status'],
      progress: number,
      errorMessage?: string,
    ) => {
      if (settled) {
        return;
      }

      settled = true;
      offlineManager.unsubscribe?.(packName);

      const record = await saveRegion(status, progress);
      if (status === 'failed') {
        reject(new Error(errorMessage ?? 'Offline map download failed.'));
        return;
      }

      resolve(record);
    };

    void offlineManager
      .createPack(
        {
          name: packName,
          styleURL: env.mapboxStyleUrl,
          minZoom: 11,
          maxZoom: 16,
          bounds,
        },
        async (_pack, downloadStatus) => {
          const progress = Math.max(0, Math.min(100, downloadStatus.percentage ?? 0));
          await saveRegion(progress >= 100 ? 'downloaded' : 'downloading', progress);

          if (progress >= 100) {
            await complete('downloaded', 100);
          }
        },
        async (_pack, error) => {
          await complete('failed', existingRegion?.progress ?? 0, error.message);
        },
      )
      .catch(async (error) => {
        await complete(
          'failed',
          existingRegion?.progress ?? 0,
          error instanceof Error ? error.message : 'Offline map download failed.',
        );
      });
  });
}
