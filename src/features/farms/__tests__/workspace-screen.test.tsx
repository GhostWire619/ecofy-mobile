import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
};

const mockMobileApi = {
  listFarms: jest.fn(),
  listFarmPlots: jest.fn(),
  listFarmJourneys: jest.fn(),
  listJourneyLogs: jest.fn(),
  getWeatherForFarm: jest.fn(),
  getRecommendationsByJourney: jest.fn(),
  getFarmHealthSummary: jest.fn(),
  getPlotHealthSnapshot: jest.fn(),
  getPlotAIRecommendations: jest.fn(),
  getRemoteSensingLatest: jest.fn(),
  getRemoteSensingTimeseries: jest.fn(),
  syncLog: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: mockRouter,
}));

jest.mock('@/lib/api/mobile', () => ({
  mobileApi: mockMobileApi,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FarmWorkspaceScreen } = require('@/features/farms/workspace-screen');

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });
}

function createFarm() {
  return {
    id: 'farm-1',
    client_mutation_id: 'mutation-farm-1',
    updated_at: '2026-04-24T12:00:00Z',
    deleted_at: null,
    sync_status: 'synced',
    last_synced_at: '2026-04-24T12:00:00Z',
    name: 'Alpha Farm',
    latitude: -1.2921,
    longitude: 36.8219,
    region: 'Arusha',
    country: 'Tanzania',
    district: 'Meru',
    formatted_address: 'Meru, Arusha, Tanzania',
    size_hectares: 12.4,
    soil_type: 'Loam',
    irrigation_type: 'irrigated',
    elevation: 1180,
  };
}

function seedDefaultMocks() {
  mockMobileApi.listFarms.mockResolvedValue([createFarm()]);
  mockMobileApi.listFarmPlots.mockResolvedValue([
    {
      id: 'plot-1',
      client_mutation_id: 'mutation-plot-1',
      updated_at: '2026-04-24T12:00:00Z',
      deleted_at: null,
      sync_status: 'synced',
      last_synced_at: '2026-04-24T12:00:00Z',
      farm_id: 'farm-1',
      name: 'Main Plot',
      plot_code: 'P-1',
      size_hectares: 12.4,
      soil_type: 'Loam',
      field_boundary_json:
        '{"type":"Polygon","coordinates":[[[36.8219,-1.2921],[36.8229,-1.2921],[36.8229,-1.2931],[36.8219,-1.2931],[36.8219,-1.2921]]]}',
      center_latitude: -1.2926,
      center_longitude: 36.8224,
      is_default: 1,
    },
  ]);
  mockMobileApi.listFarmJourneys.mockResolvedValue([
    {
      id: 'journey-1',
      client_mutation_id: 'mutation-journey-1',
      updated_at: '2026-04-24T12:00:00Z',
      deleted_at: null,
      sync_status: 'synced',
      last_synced_at: '2026-04-24T12:00:00Z',
      farm_id: 'farm-1',
      plot_id: 'plot-1',
      crop_id: 'maize',
      crop_name: 'Maize',
      common_name: 'Maize',
      local_name: 'Mahindi',
      variety: 'DK 8031',
      planting_date: '2026-03-01',
      expected_harvest_date: '2026-07-18',
      status: 'active',
      progress_percentage: 58,
      current_stage: 'Vegetative Growth',
      predicted_yield: 4.8,
      actual_yield: null,
    },
  ]);
  mockMobileApi.listJourneyLogs.mockResolvedValue([
    {
      id: 'log-1',
      client_mutation_id: 'mutation-log-1',
      updated_at: '2026-04-24T12:00:00Z',
      deleted_at: null,
      sync_status: 'synced',
      last_synced_at: '2026-04-24T12:00:00Z',
      farm_id: 'farm-1',
      plot_id: 'plot-1',
      journey_id: 'journey-1',
      operation_type: 'Scouting',
      date: '2026-04-21',
      cost: 0,
      notes: 'Leaves are uniform and vigor is improving.',
      location_latitude: -1.2921,
      location_longitude: 36.8219,
      snapshot_url: null,
    },
  ]);
  mockMobileApi.getWeatherForFarm.mockResolvedValue({
    current: {
      temperature: 24,
      humidity: 64,
      precipitation: 2,
      conditions: 'Clear',
    },
    forecast: [],
    summary: {
      total_rainfall_mm: 8,
      avg_humidity: 64,
    },
  });
  mockMobileApi.getRecommendationsByJourney.mockResolvedValue([
    {
      id: 'live-rec-1',
      crop_journey_id: 'journey-1',
      weekly_milestone_id: 'milestone-1',
      type: 'advice',
      title: 'Irrigate before afternoon heat',
      message: 'Moisture is drifting lower than expected for this stage.',
      priority: 'critical',
      source: 'ai_model',
      trigger_data: null,
      action_taken: null,
      status: 'pending',
      expires_at: null,
      generated_at: '2026-04-24T12:00:00Z',
    },
  ]);
  mockMobileApi.getFarmHealthSummary.mockResolvedValue({
    farm_id: 'farm-1',
    farm_name: 'Alpha Farm',
    overall_risk_score: 42,
    overall_risk_level: 'MODERATE',
    plots_count: 1,
    risk_distribution: {
      LOW: 0,
      MODERATE: 1,
      HIGH: 0,
      CRITICAL: 0,
    },
    plots: [],
  });
  mockMobileApi.getPlotHealthSnapshot.mockResolvedValue({
    farm_id: 'farm-1',
    plot_id: 'plot-1',
    plot_name: 'Main Plot',
    risk_score: 42,
    risk_level: 'MODERATE',
    journey: {
      crop_name: 'Maize',
      current_stage: 'Vegetative Growth',
      progress_percentage: 58,
      days_to_harvest: 84,
    },
    breakdown: {
      satellite: { score: 71, ndvi: 0.63, trend: 'up', status: 'healthy' },
      weather: { score: 68, threats: ['Windy afternoon'] },
      operations: { score: 82, overdue_count: 1, pending_count: 2 },
      scouting: { score: 74, days_since_last: 3 },
    },
    actions: [{ type: 'weather', message: 'Irrigate before the next hot afternoon.' }],
  });
  mockMobileApi.getPlotAIRecommendations.mockResolvedValue({
    recommendations: {
      irrigation: {
        summary: 'Moisture is trending down.',
        actions: ['Irrigate in the next 24 hours'],
      },
    },
    generated_at: '2026-04-24T12:00:00Z',
    cached: false,
  });
  mockMobileApi.getRemoteSensingLatest.mockResolvedValue({
    farm_id: 'farm-1',
    analysis_type: 'ndvi',
    image_date: '2026-04-22',
    value: 0.63,
    mean_value: 0.63,
    trend: 'up',
    status: 'healthy',
    change_percent: 4.1,
  });
  mockMobileApi.getRemoteSensingTimeseries.mockResolvedValue({
    farm_id: 'farm-1',
    analysis_type: 'ndvi',
    series: [
      { date: '2026-04-10', value: 0.42 },
      { date: '2026-04-16', value: 0.55 },
      { date: '2026-04-22', value: 0.63 },
    ],
    trend: 'up',
    change_percent: 4.1,
  });
}

function renderWorkspace(onClose = jest.fn()) {
  const client = createQueryClient();
  return {
    client,
    onClose,
    ...render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <QueryClientProvider client={client}>
          <FarmWorkspaceScreen farmId="farm-1" onClose={onClose} />
        </QueryClientProvider>
      </SafeAreaProvider>,
    ),
  };
}

describe('FarmWorkspaceScreen', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    onlineManager.setOnline(true);
    focusManager.setFocused(true);
    seedDefaultMocks();
  });

  it('shows overview by default, opens the farm logs tab, switches to risks, and closes through the modal action', async () => {
    const { client, onClose } = renderWorkspace();

    await waitFor(() => expect(mockMobileApi.listFarms).toHaveBeenCalledTimes(1));
    expect(client.getQueryState(['farm-workspace-online-core', 'farm-1'])?.status).toBe('success');

    expect(await screen.findByText('Field Status')).toBeTruthy();
    expect(await screen.findByText('Weather & Your Field')).toBeTruthy();
    expect(await screen.findByText('NDVI Trend')).toBeTruthy();

    fireEvent.press(screen.getByTestId('farm-workspace-tab-logs'));
    expect(await screen.findByText('Farm Logs')).toBeTruthy();
    expect(await screen.findByText('1 field log for Alpha Farm.')).toBeTruthy();
    expect(await screen.findByText('Scouting')).toBeTruthy();

    fireEvent.press(screen.getByTestId('farm-workspace-tab-risks'));
    expect(await screen.findByText('YOUR FIELDS (1)')).toBeTruthy();
    fireEvent.press(await screen.findByTestId('farm-risk-plot-plot-1'));
    expect(await screen.findByText("WHAT'S HAPPENING")).toBeTruthy();
    expect(await screen.findByText('RISKS & WHAT TO DO')).toBeTruthy();

    fireEvent.press(screen.getByTestId('farm-workspace-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows online empty and monitoring fallback states', async () => {
    mockMobileApi.listFarmPlots.mockResolvedValue([
      {
        id: 'plot-1',
        client_mutation_id: 'mutation-plot-1',
        updated_at: '2026-04-24T12:00:00Z',
        deleted_at: null,
        sync_status: 'synced',
        last_synced_at: '2026-04-24T12:00:00Z',
        farm_id: 'farm-1',
        name: 'Main Plot',
        plot_code: 'P-1',
        size_hectares: 12.4,
        soil_type: 'Loam',
        field_boundary_json: null,
        center_latitude: -1.2926,
        center_longitude: 36.8224,
        is_default: 1,
      },
    ]);
    mockMobileApi.listFarmJourneys.mockResolvedValue([]);
    mockMobileApi.getFarmHealthSummary.mockRejectedValue(new Error('offline'));
    mockMobileApi.getRemoteSensingLatest.mockRejectedValue(new Error('offline'));
    mockMobileApi.getRemoteSensingTimeseries.mockRejectedValue(new Error('offline'));

    renderWorkspace();

    expect(
      await screen.findByText(
        'No active journey yet. Start a crop journey to unlock live field monitoring.',
      ),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        'Live monitoring is unavailable right now. The dashboard is showing what the online farm API returned.',
      ),
    ).toBeTruthy();
    expect(await screen.findByText('Map this farm boundary to unlock NDVI trend updates.')).toBeTruthy();
  });

  it('refreshes the NDVI monitoring workflow from the overview controls', async () => {
    renderWorkspace();

    await screen.findByText('NDVI Trend');
    fireEvent.press(screen.getByTestId('farm-ndvi-refresh'));

    await waitFor(() => expect(mockMobileApi.getRemoteSensingLatest).toHaveBeenCalledTimes(2));
  });

  it('stays rendered when live monitoring payloads are partial or malformed', async () => {
    mockMobileApi.getFarmHealthSummary.mockResolvedValue({
      farm_id: 'farm-1',
      farm_name: null,
      overall_risk_score: null,
      overall_risk_level: null,
      plots_count: 1,
      risk_distribution: null,
      plots: [{ plot_id: 'plot-1', plot_name: null, risk_score: null, risk_level: null, crop: null, ndvi: null }],
    });
    mockMobileApi.getPlotHealthSnapshot.mockResolvedValue({
      farm_id: 'farm-1',
      plot_id: 'plot-1',
      plot_name: null,
      risk_score: null,
      risk_level: null,
      journey: null,
      breakdown: {
        satellite: { score: null, ndvi: null, trend: null, status: null },
        weather: { score: null, threats: null },
        operations: { score: null, overdue_count: null, pending_count: null },
        scouting: { score: null, days_since_last: null },
      },
      actions: [{ type: 'weather', message: { body: 'bad shape' } }],
    });
    mockMobileApi.getPlotAIRecommendations.mockResolvedValue({
      recommendations: {
        irrigation: {
          summary: null,
          actions: [null, 'Irrigate soon'],
        },
      },
      generated_at: null,
      cached: null,
    });
    mockMobileApi.getRecommendationsByJourney.mockResolvedValue([
      {
        id: 'live-rec-1',
        crop_journey_id: 'journey-1',
        weekly_milestone_id: 'milestone-1',
        type: 'advice',
        title: { bad: true },
        message: null,
        priority: 'unknown',
        source: null,
        trigger_data: null,
        action_taken: null,
        status: 'pending',
        expires_at: null,
        generated_at: '2026-04-24T12:00:00Z',
      },
    ]);

    renderWorkspace();

    expect(await screen.findByText('Field Status')).toBeTruthy();
    expect(await screen.findByText('Main Field')).toBeTruthy();
    expect(await screen.findByText('No details available yet.')).toBeTruthy();
  });
});
