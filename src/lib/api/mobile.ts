import { formatISO } from 'date-fns';

import { apiRequest } from '@/lib/api/client';
import { compressForUpload } from '@/lib/utils/image';
import type {
  AchievementBadge,
  AIRecommendation,
  DiagnosisResult,
  EngagementSummary,
  FarmRecord,
  FarmHealthSummary,
  JourneyRecord,
  LogImageRecord,
  LogRecord,
  LiveWeatherResponse,
  MilestoneExpectation,
  MilestoneRecord,
  MobileBootstrapPayload,
  PlotRecord,
  PlotAIRecommendationsResponse,
  PlotHealthSnapshot,
  RemoteSensingOverlay,
  RemoteSensingRun,
  RemoteSensingRunRequest,
  RemoteSensingRunResult,
  RemoteSensingSummary,
  RemoteSensingTimeSeries,
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

function unwrapApiData<T>(
  payload:
    | T
    | { success?: boolean; data?: T }
    | { items?: T }
    | { data?: { success?: boolean; data?: T } },
): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const inner = (payload as { data?: T | { success?: boolean; data?: T } }).data;

    if (inner && typeof inner === 'object' && 'data' in inner) {
      return (inner as { data?: T }).data as T;
    }

    return inner as T;
  }

  return payload as T;
}

type ApiEnvelope<T> = T | { success?: boolean; data?: T };

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
  async googleSignIn(idToken: string, preferredLanguage: 'en' | 'sw' = 'en') {
    return apiRequest<AuthResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        id_token: idToken,
        client_app: 'ecofy-mobile',
        preferred_language: preferredLanguage,
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
  listFarms() {
    return apiRequest<ApiEnvelope<FarmRecord[]>>('/api/farms', {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<FarmRecord[]>(payload) ?? []);
  },
  listFarmJourneys(farmId: string) {
    return apiRequest<ApiEnvelope<JourneyRecord[]>>(`/api/farms/${farmId}/journeys`, {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<JourneyRecord[]>(payload) ?? []);
  },
  listFarmPlots(farmId: string) {
    return apiRequest<ApiEnvelope<PlotRecord[]>>(`/api/farms/${farmId}/plots`, {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<PlotRecord[]>(payload) ?? []);
  },
  listJourneyLogs(farmId: string, journeyId: string) {
    return apiRequest<ApiEnvelope<LogRecord[]>>(`/api/farms/${farmId}/journeys/${journeyId}/logs`, {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<LogRecord[]>(payload) ?? []);
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
  /** Upload one image file to backend storage; returns its reachable URL. */
  async uploadImage(uri: string, mimeType: string = 'image/jpeg', category: string = 'logs') {
    const form = new FormData();
    const name = uri.split('/').pop() || 'photo.jpg';
    form.append('file', { uri, name, type: mimeType } as unknown as Blob);
    form.append('category', category);
    return apiRequest<ApiEnvelope<{ url: string; path: string; mime_type?: string | null }>>(
      '/api/uploads',
      { method: 'POST', auth: true, body: form, timeoutMs: 45_000 },
    ).then((p) => unwrapApiData<{ url: string; path: string }>(p));
  },
  async syncLog(payload: { log: LogRecord; images: LogImageRecord[] }) {
    // Upload any device-local images to storage first so the server keeps a
    // real, reachable URL (not a file:// path) — works across devices + web.
    const images = await Promise.all(
      payload.images.map(async (img) => {
        const hasRemote = Boolean(img.remote_url && /^https?:\/\//.test(img.remote_url));
        if (!img.local_uri || hasRemote) return img;
        try {
          const compressed = await compressForUpload(img.local_uri, img.mime_type);
          const uploaded = await mobileApi.uploadImage(compressed.uri, compressed.mimeType, 'logs');
          if (uploaded?.url) return { ...img, remote_url: uploaded.url };
        } catch {
          // Upload failed — fall back to the local URI; server stores it as-is.
        }
        return img;
      }),
    );
    return apiRequest<{ log: LogRecord; images: LogImageRecord[] }>('/api/mobile/sync/logs', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ ...payload, images }),
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
  getWeatherByFarm(farmId: string, days = 7) {
    const qs = new URLSearchParams({ farm_id: farmId, days: String(days) });
    return apiRequest<LiveWeatherResponse>(`/api/weather?${qs.toString()}`, {
      method: 'GET',
      auth: true,
    });
  },
  getWeatherForFarm(farmId: string) {
    return apiRequest<ApiEnvelope<LiveWeatherResponse>>(`/api/weather/farm/${farmId}`, {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<LiveWeatherResponse>(payload));
  },
  fetchMarketPrices() {
    return apiRequest<{ items: Record<string, unknown>[] }>('/api/mobile/market/prices', {
      method: 'GET',
      auth: true,
    });
  },
  getPriceRegions() {
    return apiRequest<{ regions: { id: string; name: string }[] }>('/api/prices/regions', {
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
      points: {
        bucket: string;
        avg_price: number | null;
        moving_avg: number | null;
        high: number | null;
        low: number | null;
        samples: number | null;
      }[];
    }>(`/api/prices/trends?${qs.toString()}`, {
      method: 'GET',
      auth: true,
    });
  },
  getPriceCompare(params: { crop: string; regions: string[] }) {
    const qs = new URLSearchParams({ crop: params.crop, regions: params.regions.join(',') });
    return apiRequest<{
      regions: {
        region: string;
        district?: string | null;
        date?: string | null;
        mid_price?: number | null;
        min_price?: number | null;
        max_price?: number | null;
        available: boolean;
      }[];
    }>(`/api/prices/compare?${qs.toString()}`, {
      method: 'GET',
      auth: true,
    });
  },
  // ─── Crop image diagnosis ───────────────────────────────────────────────
  diagnoseCropImage(input: {
    uri: string;
    mimeType?: string;
    cropId?: string;
    farmId?: string | null;
    journeyId?: string | null;
    plotId?: string | null;
    notes?: string | null;
  }) {
    const form = new FormData();
    const name = input.uri.split('/').pop() || 'photo.jpg';
    // React Native FormData file shape
    form.append('image', {
      uri: input.uri,
      name,
      type: input.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
    form.append('crop_id', input.cropId ?? 'maize');
    if (input.farmId) form.append('farm_id', input.farmId);
    if (input.journeyId) form.append('journey_id', input.journeyId);
    if (input.plotId) form.append('plot_id', input.plotId);
    if (input.notes) form.append('notes', input.notes);

    return apiRequest<ApiEnvelope<DiagnosisResult>>('/api/observations/diagnose', {
      method: 'POST',
      auth: true,
      body: form,
      // Image upload + AI inference can take well over the default 15s.
      timeoutMs: 45_000,
    }).then((payload) => unwrapApiData<DiagnosisResult>(payload));
  },

  // ─── Engagement / gamification ──────────────────────────────────────────
  getEngagementSummary() {
    return apiRequest<ApiEnvelope<EngagementSummary>>('/api/engagement/me/summary', {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<EngagementSummary>(payload));
  },
  getAchievements() {
    return apiRequest<ApiEnvelope<AchievementBadge[]>>('/api/engagement/me/achievements', {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<AchievementBadge[]>(payload) ?? []);
  },
  getXpEvents() {
    return apiRequest<ApiEnvelope<{ event_type: string; points: number; rule_key: string; created_at: string }[]>>(
      '/api/engagement/me/events',
      { method: 'GET', auth: true },
    ).then((payload) => unwrapApiData(payload) ?? []);
  },
  getRewardEligibility() {
    return apiRequest<
      ApiEnvelope<{ event_type: string; status: string; payload: Record<string, unknown>; created_at: string }[]>
    >('/api/engagement/me/reward-eligibility', { method: 'GET', auth: true }).then(
      (payload) => unwrapApiData(payload) ?? [],
    );
  },
  sendAssistantMessage(payload: {
    farm_id?: string | null;
    journey_id?: string | null;
    message: string;
    session_id?: string | null;
    history?: { role: string; content: string }[];
    image_base64?: string | null;
    image_mime_type?: string | null;
    image_url?: string | null;
  }) {
    return apiRequest<{ reply: string; session_id: string }>('/api/mobile/assistant/messages', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
      // Conversation grounding + inference can exceed the default 15s.
      timeoutMs: 40_000,
    });
  },
  // Server-side conversation history (shared store; web uses it too).
  listChatSessions() {
    return apiRequest<
      { id: string; title: string; last_message: string | null; last_message_time: string | null; created_at: string }[]
    >('/api/chat/sessions', { method: 'GET', auth: true });
  },
  getChatMessages(sessionId: string) {
    return apiRequest<
      { id: string; session_id: string; user_id: string | null; content: string; type: string; file_url: string | null; is_ai: boolean; created_at: string }[]
    >(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, { method: 'GET', auth: true });
  },
  getRecommendationsByJourney(journeyId: string) {
    const qs = new URLSearchParams({ journey_id: journeyId });
    return apiRequest<ApiEnvelope<AIRecommendation[]>>(`/api/recommendations?${qs.toString()}`, {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<AIRecommendation[]>(payload) ?? []);
  },
  getExpectationsByMilestone(milestoneId: string) {
    const qs = new URLSearchParams({ milestone_id: milestoneId });
    return apiRequest<ApiEnvelope<MilestoneExpectation[]>>(`/api/expectations?${qs.toString()}`, {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<MilestoneExpectation[]>(payload) ?? []);
  },
  getFarmHealthSummary(farmId: string) {
    return apiRequest<ApiEnvelope<FarmHealthSummary>>(`/api/farms/${farmId}/health-summary`, {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<FarmHealthSummary>(payload));
  },
  getPlotHealthSnapshot(farmId: string, plotId: string) {
    return apiRequest<ApiEnvelope<PlotHealthSnapshot>>(
      `/api/farms/${farmId}/plots/${plotId}/health-snapshot`,
      {
        method: 'GET',
        auth: true,
      },
    ).then((payload) => unwrapApiData<PlotHealthSnapshot>(payload));
  },
  getPlotAIRecommendations(farmId: string, plotId: string) {
    return apiRequest<ApiEnvelope<PlotAIRecommendationsResponse>>(
      `/api/farms/${farmId}/plots/${plotId}/ai-recommendations`,
      {
        method: 'GET',
        auth: true,
      },
    ).then((payload) => unwrapApiData<PlotAIRecommendationsResponse>(payload));
  },
  runRemoteSensingAnalysis(farmId: string, payload: RemoteSensingRunRequest) {
    return apiRequest<ApiEnvelope<RemoteSensingRun>>(`/api/remote-sensing/farms/${farmId}/run`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    }).then((response) => unwrapApiData<RemoteSensingRun>(response));
  },
  getRemoteSensingRun(runId: string) {
    return apiRequest<ApiEnvelope<RemoteSensingRunResult>>(`/api/remote-sensing/runs/${runId}`, {
      method: 'GET',
      auth: true,
    }).then((payload) => unwrapApiData<RemoteSensingRunResult>(payload));
  },
  getRemoteSensingLatest(
    farmId: string,
    params?: { analysis_type?: string; plot_id?: string },
  ) {
    const qs = new URLSearchParams();
    if (params?.analysis_type) qs.set('analysis_type', params.analysis_type);
    if (params?.plot_id) qs.set('plot_id', params.plot_id);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<ApiEnvelope<RemoteSensingSummary>>(
      `/api/remote-sensing/farms/${farmId}/latest${suffix}`,
      {
        method: 'GET',
        auth: true,
      },
    ).then((payload) => unwrapApiData<RemoteSensingSummary>(payload));
  },
  getRemoteSensingTimeseries(
    farmId: string,
    params?: {
      analysis_type?: string;
      plot_id?: string;
      date_start?: string;
      date_end?: string;
    },
  ) {
    const qs = new URLSearchParams();
    if (params?.analysis_type) qs.set('analysis_type', params.analysis_type);
    if (params?.plot_id) qs.set('plot_id', params.plot_id);
    if (params?.date_start) qs.set('date_start', params.date_start);
    if (params?.date_end) qs.set('date_end', params.date_end);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<ApiEnvelope<RemoteSensingTimeSeries>>(
      `/api/remote-sensing/farms/${farmId}/timeseries${suffix}`,
      {
        method: 'GET',
        auth: true,
      },
    ).then((payload) => unwrapApiData<RemoteSensingTimeSeries>(payload));
  },
  getRemoteSensingOverlay(
    farmId: string,
    params?: { analysis_type?: string; plot_id?: string; image_date?: string },
  ) {
    const qs = new URLSearchParams();
    if (params?.analysis_type) qs.set('analysis_type', params.analysis_type);
    if (params?.plot_id) qs.set('plot_id', params.plot_id);
    if (params?.image_date) qs.set('image_date', params.image_date);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<ApiEnvelope<RemoteSensingOverlay>>(
      `/api/remote-sensing/farms/${farmId}/overlay${suffix}`,
      {
        method: 'GET',
        auth: true,
      },
    ).then((payload) => unwrapApiData<RemoteSensingOverlay>(payload));
  },
};
