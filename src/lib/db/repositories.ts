import { addDays, formatISO, startOfToday } from 'date-fns';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import { cropCatalog, getCropCatalogItem } from '@/lib/constants/crops';
import { getDatabase, withTransaction } from '@/lib/db/database';
import type {
  AssistantMessageRecord,
  EngagementSummary,
  FarmRecord,
  JourneyRecord,
  LogImageRecord,
  LogRecord,
  MilestoneRecord,
  MobileBootstrapPayload,
  OfflineMapRegionRecord,
  PlotRecord,
  PriceSnapshotRecord,
  RecommendationRecord,
  SessionRecord,
  StageRecord,
  SyncConflictRecord,
  SyncFields,
  SyncQueueRecord,
  TaskRecord,
  UserProfile,
  WeatherCacheRecord,
} from '@/lib/domain/types';
import { createId } from '@/lib/utils/id';
import { parseJson, toJson } from '@/lib/utils/json';

const nowIso = () => new Date().toISOString();

function syncFields(id?: string): SyncFields {
  const timestamp = nowIso();
  return {
    id: id ?? createId(),
    client_mutation_id: createId('mutation'),
    updated_at: timestamp,
    deleted_at: null,
    sync_status: 'pending',
    last_synced_at: null,
  };
}

function columns<T extends object>(row: T) {
  return Object.keys(row as Record<string, unknown>);
}

function values<T extends object>(row: T) {
  return Object.values(row as Record<string, unknown>) as SQLiteBindValue[];
}

function isNamedParams(
  params?: SQLiteBindValue[] | Record<string, SQLiteBindValue>,
): params is Record<string, SQLiteBindValue> {
  return Boolean(params) && !Array.isArray(params);
}

async function runStatement(
  db: SQLiteDatabase,
  query: string,
  params?: SQLiteBindValue[] | Record<string, SQLiteBindValue>,
) {
  if (!params) {
    return db.runAsync(query);
  }

  if (isNamedParams(params)) {
    return db.runAsync(query, params);
  }

  return db.runAsync(query, ...params);
}

async function upsertMany<T extends object>(
  db: SQLiteDatabase,
  table: string,
  rows: T[],
  conflictKey = 'id',
) {
  if (rows.length === 0) {
    return;
  }

  for (const row of rows) {
    const rowColumns = columns(row);
    const placeholders = rowColumns.map(() => '?').join(', ');
    const assignments = rowColumns
      .filter((column) => column !== conflictKey)
      .map((column) => `${column} = excluded.${column}`)
      .join(', ');

    await runStatement(
      db,
      `INSERT INTO ${table} (${rowColumns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(${conflictKey}) DO UPDATE SET ${assignments};`,
      values(row),
    );
  }
}

async function listRows<T>(query: string, params?: SQLiteBindValue[] | Record<string, SQLiteBindValue>) {
  const db = await getDatabase();
  if (!params) {
    return db.getAllAsync<T>(query);
  }

  if (isNamedParams(params)) {
    return db.getAllAsync<T>(query, params);
  }

  return db.getAllAsync<T>(query, ...params);
}

async function getFirstRow<T>(
  query: string,
  params?: SQLiteBindValue[] | Record<string, SQLiteBindValue>,
) {
  const db = await getDatabase();
  if (!params) {
    return db.getFirstAsync<T>(query);
  }

  if (isNamedParams(params)) {
    return db.getFirstAsync<T>(query, params);
  }

  return db.getFirstAsync<T>(query, ...params);
}

export const sessionRepository = {
  async getSession(userId?: string) {
    if (userId) {
      return getFirstRow<SessionRecord>('SELECT * FROM session WHERE user_id = ? LIMIT 1;', [userId]);
    }
    // No user given: prefer the most recent real session over the seeded
    // 'anonymous' placeholder so we don't read a stale/wrong onboarding flag.
    return (
      (await getFirstRow<SessionRecord>(
        "SELECT * FROM session WHERE user_id != 'anonymous' ORDER BY updated_at DESC LIMIT 1;",
      )) ?? (await getFirstRow<SessionRecord>('SELECT * FROM session LIMIT 1;'))
    );
  },
  /** The real (non-anonymous) user the local data currently belongs to, if any. */
  async getOwnerUserId(): Promise<string | null> {
    const row = await getFirstRow<{ user_id: string }>(
      "SELECT user_id FROM session WHERE user_id != 'anonymous' ORDER BY updated_at DESC LIMIT 1;",
    );
    return row?.user_id ?? null;
  },
  async upsertSession(partial: Partial<SessionRecord> & { user_id: string }) {
    const existing = await this.getSession(partial.user_id);
    const record: SessionRecord = {
      user_id: partial.user_id,
      locale: partial.locale ?? existing?.locale ?? 'en',
      units: partial.units ?? existing?.units ?? 'metric',
      onboarding_complete:
        partial.onboarding_complete ?? existing?.onboarding_complete ?? 0,
      last_bootstrap_at:
        partial.last_bootstrap_at ?? existing?.last_bootstrap_at ?? null,
      updated_at: partial.updated_at ?? nowIso(),
    };

    const db = await getDatabase();
    await upsertMany(db, 'session', [record], 'user_id');
    return record;
  },
};

// Device-level flag (in app_prefs, survives logout, cleared only on reinstall)
// marking that the first-run intro carousel has been shown.
export const INTRO_SEEN_KEY = 'intro_seen';

export const prefsRepository = {
  async get(key: string) {
    const row = await getFirstRow<{ value: string }>(
      'SELECT value FROM app_prefs WHERE key = ? LIMIT 1;',
      [key],
    );
    return row?.value ?? null;
  },
  async set(key: string, value: string | null) {
    const db = await getDatabase();
    if (value == null) {
      await runStatement(db, 'DELETE FROM app_prefs WHERE key = ?;', [key]);
      return;
    }
    await runStatement(db, 'INSERT OR REPLACE INTO app_prefs (key, value) VALUES (?, ?);', [
      key,
      value,
    ]);
  },
};

const SELECTED_JOURNEY_KEY = 'selected_journey_id';
const SELECTED_FARM_KEY = 'selected_farm_id';

export const farmRepository = {
  async listFarms() {
    return listRows<FarmRecord>(
      'SELECT * FROM farms WHERE deleted_at IS NULL ORDER BY updated_at DESC;',
    );
  },
  async getFarm(id: string) {
    return getFirstRow<FarmRecord>(
      'SELECT * FROM farms WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
      [id],
    );
  },
  async saveFarm(record: FarmRecord) {
    const db = await getDatabase();
    await upsertMany(db, 'farms', [record]);
    return record;
  },
  async getSelectedFarmId() {
    return prefsRepository.get(SELECTED_FARM_KEY);
  },
  async setSelectedFarmId(farmId: string | null) {
    await prefsRepository.set(SELECTED_FARM_KEY, farmId);
  },
  async createLocalFarm(input: {
    name: string;
    latitude: number;
    longitude: number;
    region: string;
    country: string;
    district?: string | null;
    formatted_address?: string | null;
    size_hectares: number;
    soil_type?: string | null;
    irrigation_type: 'rain-fed' | 'irrigated';
    plot_name?: string;
    plot_size_hectares?: number | null;
    field_boundary_json?: string | null;
    center_latitude?: number | null;
    center_longitude?: number | null;
  }) {
    const farm: FarmRecord = {
      ...syncFields(),
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      region: input.region,
      country: input.country,
      district: input.district ?? null,
      formatted_address: input.formatted_address ?? null,
      size_hectares: input.size_hectares,
      soil_type: input.soil_type ?? null,
      irrigation_type: input.irrigation_type,
      elevation: null,
    };

    const plot: PlotRecord = {
      ...syncFields(),
      farm_id: farm.id,
      name: input.plot_name ?? 'Main Plot',
      plot_code: null,
      size_hectares: input.plot_size_hectares ?? input.size_hectares,
      soil_type: input.soil_type ?? null,
      field_boundary_json: input.field_boundary_json ?? null,
      center_latitude: input.center_latitude ?? input.latitude,
      center_longitude: input.center_longitude ?? input.longitude,
      is_default: 1,
    };

    await withTransaction(async (db) => {
      await upsertMany(db, 'farms', [farm]);
      await upsertMany(db, 'plots', [plot]);
    });

    return { farm, plot };
  },
  async softDeleteFarm(id: string) {
    const db = await getDatabase();
    await runStatement(
      db,
      'UPDATE farms SET deleted_at = ?, sync_status = ? WHERE id = ?;',
      [nowIso(), 'pending', id],
    );
  },
};

export const plotRepository = {
  async listPlotsForFarm(farmId: string) {
    return listRows<PlotRecord>(
      'SELECT * FROM plots WHERE farm_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, updated_at DESC;',
      [farmId],
    );
  },
  async getDefaultPlotForFarm(farmId: string) {
    return getFirstRow<PlotRecord>(
      'SELECT * FROM plots WHERE farm_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, updated_at DESC LIMIT 1;',
      [farmId],
    );
  },
  async savePlot(record: PlotRecord) {
    const db = await getDatabase();
    await upsertMany(db, 'plots', [record]);
    return record;
  },
};

function buildDraftTimeline(journeyId: string, cropName: string, plantingDate: Date) {
  const stageDefinitions = [
    {
      name: 'Germination',
      start_day: 0,
      end_day: 10,
      risk_level: 'medium' as const,
      color: '#7abf63',
      description: `Seed emergence and establishment for ${cropName}.`,
      visual_indicators: ['Seedling emergence', 'Uniform stand'],
      critical_factors: ['Moisture', 'Seed spacing'],
    },
    {
      name: 'Vegetative Growth',
      start_day: 11,
      end_day: 45,
      risk_level: 'medium' as const,
      color: '#3f9b58',
      description: `${cropName} builds canopy and root strength.`,
      visual_indicators: ['Leaf expansion', 'Consistent vigor'],
      critical_factors: ['Weeding', 'Nutrient support'],
    },
    {
      name: 'Flowering',
      start_day: 46,
      end_day: 80,
      risk_level: 'high' as const,
      color: '#f2b746',
      description: `${cropName} enters a sensitive reproductive stage.`,
      visual_indicators: ['Flower initiation', 'High pollination activity'],
      critical_factors: ['Stress control', 'Pest scouting'],
    },
    {
      name: 'Maturity',
      start_day: 81,
      end_day: 120,
      risk_level: 'medium' as const,
      color: '#b4672d',
      description: `Dry-down, harvest planning, and storage readiness.`,
      visual_indicators: ['Drying crop', 'Harvest color change'],
      critical_factors: ['Harvest timing', 'Post-harvest handling'],
    },
  ];

  const stages: StageRecord[] = stageDefinitions.map((stage, index) => ({
    ...syncFields(),
    journey_id: journeyId,
    name: stage.name,
    order_index: index,
    start_day: stage.start_day,
    end_day: stage.end_day,
    start_date: formatISO(addDays(plantingDate, stage.start_day), { representation: 'date' }),
    end_date: formatISO(addDays(plantingDate, stage.end_day), { representation: 'date' }),
    status: index === 0 ? 'active' : 'upcoming',
    description: stage.description,
    risk_level: stage.risk_level,
    color: stage.color,
    visual_indicators_json: toJson(stage.visual_indicators),
    critical_factors_json: toJson(stage.critical_factors),
  }));

  const milestoneDefinitions = [
    {
      title: 'Field ready and planted',
      description: 'Confirm land prep, seed rate, and emergence checks.',
      stageIndex: 0,
      week: 1,
    },
    {
      title: 'Stand count and first weeding',
      description: 'Inspect crop establishment and remove early weeds.',
      stageIndex: 1,
      week: 3,
    },
    {
      title: 'Nutrition and canopy health',
      description: 'Top-dress, scout pests, and reinforce moisture management.',
      stageIndex: 1,
      week: 5,
    },
    {
      title: 'Flowering watch',
      description: 'Protect the crop during its highest-risk reproductive period.',
      stageIndex: 2,
      week: 8,
    },
    {
      title: 'Harvest prep',
      description: 'Check maturity, labor plan, and storage readiness.',
      stageIndex: 3,
      week: 12,
    },
  ];

  const milestones: MilestoneRecord[] = milestoneDefinitions.map((milestone) => ({
    ...syncFields(),
    journey_id: journeyId,
    stage_id: stages[milestone.stageIndex]?.id ?? null,
    week_number: milestone.week,
    title: milestone.title,
    description: milestone.description,
    start_date: formatISO(addDays(plantingDate, (milestone.week - 1) * 7), {
      representation: 'date',
    }),
    end_date: formatISO(addDays(plantingDate, milestone.week * 7), {
      representation: 'date',
    }),
    status: milestone.week === 1 ? 'in_progress' : 'pending',
    xp_reward: 50,
  }));

  const tasks: TaskRecord[] = [
    {
      ...syncFields(),
      journey_id: journeyId,
      milestone_id: milestones[0]?.id ?? null,
      plot_id: null,
      title: 'Confirm planting pattern',
      description: 'Check spacing, population, and planting depth.',
      task_type: 'planting',
      priority: 'high',
      status: 'pending',
      is_required: 1,
      sequence_order: 1,
      due_date: milestones[0]?.end_date ?? null,
      completed_at: null,
      estimated_duration_minutes: 25,
      xp_value: 20,
      instructions_json: toJson([
        'Walk the main plot edge to edge.',
        'Confirm seed rows are even and replant visible gaps.',
      ]),
      observation_notes: null,
    },
    {
      ...syncFields(),
      journey_id: journeyId,
      milestone_id: milestones[1]?.id ?? null,
      plot_id: null,
      title: 'Scout for weeds and stress',
      description: 'Log weeds, moisture, and any stand gaps.',
      task_type: 'scouting',
      priority: 'medium',
      status: 'pending',
      is_required: 1,
      sequence_order: 2,
      due_date: milestones[1]?.end_date ?? null,
      completed_at: null,
      estimated_duration_minutes: 30,
      xp_value: 15,
      instructions_json: toJson([
        'Scan low spots and edges first.',
        'Capture a photo if emergence looks uneven.',
      ]),
      observation_notes: null,
    },
    {
      ...syncFields(),
      journey_id: journeyId,
      milestone_id: milestones[2]?.id ?? null,
      plot_id: null,
      title: 'Apply nutrient plan',
      description: 'Log fertilizer or soil amendment work.',
      task_type: 'fertilizing',
      priority: 'high',
      status: 'pending',
      is_required: 1,
      sequence_order: 3,
      due_date: milestones[2]?.end_date ?? null,
      completed_at: null,
      estimated_duration_minutes: 45,
      xp_value: 25,
      instructions_json: toJson([
        'Follow the crop-specific recommendation.',
        'Record cost and method in the logbook.',
      ]),
      observation_notes: null,
    },
    {
      ...syncFields(),
      journey_id: journeyId,
      milestone_id: milestones[3]?.id ?? null,
      plot_id: null,
      title: 'Protect flowering stage',
      description: 'Inspect pest pressure and avoid crop stress.',
      task_type: 'pest_control',
      priority: 'urgent',
      status: 'pending',
      is_required: 1,
      sequence_order: 4,
      due_date: milestones[3]?.end_date ?? null,
      completed_at: null,
      estimated_duration_minutes: 35,
      xp_value: 30,
      instructions_json: toJson([
        'Walk the field early morning.',
        'Check 5 sample points and note pest hotspots.',
      ]),
      observation_notes: null,
    },
    {
      ...syncFields(),
      journey_id: journeyId,
      milestone_id: milestones[4]?.id ?? null,
      plot_id: null,
      title: 'Prepare harvest logistics',
      description: 'Check labor, bags, storage, and expected harvest date.',
      task_type: 'harvesting',
      priority: 'medium',
      status: 'pending',
      is_required: 1,
      sequence_order: 5,
      due_date: milestones[4]?.end_date ?? null,
      completed_at: null,
      estimated_duration_minutes: 20,
      xp_value: 20,
      instructions_json: toJson([
        'Confirm drying area and storage cleanliness.',
        'Review expected market options.',
      ]),
      observation_notes: null,
    },
  ];

  return { stages, milestones, tasks };
}

export const journeyRepository = {
  async listJourneys() {
    return listRows<JourneyRecord>(
      'SELECT * FROM journeys WHERE deleted_at IS NULL ORDER BY planting_date DESC;',
    );
  },
  async getActiveJourney() {
    // Honour the farmer's explicitly selected journey if it still exists.
    const selectedId = await prefsRepository.get(SELECTED_JOURNEY_KEY);
    if (selectedId) {
      const selected = await getFirstRow<JourneyRecord>(
        'SELECT * FROM journeys WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
        [selectedId],
      );
      if (selected) return selected;
    }
    return getFirstRow<JourneyRecord>(
      "SELECT * FROM journeys WHERE deleted_at IS NULL AND status IN ('active', 'planned') ORDER BY planting_date DESC LIMIT 1;",
    );
  },
  async setSelectedJourney(journeyId: string | null) {
    await prefsRepository.set(SELECTED_JOURNEY_KEY, journeyId);
  },
  async getActiveJourneyForFarm(farmId: string) {
    return getFirstRow<JourneyRecord>(
      "SELECT * FROM journeys WHERE farm_id = ? AND deleted_at IS NULL AND status IN ('active', 'planned') ORDER BY planting_date DESC LIMIT 1;",
      [farmId],
    );
  },
  async saveJourney(record: JourneyRecord) {
    const db = await getDatabase();
    await upsertMany(db, 'journeys', [record]);
    return record;
  },
  async createJourneyDraft(input: {
    farm_id: string;
    plot_id?: string | null;
    crop_id: string;
    planting_date?: string;
  }) {
    const crop = getCropCatalogItem(input.crop_id);
    const plantingDate = input.planting_date
      ? new Date(input.planting_date)
      : startOfToday();
    // A future planting date is a pre-planting (planned) journey; today/past is active.
    const isFuturePlanting = plantingDate.getTime() > startOfToday().getTime();
    const journey: JourneyRecord = {
      ...syncFields(),
      farm_id: input.farm_id,
      plot_id: input.plot_id ?? null,
      crop_id: crop.id,
      crop_name: crop.name,
      common_name: crop.common_name,
      local_name: crop.local_name,
      variety: crop.variety,
      planting_date: formatISO(plantingDate, { representation: 'date' }),
      expected_harvest_date: formatISO(addDays(plantingDate, crop.maturity_days_max), {
        representation: 'date',
      }),
      status: isFuturePlanting ? 'planned' : 'active',
      progress_percentage: 0,
      current_stage: 'Germination',
      predicted_yield: null,
      actual_yield: null,
    };

    const { stages, milestones, tasks } = buildDraftTimeline(
      journey.id,
      crop.common_name,
      plantingDate,
    );

    await withTransaction(async (db) => {
      await upsertMany(db, 'journeys', [journey]);
      await upsertMany(db, 'stages', stages);
      await upsertMany(db, 'milestones', milestones);
      await upsertMany(db, 'tasks', tasks);
    });

    return { journey, stages, milestones, tasks };
  },
  async listStages(journeyId: string) {
    return listRows<StageRecord>(
      'SELECT * FROM stages WHERE journey_id = ? AND deleted_at IS NULL ORDER BY order_index ASC;',
      [journeyId],
    );
  },
  async listMilestones(journeyId: string) {
    return listRows<MilestoneRecord>(
      'SELECT * FROM milestones WHERE journey_id = ? AND deleted_at IS NULL ORDER BY week_number ASC;',
      [journeyId],
    );
  },
  async listTasks(journeyId: string) {
    return listRows<TaskRecord>(
      'SELECT * FROM tasks WHERE journey_id = ? AND deleted_at IS NULL ORDER BY sequence_order ASC;',
      [journeyId],
    );
  },
};

export const taskRepository = {
  async listTodayTasks() {
    const today = formatISO(startOfToday(), { representation: 'date' });
    return listRows<TaskRecord>(
      "SELECT * FROM tasks WHERE deleted_at IS NULL AND status != 'completed' AND (due_date IS NULL OR due_date <= ?) ORDER BY priority DESC, due_date ASC;",
      [today],
    );
  },
  async getTask(taskId: string) {
    return getFirstRow<TaskRecord>(
      'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
      [taskId],
    );
  },
  async completeTaskOffline(taskId: string, note?: string) {
    const db = await getDatabase();
    const timestamp = nowIso();
    await runStatement(
      db,
      `UPDATE tasks
       SET status = 'completed',
           completed_at = ?,
           observation_notes = COALESCE(?, observation_notes),
           sync_status = CASE WHEN sync_status = 'synced' THEN 'pending' ELSE sync_status END,
           updated_at = ?
       WHERE id = ?;`,
      [timestamp, note ?? null, timestamp, taskId],
    );
  },
  /** Mark a task as skipped (not done, no XP) with an optional reason. */
  async skipTaskOffline(taskId: string, reason?: string | null) {
    const db = await getDatabase();
    const timestamp = nowIso();
    await runStatement(
      db,
      `UPDATE tasks
       SET status = 'skipped',
           completed_at = NULL,
           observation_notes = COALESCE(?, observation_notes),
           sync_status = CASE WHEN sync_status = 'synced' THEN 'pending' ELSE sync_status END,
           updated_at = ?
       WHERE id = ?;`,
      [reason ?? null, timestamp, taskId],
    );
  },
  /** Push a task's due date out by `days` (from its current due date, or today). Returns the new date. */
  async snoozeTaskOffline(taskId: string, days: number) {
    const db = await getDatabase();
    const timestamp = nowIso();
    const task = await getFirstRow<TaskRecord>(
      'SELECT * FROM tasks WHERE id = ? LIMIT 1;',
      [taskId],
    );
    const base = task?.due_date ? new Date(task.due_date) : new Date();
    const next = formatISO(addDays(base, days), { representation: 'date' });
    await runStatement(
      db,
      `UPDATE tasks
       SET due_date = ?,
           status = 'pending',
           sync_status = CASE WHEN sync_status = 'synced' THEN 'pending' ELSE sync_status END,
           updated_at = ?
       WHERE id = ?;`,
      [next, timestamp, taskId],
    );
    return next;
  },
  /** Revert a just-completed task back to pending (for the undo window). */
  async undoCompleteOffline(taskId: string) {
    const db = await getDatabase();
    const timestamp = nowIso();
    await runStatement(
      db,
      `UPDATE tasks
       SET status = 'pending',
           completed_at = NULL,
           sync_status = CASE WHEN sync_status = 'synced' THEN 'pending' ELSE sync_status END,
           updated_at = ?
       WHERE id = ?;`,
      [timestamp, taskId],
    );
  },
};

export const logRepository = {
  async listLogs() {
    return listRows<LogRecord>(
      'SELECT * FROM logs WHERE deleted_at IS NULL ORDER BY date DESC, updated_at DESC;',
    );
  },
  async listLogsForFarm(farmId: string, limit = 20) {
    return listRows<LogRecord>(
      'SELECT * FROM logs WHERE farm_id = ? AND deleted_at IS NULL ORDER BY date DESC, updated_at DESC LIMIT ?;',
      [farmId, limit],
    );
  },
  async listImagesForLog(logId: string) {
    return listRows<LogImageRecord>(
      'SELECT * FROM log_images WHERE log_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC;',
      [logId],
    );
  },
  async createOfflineLog(input: {
    farm_id: string;
    plot_id?: string | null;
    journey_id?: string | null;
    operation_type: string;
    date: string;
    cost?: number | null;
    notes?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    images?: {
      local_uri: string;
      mime_type?: string | null;
      width?: number | null;
      height?: number | null;
    }[];
  }) {
    const resolvedPlotId =
      input.plot_id ??
      (
        await getFirstRow<{ id: string }>(
          'SELECT id FROM plots WHERE farm_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, updated_at DESC LIMIT 1;',
          [input.farm_id],
        )
      )?.id ??
      null;

    const resolvedJourneyId =
      input.journey_id ??
      (
        await getFirstRow<{ id: string }>(
          "SELECT id FROM journeys WHERE farm_id = ? AND deleted_at IS NULL AND status IN ('active', 'planned') ORDER BY updated_at DESC LIMIT 1;",
          [input.farm_id],
        )
      )?.id ??
      null;

    if (!resolvedPlotId || !resolvedJourneyId) {
      throw new Error('This farm needs an active journey and plot before you can save logs offline.');
    }

    const log: LogRecord = {
      ...syncFields(),
      farm_id: input.farm_id,
      plot_id: resolvedPlotId,
      journey_id: resolvedJourneyId,
      operation_type: input.operation_type,
      date: input.date,
      cost: input.cost ?? null,
      notes: input.notes ?? null,
      location_latitude: input.latitude ?? null,
      location_longitude: input.longitude ?? null,
      snapshot_url: null,
    };

    const images: LogImageRecord[] = (input.images ?? []).map((image) => ({
      ...syncFields(),
      log_id: log.id,
      local_uri: image.local_uri,
      remote_url: null,
      thumbnail_url: null,
      mime_type: image.mime_type ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      taken_at: nowIso(),
    }));

    await withTransaction(async (db) => {
      await upsertMany(db, 'logs', [log]);
      await upsertMany(db, 'log_images', images);
    });

    return { log, images };
  },
  /** Soft-delete a log and its images (used to roll back a task-completion proof on undo). */
  async softDeleteLog(logId: string) {
    const timestamp = nowIso();
    await withTransaction(async (db) => {
      await runStatement(db, 'UPDATE logs SET deleted_at = ?, updated_at = ? WHERE id = ?;', [
        timestamp,
        timestamp,
        logId,
      ]);
      await runStatement(
        db,
        'UPDATE log_images SET deleted_at = ?, updated_at = ? WHERE log_id = ?;',
        [timestamp, timestamp, logId],
      );
    });
  },
};

export const recommendationRepository = {
  async listForJourney(journeyId: string) {
    return listRows<RecommendationRecord>(
      "SELECT * FROM recommendations WHERE journey_id = ? AND deleted_at IS NULL AND status = 'pending' ORDER BY priority DESC, updated_at DESC;",
      [journeyId],
    );
  },
  async listPending(limit = 20) {
    return listRows<RecommendationRecord>(
      "SELECT * FROM recommendations WHERE deleted_at IS NULL AND status = 'pending' ORDER BY priority DESC, updated_at DESC LIMIT ?;",
      [limit],
    );
  },
  async dismiss(id: string) {
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE recommendations SET status = 'dismissed', updated_at = ? WHERE id = ?;",
      [nowIso(), id],
    );
  },
};

const ENGAGEMENT_KEY = 'me';

export const engagementRepository = {
  async save(summary: EngagementSummary) {
    const db = await getDatabase();
    await db.runAsync(
      'INSERT OR REPLACE INTO engagement (user_id, summary_json, updated_at) VALUES (?, ?, ?);',
      [ENGAGEMENT_KEY, toJson(summary), nowIso()],
    );
  },
  async get(): Promise<EngagementSummary | null> {
    const row = await getFirstRow<{ summary_json: string }>(
      'SELECT summary_json FROM engagement WHERE user_id = ? LIMIT 1;',
      [ENGAGEMENT_KEY],
    );
    if (!row?.summary_json) return null;
    return parseJson<EngagementSummary | null>(row.summary_json, null);
  },
};

export const marketRepository = {
  async listPrices() {
    return listRows<PriceSnapshotRecord>(
      'SELECT * FROM price_snapshots ORDER BY captured_at DESC, commodity ASC;',
    );
  },
  async seedPricesIfEmpty() {
    const existing = await getFirstRow<{ total: number }>(
      'SELECT COUNT(*) as total FROM price_snapshots;',
    );

    if ((existing?.total ?? 0) > 0) {
      return;
    }

    const snapshots: PriceSnapshotRecord[] = [
      {
        id: createId('price'),
        commodity: 'Maize',
        market_name: 'Nairobi Wakulima',
        region: 'Kenya',
        price: 49,
        currency: 'KES',
        unit: 'kg',
        trend: 'rising',
        captured_at: nowIso(),
      },
      {
        id: createId('price'),
        commodity: 'Beans',
        market_name: 'Moshi Central',
        region: 'Tanzania',
        price: 4200,
        currency: 'TZS',
        unit: 'kg',
        trend: 'stable',
        captured_at: nowIso(),
      },
      {
        id: createId('price'),
        commodity: 'Tomato',
        market_name: 'Kariakoo',
        region: 'Tanzania',
        price: 1800,
        currency: 'TZS',
        unit: 'kg',
        trend: 'falling',
        captured_at: nowIso(),
      },
      {
        id: createId('price'),
        commodity: 'Rice',
        market_name: 'Kisumu Wholesale',
        region: 'Kenya',
        price: 88,
        currency: 'KES',
        unit: 'kg',
        trend: 'rising',
        captured_at: nowIso(),
      },
    ];

    const db = await getDatabase();
    await upsertMany(db, 'price_snapshots', snapshots);
  },
};

export const weatherRepository = {
  async getWeatherForFarm(farmId: string) {
    return getFirstRow<WeatherCacheRecord>(
      'SELECT * FROM weather_cache WHERE farm_id = ? LIMIT 1;',
      [farmId],
    );
  },
  async saveWeather(record: WeatherCacheRecord) {
    const db = await getDatabase();
    await upsertMany(db, 'weather_cache', [record], 'farm_id');
  },
};

export const offlineMapRepository = {
  async listRegions() {
    return listRows<OfflineMapRegionRecord>(
      'SELECT * FROM offline_map_regions ORDER BY updated_at DESC;',
    );
  },
  async getRegionForFarm(farmId: string) {
    return getFirstRow<OfflineMapRegionRecord>(
      'SELECT * FROM offline_map_regions WHERE farm_id = ? LIMIT 1;',
      [farmId],
    );
  },
  async saveRegion(record: OfflineMapRegionRecord) {
    const db = await getDatabase();
    await upsertMany(db, 'offline_map_regions', [record]);
  },
};

export const assistantRepository = {
  async listMessages(limit = 60) {
    return listRows<AssistantMessageRecord>(
      'SELECT * FROM assistant_messages ORDER BY created_at ASC LIMIT ?;',
      [limit],
    );
  },
  async appendMessage(input: {
    farm_id?: string | null;
    journey_id?: string | null;
    role: AssistantMessageRecord['role'];
    text: string;
    image_local_uri?: string | null;
    delivery_status?: AssistantMessageRecord['delivery_status'];
  }) {
    const record: AssistantMessageRecord = {
      id: createId('assistant'),
      farm_id: input.farm_id ?? null,
      journey_id: input.journey_id ?? null,
      role: input.role,
      text: input.text,
      image_local_uri: input.image_local_uri ?? null,
      delivery_status: input.delivery_status ?? 'local',
      created_at: nowIso(),
    };

    const db = await getDatabase();
    await upsertMany(db, 'assistant_messages', [record]);
    await runStatement(
      db,
      `DELETE FROM assistant_messages
       WHERE id NOT IN (
         SELECT id FROM assistant_messages ORDER BY created_at DESC LIMIT 60
       );`,
    );
    return record;
  },
  async clearMessages() {
    const db = await getDatabase();
    await runStatement(db, 'DELETE FROM assistant_messages;');
  },
};

export const syncRepository = {
  async listQueue() {
    return listRows<SyncQueueRecord>(
      "SELECT * FROM sync_queue WHERE status IN ('queued', 'failed') ORDER BY created_at ASC;",
    );
  },
  async getQueueSummary() {
    const [queued, conflicts] = await Promise.all([
      getFirstRow<{ total: number }>(
        "SELECT COUNT(*) as total FROM sync_queue WHERE status IN ('queued', 'failed');",
      ),
      getFirstRow<{ total: number }>('SELECT COUNT(*) as total FROM sync_conflicts;'),
    ]);

    return {
      queued: queued?.total ?? 0,
      conflicts: conflicts?.total ?? 0,
    };
  },
  async enqueueJob(entityType: string, entityId: string, jobType: string, payload: unknown) {
    const job: SyncQueueRecord = {
      id: createId('sync'),
      entity_type: entityType,
      entity_id: entityId,
      job_type: jobType,
      payload_json: toJson(payload),
      status: 'queued',
      attempts: 0,
      last_error: null,
      next_retry_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    const db = await getDatabase();
    await upsertMany(db, 'sync_queue', [job]);
    return job;
  },
  async markProcessing(jobId: string) {
    const db = await getDatabase();
    await runStatement(
      db,
      "UPDATE sync_queue SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?;",
      [nowIso(), jobId],
    );
  },
  async markFailed(jobId: string, errorMessage: string) {
    const db = await getDatabase();
    await runStatement(
      db,
      "UPDATE sync_queue SET status = 'failed', last_error = ?, next_retry_at = ?, updated_at = ? WHERE id = ?;",
      [errorMessage, addDays(new Date(), 0).toISOString(), nowIso(), jobId],
    );
  },
  async removeJob(jobId: string) {
    const db = await getDatabase();
    await runStatement(db, 'DELETE FROM sync_queue WHERE id = ?;', [jobId]);
  },
  /** Remove a not-yet-processed job for an entity (used to cancel a queued task completion on undo). */
  async removeQueuedJob(entityType: string, entityId: string, jobType: string) {
    const db = await getDatabase();
    await runStatement(
      db,
      "DELETE FROM sync_queue WHERE entity_type = ? AND entity_id = ? AND job_type = ? AND status IN ('queued', 'failed');",
      [entityType, entityId, jobType],
    );
  },
  async saveConflict(conflict: SyncConflictRecord) {
    const db = await getDatabase();
    await upsertMany(db, 'sync_conflicts', [conflict]);
  },
  async markEntitySynced(table: string, entityId: string) {
    const db = await getDatabase();
    await runStatement(
      db,
      `UPDATE ${table} SET sync_status = 'synced', last_synced_at = ?, updated_at = ? WHERE id = ?;`,
      [nowIso(), nowIso(), entityId],
    );
  },
};

export async function replaceBootstrapData(payload: MobileBootstrapPayload) {
  await withTransaction(async (db) => {
    if (payload.session) {
      await upsertMany(db, 'session', [payload.session], 'user_id');
    }
    await upsertMany(db, 'farms', payload.farms);
    await upsertMany(db, 'plots', payload.plots);
    await upsertMany(db, 'journeys', payload.journeys);
    await upsertMany(db, 'stages', payload.stages);
    await upsertMany(db, 'milestones', payload.milestones);
    await upsertMany(db, 'tasks', payload.tasks);
    await upsertMany(db, 'logs', payload.logs);
    await upsertMany(db, 'log_images', payload.log_images);
    await upsertMany(db, 'recommendations', payload.recommendations);
    await upsertMany(db, 'weather_cache', payload.weather_cache, 'farm_id');
    await upsertMany(db, 'price_snapshots', payload.price_snapshots);
    if (payload.engagement) {
      await db.runAsync(
        'INSERT OR REPLACE INTO engagement (user_id, summary_json, updated_at) VALUES (?, ?, ?);',
        ['me', toJson(payload.engagement), nowIso()],
      );
    }
  });
}

export async function saveUserProfile(user: UserProfile) {
  await sessionRepository.upsertSession({
    user_id: user.id,
    locale: user.preferred_language,
    updated_at: nowIso(),
  });
}

/**
 * Wipe all per-user local data. Called when a *different* user signs in so one
 * account never inherits another's farms, journeys, session/onboarding flag, or
 * engagement (a correctness + privacy fix). Public market data is left intact.
 */
export async function clearLocalUserData() {
  const tables = [
    'session', 'farms', 'plots', 'journeys', 'stages', 'milestones',
    'tasks', 'logs', 'log_images', 'recommendations', 'weather_cache',
    'price_snapshots', 'engagement', 'sync_queue', 'sync_conflicts',
  ];
  await withTransaction(async (db) => {
    for (const table of tables) {
      await db.runAsync(`DELETE FROM ${table};`);
    }
  });
}

export async function seedBootstrapDefaults() {
  await marketRepository.seedPricesIfEmpty();

  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) as total FROM session;',
  );

  if ((existing?.total ?? 0) === 0) {
    await sessionRepository.upsertSession({
      user_id: 'anonymous',
      locale: 'en',
      onboarding_complete: 0,
      updated_at: nowIso(),
    });
  }
}

export function decodeInstructions(task: TaskRecord) {
  return parseJson<string[]>(task.instructions_json, []);
}

export function decodeStageIndicators(stage: StageRecord) {
  return {
    visual: parseJson<string[]>(stage.visual_indicators_json, []),
    critical: parseJson<string[]>(stage.critical_factors_json, []),
  };
}

export function cropSuggestions() {
  return cropCatalog;
}
