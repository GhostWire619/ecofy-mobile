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
  text: string;
}

/** Weather note for a single task today, or null if weather is irrelevant to it. */
export function weatherAdviceForTask(
  task: Pick<TaskRecord, 'task_type' | 'title'>,
  w: TodayWeather | null,
): TaskWeatherAdvice | null {
  if (!w) return null;
  switch (categorize(task)) {
    case 'spray':
      if (!w.sprayingOk) {
        const reason = w.windy ? 'Strong wind is expected' : 'Rain is likely later today';
        return {
          level: 'block',
          text: `${reason} — spray can drift or wash off. Wait for a calm, dry window.`,
        };
      }
      return null;
    case 'fertilize':
      if (w.heavyRain)
        return {
          level: 'block',
          text: 'Heavy rain today can wash fertilizer away. Apply on a drier day.',
        };
      if (w.rainLikely)
        return { level: 'caution', text: 'Light rain expected — avoid applying right before a downpour.' };
      return null;
    case 'fieldwork':
      if (w.fieldWorkHard)
        return {
          level: 'block',
          text: 'Wet or windy today — field work is hard and can damage soil. Try once it dries.',
        };
      return null;
    case 'irrigate':
      if (w.rainLikely)
        return {
          level: 'caution',
          text: 'Rain is expected today — you may not need to irrigate. Check the soil first.',
        };
      return null;
    case 'plant':
      if (w.heavyRain)
        return { level: 'caution', text: 'Heavy rain today — seeds can wash out. A lighter day is safer.' };
      return null;
    default:
      if (w.veryHot)
        return { level: 'caution', text: 'Very hot today — work in the early morning or evening and stay hydrated.' };
      return null;
  }
}

export interface WorkabilityHeadline {
  tone: 'good' | 'warn';
  text: string;
}

/** One-line "is today a good field day?" summary for the weather widget. */
export function workabilityHeadline(w: TodayWeather | null): WorkabilityHeadline | null {
  if (!w) return null;
  if (w.fieldWorkHard) return { tone: 'warn', text: 'Rain or wind expected — tough day for field work' };
  if (!w.sprayingOk) return { tone: 'warn', text: 'Rain or wind expected later — not ideal for spraying' };
  if (w.veryHot) return { tone: 'warn', text: 'Very hot today — work in the cool hours' };
  if (w.rainLikely) return { tone: 'good', text: 'Rain likely later today — good for the crop, plan dry jobs around it' };
  return { tone: 'good', text: 'Good conditions for field work today' };
}
