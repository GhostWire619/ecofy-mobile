import { env } from '@/lib/constants/env';
import type {
  RemoteSensingOverlay,
  RemoteSensingRun,
  RemoteSensingRunRequest,
  RemoteSensingRunResult,
} from '@/lib/domain/types';

type OverlayFetchResult = {
  success: boolean;
  data?: RemoteSensingOverlay;
  error?: string;
};

type RunFetchResult = {
  success: boolean;
  data?: RemoteSensingRun;
  error?: string;
};

type RunStatusFetchResult = {
  success: boolean;
  data?: RemoteSensingRunResult;
  error?: string;
};

type OverlayLoaderDeps = {
  getOverlay: () => Promise<OverlayFetchResult>;
  runAnalysis: (payload: RemoteSensingRunRequest) => Promise<RunFetchResult>;
  getRunStatus: (runId: string) => Promise<RunStatusFetchResult>;
  delay?: (ms: number) => Promise<void>;
};

export type FarmOverlayLoadResult =
  | {
      state: 'ready';
      overlay: RemoteSensingOverlay;
      error: null;
      ranAnalysis: boolean;
    }
  | {
      state: 'boundary_required' | 'unavailable' | 'failed';
      overlay: null;
      error: string | null;
      ranAnalysis: boolean;
    };

export function resolveApiTileUrl(url?: string | null) {
  if (!url) {
    return null;
  }

  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  if (url.startsWith('/')) {
    return `${env.apiUrl}${url}`;
  }

  return `${env.apiUrl}/${url.replace(/^\/+/, '')}`;
}

export async function loadFarmRemoteSensingOverlay(
  input: {
    hasBoundary: boolean;
    runPayload: RemoteSensingRunRequest;
    maxAttempts?: number;
    pollIntervalMs?: number;
    forceRefresh?: boolean;
  },
  deps: OverlayLoaderDeps,
): Promise<FarmOverlayLoadResult> {
  const fetchExistingOverlay = async () => {
    const overlayResponse = await deps.getOverlay();
    if (overlayResponse.success && overlayResponse.data?.tile_url) {
      return overlayResponse.data;
    }
    return null;
  };

  const existingOverlay = input.forceRefresh ? null : await fetchExistingOverlay();
  if (existingOverlay) {
    return {
      state: 'ready',
      overlay: existingOverlay,
      error: null,
      ranAnalysis: false,
    };
  }

  if (!input.hasBoundary) {
    return {
      state: 'boundary_required',
      overlay: null,
      error: 'Map this farm boundary to view NDVI overlays.',
      ranAnalysis: false,
    };
  }

  const runResponse = await deps.runAnalysis(input.runPayload);
  if (!runResponse.success || !runResponse.data?.run_id) {
    return {
      state: 'failed',
      overlay: null,
      error: runResponse.error || 'Could not start NDVI overlay analysis.',
      ranAnalysis: true,
    };
  }

  const maxAttempts = input.maxAttempts ?? 30;
  const pollIntervalMs = input.pollIntervalMs ?? 2000;
  const delay =
    deps.delay ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const statusResponse = await deps.getRunStatus(runResponse.data.run_id);

    if (!statusResponse.success || !statusResponse.data) {
      return {
        state: 'failed',
        overlay: null,
        error: statusResponse.error || 'Could not monitor NDVI overlay analysis.',
        ranAnalysis: true,
      };
    }

    if (statusResponse.data.status === 'failed') {
      return {
        state: 'failed',
        overlay: null,
        error: statusResponse.data.error_message || 'NDVI overlay analysis failed.',
        ranAnalysis: true,
      };
    }

    if (statusResponse.data.status === 'completed') {
      const refreshedOverlay = await fetchExistingOverlay();
      if (refreshedOverlay) {
        return {
          state: 'ready',
          overlay: refreshedOverlay,
          error: null,
          ranAnalysis: true,
        };
      }

      return {
        state: 'unavailable',
        overlay: null,
        error: 'NDVI overlay is not available yet.',
        ranAnalysis: true,
      };
    }

    await delay(pollIntervalMs);
  }

  return {
    state: 'unavailable',
    overlay: null,
    error: 'NDVI overlay is still processing.',
    ranAnalysis: true,
  };
}
