import { mobileApi } from '@/lib/api/mobile';
import { apiRequest } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({
  apiRequest: jest.fn(),
}));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('mobileApi envelope handling', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
  });

  it('unwraps farm health summary responses wrapped in success envelopes', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        farm_id: 'farm-1',
        farm_name: 'Shamba 1',
        overall_risk_score: 72,
        overall_risk_level: 'HIGH',
        plots_count: 1,
        risk_distribution: { LOW: 0, MODERATE: 0, HIGH: 1, CRITICAL: 0 },
        plots: [],
      },
    });

    await expect(mobileApi.getFarmHealthSummary('farm-1')).resolves.toMatchObject({
      farm_id: 'farm-1',
      overall_risk_level: 'HIGH',
    });
  });

  it('unwraps plot health snapshot responses wrapped in success envelopes', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        farm_id: 'farm-1',
        plot_id: 'plot-1',
        plot_name: 'Main Field',
        risk_score: 48,
        risk_level: 'MODERATE',
        journey: null,
        breakdown: {
          satellite: { score: 40, ndvi: 0.32, trend: 'down', status: 'warning' },
          weather: { score: 30, threats: ['Rain expected'] },
          operations: { score: 10, overdue_count: 0, pending_count: 1 },
          scouting: { score: 60, days_since_last: 18 },
        },
        actions: [{ type: 'weather', message: 'Delay irrigation until after rainfall.' }],
      },
    });

    await expect(mobileApi.getPlotHealthSnapshot('farm-1', 'plot-1')).resolves.toMatchObject({
      plot_id: 'plot-1',
      risk_level: 'MODERATE',
    });
  });

  it('unwraps plot ai recommendation responses wrapped in success envelopes', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        recommendations: {
          weather_risk: {
            summary: 'Rain likely this evening.',
            actions: ['Pause irrigation this afternoon'],
          },
        },
        generated_at: '2026-04-25T12:00:00Z',
        cached: false,
      },
    });

    await expect(mobileApi.getPlotAIRecommendations('farm-1', 'plot-1')).resolves.toMatchObject({
      recommendations: {
        weather_risk: {
          summary: 'Rain likely this evening.',
          actions: ['Pause irrigation this afternoon'],
        },
      },
    });
  });

  it('unwraps journey recommendation arrays wrapped in success envelopes', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'rec-1',
          title: 'Irrigate tonight',
          message: 'Moisture is dropping.',
          priority: 'high',
          source: 'ai',
        },
      ],
    });

    await expect(mobileApi.getRecommendationsByJourney('journey-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'rec-1',
        priority: 'high',
      }),
    ]);
  });

  it('normalizes the backend daily weather forecast for the mobile widget', async () => {
    mockApiRequest.mockResolvedValue({
      location: { lat: -6.8, lng: 39.2, name: 'Shamba 1' },
      current: {
        temperature: 27.4,
        humidity: 71,
        conditions: 'Partly cloudy',
      },
      daily: [
        {
          date: '2026-06-18',
          temperature_min: 21.2,
          temperature_max: 29.8,
          rainfall_mm: 4.5,
          precipitation_probability: 65,
          conditions: 'Rain showers',
        },
      ],
    });

    await expect(mobileApi.getWeatherForFarm('farm-1')).resolves.toMatchObject({
      current: { temperature: 27.4 },
      forecast: [
        {
          date: '2026-06-18',
          temperature_low: 21.2,
          temperature_high: 29.8,
          rainfall_mm: 4.5,
          precipitation_probability: 65,
        },
      ],
      summary: {
        period_days: 1,
        total_rainfall_mm: 4.5,
      },
    });
  });

  it('deletes a journey activity using the authenticated log endpoint', async () => {
    mockApiRequest.mockResolvedValue({ success: true });

    await mobileApi.deleteJourneyLog('farm-1', 'journey-1', 'log-1');

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/farms/farm-1/journeys/journey-1/logs/log-1',
      { method: 'DELETE', auth: true },
    );
  });
});
