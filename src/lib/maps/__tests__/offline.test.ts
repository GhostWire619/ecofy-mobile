import { createOfflinePackBounds, createOfflinePackName } from '@/lib/maps/offline';

describe('offline map helpers', () => {
  it('builds a stable offline pack name per farm', () => {
    expect(createOfflinePackName('farm-123')).toBe('farm-farm-123');
  });

  it('creates northeast and southwest bounds around the farm center', () => {
    expect(
      createOfflinePackBounds({
        latitude: -1.2921,
        longitude: 36.8219,
      }),
    ).toEqual([
      [36.8519, -1.2621],
      [36.7919, -1.3221],
    ]);
  });
});
