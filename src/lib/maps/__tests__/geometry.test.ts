import {
  buildBoundaryJson,
  calculatePolygonAreaHectares,
  getPolygonCentroid,
  parseBoundaryPoints,
} from '@/lib/maps/geometry';

describe('farm geometry helpers', () => {
  const points: [number, number][] = [
    [36.8219, -1.2921],
    [36.8229, -1.2921],
    [36.8229, -1.2931],
    [36.8219, -1.2931],
  ];

  it('serializes and rehydrates polygon points', () => {
    const boundaryJson = buildBoundaryJson(points);

    expect(boundaryJson).toBeTruthy();
    expect(parseBoundaryPoints(boundaryJson)).toEqual(points);
  });

  it('computes a centroid for the mapped farm boundary', () => {
    expect(getPolygonCentroid(points)).toEqual({
      longitude: 36.822400000000005,
      latitude: -1.2926,
    });
  });

  it('estimates polygon area in hectares', () => {
    expect(calculatePolygonAreaHectares(points)).toBeGreaterThan(1);
    expect(calculatePolygonAreaHectares(points)).toBeLessThan(2);
  });
});
