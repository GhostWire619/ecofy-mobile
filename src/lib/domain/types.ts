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
}
