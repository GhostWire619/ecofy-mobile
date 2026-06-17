import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { mobileApi } from '@/lib/api/mobile';
import { env } from '@/lib/constants/env';
import type {
  AIRecommendation,
  FarmHealthSummary,
  FarmRecord,
  JourneyRecord,
  LiveWeatherResponse,
  LogRecord,
  PlotAIRecommendationsResponse,
  PlotHealthSnapshot,
  PlotRecord,
  RemoteSensingSummary,
  RemoteSensingTimeSeries,
} from '@/lib/domain/types';
import { AddLogSheet } from '@/features/logbook/screen';
import { theme } from '@/lib/theme';

type OverviewMode = 'overview' | 'logs' | 'risks';

type AsyncData<T> = {
  data: T | null;
  error: string | null;
};

type RecommendationView = {
  id: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  source: string;
};

type SignalTone = 'good' | 'warn' | 'bad' | 'neutral';

type RiskCardItem = {
  key: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  icon: keyof typeof Ionicons.glyphMap;
  riskType: 'weather' | 'satellite' | 'operations' | 'scouting' | 'generic';
  mitigations: string[];
};

type WorkspaceCoreData = {
  farm: FarmRecord;
  plot: PlotRecord | null;
  journey: JourneyRecord | null;
  logs: LogRecord[];
  weather: LiveWeatherResponse | null;
};

type WorkspaceLiveData = {
  recommendations: AsyncData<AIRecommendation[]>;
  farmHealth: AsyncData<FarmHealthSummary>;
  plotHealth: AsyncData<PlotHealthSnapshot>;
  plotAi: AsyncData<PlotAIRecommendationsResponse>;
  latestNdvi: AsyncData<RemoteSensingSummary>;
  ndviTimeseries: AsyncData<RemoteSensingTimeSeries>;
};

type FarmWorkspaceScreenProps = {
  farmId: string;
  onClose?: () => void;
};

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

function fmtDate(value?: string | null, formatString = 'MMM d') {
  if (!value) {
    return 'Not set';
  }

  try {
    return format(parseISO(value), formatString);
  } catch {
    return value;
  }
}

function formatValue(value: number | null | undefined, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return value.toFixed(digits);
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

function riskMeta(level?: string | null) {
  switch (level?.toLowerCase()) {
    case 'low':
    case 'healthy':
      return { label: 'Healthy', color: '#1f8f54', bg: '#e5f7ec' };
    case 'moderate':
    case 'medium':
      return { label: 'Watch', color: '#b86b00', bg: '#fff1d9' };
    case 'high':
    case 'warning':
      return { label: 'At risk', color: '#d25a14', bg: '#fff0e7' };
    case 'critical':
      return { label: 'Critical', color: '#b93821', bg: '#ffe8e2' };
    default:
      return { label: 'Stable', color: theme.colors.textMuted, bg: '#f0f1eb' };
  }
}

function getActiveJourney(journeys: JourneyRecord[]) {
  return (
    journeys.find((journey) => journey.status === 'active') ??
    journeys.find((journey) => journey.status === 'planned') ??
    journeys[0] ??
    null
  );
}

function normalizeFarmRecord(rawFarm: FarmRecord): FarmRecord {
  return {
    ...rawFarm,
    name: safeText(rawFarm.name, 'Untitled farm'),
    region: safeText(rawFarm.region, 'Unknown region'),
    country: safeText(rawFarm.country, 'Unknown country'),
    district: safeText(rawFarm.district, ''),
    formatted_address: safeText(rawFarm.formatted_address, ''),
    soil_type: safeText(rawFarm.soil_type, ''),
    size_hectares: safeNumber(rawFarm.size_hectares, 0),
    latitude: safeNumber(rawFarm.latitude, 0),
    longitude: safeNumber(rawFarm.longitude, 0),
    elevation: typeof rawFarm.elevation === 'number' && Number.isFinite(rawFarm.elevation) ? rawFarm.elevation : null,
    irrigation_type: rawFarm.irrigation_type === 'irrigated' ? 'irrigated' : 'rain-fed',
  };
}

function normalizePlotRecord(rawPlot: PlotRecord): PlotRecord {
  return {
    ...rawPlot,
    name: safeText(rawPlot.name, 'Main field'),
    plot_code: safeText(rawPlot.plot_code) || null,
    soil_type: safeText(rawPlot.soil_type) || null,
    field_boundary_json: safeText(rawPlot.field_boundary_json) || null,
    size_hectares: typeof rawPlot.size_hectares === 'number' && Number.isFinite(rawPlot.size_hectares) ? rawPlot.size_hectares : null,
    center_latitude: typeof rawPlot.center_latitude === 'number' && Number.isFinite(rawPlot.center_latitude) ? rawPlot.center_latitude : null,
    center_longitude: typeof rawPlot.center_longitude === 'number' && Number.isFinite(rawPlot.center_longitude) ? rawPlot.center_longitude : null,
    is_default: rawPlot.is_default === 1 ? 1 : 0,
  };
}

function normalizeJourneyRecord(rawJourney: JourneyRecord): JourneyRecord {
  return {
    ...rawJourney,
    crop_name: safeText(rawJourney.crop_name, 'No crop'),
    common_name: safeText(rawJourney.common_name, safeText(rawJourney.crop_name, 'No crop')),
    local_name: safeText(rawJourney.local_name, ''),
    variety: safeText(rawJourney.variety, ''),
    current_stage: safeText(rawJourney.current_stage, ''),
    progress_percentage: safeNumber(rawJourney.progress_percentage, 0),
  };
}

function normalizeLogRecord(rawLog: LogRecord): LogRecord {
  return {
    ...rawLog,
    operation_type: safeText(rawLog.operation_type, 'Field update'),
    notes: safeText(rawLog.notes, ''),
  };
}

const LOG_OP_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Scouting: 'eye-outline',
  Spraying: 'water-outline',
  Fertilizing: 'leaf-outline',
  Irrigation: 'rainy-outline',
  Weeding: 'cut-outline',
  Tilling: 'construct-outline',
  Harvesting: 'basket-outline',
};

function buildStaticMapUrl(lat: number, lon: number, sizeHectares: number): string {
  const token = env.mapboxAccessToken;
  if (!token || !lat || !lon) return '';
  const zoom =
    sizeHectares > 200 ? 12
    : sizeHectares > 50 ? 13
    : sizeHectares > 10 ? 14
    : sizeHectares > 2 ? 15
    : 16;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${lon},${lat},${zoom}/600x300@2x?access_token=${token}`;
}

function buildHeroDescriptors(coreData: WorkspaceCoreData) {
  return [
    safeText(coreData.journey?.crop_name, '').toLowerCase(),
    safeText(coreData.farm.region, '').toLowerCase(),
    safeText(coreData.journey?.current_stage, '').toLowerCase(),
  ].filter(Boolean) as string[];
}

function toRecommendationView(recommendation: AIRecommendation): RecommendationView {
  return {
    id: safeText(recommendation.id, `rec-${Math.random().toString(36).slice(2, 8)}`),
    title: safeText(recommendation.title, 'Recommendation'),
    message: safeText(recommendation.message, 'No details available yet.'),
    priority:
      recommendation.priority === 'critical' ||
      recommendation.priority === 'high' ||
      recommendation.priority === 'medium' ||
      recommendation.priority === 'low'
        ? recommendation.priority
        : 'medium',
    source: safeText(recommendation.source, 'system'),
  };
}

function getWeatherSnapshot(weather: LiveWeatherResponse | null) {
  if (!weather?.current) {
    return null;
  }

  const forecast = asArray(weather.forecast);
  return {
    temperature: weather.current.temperature ?? null,
    humidity: weather.current.humidity ?? weather.summary?.avg_humidity ?? null,
    windSpeed:
      weather.current.wind_speed ??
      forecast.find((entry) => typeof entry.wind_speed === 'number')?.wind_speed ??
      null,
    precipitation: weather.current.precipitation ?? weather.summary?.total_rainfall_mm ?? null,
    conditions: weather.current.conditions ?? null,
    forecast,
  };
}

function buildWeatherNotes(input: {
  weather: ReturnType<typeof getWeatherSnapshot>;
  plotHealth: PlotHealthSnapshot | null;
  plotAi: PlotAIRecommendationsResponse | null;
}) {
  const notes: string[] = [];

  if (input.weather?.conditions || typeof input.weather?.precipitation === 'number') {
    notes.push(
      (input.weather.precipitation ?? 0) >= 5
        ? 'Plan around rainfall today and protect any field work windows.'
        : 'Good conditions for field work. Make the most of today!',
    );
  }

  const firstAiSummary = Object.values(input.plotAi?.recommendations ?? {}).find(
    (recommendation) =>
      Boolean(recommendation?.summary) ||
      (Array.isArray(recommendation?.actions) && recommendation.actions.length > 0),
  );

  if (firstAiSummary?.summary) {
    notes.push(safeText(firstAiSummary.summary));
  } else if (input.plotHealth?.actions[0]?.message) {
    notes.push(safeText(input.plotHealth.actions[0].message));
  }

  if (input.weather?.forecast[0]?.conditions) {
    notes.push(
      `${safeText(input.weather.forecast[0].conditions, 'Weather change')} expected next. Plan field activity around the next weather shift.`,
    );
  }

  return Array.from(new Set(notes.map((note) => safeText(note)).filter(Boolean))).slice(0, 3);
}

function pickPrimaryMessage(input: {
  plotHealth: PlotHealthSnapshot | null;
  recommendations: RecommendationView[];
  hasJourney: boolean;
}) {
  if (!input.hasJourney) {
    return 'Start a crop journey to unlock field health and NDVI monitoring.';
  }

  if (input.plotHealth?.actions[0]?.message) {
    return input.plotHealth.actions[0].message;
  }

  if (input.recommendations[0]?.message) {
    return input.recommendations[0].message;
  }

  return 'Your field has issues that need quick action. See what to do below.';
}

function latestNdviValue(
  latest: RemoteSensingSummary | null,
  timeseries: RemoteSensingTimeSeries | null,
) {
  const lastPoint = [...asArray(timeseries?.series)].reverse().find((point) => typeof point?.value === 'number');

  if (typeof latest?.value === 'number') {
    return latest.value;
  }

  if (typeof latest?.mean_value === 'number') {
    return latest.mean_value;
  }

  return lastPoint?.value ?? null;
}

function latestNdviDate(
  latest: RemoteSensingSummary | null,
  timeseries: RemoteSensingTimeSeries | null,
) {
  const lastPoint = [...asArray(timeseries?.series)].reverse().find((point) => point?.date);
  return latest?.image_date ?? lastPoint?.date ?? null;
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

function normalizePlotAiRecommendations(data: PlotAIRecommendationsResponse | null): PlotAIRecommendationsResponse | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const entries = Object.entries(data.recommendations ?? {}).map(([key, value]) => [
    key,
    {
      summary: safeText(value?.summary, ''),
      actions: asArray(value?.actions).map((item) => safeText(item)).filter(Boolean),
    },
  ]);

  return {
    ...data,
    recommendations: Object.fromEntries(entries),
    generated_at: safeText(data.generated_at, ''),
    cached: Boolean(data.cached),
  };
}

function statusVisual(level?: string | null) {
  switch ((level ?? '').toUpperCase()) {
    case 'LOW':
      return {
        label: 'Healthy',
        color: '#1f8f54',
        dot: '#1f8f54',
        bg: '#e9f7ef',
        border: '#cfe7d8',
        icon: 'shield-checkmark-outline' as const,
      };
    case 'MODERATE':
      return {
        label: 'Watch',
        color: '#b86b00',
        dot: '#d18a00',
        bg: '#fff6df',
        border: '#f2dfaa',
        icon: 'shield-half-outline' as const,
      };
    case 'HIGH':
      return {
        label: 'At risk',
        color: '#e46a11',
        dot: '#ff7d1a',
        bg: '#fff6ed',
        border: '#f3d7b2',
        icon: 'shield-outline' as const,
      };
    case 'CRITICAL':
      return {
        label: 'Critical',
        color: '#c73a28',
        dot: '#d94a37',
        bg: '#fff0ec',
        border: '#f1c4bb',
        icon: 'warning-outline' as const,
      };
    default:
      return {
        label: 'Stable',
        color: theme.colors.textMuted,
        dot: '#c1b8a5',
        bg: '#f5f2ea',
        border: '#e7e0d1',
        icon: 'shield-outline' as const,
      };
  }
}

function severityVisual(level: RiskCardItem['severity']) {
  switch (level) {
    case 'low':
      return { label: 'Low', bg: '#e5f7ec', color: '#1f8f54' };
    case 'high':
      return { label: 'High', bg: '#ffe7e4', color: '#d43c2e' };
    default:
      return { label: 'Medium', bg: '#fff1d9', color: '#c17a00' };
  }
}

function buildSatelliteSignal(snapshot: PlotHealthSnapshot | null): { message: string; tone: SignalTone } {
  const sat = snapshot?.breakdown?.satellite;
  if (!sat) {
    return { message: 'Satellite scan has not arrived yet.', tone: 'neutral' };
  }
  if (sat.status === 'healthy' || (typeof sat.ndvi === 'number' && sat.ndvi >= 0.6)) {
    return { message: 'Satellite view looks healthy across the field.', tone: 'good' };
  }
  if (sat.trend === 'down' || sat.status === 'warning' || sat.status === 'critical') {
    return { message: 'Satellite detects crop stress in your field. Some areas show reduced vegetation.', tone: 'bad' };
  }
  if (typeof sat.ndvi === 'number') {
    return { message: `Vegetation is uneven. NDVI is ${sat.ndvi.toFixed(2)} and needs attention.`, tone: 'warn' };
  }
  return { message: 'Satellite monitoring is still warming up for this field.', tone: 'neutral' };
}

function buildWeatherSignal(snapshot: PlotHealthSnapshot | null) {
  const weather = snapshot?.breakdown?.weather;
  if (!weather) {
    return { message: 'Weather outlook is still loading.', tone: 'neutral' as SignalTone };
  }
  if (weather.threats.length > 0) {
    return {
      message: `${weather.threats.join('. ')}.`,
      tone: weather.score > 50 ? 'bad' as SignalTone : 'warn' as SignalTone,
    };
  }
  if (weather.score < 20) {
    return { message: 'Conditions look calm for field work today.', tone: 'good' as SignalTone };
  }
  return { message: 'Weather conditions need a quick check before field work.', tone: 'neutral' as SignalTone };
}

function buildOperationsSignal(snapshot: PlotHealthSnapshot | null) {
  const ops = snapshot?.breakdown?.operations;
  if (!ops) {
    return { message: 'Field work status is still syncing.', tone: 'neutral' as SignalTone };
  }
  if (ops.overdue_count > 0) {
    return {
      message: `You have ${ops.overdue_count} overdue task${ops.overdue_count > 1 ? 's' : ''}. Catching up soon will keep your crop on track.`,
      tone: 'bad' as SignalTone,
    };
  }
  if (ops.pending_count > 0) {
    return {
      message: `${ops.pending_count} task${ops.pending_count > 1 ? 's are' : ' is'} coming up next.`,
      tone: 'neutral' as SignalTone,
    };
  }
  return { message: 'Your field work is up to date.', tone: 'good' as SignalTone };
}

function buildScoutingSignal(snapshot: PlotHealthSnapshot | null) {
  const scouting = snapshot?.breakdown?.scouting;
  if (!scouting) {
    return { message: 'Field visit data is not available yet.', tone: 'neutral' as SignalTone };
  }
  if (scouting.days_since_last == null) {
    return { message: 'No field visits recorded yet. A quick walk can catch issues early.', tone: 'warn' as SignalTone };
  }
  if (scouting.days_since_last <= 7) {
    return { message: `Field was checked ${scouting.days_since_last} day${scouting.days_since_last === 1 ? '' : 's'} ago.`, tone: 'good' as SignalTone };
  }
  if (scouting.days_since_last <= 14) {
    return { message: `Last field visit was ${scouting.days_since_last} days ago. Another check is due soon.`, tone: 'neutral' as SignalTone };
  }
  return { message: `It has been ${scouting.days_since_last} days since the last field visit.`, tone: 'bad' as SignalTone };
}

function aiActionsForRisk(plotAi: PlotAIRecommendationsResponse | null, riskType: RiskCardItem['riskType']) {
  if (!plotAi?.recommendations) {
    return [] as string[];
  }

  const candidates: string[] = [];
  const summaries: string[] = [];
  const recommendationEntries = Object.entries(plotAi.recommendations);

  for (const [key, value] of recommendationEntries) {
    const normalizedKey = key.toLowerCase();
    const normalizedSummary = safeText(value?.summary);
    const normalizedActions = asArray(value?.actions).map((item) => safeText(item)).filter(Boolean);

    if (
      (riskType === 'weather' &&
        (normalizedKey.includes('weather') ||
          normalizedKey.includes('irrig') ||
          normalizedKey.includes('rain') ||
          normalizedKey.includes('moist'))) ||
      (riskType === 'satellite' &&
        (normalizedKey.includes('satellite') ||
          normalizedKey.includes('crop') ||
          normalizedKey.includes('ndvi') ||
          normalizedKey.includes('health') ||
          normalizedKey.includes('canopy'))) ||
      (riskType === 'operations' &&
        (normalizedKey.includes('task') ||
          normalizedKey.includes('operation') ||
          normalizedKey.includes('work') ||
          normalizedKey.includes('overdue'))) ||
      (riskType === 'scouting' &&
        (normalizedKey.includes('visit') ||
          normalizedKey.includes('scout') ||
          normalizedKey.includes('inspection'))) ||
      riskType === 'generic'
    ) {
      if (normalizedSummary) {
        summaries.push(normalizedSummary);
      }
      candidates.push(...normalizedActions);
    }
  }

  const matched = Array.from(new Set([...candidates, ...summaries])).filter(Boolean);
  if (matched.length > 0) {
    return matched.slice(0, 4);
  }

  return Array.from(
    new Set(
      recommendationEntries.flatMap(([, value]) => {
        const normalizedSummary = safeText(value?.summary);
        const normalizedActions = asArray(value?.actions).map((item) => safeText(item)).filter(Boolean);
        return normalizedSummary ? [normalizedSummary, ...normalizedActions] : normalizedActions;
      }),
    ),
  ).slice(0, 4);
}

function buildRiskCards(snapshot: PlotHealthSnapshot | null): RiskCardItem[] {
  if (!snapshot) {
    return [];
  }

  const items: RiskCardItem[] = [];
  const weatherThreats = asArray(snapshot.breakdown?.weather?.threats);
  if ((snapshot.breakdown?.weather?.score ?? 0) > 20 || weatherThreats.length > 0) {
    items.push({
      key: 'weather',
      title: 'Weather Risk',
      description: weatherThreats.join('. ') || 'Weather conditions need attention for your next field operations.',
      severity: (snapshot.breakdown?.weather?.score ?? 0) > 50 ? 'high' : (snapshot.breakdown?.weather?.score ?? 0) > 25 ? 'medium' : 'low',
      icon: 'cloud-outline',
      riskType: 'weather',
      mitigations: [
        'Monitor local weather forecasts for upcoming rain patterns',
        'Check soil moisture manually before proceeding with planting',
        'Ensure drainage channels are clear in case of sudden heavy rainfall',
      ],
    });
  }

  if ((snapshot.breakdown?.satellite?.score ?? 0) > 30) {
    items.push({
      key: 'satellite',
      title: 'Crop Health Risk',
      description:
        snapshot.breakdown?.satellite?.trend === 'down'
          ? 'Satellite data suggests your crop canopy may be under stress.'
          : 'Satellite detects crop stress in your field. Some areas show reduced vegetation.',
      severity: (snapshot.breakdown?.satellite?.score ?? 0) > 60 ? 'high' : 'medium',
      icon: 'flower-outline',
      riskType: 'satellite',
      mitigations: [
        'Visit the field to check for crop emergence or soil issues',
        'Verify if the low NDVI is due to late planting or land preparation',
        'Take photos of the plot to document current ground conditions',
      ],
    });
  }

  if ((snapshot.breakdown?.operations?.overdue_count ?? 0) > 0) {
    items.push({
      key: 'operations',
      title: 'Overdue Field Work',
      description: `You have ${snapshot.breakdown.operations.overdue_count} overdue task${snapshot.breakdown.operations.overdue_count > 1 ? 's' : ''}. Delayed actions can affect crop growth.`,
      severity: snapshot.breakdown.operations.overdue_count > 3 ? 'high' : 'medium',
      icon: 'construct-outline',
      riskType: 'operations',
      mitigations: [
        'Review upcoming field tasks and complete the most urgent one first',
        'Mark finished work so the farm plan stays accurate',
        'Set aside time for delayed field operations this week',
      ],
    });
  }

  if ((snapshot.breakdown?.scouting?.score ?? 0) > 30) {
    items.push({
      key: 'scouting',
      title: 'Field Visit Gap',
      description:
        snapshot.breakdown?.scouting?.days_since_last == null
          ? 'No field visits recorded yet. A quick walk can catch issues early.'
          : `Last recorded field visit was ${snapshot.breakdown.scouting.days_since_last} days ago.`,
      severity: (snapshot.breakdown?.scouting?.days_since_last ?? 0) > 21 ? 'high' : 'medium',
      icon: 'eye-outline',
      riskType: 'scouting',
      mitigations: [
        'Walk the field this week and check uneven growth areas',
        'Inspect leaf undersides and crop stands for pests or damage',
        'Record observations so the next recommendation is more accurate',
      ],
    });
  }

  asArray(snapshot.actions).forEach((action, index) => {
    if (!items.some((item) => item.key === action.type || item.title.toLowerCase().includes(action.type))) {
      items.push({
        key: `generic-${index}`,
        title: 'Field Advisory',
        description: safeText(action.message, 'Field conditions need attention.'),
        severity: 'medium',
        icon: 'bulb-outline',
        riskType: 'generic',
        mitigations: [
          'Follow the latest farm recommendation',
          'Check the field conditions on the ground',
        ],
      });
    }
  });

  return items;
}

function Badge({
  label,
  backgroundColor,
  color,
}: {
  label: string;
  backgroundColor: string;
  color: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function MetricPill({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function NoticeStrip({
  icon,
  text,
  highlighted = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  highlighted?: boolean;
}) {
  return (
    <View style={[styles.noticeStrip, highlighted ? styles.noticeStripHighlight : null]}>
      <Ionicons
        name={icon}
        size={16}
        color={highlighted ? '#1c8f67' : theme.colors.info}
        style={styles.noticeIcon}
      />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function OverviewChart({ series }: { series: RemoteSensingTimeSeries['series'] }) {
  const points = asArray(series).filter((point) => typeof point?.value === 'number');

  if (points.length === 0) {
    return (
      <View style={styles.ndviEmpty}>
        <Text style={styles.ndviEmptyText}>No NDVI observations yet.</Text>
      </View>
    );
  }

  const width = 300;
  const height = 150;
  const padding = 18;
  let minValue = Math.min(...points.map((point) => point.value ?? 0), 0.15);
  let maxValue = Math.max(...points.map((point) => point.value ?? 0), 0.85);

  if (maxValue - minValue < 0.12) {
    minValue = Math.max(0, minValue - 0.06);
    maxValue = Math.min(1, maxValue + 0.06);
  }

  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const valueRange = maxValue - minValue || 1;
  const yForValue = (value: number) =>
    height - padding - ((value - minValue) / valueRange) * (height - padding * 2);
  const path = points
    .map((point, index) => {
      const x = padding + xStep * index;
      const y = yForValue(point.value ?? minValue);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const latestPoint = points[points.length - 1];
  const latestX = padding + xStep * (points.length - 1);
  const latestY = yForValue(latestPoint.value ?? minValue);

  return (
    <Svg width="100%" height={180} viewBox={`0 0 ${width} ${height}`}>
      {[0.2, 0.5, 0.8].map((mark) => (
        <Line
          key={mark}
          x1={padding}
          y1={yForValue(mark)}
          x2={width - padding}
          y2={yForValue(mark)}
          stroke="#d9ddd1"
          strokeDasharray="5 5"
          strokeWidth={1}
        />
      ))}
      {points.map((point, index) => {
        const x = padding + xStep * index;
        const y = yForValue(point.value ?? minValue);
        return (
          <Circle
            key={`${point.date}-${index}`}
            cx={x}
            cy={y}
            r={index === points.length - 1 ? 4.5 : 3}
            fill={index === points.length - 1 ? theme.colors.primary : '#7da98b'}
          />
        );
      })}
      <Path d={path} fill="none" stroke={theme.colors.primary} strokeWidth={3.5} strokeLinecap="round" />
      <Circle cx={latestX} cy={latestY} r={8} fill="rgba(31, 106, 58, 0.14)" />
    </Svg>
  );
}

function SignalCard({
  icon,
  label,
  message,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  message: string;
  tone: SignalTone;
}) {
  const palette =
    tone === 'good'
      ? { bg: '#ebfbf4', border: '#cfe9df', icon: '#1c8f67' }
      : tone === 'warn'
        ? { bg: '#fff8e8', border: '#f1dfb2', icon: '#d08b00' }
        : tone === 'bad'
          ? { bg: '#fff4ed', border: '#f0d2b6', icon: '#df6b19' }
          : { bg: '#f7f4ed', border: '#e5ded0', icon: theme.colors.textMuted };

  return (
    <View style={[styles.signalCard, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={styles.signalIconWrap}>
        <Ionicons name={icon} size={16} color={palette.icon} />
      </View>
      <View style={styles.signalCopy}>
        <Text style={styles.signalLabel}>{label}</Text>
        <Text style={styles.signalMessage}>{message}</Text>
      </View>
    </View>
  );
}

function RiskActionCard({
  item,
  aiActions,
  aiLoading,
}: {
  item: RiskCardItem;
  aiActions: string[];
  aiLoading: boolean;
}) {
  const severity = severityVisual(item.severity);
  const hasAi = !aiLoading && aiActions.length > 0;

  return (
    <View style={styles.riskCard}>
      <View style={styles.riskCardHeader}>
        <View style={styles.riskCardTitleRow}>
          <View style={styles.riskCardIconWrap}>
            <Ionicons name={item.icon} size={16} color={theme.colors.text} />
          </View>
          <Text style={styles.riskCardTitle}>{item.title}</Text>
          {hasAi ? (
            <View style={styles.riskAiBadge}>
              <Ionicons name="sparkles-outline" size={12} color="#8559d3" />
              <Text style={styles.riskAiBadgeText}>AI</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.severityBadge, { backgroundColor: severity.bg }]}>
          <Text style={[styles.severityBadgeText, { color: severity.color }]}>{severity.label}</Text>
        </View>
      </View>

      <Text style={styles.riskCardDescription}>{item.description}</Text>

      <View style={styles.whatToDoCard}>
        <View style={styles.whatToDoHeader}>
          <Ionicons name="bulb-outline" size={14} color="#1c8f67" />
          <Text style={styles.whatToDoTitle}>What to do</Text>
        </View>
        {aiLoading ? (
          <View style={styles.aiLoadingRow}>
            <Ionicons name="sparkles-outline" size={14} color="#8559d3" />
            <Text style={styles.aiLoadingText}>AI is analysing your field...</Text>
          </View>
        ) : (
          (hasAi ? aiActions : item.mitigations).map((action, index) => (
            <View key={`${item.key}-${index}`} style={styles.whatToDoRow}>
              <Ionicons name={hasAi ? 'sparkles-outline' : 'arrow-forward'} size={12} color={hasAi ? '#8559d3' : '#1c8f67'} />
              <Text style={styles.whatToDoText}>{action}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

export function FarmWorkspaceScreen({ farmId, onClose }: FarmWorkspaceScreenProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<OverviewMode>('overview');
  const [selectedRiskPlotId, setSelectedRiskPlotId] = useState<string | null>(null);
  const [showAddLog, setShowAddLog] = useState(false);

  const coreQuery = useQuery({
    queryKey: ['farm-workspace-online-core', farmId],
    enabled: Boolean(farmId),
    queryFn: async (): Promise<WorkspaceCoreData> => {
      const farms = asArray<FarmRecord>(await mobileApi.listFarms()).map(normalizeFarmRecord);
      const farm = farms.find((item) => String(item.id) === String(farmId));
      if (!farm) {
        throw new Error('Farm not found.');
      }

      const [plotsResponse, journeysResponse, weather] = await Promise.all([
        mobileApi.listFarmPlots(farmId).catch(() => []),
        mobileApi.listFarmJourneys(farmId).catch(() => []),
        mobileApi.getWeatherForFarm(farmId).catch(() => null),
      ]);

      const plots = asArray<PlotRecord>(plotsResponse).map(normalizePlotRecord);
      const journeys = asArray<JourneyRecord>(journeysResponse).map(normalizeJourneyRecord);
      const journey = getActiveJourney(journeys);
      const logs = journey
        ? asArray<LogRecord>(await mobileApi.listJourneyLogs(farmId, journey.id).catch(() => [])).map(normalizeLogRecord)
        : [];

      return {
        farm,
        plot: plots[0] ?? null,
        journey,
        logs,
        weather,
      };
    },
  });

  const liveQuery = useQuery({
    queryKey: [
      'farm-workspace-online-live',
      farmId,
      coreQuery.data?.journey?.id ?? 'none',
      coreQuery.data?.plot?.id ?? 'none',
    ],
    enabled: Boolean(farmId && coreQuery.data),
    queryFn: async (): Promise<WorkspaceLiveData> => {
      const plotId = coreQuery.data?.plot?.id;
      const journeyId = coreQuery.data?.journey?.id;

      return {
        recommendations: journeyId
          ? await capture(mobileApi.getRecommendationsByJourney(journeyId))
          : { data: null, error: null },
        farmHealth: await capture(mobileApi.getFarmHealthSummary(farmId)),
        plotHealth: plotId
          ? await capture(mobileApi.getPlotHealthSnapshot(farmId, plotId))
          : { data: null, error: null },
        plotAi: plotId
          ? await capture(mobileApi.getPlotAIRecommendations(farmId, plotId))
          : { data: null, error: null },
        latestNdvi: await capture(
          mobileApi.getRemoteSensingLatest(farmId, {
            analysis_type: 'ndvi',
            plot_id: plotId,
          }),
        ),
        ndviTimeseries: await capture(
          mobileApi.getRemoteSensingTimeseries(farmId, {
            analysis_type: 'ndvi',
            plot_id: plotId,
          }),
        ),
      };
    },
  });

  const selectedPlotId = selectedRiskPlotId ?? coreQuery.data?.plot?.id ?? null;
  const selectedPlotDetailQuery = useQuery({
    queryKey: ['farm-workspace-risk-detail', farmId, selectedPlotId],
    enabled: Boolean(farmId && selectedPlotId && mode === 'risks'),
    queryFn: async () => ({
      snapshot: selectedPlotId
        ? await capture(mobileApi.getPlotHealthSnapshot(farmId, selectedPlotId))
        : { data: null, error: null },
      plotAi: selectedPlotId
        ? await capture(mobileApi.getPlotAIRecommendations(farmId, selectedPlotId))
        : { data: null, error: null },
    }),
  });

  const closeScreen = () => {
    if (onClose) {
      onClose();
      return;
    }

    router.back();
  };

  async function handleLogSaved() {
    setShowAddLog(false);
    await queryClient.invalidateQueries({ queryKey: ['farm-workspace-online-core', farmId] });
  }

  const combinedRecommendations = useMemo(
    () => asArray(liveQuery.data?.recommendations.data).map(toRecommendationView),
    [liveQuery.data?.recommendations.data],
  );

  const weather = getWeatherSnapshot(coreQuery.data?.weather ?? null);
  const plotHealth = normalizePlotHealthSnapshot(liveQuery.data?.plotHealth.data ?? null);
  const farmHealth = normalizeFarmHealthSummary(liveQuery.data?.farmHealth.data ?? null);
  const plotAi = normalizePlotAiRecommendations(liveQuery.data?.plotAi.data ?? null);
  const selectedPlotHealth = normalizePlotHealthSnapshot(
    selectedRiskPlotId
      ? selectedPlotDetailQuery.data?.snapshot.data ?? null
      : liveQuery.data?.plotHealth.data ?? null,
  );
  const selectedPlotAi = normalizePlotAiRecommendations(
    selectedRiskPlotId
      ? selectedPlotDetailQuery.data?.plotAi.data ?? null
      : liveQuery.data?.plotAi.data ?? null,
  );
  const primaryRisk = riskMeta(
    farmHealth?.overall_risk_level ?? plotHealth?.risk_level ?? null,
  );
  const primaryMessage = pickPrimaryMessage({
    plotHealth,
    recommendations: combinedRecommendations,
    hasJourney: Boolean(coreQuery.data?.journey),
  });
  const weatherNotes = buildWeatherNotes({
    weather,
    plotHealth,
    plotAi,
  });
  const ndviValue = latestNdviValue(
    liveQuery.data?.latestNdvi.data ?? null,
    liveQuery.data?.ndviTimeseries.data ?? null,
  );
  const ndviDate = latestNdviDate(
    liveQuery.data?.latestNdvi.data ?? null,
    liveQuery.data?.ndviTimeseries.data ?? null,
  );
  const ndviObservations = asArray(liveQuery.data?.ndviTimeseries.data?.series).filter(
    (point) => typeof point.value === 'number',
  ).length;
  const monitoringUnavailable = Boolean(
    liveQuery.data &&
      [
        liveQuery.data.farmHealth.error,
        liveQuery.data.plotHealth.error,
        liveQuery.data.latestNdvi.error,
        liveQuery.data.ndviTimeseries.error,
      ].some(Boolean),
  );
  const farmStatus = statusVisual(farmHealth?.overall_risk_level ?? plotHealth?.risk_level ?? null);
  const fallbackRiskPlot = coreQuery.data?.plot
    ? {
        plot_id: coreQuery.data.plot.id,
        plot_name: coreQuery.data.plot.name,
        risk_score: plotHealth?.risk_score ?? 0,
        risk_level: plotHealth?.risk_level ?? 'HIGH',
        crop: coreQuery.data.journey?.crop_name ?? null,
        ndvi: liveQuery.data?.latestNdvi.data?.value ?? liveQuery.data?.latestNdvi.data?.mean_value ?? null,
      }
    : null;
  const selectedPlotStatus = statusVisual(selectedPlotHealth?.risk_level ?? plotHealth?.risk_level ?? null);
  const riskFieldRows = farmHealth?.plots?.length
    ? [...farmHealth.plots].sort((a, b) => b.risk_score - a.risk_score)
    : fallbackRiskPlot
      ? [fallbackRiskPlot]
      : [];
  const riskCards = buildRiskCards(selectedPlotHealth);
  const satelliteSignal = buildSatelliteSignal(selectedPlotHealth);
  const weatherSignal = buildWeatherSignal(selectedPlotHealth);
  const operationsSignal = buildOperationsSignal(selectedPlotHealth);
  const scoutingSignal = buildScoutingSignal(selectedPlotHealth);
  const isAiLoading = selectedRiskPlotId ? selectedPlotDetailQuery.isFetching : liveQuery.isFetching;
  const farmLogs = [...(coreQuery.data?.logs ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const logFarmOptions =
    coreQuery.data?.journey && coreQuery.data?.farm
      ? [{ id: String(coreQuery.data.farm.id), name: coreQuery.data.farm.name, journeyId: coreQuery.data.journey.id }]
      : [];

  if (!farmId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.sheet}>
          <View style={styles.centerState}>
            <Text style={styles.centerTitle}>Farm not found</Text>
            <Text style={styles.centerMessage}>Open a farm from the Farms tab to view its dashboard.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (coreQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.sheet}>
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.centerMessage}>Loading farm dashboard...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (coreQuery.isError || !coreQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.sheet}>
          <View style={styles.centerState}>
            <Text style={styles.centerTitle}>Farm not found</Text>
            <Text style={styles.centerMessage}>{errorMessage(coreQuery.error)}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={closeScreen}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const heroDescriptors = buildHeroDescriptors(coreQuery.data);
  const heroMapUrl = buildStaticMapUrl(
    coreQuery.data.farm.latitude,
    coreQuery.data.farm.longitude,
    coreQuery.data.farm.size_hectares ?? 1,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.screenTitle}>{coreQuery.data.farm.name}</Text>
              <Text style={styles.screenSubtitle}>Farm dashboard</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={closeScreen}
              style={styles.closeButton}
              testID="farm-workspace-close"
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>

          <ImageBackground
            source={heroMapUrl ? { uri: heroMapUrl } : undefined}
            style={styles.heroCard}
            imageStyle={{ borderRadius: 24 }}
            resizeMode="cover"
          >
            <View style={[StyleSheet.absoluteFillObject, styles.heroOverlay]} />
            <View style={styles.heroGlowOne} />
            <View style={styles.heroGlowTwo} />
            <View style={styles.heroBadgeRow}>
              <Badge label="AI FARM DESK" backgroundColor="rgba(11, 34, 20, 0.36)" color="#dfeadf" />
              <Badge
                label={primaryRisk.label === 'Healthy' ? 'ON TRACK' : 'ACTION NEEDED'}
                backgroundColor="rgba(242, 183, 70, 0.22)"
                color="#f6de9c"
              />
            </View>
            <Text style={styles.heroTitle}>{coreQuery.data.farm.name}</Text>
            <View style={styles.heroDescriptorRow}>
              {heroDescriptors.map((descriptor) => (
                <Text key={descriptor} style={styles.heroDescriptor}>
                  {descriptor}
                </Text>
              ))}
            </View>
            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaCard}>
                <Text style={styles.heroMetaLabel}>PLANTING</Text>
                <Text style={styles.heroMetaValue}>{fmtDate(coreQuery.data.journey?.planting_date)}</Text>
              </View>
              <View style={styles.heroMetaCard}>
                <Text style={styles.heroMetaLabel}>HARVEST</Text>
                <Text style={styles.heroMetaValue}>
                  {fmtDate(coreQuery.data.journey?.expected_harvest_date)}
                </Text>
              </View>
            </View>
          </ImageBackground>

          <View style={styles.segmentedRow}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setMode('overview')}
              style={[styles.segmentButton, mode === 'overview' ? styles.segmentButtonActive : null]}
              testID="farm-workspace-tab-overview"
            >
              <Ionicons
                name="clipboard-outline"
                size={15}
                color={mode === 'overview' ? theme.colors.text : theme.colors.textMuted}
              />
              <Text style={[styles.segmentButtonText, mode === 'overview' ? styles.segmentButtonTextActive : null]}>
                Overview
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setMode('logs')}
              style={[styles.segmentButton, mode === 'logs' ? styles.segmentButtonActive : null]}
              testID="farm-workspace-tab-logs"
            >
              <Ionicons
                name="journal-outline"
                size={15}
                color={mode === 'logs' ? theme.colors.text : theme.colors.textMuted}
              />
              <Text style={[styles.segmentButtonText, mode === 'logs' ? styles.segmentButtonTextActive : null]}>
                Logs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setMode('risks')}
              style={[styles.segmentButton, mode === 'risks' ? styles.segmentButtonActive : null]}
              testID="farm-workspace-tab-risks"
            >
              <Ionicons
                name="shield-outline"
                size={15}
                color={mode === 'risks' ? theme.colors.text : theme.colors.textMuted}
              />
              <Text style={[styles.segmentButtonText, mode === 'risks' ? styles.segmentButtonTextActive : null]}>
                Risks
              </Text>
            </TouchableOpacity>
          </View>

          {!coreQuery.data.journey ? (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                No active journey yet. Start a crop journey to unlock live field monitoring.
              </Text>
            </View>
          ) : null}

          {monitoringUnavailable ? (
            <View style={styles.monitoringBanner}>
              <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.textMuted} />
              <Text style={styles.monitoringBannerText}>
                Live monitoring is unavailable right now. The dashboard is showing what the online farm API returned.
              </Text>
            </View>
          ) : null}

          {mode === 'overview' ? (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#f26b1d" />
                    <Text style={styles.sectionTitle}>Field Status</Text>
                  </View>
                  <Badge
                    label={primaryRisk.label}
                    backgroundColor={primaryRisk.bg}
                    color={primaryRisk.color}
                  />
                </View>
                <Text style={styles.sectionDescription}>{primaryMessage}</Text>
                <View style={styles.fieldStatusRow}>
                  <View style={styles.fieldStatusDot} />
                  <Text style={styles.fieldStatusLabel}>{plotHealth?.plot_name ?? coreQuery.data.plot?.name ?? 'Main Field'}</Text>
                  <Text style={styles.fieldStatusMeta}>{coreQuery.data.journey?.crop_name ?? 'No crop'}</Text>
                  <Text style={[styles.fieldStatusMeta, { color: primaryRisk.color }]}>{primaryRisk.label}</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" onPress={() => setMode('risks')} style={styles.ctaButton}>
                  <Text style={styles.ctaButtonText}>View risks & details</Text>
                  <Ionicons name="arrow-forward" size={16} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="partly-sunny-outline" size={18} color={theme.colors.info} />
                  <Text style={styles.sectionTitle}>Weather & Your Field</Text>
                </View>
                <View style={styles.metricsRow}>
                  <MetricPill
                    value={`${formatValue(weather?.temperature, 1)}°C`}
                    label={weather?.conditions ?? 'No live weather'}
                  />
                  <MetricPill value={`${formatValue(weather?.humidity)}%`} label="Humidity" />
                  <MetricPill
                    value={
                      typeof weather?.windSpeed === 'number'
                        ? `${Math.round(weather.windSpeed)}`
                        : `${formatValue(weather?.precipitation)}`
                    }
                    label={typeof weather?.windSpeed === 'number' ? 'Wind km/h' : 'Rain mm'}
                  />
                </View>
                <View style={styles.noticeStack}>
                  {weatherNotes.length > 0 ? (
                    weatherNotes.map((note, index) => (
                      <NoticeStrip
                        key={`${note}-${index}`}
                        icon={index === 0 ? 'sparkles-outline' : index === 1 ? 'water-outline' : 'rainy-outline'}
                        text={note}
                        highlighted={index === 0}
                      />
                    ))
                  ) : (
                    <NoticeStrip
                      icon="leaf-outline"
                      text="Live weather guidance will appear here as soon as the farm API responds."
                      highlighted
                    />
                  )}
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="leaf-outline" size={18} color={theme.colors.success} />
                    <Text style={styles.sectionTitle}>NDVI Trend</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => {
                      void liveQuery.refetch();
                      void coreQuery.refetch();
                    }}
                    style={styles.refreshButton}
                    testID="farm-ndvi-refresh"
                  >
                    <Ionicons name="refresh-outline" size={16} color={theme.colors.text} />
                    <Text style={styles.refreshButtonText}>
                      {liveQuery.isFetching || coreQuery.isFetching ? 'Refreshing' : 'Refresh'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {coreQuery.data.plot?.field_boundary_json ? (
                  <>
                    <View style={styles.ndviHeaderRow}>
                      <Text style={styles.ndviHeading}>90-day NDVI trend</Text>
                      <Text style={styles.ndviObservationText}>{ndviObservations} observations</Text>
                    </View>
                    <View style={styles.chartCard}>
                      <OverviewChart series={liveQuery.data?.ndviTimeseries.data?.series ?? []} />
                    </View>
                    <View style={styles.ndviFooterCard}>
                      <Text style={styles.ndviFooterDate}>{fmtDate(ndviDate, 'MMM d, yyyy')}</Text>
                      <Text style={styles.ndviFooterValue}>NDVI: {formatValue(ndviValue, 2)}</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.ndviEmpty}>
                    <Text style={styles.ndviEmptyText}>
                      Map this farm boundary to unlock NDVI trend updates.
                    </Text>
                  </View>
                )}
              </View>

              {coreQuery.data.logs.length > 0 ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="journal-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.sectionTitle}>Recent Logs</Text>
                  </View>
                  <View style={styles.logStack}>
                    {coreQuery.data.logs.slice(0, 5).map((log) => (
                      <View key={log.id} style={styles.logCard}>
                        <View style={styles.logIconWrap}>
                          <Ionicons
                            name={LOG_OP_ICONS[log.operation_type] ?? 'document-outline'}
                            size={18}
                            color={theme.colors.primary}
                          />
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={styles.logCardTop}>
                            <Text style={styles.logTitle}>{log.operation_type}</Text>
                            <Text style={styles.logDate}>{fmtDate(log.date)}</Text>
                          </View>
                          {log.notes ? (
                            <Text style={styles.logNotes} numberOfLines={2}>{log.notes}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          ) : mode === 'logs' ? (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="journal-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.sectionTitle}>Farm Logs</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={!coreQuery.data.journey}
                    onPress={() => setShowAddLog(true)}
                    style={[styles.refreshButton, !coreQuery.data.journey ? styles.disabledButton : null]}
                    testID="farm-logs-add"
                  >
                    <Ionicons name="add" size={16} color={theme.colors.text} />
                    <Text style={styles.refreshButtonText}>Add log</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sectionDescription}>
                  {coreQuery.data.journey
                    ? `${farmLogs.length} field log${farmLogs.length === 1 ? '' : 's'} for ${coreQuery.data.farm.name}.`
                    : 'Start a crop journey on this farm before adding field logs.'}
                </Text>
              </View>

              {farmLogs.length > 0 ? (
                <View style={styles.logStack}>
                  {farmLogs.map((log) => (
                    <View key={log.id} style={styles.logCard}>
                      <View style={styles.logIconWrap}>
                        <Ionicons
                          name={LOG_OP_ICONS[log.operation_type] ?? 'document-outline'}
                          size={18}
                          color={theme.colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={styles.logCardTop}>
                          <Text style={styles.logTitle}>{coreQuery.data.farm.name}</Text>
                          <Text style={styles.logDate}>{fmtDate(log.date)}</Text>
                        </View>
                        <View style={styles.logBadge}>
                          <Ionicons
                            name={LOG_OP_ICONS[log.operation_type] ?? 'document-outline'}
                            size={11}
                            color={theme.colors.primary}
                          />
                          <Text style={styles.logBadgeText}>{log.operation_type}</Text>
                        </View>
                        {log.notes ? (
                          <Text style={styles.logNotes} numberOfLines={2}>{log.notes}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.sectionCard}>
                  <View style={styles.emptyLogState}>
                    <Ionicons name="journal-outline" size={34} color={theme.colors.textMuted} />
                    <Text style={styles.emptyLogTitle}>No farm logs yet</Text>
                    <Text style={styles.emptyLogText}>
                      Add scouting, spraying, irrigation, or harvest notes for this farm here.
                    </Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <>
              {selectedRiskPlotId ? (
                <>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setSelectedRiskPlotId(null)}
                    style={styles.backLink}
                    testID="farm-risk-back"
                  >
                    <Ionicons name="arrow-back" size={16} color={theme.colors.text} />
                    <Text style={styles.backLinkText}>Back</Text>
                  </TouchableOpacity>

                  <View style={[styles.sectionCard, { borderColor: selectedPlotStatus.border, backgroundColor: selectedPlotStatus.bg }]}>
                    <View style={styles.riskSummaryHeader}>
                      <View style={[styles.riskSummaryIconWrap, { backgroundColor: '#fff8f2' }]}>
                        <Ionicons name={selectedPlotStatus.icon} size={18} color={selectedPlotStatus.color} />
                      </View>
                      <View style={styles.riskSummaryCopy}>
                        <Text style={styles.riskSummaryTitle}>{selectedPlotHealth?.plot_name ?? 'Main Field'}</Text>
                        <Text style={[styles.riskSummaryStatus, { color: selectedPlotStatus.color }]}>{selectedPlotStatus.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionDescription}>
                      {selectedPlotHealth?.journey?.crop_name ?? 'No crop planted'}
                    </Text>
                  </View>

                  <View style={styles.riskBlock}>
                    <Text style={styles.riskBlockLabel}>WHAT&apos;S HAPPENING</Text>
                    <View style={styles.riskSignalStack}>
                      <SignalCard icon="flower-outline" label="Crop health from satellite" message={satelliteSignal.message} tone={satelliteSignal.tone} />
                      <SignalCard icon="cloud-outline" label="Weather outlook" message={weatherSignal.message} tone={weatherSignal.tone} />
                      <SignalCard icon="construct-outline" label="Your field work" message={operationsSignal.message} tone={operationsSignal.tone} />
                      <SignalCard icon="eye-outline" label="Field visits" message={scoutingSignal.message} tone={scoutingSignal.tone} />
                    </View>
                  </View>

                  {isAiLoading ? (
                    <View style={styles.aiBanner}>
                      <View style={styles.aiBannerIconWrap}>
                        <Ionicons name="sparkles-outline" size={18} color="#8559d3" />
                      </View>
                      <View style={styles.aiBannerCopy}>
                        <Text style={styles.aiBannerTitle}>AI is analysing your field...</Text>
                        <Text style={styles.aiBannerText}>Personalised recommendations will appear in each risk card below.</Text>
                      </View>
                      <Text style={styles.aiBannerDots}>•••</Text>
                    </View>
                  ) : null}

                  <View style={styles.riskBlock}>
                    <Text style={styles.riskBlockLabel}>RISKS & WHAT TO DO</Text>
                    <View style={styles.riskCardsStack}>
                      {riskCards.length > 0 ? (
                        riskCards.map((item) => (
                          <RiskActionCard
                            key={item.key}
                            item={item}
                            aiActions={aiActionsForRisk(selectedPlotAi, item.riskType)}
                            aiLoading={isAiLoading}
                          />
                        ))
                      ) : (
                        <View style={styles.emptyRiskCard}>
                          <Ionicons name="checkmark-circle-outline" size={24} color={theme.colors.success} />
                          <Text style={styles.emptyRiskTitle}>No active risks</Text>
                          <Text style={styles.emptyRiskText}>This field does not have any urgent risk cards right now.</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={[styles.sectionCard, { borderColor: farmStatus.border, backgroundColor: farmStatus.bg }]}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.riskSummaryHeader}>
                        <View style={[styles.riskSummaryIconWrap, { backgroundColor: '#fff8f2' }]}>
                          <Ionicons name={farmStatus.icon} size={18} color={farmStatus.color} />
                        </View>
                        <View style={styles.riskSummaryCopy}>
                          <Text style={styles.riskSummaryTitle}>{coreQuery.data.farm.name}</Text>
                          <Text style={[styles.riskSummaryStatus, { color: farmStatus.color }]}>{farmStatus.label}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => {
                          void liveQuery.refetch();
                          void selectedPlotDetailQuery.refetch();
                        }}
                        style={styles.iconRefreshButton}
                        testID="farm-risks-refresh"
                      >
                        <Ionicons name="refresh-outline" size={16} color={theme.colors.text} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.sectionDescription}>{primaryMessage}</Text>
                  </View>

                  <View style={styles.riskBlock}>
                    <Text style={styles.riskBlockLabel}>YOUR FIELDS ({riskFieldRows.length})</Text>
                    <View style={styles.fieldRowsStack}>
                      {riskFieldRows.length > 0 ? (
                        riskFieldRows.map((plot) => {
                          const plotStatus = statusVisual(plot.risk_level);
                          const healthLabel =
                            typeof plot.ndvi === 'number'
                              ? plot.ndvi >= 0.6
                                ? 'Health: good'
                                : plot.ndvi >= 0.4
                                  ? 'Health: moderate'
                                  : 'Health: low'
                              : 'Health: low';
                          return (
                            <TouchableOpacity
                              key={plot.plot_id}
                              accessibilityRole="button"
                              onPress={() => setSelectedRiskPlotId(plot.plot_id)}
                              style={styles.fieldRowCard}
                              testID={`farm-risk-plot-${plot.plot_id}`}
                            >
                              <View style={[styles.fieldRowDot, { backgroundColor: plotStatus.dot }]} />
                              <View style={styles.fieldRowCopy}>
                                <Text style={styles.fieldRowTitle}>{plot.plot_name}</Text>
                                <Text style={styles.fieldRowMeta}>{plot.crop || 'No crop planted'} · {healthLabel}</Text>
                              </View>
                              <View style={[styles.fieldRowBadge, { backgroundColor: plotStatus.bg, borderColor: plotStatus.border }]}>
                                <Text style={[styles.fieldRowBadgeText, { color: plotStatus.color }]}>{plotStatus.label}</Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        <Text style={styles.sectionDescription}>
                          Risk signals will appear here once the live monitoring endpoints respond.
                        </Text>
                      )}
                    </View>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
        {showAddLog ? (
          <AddLogSheet
            farmOptions={logFarmOptions}
            lockedFarmId={String(coreQuery.data.farm.id)}
            onClose={() => setShowAddLog(false)}
            onSaved={() => void handleLogSaved()}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#f4f0e7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    gap: 14,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
  },
  screenSubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  closeButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e1ddcf',
    backgroundColor: 'rgba(255,255,255,0.74)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  heroCard: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#1d5d3a',
    padding: 18,
    gap: 12,
  },
  heroOverlay: {
    backgroundColor: 'rgba(8, 28, 14, 0.62)',
    borderRadius: 24,
  },
  heroGlowOne: {
    position: 'absolute',
    top: -40,
    right: -10,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(153, 214, 178, 0.14)',
  },
  heroGlowTwo: {
    position: 'absolute',
    bottom: -50,
    left: -20,
    width: 220,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(17, 40, 26, 0.34)',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#f4f4ec',
  },
  heroDescriptorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroDescriptor: {
    color: 'rgba(243, 243, 234, 0.88)',
    fontSize: 13,
    textTransform: 'lowercase',
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetaCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  heroMetaLabel: {
    fontSize: 10,
    letterSpacing: 1.4,
    color: 'rgba(240, 244, 236, 0.72)',
  },
  heroMetaValue: {
    fontSize: 23,
    fontWeight: '700',
    color: '#f8f8f1',
  },
  segmentedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  segmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#ece9de',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  segmentButtonActive: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e1d5',
  },
  segmentButtonText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  segmentButtonTextActive: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  infoBanner: {
    borderRadius: 20,
    backgroundColor: '#fff7e1',
    borderWidth: 1,
    borderColor: '#f4dca4',
    padding: 14,
  },
  infoBannerText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7b5b17',
  },
  monitoringBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#ecebe3',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  monitoringBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMuted,
  },
  sectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#eadfcb',
    backgroundColor: '#fbfaf6',
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 23,
    fontWeight: '700',
    color: theme.colors.text,
  },
  sectionDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.textMuted,
  },
  fieldStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  fieldStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f26b1d',
  },
  fieldStatusLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  fieldStatusMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd8c8',
    backgroundColor: '#fffefc',
    paddingVertical: 12,
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricPill: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8e2d7',
    backgroundColor: '#fffdfa',
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.text,
  },
  metricLabel: {
    fontSize: 12,
    color: theme.colors.text,
  },
  noticeStack: {
    gap: 10,
  },
  noticeStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e7e2d8',
    backgroundColor: '#fffdfa',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeStripHighlight: {
    borderColor: '#cfe9df',
    backgroundColor: '#ebfbf4',
  },
  noticeIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e1ddcf',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fffefb',
  },
  disabledButton: {
    opacity: 0.5,
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  ndviHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  ndviHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  ndviObservationText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  chartCard: {
    borderTopWidth: 1,
    borderTopColor: '#efe9de',
    paddingTop: 12,
    minHeight: 180,
  },
  ndviFooterCard: {
    alignSelf: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e7e2d8',
    backgroundColor: '#fffdfa',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  ndviFooterDate: {
    fontSize: 14,
    color: theme.colors.text,
  },
  ndviFooterValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  ndviEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#f6f4ed',
    minHeight: 160,
    padding: 16,
  },
  ndviEmptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  riskSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  riskSummaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskSummaryCopy: {
    flex: 1,
    gap: 2,
  },
  riskSummaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  riskSummaryStatus: {
    fontSize: 15,
    fontWeight: '700',
  },
  iconRefreshButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffdfa',
    borderWidth: 1,
    borderColor: '#e1ddcf',
  },
  riskBlock: {
    gap: 10,
  },
  riskBlockLabel: {
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  fieldRowsStack: {
    gap: 10,
  },
  fieldRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadfcb',
    backgroundColor: '#fbfaf6',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fieldRowDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  fieldRowCopy: {
    flex: 1,
    gap: 2,
  },
  fieldRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  fieldRowMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  fieldRowBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fieldRowBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  riskSignalStack: {
    gap: 10,
  },
  signalCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  signalIconWrap: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
  },
  signalCopy: {
    flex: 1,
    gap: 4,
  },
  signalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  signalMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMuted,
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e3d6ff',
    backgroundColor: '#f5eeff',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  aiBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe5ff',
  },
  aiBannerCopy: {
    flex: 1,
    gap: 2,
  },
  aiBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  aiBannerText: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  aiBannerDots: {
    fontSize: 18,
    color: '#8559d3',
    letterSpacing: 2,
  },
  riskCardsStack: {
    gap: 12,
  },
  riskCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#eadfcb',
    backgroundColor: '#fbfaf6',
    padding: 16,
    gap: 12,
  },
  riskCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  riskCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexWrap: 'wrap',
  },
  riskCardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3efe8',
  },
  riskCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  riskAiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#efe5ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  riskAiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8559d3',
  },
  severityBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  severityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  riskCardDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMuted,
  },
  whatToDoCard: {
    borderRadius: 18,
    backgroundColor: '#eef8f3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  whatToDoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  whatToDoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c8f67',
  },
  whatToDoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  whatToDoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text,
  },
  aiLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiLoadingText: {
    fontSize: 13,
    color: '#8559d3',
    fontWeight: '600',
  },
  emptyRiskCard: {
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d3e7db',
    backgroundColor: '#eef8f3',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyRiskTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  emptyRiskText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  emptyLogState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 26,
    paddingHorizontal: 18,
  },
  emptyLogTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  emptyLogText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  logStack: { gap: 10 },
  logCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8e2d7',
    backgroundColor: '#fffdfa',
    padding: 12,
  },
  logIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f0f7f2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#d8ead2',
  },
  logCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  logTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
  },
  logDate: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  logBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#d8ead2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#f0f7f2',
  },
  logBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  logNotes: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 17,
  },
  watchlistStack: {
    gap: 10,
  },
  watchlistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  watchlistDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f26b1d',
    marginTop: 7,
  },
  watchlistText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
  actionCard: {
    borderRadius: 18,
    backgroundColor: '#f2f7f0',
    padding: 14,
    gap: 6,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  actionMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMuted,
  },
});
