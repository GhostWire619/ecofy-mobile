import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FarmMapCard } from '@/components/map/farm-map-card';
import { mobileApi } from '@/lib/api/mobile';
import type {
  PlotHealthSnapshot,
  RemoteSensingSummary,
} from '@/lib/domain/types';
import {
  loadFarmWorkspaceCore,
  normalizeFarmHealthSummary,
} from '@/features/farms/data';
import { loadFarmRemoteSensingOverlay } from '@/lib/maps/monitoring';
import { theme } from '@/lib/theme';

type AsyncData<T> = {
  data: T | null;
  error: string | null;
};

type FarmMapScreenProps = {
  farmId: string;
};

type UserLocationState = {
  latitude: number;
  longitude: number;
} | null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

async function capture<T>(promise: Promise<T>): Promise<AsyncData<T>> {
  try {
    return { data: await promise, error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
}

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizePlotHealthSnapshot(snapshot: PlotHealthSnapshot | null): PlotHealthSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  return {
    ...snapshot,
    plot_name: safeText(snapshot.plot_name, 'Main Field'),
    risk_score: safeNumber(snapshot.risk_score, 0),
    risk_level: snapshot.risk_level ?? 'LOW',
    journey: snapshot.journey
      ? {
          crop_name: safeText(snapshot.journey.crop_name, 'No crop'),
          current_stage: safeText(snapshot.journey.current_stage, 'Not set'),
          progress_percentage: safeNumber(snapshot.journey.progress_percentage, 0),
          days_to_harvest: safeNumber(snapshot.journey.days_to_harvest, 0),
        }
      : null,
    breakdown: {
      satellite: {
        score: safeNumber(snapshot.breakdown?.satellite?.score, 0),
        ndvi: typeof snapshot.breakdown?.satellite?.ndvi === 'number' ? snapshot.breakdown.satellite.ndvi : null,
        trend: safeText(snapshot.breakdown?.satellite?.trend) || null,
        status: safeText(snapshot.breakdown?.satellite?.status) || null,
      },
      weather: {
        score: safeNumber(snapshot.breakdown?.weather?.score, 0),
        threats: asArray(snapshot.breakdown?.weather?.threats).map((item) => safeText(item)).filter(Boolean),
      },
      operations: {
        score: safeNumber(snapshot.breakdown?.operations?.score, 0),
        overdue_count: safeNumber(snapshot.breakdown?.operations?.overdue_count, 0),
        pending_count: safeNumber(snapshot.breakdown?.operations?.pending_count, 0),
      },
      scouting: {
        score: safeNumber(snapshot.breakdown?.scouting?.score, 0),
        days_since_last:
          typeof snapshot.breakdown?.scouting?.days_since_last === 'number'
            ? snapshot.breakdown.scouting.days_since_last
            : null,
      },
    },
    actions: asArray(snapshot.actions)
      .map((action) => ({
        type: action?.type ?? 'operations',
        message: safeText(action?.message),
      }))
      .filter((action) => Boolean(action.message)),
  };
}

function buildWeatherLabel(remoteSummary: RemoteSensingSummary | null) {
  if (remoteSummary?.status) {
    return String(remoteSummary.status).replace('_', ' ');
  }

  return 'NDVI monitoring';
}

export function FarmMapScreen({ farmId }: FarmMapScreenProps) {
  const insets = useSafeAreaInsets();
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);
  const [overlayRefreshVersion, setOverlayRefreshVersion] = useState(0);
  const [userLocation, setUserLocation] = useState<UserLocationState>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let watcher: Location.LocationSubscription | null = null;

    const startTracking = async () => {
      try {
        // Do NOT prompt here — Google Play requires a prominent disclosure
        // before the first request (shown when the user explicitly captures
        // location elsewhere). Only show the live dot if already granted.
        const permission = await Location.getForegroundPermissionsAsync();
        if (!isMounted) {
          return;
        }

        if (!permission.granted) {
          setLocationReady(true);
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (isMounted) {
          setUserLocation({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
        }

        watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10,
            timeInterval: 15000,
          },
          (position) => {
            if (!isMounted) {
              return;
            }

            setUserLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
        );
      } catch (error) {
        if (isMounted) {
          setLocationError(errorMessage(error));
        }
      } finally {
        if (isMounted) {
          setLocationReady(true);
        }
      }
    };

    void startTracking();

    return () => {
      isMounted = false;
      watcher?.remove();
    };
  }, []);

  const coreQuery = useQuery({
    queryKey: ['farm-map-core', farmId],
    enabled: Boolean(farmId),
    queryFn: async () => loadFarmWorkspaceCore(farmId),
  });

  const liveQuery = useQuery({
    queryKey: ['farm-map-live', farmId, coreQuery.data?.plot?.id ?? 'none'],
    enabled: Boolean(farmId && coreQuery.data),
    queryFn: async () => ({
      farmHealth: await capture(mobileApi.getFarmHealthSummary(farmId)),
      plotHealth: coreQuery.data?.plot?.id
        ? await capture(mobileApi.getPlotHealthSnapshot(farmId, coreQuery.data.plot.id))
        : { data: null, error: null },
      latestNdvi: await capture(
        mobileApi.getRemoteSensingLatest(farmId, {
          analysis_type: 'ndvi',
          plot_id: coreQuery.data?.plot?.id ?? undefined,
        }),
      ),
    }),
  });

  const overlayQuery = useQuery({
    queryKey: [
      'farm-map-overlay',
      farmId,
      coreQuery.data?.plot?.id ?? 'none',
      coreQuery.data?.plot?.field_boundary_json ?? 'no-boundary',
      overlayRefreshVersion,
    ],
    enabled: Boolean(farmId && coreQuery.data && (isOverlayVisible || overlayRefreshVersion > 0)),
    staleTime: Infinity,
    queryFn: async () =>
      loadFarmRemoteSensingOverlay(
        {
          hasBoundary: Boolean(coreQuery.data?.plot?.field_boundary_json),
          forceRefresh: overlayRefreshVersion > 0,
          runPayload: {
            analysis_type: 'ndvi',
            plot_id: coreQuery.data?.plot?.id ?? undefined,
            output_modes: ['map_overlay'],
            force_refresh: overlayRefreshVersion > 0,
          },
        },
        {
          getOverlay: async () => {
            try {
              const overlay = await mobileApi.getRemoteSensingOverlay(farmId, {
                analysis_type: 'ndvi',
                plot_id: coreQuery.data?.plot?.id ?? undefined,
              });
              return { success: true, data: overlay };
            } catch (error) {
              return { success: false, error: errorMessage(error) };
            }
          },
          runAnalysis: async (payload) => {
            try {
              const run = await mobileApi.runRemoteSensingAnalysis(farmId, payload);
              return { success: true, data: run };
            } catch (error) {
              return { success: false, error: errorMessage(error) };
            }
          },
          getRunStatus: async (runId) => {
            try {
              const status = await mobileApi.getRemoteSensingRun(runId);
              return { success: true, data: status };
            } catch (error) {
              return { success: false, error: errorMessage(error) };
            }
          },
        },
      ),
  });

  if (!farmId) {
    return (
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Farm not found</Text>
          <Text style={styles.centerMessage}>Open a farm from the Farms tab to view it on the map.</Text>
        </View>
      </View>
    );
  }

  if (coreQuery.isLoading) {
    return (
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.centerMessage}>Loading map...</Text>
        </View>
      </View>
    );
  }

  if (coreQuery.isError || !coreQuery.data) {
    return (
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Farm not found</Text>
          <Text style={styles.centerMessage}>{errorMessage(coreQuery.error)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <FarmMapCard
          farm={coreQuery.data.farm}
          plot={coreQuery.data.plot}
          healthSummary={normalizeFarmHealthSummary(liveQuery.data?.farmHealth.data ?? null)}
          plotHealth={normalizePlotHealthSnapshot(liveQuery.data?.plotHealth.data ?? null)}
          remoteSummary={(liveQuery.data?.latestNdvi.data ?? null) as RemoteSensingSummary | null}
          remoteOverlay={overlayQuery.data?.overlay ?? null}
          overlayState={overlayQuery.data?.state ?? 'idle'}
          overlayError={overlayQuery.data?.error ?? null}
          isOverlayVisible={isOverlayVisible}
          isRefreshingOverlay={overlayQuery.isFetching}
          onToggleOverlay={() => {
            if (overlayQuery.isFetching) return;
            setIsOverlayVisible((current) => {
              const next = !current;
              if (next && !overlayQuery.data?.overlay) {
                setOverlayRefreshVersion((version) => version + 1);
              }
              return next;
            });
          }}
          onRefreshOverlay={() => {
            setIsOverlayVisible(true);
            setOverlayRefreshVersion((current) => current + 1);
            void liveQuery.refetch();
          }}
          height={720}
          variant="fullscreen"
          showHeader={false}
          weatherLabel={buildWeatherLabel((liveQuery.data?.latestNdvi.data ?? null) as RemoteSensingSummary | null)}
          userLocation={userLocation}
          isLocatingUser={!locationReady}
          locationError={locationError}
          onBackPress={() => router.back()}
          topInset={insets.top}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f0e7',
  },
  page: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  centerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  centerMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
