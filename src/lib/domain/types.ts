export type Locale = 'en' | 'sw';
export type SyncStatus = 'synced' | 'pending' | 'failed' | 'conflict';

export interface SyncFields {
  id: string;
  client_mutation_id: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
  last_synced_at: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  preferred_language: Locale;
  location: string | null;
  created_at: string;
}

export interface SessionRecord {
  user_id: string;
  locale: Locale;
  units: 'metric' | 'imperial';
  onboarding_complete: number;
  last_bootstrap_at: string | null;
  updated_at: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthState {
  isReady: boolean;
  isAuthenticated: boolean;
  user: UserProfile | null;
}

export interface FarmRecord extends SyncFields {
  name: string;
  latitude: number;
  longitude: number;
  region: string;
  country: string;
  district: string | null;
  formatted_address: string | null;
  size_hectares: number;
  soil_type: string | null;
  irrigation_type: 'rain-fed' | 'irrigated';
  elevation: number | null;
}

export interface PlotRecord extends SyncFields {
  farm_id: string;
  name: string;
  plot_code: string | null;
  size_hectares: number | null;
  soil_type: string | null;
  field_boundary_json: string | null;
  center_latitude: number | null;
  center_longitude: number | null;
  is_default: number;
}

export interface JourneyRecord extends SyncFields {
  farm_id: string;
  plot_id: string | null;
  crop_id: string;
  crop_name: string;
  common_name: string;
  local_name: string | null;
  variety: string | null;
  planting_date: string;
  expected_harvest_date: string;
  status: 'planned' | 'active' | 'paused' | 'failed' | 'harvested';
  progress_percentage: number;
  current_stage: string | null;
  predicted_yield: number | null;
  actual_yield: number | null;
}

export interface StageRecord extends SyncFields {
  journey_id: string;
  name: string;
  order_index: number;
  start_day: number;
  end_day: number;
  start_date: string | null;
  end_date: string | null;
  status: 'upcoming' | 'active' | 'completed';
  description: string | null;
  risk_level: 'low' | 'medium' | 'high';
  color: string | null;
  visual_indicators_json: string;
  critical_factors_json: string;
}

export interface MilestoneRecord extends SyncFields {
  journey_id: string;
  stage_id: string | null;
  week_number: number;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'missed';
  xp_reward: number;
}

export interface TaskRecord extends SyncFields {
  journey_id: string;
  milestone_id: string | null;
  plot_id: string | null;
  title: string;
  description: string;
  task_type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'completed' | 'skipped';
  is_required: number;
  sequence_order: number;
  due_date: string | null;
  completed_at: string | null;
  estimated_duration_minutes: number | null;
  xp_value: number;
  instructions_json: string;
  observation_notes: string | null;
}

export interface LogRecord extends SyncFields {
  farm_id: string;
  plot_id: string | null;
  journey_id: string | null;
  operation_type: string;
  date: string;
  cost: number | null;
  notes: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  snapshot_url: string | null;
}

export interface LogImageRecord extends SyncFields {
  log_id: string;
  local_uri: string;
  remote_url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  taken_at: string | null;
}

export interface RecommendationRecord extends SyncFields {
  journey_id: string;
  milestone_id: string | null;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  status: 'pending' | 'dismissed' | 'applied';
  trigger_data_json: string;
  action_taken: string | null;
  expires_at: string | null;
}

export interface WeatherCacheRecord {
  farm_id: string;
  summary_json: string;
  fetched_at: string;
}

export interface PriceSnapshotRecord {
  id: string;
  commodity: string;
  market_name: string;
  region: string;
  price: number;
  currency: string;
  unit: string;
  trend: 'rising' | 'falling' | 'stable';
  captured_at: string;
}

export interface OfflineMapRegionRecord {
  id: string;
  farm_id: string;
  name: string;
  style_url: string;
  min_zoom: number;
  max_zoom: number;
  bounds_json: string;
  status: 'idle' | 'downloading' | 'downloaded' | 'failed';
  progress: number;
  updated_at: string;
}

export interface AssistantMessageRecord {
  id: string;
  farm_id: string | null;
  journey_id: string | null;
  role: 'user' | 'assistant';
  text: string;
  image_local_uri: string | null;
  delivery_status: 'local' | 'sent' | 'failed';
  created_at: string;
}

export interface SyncQueueRecord {
  id: string;
  entity_type: string;
  entity_id: string;
  job_type: string;
  payload_json: string;
  status: 'queued' | 'processing' | 'failed';
  attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncConflictRecord {
  id: string;
  entity_type: string;
  entity_id: string;
  local_payload_json: string;
  remote_payload_json: string;
  message: string;
  created_at: string;
}

export interface CropCatalogItem {
  id: string;
  name: string;
  common_name: string;
  local_name: string | null;
  variety: string | null;
  maturity_days_max: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  water_needs: 'low' | 'medium' | 'high';
  market_demand: 'low' | 'medium' | 'high';
  suitability_score: number;
  expected_yield_label: string;
}

// ─── Gamification / engagement ──────────────────────────────────────────────

export interface AchievementBadge {
  achievement_key: string | null;
  name: string | null;
  description: string | null;
  icon: string | null;
  badge_tier: string | null;
  awarded_at: string | null;
}

export interface RewardEligibility {
  event_type: string;
  status: string;
  payload: Record<string, unknown>;
  created_at: string | null;
}

export interface EngagementSummary {
  total_xp: number;
  level: number;
  xp_into_level: number;
  xp_for_next_level: number;
  progress_to_next: number; // 0..1
  daily_streak: number;
  daily_streak_best: number;
  daily_last_earned_on: string | null;
  daily_grace_remaining: number;
  weekly_streak: number;
  weekly_streak_best: number;
  achievements: AchievementBadge[];
  reward_eligibility: RewardEligibility[];
  updated_at: string;
}

export interface DiagnosisAction {
  name?: string | null;
  action_en?: string | null;
  action_sw?: string | null;
  efficacy?: number | null;
  cost_tzs_per_ha_min?: number | null;
  cost_tzs_per_ha_max?: number | null;
}

export interface DiagnosisResult {
  detected: boolean;
  threat_id: string | null;
  label: string | null;
  name_en: string | null;
  name_sw: string | null;
  severity: 'low' | 'medium' | 'high' | 'unknown';
  confidence: number; // 0..1
  description: string | null;
  recommended_actions: DiagnosisAction[];
  estimated_control_cost_tzs: number | null;
  provider: string;
  model_version: string;
  diagnosed_at: string;
  image_url?: string;
  observation_id?: string | null;
}

export interface MobileBootstrapPayload {
  session: SessionRecord | null;
  user: UserProfile;
  farms: FarmRecord[];
  plots: PlotRecord[];
  journeys: JourneyRecord[];
  stages: StageRecord[];
  milestones: MilestoneRecord[];
  tasks: TaskRecord[];
  logs: LogRecord[];
  log_images: LogImageRecord[];
  recommendations: RecommendationRecord[];
  weather_cache: WeatherCacheRecord[];
  price_snapshots: PriceSnapshotRecord[];
  engagement?: EngagementSummary;
}

export interface LiveWeatherResponse {
  location?: {
    lat: number;
    lng: number;
    name?: string;
    farm_id?: string;
  };
  farm?: {
    id: string;
    name: string;
    region: string;
    latitude: number;
    longitude: number;
  };
  current: {
    temperature: number;
    temperature_high?: number;
    temperature_low?: number;
    humidity?: number;
    precipitation?: number;
    conditions?: string;
    wind_speed?: number;
    feels_like?: number;
  } | null;
  forecast: {
    date: string;
    temperature_high?: number;
    temperature_low?: number;
    temperature_avg?: number;
    humidity?: number;
    precipitation?: number;
    precipitation_probability?: number;
    rainfall_mm?: number;
    conditions?: string;
    wind_speed?: number;
    wind_speed_max?: number;
    is_forecast?: boolean;
    confidence?: number | null;
  }[];
  summary?: {
    period_days?: number;
    avg_temperature?: number;
    total_rainfall_mm?: number;
    avg_humidity?: number;
  };
}

export interface AIRecommendation {
  id: string;
  crop_journey_id: string;
  weekly_milestone_id: string | null;
  type:
    | 'weather'
    | 'task_reminder'
    | 'pest_alert'
    | 'growth_tip'
    | 'yield_prediction'
    | 'advice'
    | 'warning'
    | 'diagnosis'
    | 'weather_alert'
    | 'market_insight'
    | 'data_reminder';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  source:
    | 'ai_model'
    | 'weather_service'
    | 'rule_engine'
    | 'user_report'
    | 'weather_ai'
    | 'crop_model'
    | 'pest_prediction'
    | 'schedule_ai'
    | 'manual';
  trigger_data: Record<string, unknown> | null;
  action_taken: string | null;
  status: 'pending' | 'dismissed' | 'applied';
  expires_at: string | null;
  generated_at: string;
}

export interface MilestoneExpectation {
  id: string;
  weekly_milestone_id: string;
  category: 'visual' | 'measurement' | 'health_check' | 'environmental';
  parameter: string;
  expected_value: string;
  expected_range_min: number | null;
  expected_range_max: number | null;
  unit: string | null;
  importance_level: 'low' | 'medium' | 'high' | 'critical';
  warning_signs: string[];
  healthy_signs: string[];
  sequence_order: number;
  is_verified: boolean;
  verification_notes: string | null;
  photo_url: string | null;
}

export type RemoteSensingAnalysisType =
  | 'ndvi'
  | 'ndwi'
  | 'evi'
  | 'false_color'
  | 'moisture_proxy';

export type RemoteSensingOutputMode = 'summary' | 'timeseries' | 'map_overlay';

export type RemoteSensingRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export type RemoteSensingAgronomyStatus =
  | 'healthy'
  | 'moderate'
  | 'warning'
  | 'critical'
  | 'unknown';

export type RemoteSensingTrend = 'up' | 'down' | 'stable';

export interface RemoteSensingRunRequest {
  plot_id?: string;
  analysis_type?: RemoteSensingAnalysisType;
  date_start?: string;
  date_end?: string;
  output_modes?: RemoteSensingOutputMode[];
  cloud_threshold?: number;
  resolution_m?: number;
  force_refresh?: boolean;
}

export interface RemoteSensingRun {
  run_id: string;
  farm_id: string;
  plot_id?: string | null;
  analysis_type: RemoteSensingAnalysisType | string;
  status: RemoteSensingRunStatus | string;
  requested_at: string;
}

export interface RemoteSensingRunResult {
  run_id: string;
  status: RemoteSensingRunStatus | string;
  farm_id: string;
  plot_id?: string | null;
  analysis_type: RemoteSensingAnalysisType | string;
  requested_at: string;
  completed_at?: string | null;
  error_message?: string | null;
  outputs_ready?: Partial<Record<RemoteSensingOutputMode, boolean>>;
}

export interface RemoteSensingSummary {
  farm_id: string;
  plot_id?: string | null;
  analysis_type: RemoteSensingAnalysisType | string;
  image_date?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  value?: number | null;
  mean_value?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  stddev?: number | null;
  change_percent?: number | null;
  trend?: RemoteSensingTrend | string | null;
  status?: RemoteSensingAgronomyStatus | string | null;
  confidence?: string | null;
  cloud_cover?: number | null;
  source_dataset?: string | null;
  message?: string | null;
}

export interface RemoteSensingTimeSeriesPoint {
  date: string;
  value?: number | null;
  cloud_cover?: number | null;
}

export interface RemoteSensingTimeSeries {
  farm_id: string;
  plot_id?: string | null;
  analysis_type: RemoteSensingAnalysisType | string;
  series: RemoteSensingTimeSeriesPoint[];
  trend?: RemoteSensingTrend | string | null;
  change_percent?: number | null;
}

export interface RemoteSensingLegend {
  min: number;
  max: number;
  palette: string[];
}

export interface RemoteSensingOverlay {
  farm_id: string;
  plot_id?: string | null;
  analysis_type: RemoteSensingAnalysisType | string;
  layer_name?: string | null;
  image_date?: string | null;
  tile_url?: string | null;
  bounds?: number[] | null;
  min_zoom?: number;
  max_zoom?: number;
  opacity?: number;
  legend?: RemoteSensingLegend | null;
}

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface HealthSnapshotBreakdown {
  satellite: {
    score: number;
    ndvi: number | null;
    trend: string | null;
    status: string | null;
  };
  weather: {
    score: number;
    threats: string[];
  };
  operations: {
    score: number;
    overdue_count: number;
    pending_count: number;
  };
  scouting: {
    score: number;
    days_since_last: number | null;
  };
}

export interface HealthSnapshotAction {
  type: 'satellite' | 'weather' | 'operations' | 'scouting';
  message: string;
}

export interface PlotHealthSnapshot {
  farm_id: string;
  plot_id: string;
  plot_name: string;
  risk_score: number;
  risk_level: RiskLevel;
  journey: {
    crop_name: string;
    current_stage: string;
    progress_percentage: number;
    days_to_harvest: number;
  } | null;
  breakdown: HealthSnapshotBreakdown;
  actions: HealthSnapshotAction[];
}

export interface FarmHealthPlotSummary {
  plot_id: string;
  plot_name: string;
  risk_score: number;
  risk_level: RiskLevel;
  crop: string | null;
  ndvi: number | null;
}

export interface FarmHealthSummary {
  farm_id: string;
  farm_name: string;
  overall_risk_score: number;
  overall_risk_level: RiskLevel;
  plots_count: number;
  risk_distribution: Record<RiskLevel, number>;
  plots: FarmHealthPlotSummary[];
}

export interface PlotAIRecommendationsResponse {
  recommendations: Record<string, { actions: string[]; summary: string }>;
  generated_at: string;
  cached: boolean;
}

export type SoilNutrientLevel = 'Low' | 'Medium' | 'High';

export interface SoilProfileView {
  texture_class: string | null;
  ph: number | null;
  ph_band: string | null;
  sand_pct: number | null;
  silt_pct: number | null;
  clay_pct: number | null;
  organic_carbon_pct: number | null;
  nitrogen_total_g_kg: number | null;
  phosphorus_ppm: number | null;
  potassium_ppm: number | null;
  water_capacity_mm: number | null;
  n_level: SoilNutrientLevel | null;
  p_level: SoilNutrientLevel | null;
  k_level: SoilNutrientLevel | null;
  source: 'isda' | 'soilgrids' | 'default';
  confidence: 'high' | 'medium' | 'low';
  fetched_at: string | null;
}

export interface SoilWaterStatus {
  available_mm: number;
  capacity_mm: number;
  pct: number;
  status: 'dry' | 'adequate' | 'wet';
  computed_at: string;
}

export interface FarmSoilResponse {
  plot_id: string | null;
  profile: SoilProfileView;
  water_status: SoilWaterStatus | null;
}
