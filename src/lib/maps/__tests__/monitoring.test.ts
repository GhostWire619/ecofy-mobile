import { loadFarmRemoteSensingOverlay } from '@/lib/maps/monitoring';

describe('remote sensing overlay loader', () => {
  it('returns the existing overlay without starting a new analysis', async () => {
    const runAnalysis = jest.fn();
    const getRunStatus = jest.fn();

    const result = await loadFarmRemoteSensingOverlay(
      {
        hasBoundary: true,
        runPayload: {
          analysis_type: 'ndvi',
        },
      },
      {
        getOverlay: async () => ({
          success: true,
          data: {
            farm_id: 'farm-1',
            analysis_type: 'ndvi',
            tile_url: '/tiles/farm-1/{z}/{x}/{y}.png',
          },
        }),
        runAnalysis,
        getRunStatus,
      },
    );

    expect(result).toEqual({
      state: 'ready',
      overlay: expect.objectContaining({
        tile_url: '/tiles/farm-1/{z}/{x}/{y}.png',
      }),
      error: null,
      ranAnalysis: false,
    });
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(getRunStatus).not.toHaveBeenCalled();
  });

  it('runs analysis and refetches the overlay when it is initially missing', async () => {
    let overlayFetchCount = 0;

    const result = await loadFarmRemoteSensingOverlay(
      {
        hasBoundary: true,
        runPayload: {
          analysis_type: 'ndvi',
          output_modes: ['map_overlay'],
        },
      },
      {
        getOverlay: async () => {
          overlayFetchCount += 1;
          if (overlayFetchCount === 1) {
            return {
              success: true,
              data: {
                farm_id: 'farm-1',
                analysis_type: 'ndvi',
                tile_url: null,
              },
            };
          }

          return {
            success: true,
            data: {
              farm_id: 'farm-1',
              analysis_type: 'ndvi',
              tile_url: '/tiles/farm-1/{z}/{x}/{y}.png',
            },
          };
        },
        runAnalysis: async () => ({
          success: true,
          data: {
            run_id: 'run-1',
            farm_id: 'farm-1',
            analysis_type: 'ndvi',
            status: 'queued',
            requested_at: '2026-04-24T12:00:00Z',
          },
        }),
        getRunStatus: async () => ({
          success: true,
          data: {
            run_id: 'run-1',
            farm_id: 'farm-1',
            analysis_type: 'ndvi',
            status: 'completed',
            requested_at: '2026-04-24T12:00:00Z',
          },
        }),
        delay: async () => undefined,
      },
    );

    expect(result.state).toBe('ready');
    expect(result.ranAnalysis).toBe(true);
    expect(result.overlay).toEqual(
      expect.objectContaining({
        tile_url: '/tiles/farm-1/{z}/{x}/{y}.png',
      }),
    );
  });

  it('bypasses an existing overlay when forceRefresh is requested', async () => {
    const runAnalysis = jest.fn(async () => ({
      success: true,
      data: {
        run_id: 'run-2',
        farm_id: 'farm-1',
        analysis_type: 'ndvi',
        status: 'queued',
        requested_at: '2026-04-24T12:00:00Z',
      },
    }));

    const result = await loadFarmRemoteSensingOverlay(
      {
        hasBoundary: true,
        forceRefresh: true,
        runPayload: {
          analysis_type: 'ndvi',
          force_refresh: true,
        },
      },
      {
        getOverlay: async () => ({
          success: true,
          data: {
            farm_id: 'farm-1',
            analysis_type: 'ndvi',
            tile_url: '/tiles/farm-1/{z}/{x}/{y}.png',
          },
        }),
        runAnalysis,
        getRunStatus: async () => ({
          success: true,
          data: {
            run_id: 'run-2',
            farm_id: 'farm-1',
            analysis_type: 'ndvi',
            status: 'completed',
            requested_at: '2026-04-24T12:00:00Z',
          },
        }),
        delay: async () => undefined,
      },
    );

    expect(result.state).toBe('ready');
    expect(result.ranAnalysis).toBe(true);
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  });

  it('returns a boundary-required state when the farm has no mapped boundary', async () => {
    const runAnalysis = jest.fn();

    const result = await loadFarmRemoteSensingOverlay(
      {
        hasBoundary: false,
        runPayload: {
          analysis_type: 'ndvi',
        },
      },
      {
        getOverlay: async () => ({
          success: true,
          data: {
            farm_id: 'farm-1',
            analysis_type: 'ndvi',
            tile_url: null,
          },
        }),
        runAnalysis,
        getRunStatus: async () => ({
          success: true,
          data: {
            run_id: 'run-1',
            farm_id: 'farm-1',
            analysis_type: 'ndvi',
            status: 'queued',
            requested_at: '2026-04-24T12:00:00Z',
          },
        }),
      },
    );

    expect(result).toEqual({
      state: 'boundary_required',
      overlay: null,
      error: 'Map this farm boundary to view NDVI overlays.',
      ranAnalysis: false,
    });
    expect(runAnalysis).not.toHaveBeenCalled();
  });
});
