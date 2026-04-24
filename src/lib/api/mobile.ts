import { formatISO } from 'date-fns';

import { apiRequest } from '@/lib/api/client';
import type {
  FarmRecord,
  JourneyRecord,
  LogImageRecord,
  LogRecord,
  MilestoneRecord,
  MobileBootstrapPayload,
  PlotRecord,
  StageRecord,
  TaskRecord,
  UserProfile,
  WeatherCacheRecord,
} from '@/lib/domain/types';

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
};

export const authApi = {
  async login(email: string, password: string) {
    const form = new URLSearchParams();
    form.set('username', email);
    form.set('password', password);

    return apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: form.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: false,
    });
  },
  async register(input: {
    email: string;
    password: string;
    full_name: string;
    phone_number?: string;
    location?: string;
    preferred_language: 'en' | 'sw';
  }) {
    return apiRequest<UserProfile>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        phone_number: input.phone_number ?? 'Not provided',
        location: input.location ?? 'Kenya',
      }),
      auth: false,
    });
  },
};

export const mobileApi = {
  fetchCropCatalog() {
    return apiRequest<Record<string, unknown>[] | { items?: Record<string, unknown>[] }>(
      '/api/crops?limit=100',
      {
        method: 'GET',
        auth: true,
      },
    ).then((payload) => (Array.isArray(payload) ? payload : payload.items ?? []));
  },
  bootstrap() {
    return apiRequest<MobileBootstrapPayload>('/api/mobile/bootstrap', {
      method: 'GET',
      auth: true,
    });
  },
  registerDevice(payload: {
    installation_id: string;
    expo_push_token: string;
    platform: 'android' | 'ios';
    locale: string;
  }) {
    return apiRequest<{ success: boolean }>('/api/mobile/devices', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    });
  },
  syncFarm(payload: { farm: FarmRecord; plot?: PlotRecord | null }) {
    return apiRequest<{ farm: FarmRecord; plot?: PlotRecord | null }>('/api/mobile/sync/farms', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    });
  },
  syncJourney(payload: {
    journey: JourneyRecord;
    stages: StageRecord[];
    milestones: MilestoneRecord[];
    tasks: TaskRecord[];
  }) {
    return apiRequest<MobileBootstrapPayload>('/api/mobile/sync/journeys', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    });
  },
  syncLog(payload: { log: LogRecord; images: LogImageRecord[] }) {
    return apiRequest<{ log: LogRecord; images: LogImageRecord[] }>('/api/mobile/sync/logs', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    });
  },
  completeTask(task: TaskRecord) {
    return apiRequest<{ task: TaskRecord }>(`/api/mobile/sync/tasks/${task.id}/complete`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        completed_at: task.completed_at ?? formatISO(new Date()),
        observation_notes: task.observation_notes,
        client_mutation_id: task.client_mutation_id,
      }),
    });
  },
  updateProfile(payload: {
    locale?: string;
    units?: string;
    preferred_language?: string;
  }) {
    return apiRequest<{ success: boolean; user?: UserProfile }>('/api/mobile/sync/profile', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload),
    });
  },
  fetchWeather(farmId: string) {
    return apiRequest<WeatherCacheRecord>(`/api/mobile/farms/${farmId}/weather`, {
      method: 'GET',
      auth: true,
    });
  },
  fetchMarketPrices() {
    return apiRequest<{ items: Record<string, unknown>[] }>('/api/mobile/market/prices', {
      method: 'GET',
      auth: true,
    });
  },
  getPriceRegions() {
    return apiRequest<{ regions: Array<{ id: string; name: string }> }>('/api/prices/regions', {
      method: 'GET',
      auth: true,
    });
  },
  getPriceTrends(params: {
    crop: string;
    region?: string;
    interval?: 'week' | 'month' | 'year';
    moving_window?: number;
  }) {
    const qs = new URLSearchParams({ crop: params.crop });
    if (params.region) qs.set('region', params.region);
    if (params.interval) qs.set('interval', params.interval);
    if (params.moving_window != null) qs.set('moving_window', String(params.moving_window));
    return apiRequest<{
      crop_id?: string;
      region?: string;
      interval?: string;
      points: Array<{
        bucket: string;
        avg_price: number | null;
        moving_avg: number | null;
        high: number | null;
        low: number | null;
        samples: number | null;
      }>;
    }>(`/api/prices/trends?${qs.toString()}`, {
      method: 'GET',
      auth: true,
    });
  },
  getPriceCompare(params: { crop: string; regions: string[] }) {
    const qs = new URLSearchParams({ crop: params.crop, regions: params.regions.join(',') });
    return apiRequest<{
      regions: Array<{
        region: string;
        district?: string | null;
        date?: string | null;
        mid_price?: number | null;
        min_price?: number | null;
        max_price?: number | null;
        available: boolean;
      }>;
    }>(`/api/prices/compare?${qs.toString()}`, {
      method: 'GET',
      auth: true,
    });
  },
  sendAssistantMessage(payload: {
    farm_id?: string | null;
    journey_id?: string | null;
    message: string;
  }) {
    return apiRequest<{ reply: string }>('/api/mobile/assistant/messages', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    });
  },
};
