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
  FarmHealthSummary,
  FarmRecord,
  PlotHealthSnapshot,
  PlotRecord,
  RemoteSensingSummary,
} from '@/lib/domain/types';
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

function coerceNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function serializeBoundary(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return null;
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeFarmRecord(rawFarm: FarmRecord): FarmRecord {
  const elevation = coerceNumber(rawFarm.elevation, Number.NaN);
  return {
    ...rawFarm,
    name: safeText(rawFarm.name, 'Untitled farm'),
    region: safeText(rawFarm.region, 'Unknown region'),
    country: safeText(rawFarm.country, 'Unknown country'),
    district: safeText(rawFarm.district, ''),
    formatted_address: safeText(rawFarm.formatted_address, ''),
    soil_type: safeText(rawFarm.soil_type, ''),
    size_hectares: coerceNumber(rawFarm.size_hectares, 0),
    latitude: coerceNumber(rawFarm.latitude, 0),
    longitude: coerceNumber(rawFarm.longitude, 0),
    elevation: Number.isFinite(elevation) ? elevation : null,
    irrigation_type: rawFarm.irrigation_type === 'irrigated' ? 'irrigated' : 'rain-fed',
  };
}

function normalizePlotRecord(rawPlot: PlotRecord): PlotRecord {
  const extraPlot = rawPlot as PlotRecord & {
    field_boundary?: unknown;
    boundary?: unknown;
  };

  return {
    ...rawPlot,
    name: safeText(rawPlot.name, 'Main field'),
    plot_code: safeText(rawPlot.plot_code) || null,
    soil_type: safeText(rawPlot.soil_type) || null,
    field_boundary_json:
      serializeBoundary(rawPlot.field_boundary_json) ??
      serializeBoundary(extraPlot.field_boundary) ??
      serializeBoundary(extraPlot.boundary),
    size_hectares: Number.isFinite(coerceNumber(rawPlot.size_hectares, Number.NaN))
      ? coerceNumber(rawPlot.size_hectares, Number.NaN)
      : null,
    center_latitude: Number.isFinite(coerceNumber(rawPlot.center_latitude, Number.NaN))
      ? coerceNumber(rawPlot.center_latitude, Number.NaN)
      : null,
    center_longitude: Number.isFinite(coerceNumber(rawPlot.center_longitude, Number.NaN))
      ? coerceNumber(rawPlot.center_longitude, Number.NaN)
      : null,
    is_default: rawPlot.is_default === 1 ? 1 : 0,
  };
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

function normalizeFarmHealthSummary(summary: FarmHealthSummary | null): FarmHealthSummary | null {
  if (!summary || typeof summary !== 'object') {
    return null;
  }

  return {
    ...summary,
    farm_name: safeText(summary.farm_name, 'Farm'),
    overall_risk_score: safeNumber(summary.overall_risk_score, 0),
    overall_risk_level: summary.overall_risk_level ?? 'LOW',
    plots_count: safeNumber(summary.plots_count, 0),
    risk_distribution: {
      LOW: safeNumber(summary.risk_distribution?.LOW, 0),
      MODERATE: safeNumber(summary.risk_distribution?.MODERATE, 0),
      HIGH: safeNumber(summary.risk_distribution?.HIGH, 0),
      CRITICAL: safeNumber(summary.risk_distribution?.CRITICAL, 0),
    },
    plots: asArray(summary.plots).map((plot) => ({
      plot_id: safeText(plot?.plot_id, ''),
      plot_name: safeText(plot?.plot_name, 'Field'),
      risk_score: safeNumber(plot?.risk_score, 0),
      risk_level: plot?.risk_level ?? 'LOW',
      crop: safeText(plot?.crop) || null,
      ndvi: typeof plot?.ndvi === 'number' ? plot.ndvi : null,
    })),
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
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) {
          return;
        }

        if (!permission.granted) {
          setLocationError('Location permission was not granted.');
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
    queryFn: async () => {
      const farms = asArray<FarmRecord>(await mobileApi.listFarms()).map(normalizeFarmRecord);
      const farm = farms.find((item) => String(item.id) === String(farmId));
      if (!farm) {
        throw new Error('Farm not found.');
      }

      const plots = asArray<PlotRecord>(await mobileApi.listFarmPlots(farmId).catch(() => [])).map(normalizePlotRecord);
      return {
        farm,
        plot: plots.find((plot) => plot.is_default === 1) ?? plots[0] ?? null,
      };
    },
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
