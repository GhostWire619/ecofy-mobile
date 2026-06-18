import { mobileApi } from '@/lib/api/mobile';
import type {
  FarmHealthSummary,
  FarmRecord,
  JourneyRecord,
  LiveWeatherResponse,
  LogRecord,
  PlotRecord,
} from '@/lib/domain/types';

export type FarmWorkspaceCoreData = {
  farm: FarmRecord;
  plots: PlotRecord[];
  plot: PlotRecord | null;
  journeys: JourneyRecord[];
  journey: JourneyRecord | null;
  logs: LogRecord[];
  weather: LiveWeatherResponse | null;
};

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

export function normalizeFarmRecord(rawFarm: FarmRecord): FarmRecord {
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

export function normalizePlotRecord(rawPlot: PlotRecord): PlotRecord {
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

export function normalizeJourneyRecord(rawJourney: JourneyRecord): JourneyRecord {
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

export function normalizeLogRecord(rawLog: LogRecord): LogRecord {
  return {
    ...rawLog,
    operation_type: safeText(rawLog.operation_type, 'Field update'),
    notes: safeText(rawLog.notes, ''),
  };
}

export function normalizeFarmHealthSummary(summary: FarmHealthSummary | null): FarmHealthSummary | null {
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

export function getActiveJourney(journeys: JourneyRecord[]) {
  return (
    journeys.find((journey) => journey.status === 'active') ??
    journeys.find((journey) => journey.status === 'planned') ??
    journeys[0] ??
    null
  );
}

export function getActivePlot(plots: PlotRecord[], journey?: JourneyRecord | null) {
  if (journey?.plot_id) {
    const matched = plots.find((plot) => String(plot.id) === String(journey.plot_id));
    if (matched) {
      return matched;
    }
  }

  return plots.find((plot) => plot.is_default === 1) ?? plots[0] ?? null;
}

export async function loadFarmWorkspaceCore(farmId: string): Promise<FarmWorkspaceCoreData> {
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
  const plot = getActivePlot(plots, journey);

  const logResponses = await Promise.all(
    journeys.map(async (farmJourney) =>
      asArray<LogRecord>(
        await mobileApi.listJourneyLogs(farmId, String(farmJourney.id)).catch(() => []),
      ).map(normalizeLogRecord),
    ),
  );

  const logs = Array.from(
    new Map(logResponses.flat().map((log) => [String(log.id), log])).values(),
  ).sort((a, b) => b.date.localeCompare(a.date));

  return {
    farm,
    plots,
    plot,
    journeys,
    journey,
    logs,
    weather,
  };
}
