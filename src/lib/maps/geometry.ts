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

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
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

function normalizeBoundaryPoint(value: unknown): BoundaryPoint | null {
  if (isValidPoint(value)) {
    const first = value[0];
    const second = value[1];

    // Accept either [lng, lat] or [lat, lng] and normalize to [lng, lat].
    if (Math.abs(first) <= 90 && Math.abs(second) > 90) {
      return [second, first];
    }

    return [first, second];
  }

  if (value && typeof value === 'object') {
    const latitude =
      toFiniteNumber((value as { latitude?: unknown }).latitude) ??
      toFiniteNumber((value as { lat?: unknown }).lat);
    const longitude =
      toFiniteNumber((value as { longitude?: unknown }).longitude) ??
      toFiniteNumber((value as { lng?: unknown }).lng);

    if (latitude != null && longitude != null) {
      return [longitude, latitude];
    }
  }

  return null;
}

function extractPolygonRing(value: unknown): unknown[] | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }

    const first = value[0];
    if (Array.isArray(first)) {
      if (first.length > 0 && (Array.isArray(first[0]) || (first[0] && typeof first[0] === 'object'))) {
        return first as unknown[];
      }

      return value as unknown[];
    }

    if (first && typeof first === 'object') {
      return value as unknown[];
    }

    return null;
  }

  if (typeof value === 'object') {
    const shape = value as {
      type?: string;
      geometry?: unknown;
      features?: unknown[];
      coordinates?: unknown;
      boundary?: unknown;
    };

    if (shape.type === 'Polygon') {
      return extractPolygonRing(shape.coordinates);
    }

    if (shape.type === 'Feature') {
      return extractPolygonRing(shape.geometry);
    }

    if (shape.type === 'FeatureCollection') {
      const features = Array.isArray(shape.features) ? shape.features : [];
      for (const feature of features) {
        const ring = extractPolygonRing(feature);
        if (ring) {
          return ring;
        }
      }
      return null;
    }

    if (shape.geometry) {
      return extractPolygonRing(shape.geometry);
    }

    if (shape.coordinates) {
      return extractPolygonRing(shape.coordinates);
    }

    if (shape.boundary) {
      return extractPolygonRing(shape.boundary);
    }
  }

  return null;
}

export function parseBoundaryPoints(boundaryJson?: string | null) {
  if (!boundaryJson?.trim()) {
    return [] as BoundaryPoint[];
  }

  try {
    const parsed = JSON.parse(boundaryJson) as unknown;
    const ringValues = extractPolygonRing(parsed);

    if (!Array.isArray(ringValues)) {
      return [] as BoundaryPoint[];
    }

    const ring: BoundaryPoint[] = [];
    for (const value of ringValues as unknown[]) {
      const point = normalizeBoundaryPoint(value);
      if (!point) {
        continue;
      }
      ring.push(point);
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

export function getPolygonBounds(points: BoundaryPoint[]) {
  if (!points.length) {
    return null;
  }

  let minLongitude = points[0][0];
  let maxLongitude = points[0][0];
  let minLatitude = points[0][1];
  let maxLatitude = points[0][1];

  for (const [longitude, latitude] of points) {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }

  return {
    ne: [maxLongitude, maxLatitude] as BoundaryPoint,
    sw: [minLongitude, minLatitude] as BoundaryPoint,
    center: {
      longitude: (minLongitude + maxLongitude) / 2,
      latitude: (minLatitude + maxLatitude) / 2,
    },
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
