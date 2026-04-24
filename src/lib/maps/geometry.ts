export type BoundaryPoint = [number, number];

type BoundaryGeometry = {
  type: 'Polygon';
  coordinates: BoundaryPoint[][];
};

type BoundaryOverlayFeature = {
  type: 'Feature';
  geometry:
    | {
        type: 'Polygon';
        coordinates: BoundaryPoint[][];
      }
    | {
        type: 'LineString';
        coordinates: BoundaryPoint[];
      };
  properties: Record<string, never>;
};

function samePoint(a: BoundaryPoint, b: BoundaryPoint) {
  return a[0] === b[0] && a[1] === b[1];
}

function isValidPoint(value: unknown): value is BoundaryPoint {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

export function parseBoundaryPoints(boundaryJson?: string | null) {
  if (!boundaryJson?.trim()) {
    return [] as BoundaryPoint[];
  }

  try {
    const parsed = JSON.parse(boundaryJson) as {
      type?: string;
      coordinates?: unknown;
    };
    const coordinates = parsed.coordinates;

    if (parsed.type !== 'Polygon' || !Array.isArray(coordinates)) {
      return [] as BoundaryPoint[];
    }
    const firstRing = coordinates[0];
    if (!Array.isArray(firstRing)) {
      return [] as BoundaryPoint[];
    }

    const ring: BoundaryPoint[] = [];
    for (const value of firstRing as unknown[]) {
      if (!isValidPoint(value)) {
        continue;
      }
      ring.push([value[0], value[1]]);
    }

    if (ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])) {
      ring.pop();
    }

    return ring;
  } catch {
    return [] as BoundaryPoint[];
  }
}

export function buildBoundaryGeometry(points: BoundaryPoint[]) {
  if (points.length < 3) {
    return null;
  }

  return {
    type: 'Polygon',
    coordinates: [[...points, points[0]]],
  } satisfies BoundaryGeometry;
}

export function buildBoundaryJson(points: BoundaryPoint[]) {
  const geometry = buildBoundaryGeometry(points);
  return geometry ? JSON.stringify(geometry) : null;
}

export function buildBoundaryOverlay(points: BoundaryPoint[]) {
  if (points.length >= 3) {
    return {
      type: 'Feature',
      geometry: buildBoundaryGeometry(points)!,
      properties: {},
    } satisfies BoundaryOverlayFeature;
  }

  if (points.length >= 2) {
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: points,
      },
      properties: {},
    } satisfies BoundaryOverlayFeature;
  }

  return null;
}

export function getPolygonCentroid(points: BoundaryPoint[]) {
  if (!points.length) {
    return null;
  }

  const totals = points.reduce(
    (current, [longitude, latitude]) => ({
      longitude: current.longitude + longitude,
      latitude: current.latitude + latitude,
    }),
    { longitude: 0, latitude: 0 },
  );

  return {
    longitude: totals.longitude / points.length,
    latitude: totals.latitude / points.length,
  };
}

export function calculatePolygonAreaHectares(points: BoundaryPoint[]) {
  if (points.length < 3) {
    return 0;
  }

  const earthRadius = 6_378_137;
  const averageLatitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const projected = points.map(([longitude, latitude]) => {
    const x =
      ((longitude * Math.PI) / 180) *
      earthRadius *
      Math.cos((averageLatitude * Math.PI) / 180);
    const y = ((latitude * Math.PI) / 180) * earthRadius;
    return [x, y] as const;
  });

  let area = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const [x1, y1] = projected[index];
    const [x2, y2] = projected[(index + 1) % projected.length];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area / 2) / 10_000;
}
