import {
  buildBoundaryJson,
  calculatePolygonAreaHectares,
  getPolygonBounds,
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

  it('accepts feature-wrapped polygon geometry from backend payloads', () => {
    const boundaryJson = JSON.stringify({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[...points, points[0]]],
      },
      properties: {},
    });

    expect(parseBoundaryPoints(boundaryJson)).toEqual(points);
  });

  it('accepts point-object arrays and normalizes them to lng-lat order', () => {
    const boundaryJson = JSON.stringify([
      { latitude: -1.2921, longitude: 36.8219 },
      { latitude: -1.2921, longitude: 36.8229 },
      { latitude: -1.2931, longitude: 36.8229 },
      { latitude: -1.2931, longitude: 36.8219 },
      { latitude: -1.2921, longitude: 36.8219 },
    ]);

    expect(parseBoundaryPoints(boundaryJson)).toEqual(points);
  });

  it('computes a centroid for the mapped farm boundary', () => {
    expect(getPolygonCentroid(points)).toEqual({
      longitude: 36.822400000000005,
      latitude: -1.2926,
    });
  });

  it('computes northeast and southwest bounds for fit-to-boundary camera use', () => {
    expect(getPolygonBounds(points)).toEqual({
      ne: [36.8229, -1.2921],
      sw: [36.8219, -1.2931],
      center: {
        longitude: 36.822400000000005,
        latitude: -1.2926,
      },
    });
  });

  it('estimates polygon area in hectares', () => {
    expect(calculatePolygonAreaHectares(points)).toBeGreaterThan(1);
    expect(calculatePolygonAreaHectares(points)).toBeLessThan(2);
  });
});
