import type {
  FarmRecord,
  JourneyRecord,
  MilestoneRecord,
  PlotRecord,
  StageRecord,
  TaskRecord,
} from '@/lib/domain/types';

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 'success', Failed: 'failed' },
  BackgroundTaskStatus: { Available: 'available' },
  getStatusAsync: jest.fn(),
  registerTaskAsync: jest.fn(),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(),
  },
}));

jest.mock('@/lib/api/mobile', () => ({
  mobileApi: {
    syncFarm: jest.fn(),
    syncJourney: jest.fn(),
    syncLog: jest.fn(),
    completeTask: jest.fn(),
    updateProfile: jest.fn(),
  },
}));

jest.mock('@/lib/db/repositories', () => ({
  farmRepository: {
    listFarms: jest.fn(),
    saveFarm: jest.fn(),
  },
  journeyRepository: {
    listStages: jest.fn(),
    listMilestones: jest.fn(),
    listTasks: jest.fn(),
  },
  logRepository: {
    listImagesForLog: jest.fn(),
  },
  plotRepository: {
    listPlotsForFarm: jest.fn(),
    savePlot: jest.fn(),
  },
  replaceBootstrapData: jest.fn(),
  sessionRepository: {
    getSession: jest.fn(),
    upsertSession: jest.fn(),
  },
  syncRepository: {
    enqueueJob: jest.fn(),
    markEntitySynced: jest.fn(),
    listQueue: jest.fn(),
    markProcessing: jest.fn(),
    removeJob: jest.fn(),
    saveConflict: jest.fn(),
    markFailed: jest.fn(),
  },
}));

// eslint-disable-next-line import/first
import { queueFarmSync, queueJourneySync } from '@/lib/sync/engine';
// eslint-disable-next-line import/first
import { journeyRepository, syncRepository } from '@/lib/db/repositories';

const mockedJourneyRepository = journeyRepository as jest.Mocked<typeof journeyRepository>;
const mockedSyncRepository = syncRepository as jest.Mocked<typeof syncRepository>;

function syncFields(id: string) {
  return {
    id,
    client_mutation_id: `mutation-${id}`,
    updated_at: '2026-04-20T10:00:00.000Z',
    deleted_at: null,
    sync_status: 'pending' as const,
    last_synced_at: null,
  };
}

describe('sync engine queue helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queues a farm payload with its selected plot', async () => {
    const farm: FarmRecord = {
      ...syncFields('farm-1'),
      name: 'Main Farm',
      latitude: -1.2921,
      longitude: 36.8219,
      region: 'Nairobi',
      country: 'Kenya',
      district: null,
      formatted_address: null,
      size_hectares: 2.5,
      soil_type: 'Loam',
      irrigation_type: 'rain-fed',
      elevation: null,
    };
    const plot: PlotRecord = {
      ...syncFields('plot-1'),
      farm_id: farm.id,
      name: 'Main Plot',
      plot_code: null,
      size_hectares: 2.5,
      soil_type: 'Loam',
      field_boundary_json: null,
      center_latitude: -1.2921,
      center_longitude: 36.8219,
      is_default: 1,
    };

    await queueFarmSync(farm, plot);

    expect(mockedSyncRepository.enqueueJob).toHaveBeenCalledWith('farm', farm.id, 'upsert', {
      farm,
      plot,
    });
  });

  it('queues a full journey bundle for sync', async () => {
    const journey: JourneyRecord = {
      ...syncFields('journey-1'),
      farm_id: 'farm-1',
      plot_id: 'plot-1',
      crop_id: 'maize-h513',
      crop_name: 'maize',
      common_name: 'Maize',
      local_name: 'Mahindi',
      variety: 'H513',
      planting_date: '2026-04-20',
      expected_harvest_date: '2026-08-18',
      status: 'active',
      progress_percentage: 0,
      current_stage: 'Germination',
      predicted_yield: null,
      actual_yield: null,
    };
    const stages: StageRecord[] = [
      {
        ...syncFields('stage-1'),
        journey_id: journey.id,
        name: 'Germination',
        order_index: 0,
        start_day: 0,
        end_day: 10,
        start_date: '2026-04-20',
        end_date: '2026-04-30',
        status: 'active',
        description: 'Seed emergence',
        risk_level: 'medium',
        color: '#7abf63',
        visual_indicators_json: '[]',
        critical_factors_json: '[]',
      },
    ];
    const milestones: MilestoneRecord[] = [
      {
        ...syncFields('milestone-1'),
        journey_id: journey.id,
        stage_id: stages[0].id,
        week_number: 1,
        title: 'Field ready and planted',
        description: 'Confirm emergence',
        start_date: '2026-04-20',
        end_date: '2026-04-27',
        status: 'in_progress',
        xp_reward: 50,
      },
    ];
    const tasks: TaskRecord[] = [
      {
        ...syncFields('task-1'),
        journey_id: journey.id,
        milestone_id: milestones[0].id,
        plot_id: journey.plot_id,
        title: 'Confirm planting pattern',
        description: 'Check spacing',
        task_type: 'planting',
        priority: 'high',
        status: 'pending',
        is_required: 1,
        sequence_order: 1,
        due_date: '2026-04-27',
        completed_at: null,
        estimated_duration_minutes: 25,
        xp_value: 20,
        instructions_json: '[]',
        observation_notes: null,
      },
    ];

    mockedJourneyRepository.listStages.mockResolvedValue(stages);
    mockedJourneyRepository.listMilestones.mockResolvedValue(milestones);
    mockedJourneyRepository.listTasks.mockResolvedValue(tasks);

    await queueJourneySync(journey);

    expect(mockedSyncRepository.enqueueJob).toHaveBeenCalledWith('journey', journey.id, 'create', {
      journey,
      stages,
      milestones,
      tasks,
    });
  });
});
