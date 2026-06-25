/**
 * Turn the day's weather into plain, actionable guidance for field tasks.
 *
 * This is the *advisory* layer: it never hides or reschedules a task, it just
 * tells the farmer when today is a poor day for a given job (and why), so the
 * plan stays an assistant, not a commander. Heuristics mirror the backend's
 * `compute_weather_insights` so client and server agree.
 */
import type { LiveWeatherResponse, TaskRecord } from '@/lib/domain/types';

export interface TodayWeather {
  rainLikely: boolean; // raining now, or high chance / meaningful rain today
  heavyRain: boolean; // enough rain to wash off inputs / soak soil
  windy: boolean; // > 15 km/h — spray drift territory
  strongWind: boolean; // > 25 km/h
  hot: boolean; // high >= 33°C
  veryHot: boolean; // high >= 38°C
  sprayingOk: boolean;
  fieldWorkHard: boolean;
  rainProbability: number | null;
  windKmh: number | null;
  tempHigh: number | null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Derive today's workability from the current reading + first forecast day. */
export function assessTodayWeather(weather?: LiveWeatherResponse | null): TodayWeather | null {
  if (!weather) return null;
  const current = weather.current ?? undefined;
  const today = weather.forecast?.[0] ?? undefined;
  if (!current && !today) return null;

  const windKmh = Math.max(
    num(current?.wind_speed) ?? 0,
    num(today?.wind_speed_max) ?? num(today?.wind_speed) ?? 0,
  ) || (num(current?.wind_speed) ?? num(today?.wind_speed_max) ?? null);

  const rainProbability = num(today?.precipitation_probability);
  const rainfallToday = num(today?.rainfall_mm) ?? num(today?.precipitation);
  const currentRain = num(current?.precipitation);
  const tempHigh =
    num(today?.temperature_high) ?? num(current?.temperature_high) ?? num(current?.temperature);

  const rainLikely =
    (currentRain ?? 0) > 0.2 || (rainProbability ?? 0) >= 50 || (rainfallToday ?? 0) >= 2;
  const heavyRain = (rainfallToday ?? 0) >= 10 || (currentRain ?? 0) > 5;
  const windy = (windKmh ?? 0) > 15;
  const strongWind = (windKmh ?? 0) > 25;
  const hot = (tempHigh ?? 0) >= 33;
  const veryHot = (tempHigh ?? 0) >= 38;

  return {
    rainLikely,
    heavyRain,
    windy,
    strongWind,
    hot,
    veryHot,
    sprayingOk: !windy && !rainLikely,
    fieldWorkHard: heavyRain || strongWind,
    rainProbability,
    windKmh: windKmh ?? null,
    tempHigh,
  };
}

type TaskWeatherCategory = 'spray' | 'fertilize' | 'fieldwork' | 'irrigate' | 'plant' | 'other';

function categorize(task: Pick<TaskRecord, 'task_type' | 'title'>): TaskWeatherCategory {
  const h = `${task.task_type ?? ''} ${task.title ?? ''}`.toLowerCase();
  if (/(spray|pesticide|herbicide|fungicide|insecticide|treat)/.test(h)) return 'spray';
  if (/(fertil|top.?dress|nutrient|manure|urea)/.test(h)) return 'fertilize';
  if (/(weed|till|plough|plow|cultivat|harvest|land prep|dig)/.test(h)) return 'fieldwork';
  if (/(irrigat|water)/.test(h)) return 'irrigate';
  if (/(plant|sow|transplant|seed)/.test(h)) return 'plant';
  return 'other';
}

export interface TaskWeatherAdvice {
  /** block = clearly a poor day; caution = doable but not ideal. */
  level: 'block' | 'caution';
  /** i18n key + params; resolve with t() at the call site so advice translates. */
  key: string;
  params?: Record<string, string | number>;
}

const r = (n: number | null) => (n != null ? Math.round(n) : 0);

/** Weather note for a single task today, or null if weather is irrelevant to it. */
export function weatherAdviceForTask(
  task: Pick<TaskRecord, 'task_type' | 'title'>,
  w: TodayWeather | null,
): TaskWeatherAdvice | null {
  if (!w) return null;
  switch (categorize(task)) {
    case 'spray':
      if (!w.sprayingOk)
        return w.windy
          ? { level: 'block', key: 'weatherAdvice.sprayWind', params: { wind: r(w.windKmh) } }
          : { level: 'block', key: 'weatherAdvice.sprayRain', params: { rain: r(w.rainProbability) } };
      return null;
    case 'fertilize':
      if (w.heavyRain) return { level: 'block', key: 'weatherAdvice.fertilizeHeavyRain' };
      if (w.rainLikely) return { level: 'caution', key: 'weatherAdvice.fertilizeRain' };
      return null;
    case 'fieldwork':
      if (w.fieldWorkHard) return { level: 'block', key: 'weatherAdvice.fieldworkHard' };
      return null;
    case 'irrigate':
      if (w.rainLikely)
        return { level: 'caution', key: 'weatherAdvice.irrigateRain', params: { rain: r(w.rainProbability) } };
      return null;
    case 'plant':
      if (w.heavyRain) return { level: 'caution', key: 'weatherAdvice.plantHeavyRain' };
      return null;
    default:
      if (w.veryHot) return { level: 'caution', key: 'weatherAdvice.veryHotGeneric', params: { temp: r(w.tempHigh) } };
      return null;
  }
}

export interface WorkabilityHeadline {
  tone: 'good' | 'warn';
  /** i18n key + params; resolve with t() at the call site. */
  key: string;
  params?: Record<string, string | number>;
}

/**
 * One-line "is today a good field day?" summary for the weather widget.
 *
 * Intentionally NOT trigger-happy: it only *warns* when conditions genuinely
 * make general field work hard (heavy rain / strong wind) or dangerous (extreme
 * heat). Ordinary rain is framed as good news for the crop, and spraying-specific
 * caution is left to the per-task note (so a farmer with no spray task today
 * isn't told the day is "bad"). Every variant carries the live number so the
 * line visibly changes day to day.
 */
export function workabilityHeadline(w: TodayWeather | null): WorkabilityHeadline | null {
  if (!w) return null;
  if (w.fieldWorkHard) return { tone: 'warn', key: 'weatherAdvice.toughFieldwork', params: { wind: r(w.windKmh) } };
  if (w.veryHot) return { tone: 'warn', key: 'weatherAdvice.veryHot', params: { temp: r(w.tempHigh) } };
  if (w.rainLikely)
    return w.rainProbability != null
      ? { tone: 'good', key: 'weatherAdvice.rainLikely', params: { rain: r(w.rainProbability) } }
      : { tone: 'good', key: 'weatherAdvice.rainLikelyPlain' };
  if (w.hot) return { tone: 'good', key: 'weatherAdvice.warmGood', params: { temp: r(w.tempHigh) } };
  return { tone: 'good', key: 'weatherAdvice.goodDay' };
}
