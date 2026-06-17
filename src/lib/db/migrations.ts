import type { SQLiteDatabase } from 'expo-sqlite';

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS session (
  user_id TEXT PRIMARY KEY NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  units TEXT NOT NULL DEFAULT 'metric',
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  last_bootstrap_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS farms (
  id TEXT PRIMARY KEY NOT NULL,
  client_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  region TEXT NOT NULL,
  country TEXT NOT NULL,
  district TEXT,
  formatted_address TEXT,
  size_hectares REAL NOT NULL,
  soil_type TEXT,
  irrigation_type TEXT NOT NULL,
  elevation REAL
);

CREATE TABLE IF NOT EXISTS plots (
  id TEXT PRIMARY KEY NOT NULL,
  client_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  farm_id TEXT NOT NULL,
  name TEXT NOT NULL,
  plot_code TEXT,
  size_hectares REAL,
  soil_type TEXT,
  field_boundary_json TEXT,
  center_latitude REAL,
  center_longitude REAL,
  is_default INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY NOT NULL,
  client_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  farm_id TEXT NOT NULL,
  plot_id TEXT,
  crop_id TEXT NOT NULL,
  crop_name TEXT NOT NULL,
  common_name TEXT NOT NULL,
  local_name TEXT,
  variety TEXT,
  planting_date TEXT NOT NULL,
  expected_harvest_date TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_percentage REAL NOT NULL DEFAULT 0,
  current_stage TEXT,
  predicted_yield REAL,
  actual_yield REAL,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE,
  FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS stages (
  id TEXT PRIMARY KEY NOT NULL,
  client_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  journey_id TEXT NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  start_day INTEGER NOT NULL,
  end_day INTEGER NOT NULL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL,
  description TEXT,
  risk_level TEXT NOT NULL,
  color TEXT,
  visual_indicators_json TEXT NOT NULL DEFAULT '[]',
  critical_factors_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY NOT NULL,
  client_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  journey_id TEXT NOT NULL,
  stage_id TEXT,
  week_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  client_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  journey_id TEXT NOT NULL,
  milestone_id TEXT,
  plot_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_type TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 1,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  completed_at TEXT,
  estimated_duration_minutes INTEGER,
  xp_value INTEGER NOT NULL DEFAULT 0,
  instructions_json TEXT NOT NULL DEFAULT '[]',
  observation_notes TEXT,
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE,
  FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE SET NULL,
  FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY NOT NULL,
  client_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  farm_id TEXT NOT NULL,
  plot_id TEXT,
  journey_id TEXT,
  operation_type TEXT NOT NULL,
  date TEXT NOT NULL,
  cost REAL,
  notes TEXT,
  location_latitude REAL,
  location_longitude REAL,
  snapshot_url TEXT,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE,
  FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE SET NULL,
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS log_images (
  id TEXT PRIMARY KEY NOT NULL,
  client_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  log_id TEXT NOT NULL,
  local_uri TEXT NOT NULL,
  remote_url TEXT,
  thumbnail_url TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  taken_at TEXT,
  FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY NOT NULL,
  client_mutation_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  journey_id TEXT NOT NULL,
  milestone_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger_data_json TEXT NOT NULL DEFAULT '{}',
  action_taken TEXT,
  expires_at TEXT,
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weather_cache (
  farm_id TEXT PRIMARY KEY NOT NULL,
  summary_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  commodity TEXT NOT NULL,
  market_name TEXT NOT NULL,
  region TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  unit TEXT NOT NULL,
  trend TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offline_map_regions (
  id TEXT PRIMARY KEY NOT NULL,
  farm_id TEXT NOT NULL,
  name TEXT NOT NULL,
  style_url TEXT NOT NULL,
  min_zoom REAL NOT NULL,
  max_zoom REAL NOT NULL,
  bounds_json TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id TEXT PRIMARY KEY NOT NULL,
  farm_id TEXT,
  journey_id TEXT,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  image_local_uri TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL,
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_payload_json TEXT NOT NULL,
  remote_payload_json TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engagement (
  user_id TEXT PRIMARY KEY NOT NULL,
  summary_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_prefs (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_farms_sync_status ON farms(sync_status);
CREATE INDEX IF NOT EXISTS idx_plots_farm_id ON plots(farm_id);
CREATE INDEX IF NOT EXISTS idx_journeys_farm_id ON journeys(farm_id);
CREATE INDEX IF NOT EXISTS idx_stages_journey_id ON stages(journey_id);
CREATE INDEX IF NOT EXISTS idx_milestones_journey_id ON milestones(journey_id);
CREATE INDEX IF NOT EXISTS idx_tasks_journey_id ON tasks(journey_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_logs_farm_id ON logs(farm_id);
CREATE INDEX IF NOT EXISTS idx_logs_journey_id ON logs(journey_id);
CREATE INDEX IF NOT EXISTS idx_log_images_log_id ON log_images(log_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_journey_id ON recommendations(journey_id);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_created_at ON assistant_messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);
`;

export async function runMigrations(db: SQLiteDatabase) {
  await db.execAsync(schema);

  // Additive column migrations for installs created before the column existed.
  // SQLite has no "ADD COLUMN IF NOT EXISTS", so each is guarded individually.
  const additiveColumns = [
    "ALTER TABLE assistant_messages ADD COLUMN image_local_uri TEXT;",
  ];
  for (const stmt of additiveColumns) {
    try {
      await db.execAsync(stmt);
    } catch {
      // Column already exists — safe to ignore.
    }
  }
}
