import { fireEvent, render, screen } from '@testing-library/react-native';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider } from '@/lib/i18n';

const mockRouter = {
  push: jest.fn(),
};

const mockMobileApi = {
  listFarms: jest.fn(),
  listFarmJourneys: jest.fn(),
  getWeatherForFarm: jest.fn(),
  getFarmHealthSummary: jest.fn(),
};
const mockFarmRepository = {
  getSelectedFarmId: jest.fn(),
  setSelectedFarmId: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: mockRouter,
}));

jest.mock('@/lib/api/mobile', () => ({
  mobileApi: mockMobileApi,
}));
jest.mock('@/lib/db/repositories', () => ({
  farmRepository: mockFarmRepository,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HomeScreen } = require('@/features/home/screen');

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

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    onlineManager.setOnline(true);
    focusManager.setFocused(true);
    mockFarmRepository.getSelectedFarmId.mockResolvedValue(null);
    mockFarmRepository.setSelectedFarmId.mockResolvedValue(undefined);

    mockMobileApi.listFarms.mockResolvedValue([
      {
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
    mockMobileApi.getWeatherForFarm.mockResolvedValue({
      current: {
        temperature: 25,
      },
      forecast: [],
      summary: {},
    });
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
  });

  it('opens the farm workspace when a farm row is tapped', async () => {
    const client = createQueryClient();

    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <I18nProvider>
          <QueryClientProvider client={client}>
            <HomeScreen />
          </QueryClientProvider>
        </I18nProvider>
      </SafeAreaProvider>,
    );

    await screen.findByText('Alpha Farm');
    expect(client.getQueryState(['farms-screen'])?.status).toBe('success');
    expect(mockMobileApi.listFarms).toHaveBeenCalledTimes(1);

    const farmName = await screen.findByText('Alpha Farm');
    fireEvent.press(farmName);

    expect(mockRouter.push).toHaveBeenCalledWith('/farms/farm-1');
  });

  it('renders malformed farm payloads without crashing the screen', async () => {
    mockMobileApi.listFarms.mockResolvedValue([
      {
        id: 'farm-2',
        client_mutation_id: 'mutation-farm-2',
        updated_at: '2026-04-24T12:00:00Z',
        deleted_at: null,
        sync_status: 'synced',
        last_synced_at: '2026-04-24T12:00:00Z',
        name: null,
        latitude: null,
        longitude: null,
        region: null,
        country: null,
        district: null,
        formatted_address: null,
        size_hectares: null,
        soil_type: null,
        irrigation_type: null,
        elevation: null,
      },
    ]);
    mockMobileApi.listFarmJourneys.mockResolvedValue([]);
    mockMobileApi.getWeatherForFarm.mockResolvedValue(null);
    mockMobileApi.getFarmHealthSummary.mockResolvedValue(null);

    const client = createQueryClient();

    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <I18nProvider>
          <QueryClientProvider client={client}>
            <HomeScreen />
          </QueryClientProvider>
        </I18nProvider>
      </SafeAreaProvider>,
    );

    expect(await screen.findByText('Untitled farm')).toBeTruthy();
    expect(await screen.findByText('Unknown region, Unknown country')).toBeTruthy();
    expect(await screen.findByText('0.0 ha')).toBeTruthy();
  });

  it('opens the full farm map from the three-dot action sheet', async () => {
    const client = createQueryClient();

    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <I18nProvider>
          <QueryClientProvider client={client}>
            <HomeScreen />
          </QueryClientProvider>
        </I18nProvider>
      </SafeAreaProvider>,
    );

    await screen.findByText('Alpha Farm');
    fireEvent.press(screen.getByTestId('farm-menu-button-farm-1'));
    fireEvent.press(await screen.findByTestId('farm-action-view-map'));

    expect(mockRouter.push).toHaveBeenCalledWith('/farms-map/farm-1');
  });
});
